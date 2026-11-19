import { rm } from 'node:fs/promises';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  secrets: new Map<string, string>(),
  saveProviderApiKeyError: undefined as Error | undefined,
  deleteStoredSecretError: undefined as Error | undefined,
  providerApiKeyRef: (providerId: string) => `provider:${providerId}:apiKey`,
  backfillAnnotationMemoryEntries: vi.fn(),
  fetchFaviconDataUrl: vi.fn(),
  logErrors: [] as Array<{ event: string; error: unknown; data?: Record<string, unknown> }>,
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/yomitomo-store-providers-test',
  },
}));

vi.mock('../native/sqlite', async () => {
  const { default: SQLiteDatabase } = await import('better-sqlite3');
  return {
    loadSQLiteDatabase: () => SQLiteDatabase,
  };
});

vi.mock('../providers/provider-secrets', () => {
  return {
    providerApiKeyRef: testState.providerApiKeyRef,
    saveProviderApiKey: async (providerId: string, apiKey: string) => {
      if (testState.saveProviderApiKeyError) throw testState.saveProviderApiKeyError;
      const ref = testState.providerApiKeyRef(providerId);
      testState.secrets.set(ref, apiKey);
      return ref;
    },
    saveStoredSecret: async (ref: string, secret: string) => {
      if (testState.saveProviderApiKeyError) throw testState.saveProviderApiKeyError;
      testState.secrets.set(ref, secret);
    },
    readProviderApiKey: async (apiKeyRef?: string | null) =>
      (apiKeyRef && testState.secrets.get(apiKeyRef)) || '',
    deleteStoredSecret: async (secretRef: string) => {
      if (testState.deleteStoredSecretError) throw testState.deleteStoredSecretError;
      testState.secrets.delete(secretRef);
    },
  };
});

vi.mock('../articles/article-annotation-memory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../articles/article-annotation-memory')>();
  return {
    ...actual,
    backfillStoredArticleAnnotationMemoryEntries: testState.backfillAnnotationMemoryEntries,
  };
});

vi.mock('../articles/article-favicon', () => ({
  fetchFaviconDataUrl: testState.fetchFaviconDataUrl,
}));

vi.mock('../app/logger', () => ({
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => {
    testState.logErrors.push({ event, error, data });
  },
}));

import {
  buildProviderRecord,
  hydrateProviderInputApiKey,
  readStoredProviderApiKey,
  resolveProviderApiKeyStorage,
} from '../providers/provider-repository';
import { getDatabase } from './store-db';
import { closeDatabase } from './store-lifecycle';
import { deleteProvider, saveProvider } from './store-providers';
import { readStore } from './store-snapshot';
import * as schema from '../db/schema';

beforeEach(async () => {
  closeDatabase();
  await rm('/tmp/yomitomo-store-providers-test', { recursive: true, force: true });
  testState.secrets.clear();
  testState.saveProviderApiKeyError = undefined;
  testState.deleteStoredSecretError = undefined;
  testState.backfillAnnotationMemoryEntries.mockReset();
  testState.backfillAnnotationMemoryEntries.mockReturnValue({
    articleCount: 0,
    annotationCount: 0,
    entryCount: 0,
  });
  testState.fetchFaviconDataUrl.mockReset();
  testState.logErrors = [];
});

afterEach(async () => {
  closeDatabase();
  await rm('/tmp/yomitomo-store-providers-test', { recursive: true, force: true });
});

describe('desktop store providers', () => {
  it('records the credential state when provider api key replacement cannot commit', async () => {
    insertProviderRow({ id: 'provider_1', apiKeyRef: 'provider:provider_1:apiKey' });
    testState.secrets.set('provider:provider_1:apiKey', 'sk-old');
    getDatabase().run(`
      CREATE TRIGGER fail_provider_key_replacement
      BEFORE UPDATE ON providers
      BEGIN
        SELECT RAISE(ABORT, 'injected provider replacement failure');
      END
    `);

    await expect(saveProvider({ id: 'provider_1', apiKey: 'sk-new' })).rejects.toThrow(
      'injected provider replacement failure',
    );

    expect(testState.secrets.get('provider:provider_1:apiKey')).toBe('sk-old');
    expect([...testState.secrets.keys()]).toEqual(['provider:provider_1:apiKey']);
    expect(testState.logErrors).toContainEqual(
      expect.objectContaining({
        event: 'credential_swap.transaction_failed',
        error: expect.objectContaining({ message: 'injected provider replacement failure' }),
        data: {
          owner: 'provider',
          ownerId: 'provider_1',
          apiKeyRef: expect.stringMatching(/^provider:provider_1:apiKey:version:/),
        },
      }),
    );
  });

  it('switches provider rows before retiring replaced credentials', async () => {
    insertProviderRow({ id: 'provider_1', apiKeyRef: 'provider:provider_1:apiKey' });
    testState.secrets.set('provider:provider_1:apiKey', 'sk-old');

    await saveProvider({ id: 'provider_1', apiKey: 'sk-new' });

    const replacementRef = readProviderRow('provider_1')?.apiKeyRef;
    expect(replacementRef).toMatch(/^provider:provider_1:apiKey:version:/);
    expect(testState.secrets.has('provider:provider_1:apiKey')).toBe(false);
    expect(testState.secrets.get(replacementRef || '')).toBe('sk-new');
    await expect(readStoredProviderApiKey('provider_1')).resolves.toBe('sk-new');
    expect(readSecretDeletionTasks()).toEqual([]);
  });

  it('recovers a pending provider secret deletion after restart', async () => {
    const deleteError = new Error('keyring locked');
    insertProviderRow({ id: 'provider_1', apiKeyRef: 'provider:provider_1:apiKey' });
    testState.secrets.set('provider:provider_1:apiKey', 'sk-stored');
    testState.deleteStoredSecretError = deleteError;

    await expect(deleteProvider('provider_1')).resolves.toMatchObject({ providers: [] });

    expect(readProviderRow('provider_1')).toBeUndefined();
    expect(testState.secrets.get('provider:provider_1:apiKey')).toBe('sk-stored');
    expect(readSecretDeletionTasks()).toEqual([
      expect.objectContaining({ secretRef: 'provider:provider_1:apiKey' }),
    ]);
    expect(testState.logErrors).toContainEqual({
      event: 'credential_swap.committed_cleanup_deferred',
      error: deleteError,
      data: {
        owner: 'provider',
        ownerId: 'provider_1',
        secretRef: 'provider:provider_1:apiKey',
      },
    });

    closeDatabase();
    await readStore();
    expect(readSecretDeletionTasks()).toEqual([
      expect.objectContaining({ secretRef: 'provider:provider_1:apiKey' }),
    ]);
    expect(testState.logErrors).toContainEqual({
      event: 'secret_deletion.recovery_failed',
      error: deleteError,
      data: { secretRef: 'provider:provider_1:apiKey' },
    });

    testState.deleteStoredSecretError = undefined;
    closeDatabase();
    await readStore();
    await readStore();

    expect(testState.secrets.has('provider:provider_1:apiKey')).toBe(false);
    expect(readSecretDeletionTasks()).toEqual([]);
  });

  it('resolves new provider api keys into keyring refs', async () => {
    testState.secrets.clear();

    await expect(
      resolveProviderApiKeyStorage('provider_1', { apiKey: ' sk-test ' }, undefined),
    ).resolves.toEqual({
      credentialChange: {
        apiKeyRef: expect.stringMatching(/^provider:provider_1:apiKey:version:/),
        preparedSecretRef: expect.stringMatching(/^provider:provider_1:apiKey:version:/),
      },
      storedApiKey: '',
    });
    expect([...testState.secrets.values()]).toEqual(['sk-test']);
  });

  it('builds provider records without leaking api keys into the public store', () => {
    const provider = buildProviderRecord(
      {
        name: 'OpenAI',
        type: 'openai-chat',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-5.2',
        modelInputMode: 'custom',
      },
      {
        id: 'provider_1',
        now: '2026-05-16T00:00:00.000Z',
        apiKeyRef: 'provider:provider_1:apiKey',
      },
    );

    expect(provider).toMatchObject({
      id: 'provider_1',
      name: 'OpenAI',
      apiKey: '',
      hasApiKey: true,
      modelInputMode: 'custom',
      modelNames: undefined,
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    });
  });

  it('migrates legacy provider api keys into keyring refs and clears SQLite secrets', async () => {
    insertProviderRow({ id: 'provider_1', apiKey: 'legacy-key' });

    const store = await readStore();
    const row = readProviderRow('provider_1');

    expect(testState.secrets.get('provider:provider_1:apiKey')).toBe('legacy-key');
    expect(row).toMatchObject({
      apiKey: '',
      apiKeyRef: 'provider:provider_1:apiKey',
    });
    expect(store.providers.find((provider) => provider.id === 'provider_1')).toMatchObject({
      hasApiKey: true,
    });
  });

  it('retains and retries legacy provider api keys when keyring migration fails', async () => {
    const error = new Error('keyring locked');
    testState.saveProviderApiKeyError = error;
    insertProviderRow({ id: 'provider_1', apiKey: 'legacy-key' });

    await readStore();

    expect(testState.secrets.has('provider:provider_1:apiKey')).toBe(false);
    expect(readProviderRow('provider_1')).toMatchObject({ apiKey: 'legacy-key', apiKeyRef: null });
    expect(testState.logErrors).toEqual([
      {
        event: 'provider.migrate_api_key_failed',
        error,
        data: { providerId: 'provider_1', legacySecretRetained: true },
      },
    ]);

    testState.saveProviderApiKeyError = undefined;
    await readStore();

    expect(testState.secrets.get('provider:provider_1:apiKey')).toBe('legacy-key');
    expect(readProviderRow('provider_1')).toMatchObject({
      apiKey: '',
      apiKeyRef: 'provider:provider_1:apiKey',
    });
  });

  it('clones provider credentials into an independent keyring entry isolated from source deletion', async () => {
    insertProviderRow({
      id: 'provider_source',
      name: 'DeepSeek Chat',
      type: 'openai-chat',
      baseUrl: 'https://api.deepseek.com',
      modelName: 'deepseek-chat',
      apiKeyRef: 'provider:provider_source:apiKey',
    });
    testState.secrets.set('provider:provider_source:apiKey', 'sk-shared-secret');

    const hydrated = await hydrateProviderInputApiKey({
      baseUrl: 'https://api.deepseek.com',
      modelName: 'deepseek-reasoner',
      cloneApiKeyFromProviderId: 'provider_source',
    });
    expect(hydrated.apiKey).toBe('sk-shared-secret');

    const hydratedRemoved = await hydrateProviderInputApiKey({
      cloneApiKeyFromProviderId: 'provider_source',
      removeApiKey: true,
    });
    expect(hydratedRemoved.apiKey).toBe('');

    const patch = await saveProvider({
      name: 'DeepSeek Reasoner',
      type: 'openai-chat',
      baseUrl: 'https://api.deepseek.com',
      modelName: 'deepseek-reasoner',
      cloneApiKeyFromProviderId: 'provider_source',
    });

    const cloned = patch.providers.find((provider) => provider.name === 'DeepSeek Reasoner');
    expect(cloned).toBeDefined();
    expect(cloned?.id).not.toBe('provider_source');
    expect(cloned?.hasApiKey).toBe(true);
    expect(cloned?.apiKey).toBe('');

    const clonedRow = readProviderRow(cloned!.id);
    expect(clonedRow?.apiKey).toBe('');
    expect(clonedRow?.apiKeyRef).toMatch(new RegExp(`^provider:${cloned!.id}:apiKey:version:`));
    expect(clonedRow?.apiKeyRef).not.toBe('provider:provider_source:apiKey');
    await expect(readStoredProviderApiKey(cloned!.id)).resolves.toBe('sk-shared-secret');

    // Deleting source must not affect the cloned provider's keyring entry.
    await deleteProvider('provider_source');
    expect(testState.secrets.has('provider:provider_source:apiKey')).toBe(false);
    await expect(readStoredProviderApiKey(cloned!.id)).resolves.toBe('sk-shared-secret');

    // Cloning again and deleting the clone must not affect the surviving provider's keyring entry.
    const secondPatch = await saveProvider({
      name: 'DeepSeek V3',
      type: 'openai-chat',
      baseUrl: 'https://api.deepseek.com',
      modelName: 'deepseek-v3',
      cloneApiKeyFromProviderId: cloned!.id,
    });
    const secondClone = secondPatch.providers.find((provider) => provider.name === 'DeepSeek V3');
    expect(secondClone).toBeDefined();
    await deleteProvider(secondClone!.id);
    await expect(readStoredProviderApiKey(cloned!.id)).resolves.toBe('sk-shared-secret');
  });

  it('prefers explicit apiKey override or removeApiKey over cloned source credentials', async () => {
    insertProviderRow({
      id: 'provider_source',
      apiKeyRef: 'provider:provider_source:apiKey',
    });
    testState.secrets.set('provider:provider_source:apiKey', 'sk-source');

    const overriddenPatch = await saveProvider({
      name: 'Overridden Clone',
      modelName: 'model-b',
      apiKey: 'sk-override',
      cloneApiKeyFromProviderId: 'provider_source',
    });
    const overridden = overriddenPatch.providers.find(
      (provider) => provider.name === 'Overridden Clone',
    );
    await expect(readStoredProviderApiKey(overridden!.id)).resolves.toBe('sk-override');

    const strippedPatch = await saveProvider({
      name: 'Stripped Clone',
      modelName: 'model-c',
      removeApiKey: true,
      cloneApiKeyFromProviderId: 'provider_source',
    });
    const stripped = strippedPatch.providers.find((provider) => provider.name === 'Stripped Clone');
    expect(stripped?.hasApiKey).toBe(false);
    await expect(readStoredProviderApiKey(stripped!.id)).resolves.toBe('');
  });
});

function insertProviderRow(input: Partial<typeof schema.providers.$inferInsert>) {
  getDatabase()
    .insert(schema.providers)
    .values({
      id: input.id || 'provider_1',
      name: input.name || 'Provider',
      type: input.type || 'openai-chat',
      presetId: input.presetId ?? null,
      logo: input.logo ?? null,
      baseUrl: input.baseUrl || 'https://api.example.com',
      apiKey: input.apiKey || '',
      apiKeyRef: input.apiKeyRef ?? null,
      modelName: input.modelName || 'model-a',
      modelNames: input.modelNames,
      modelInputMode: input.modelInputMode || 'custom',
      reasoningEffort: input.reasoningEffort ?? null,
      createdAt: input.createdAt || '2026-05-16T00:00:00.000Z',
      updatedAt: input.updatedAt || '2026-05-16T00:00:00.000Z',
    })
    .run();
}

function readProviderRow(providerId: string) {
  return getDatabase()
    .select()
    .from(schema.providers)
    .all()
    .find((provider) => provider.id === providerId);
}

function readSecretDeletionTasks() {
  return getDatabase().select().from(schema.secretDeletionTasks).all();
}
