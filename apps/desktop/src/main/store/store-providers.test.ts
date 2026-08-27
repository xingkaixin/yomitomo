import { rm } from 'node:fs/promises';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  secrets: new Map<string, string>(),
  saveProviderApiKeyError: undefined as Error | undefined,
  saveProviderApiKeyPause: undefined as Promise<void> | undefined,
  saveProviderApiKeyCalls: 0,
  saveStoredSecretPause: undefined as Promise<void> | undefined,
  saveStoredSecretCalls: 0,
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
      testState.saveProviderApiKeyCalls += 1;
      await testState.saveProviderApiKeyPause;
      if (testState.saveProviderApiKeyError) throw testState.saveProviderApiKeyError;
      const ref = testState.providerApiKeyRef(providerId);
      testState.secrets.set(ref, apiKey);
      return ref;
    },
    saveStoredSecret: async (ref: string, secret: string) => {
      testState.saveStoredSecretCalls += 1;
      await testState.saveStoredSecretPause;
      if (testState.saveProviderApiKeyError) throw testState.saveProviderApiKeyError;
      testState.secrets.set(ref, secret);
    },
    readProviderApiKey: async (providerId: string, apiKeyRef?: string | null) =>
      testState.secrets.get(apiKeyRef || testState.providerApiKeyRef(providerId)) || '',
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
  testState.saveProviderApiKeyPause = undefined;
  testState.saveProviderApiKeyCalls = 0;
  testState.saveStoredSecretPause = undefined;
  testState.saveStoredSecretCalls = 0;
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
  it('finishes a pending credential save before deleting its provider without blocking others', async () => {
    insertProviderRow({ id: 'provider_1', apiKeyRef: 'provider:provider_1:apiKey' });
    testState.secrets.set('provider:provider_1:apiKey', 'sk-old');
    const preparation = deferred<void>();
    testState.saveStoredSecretPause = preparation.promise;
    const saving = saveProvider({ id: 'provider_1', apiKey: 'sk-new' });
    await vi.waitFor(() => expect(testState.saveStoredSecretCalls).toBe(1));

    const deleting = deleteProvider('provider_1');
    await saveProvider({ name: 'Independent provider' });
    preparation.resolve();
    await Promise.all([saving, deleting]);

    expect(readProviderRow('provider_1')).toBeUndefined();
    expect(getDatabase().select().from(schema.providers).all()).toMatchObject([
      { name: 'Independent provider' },
    ]);
    expect(testState.secrets.size).toBe(0);
    expect(readSecretDeletionTasks()).toEqual([]);
  });

  it('rejects an update ordered after deletion instead of creating another provider', async () => {
    insertProviderRow({ id: 'provider_1' });
    const deleting = deleteProvider('provider_1');
    const saving = saveProvider({ id: 'provider_1', apiKey: 'sk-new' });

    await expect(saving.then(() => undefined)).rejects.toThrow('Provider no longer exists');
    await deleting;
    expect(getDatabase().select().from(schema.providers).all()).toEqual([]);
    expect(testState.saveStoredSecretCalls).toBe(0);
    expect(testState.secrets.size).toBe(0);
  });

  it('continues a queued deletion after credential preparation fails', async () => {
    insertProviderRow({ id: 'provider_1', apiKeyRef: 'provider:provider_1:apiKey' });
    testState.secrets.set('provider:provider_1:apiKey', 'sk-old');
    const preparation = deferred<void>();
    testState.saveStoredSecretPause = preparation.promise;
    const error = new Error('keyring unavailable');
    const saving = saveProvider({ id: 'provider_1', apiKey: 'sk-new' }).catch((failure) => failure);
    await vi.waitFor(() => expect(testState.saveStoredSecretCalls).toBe(1));

    const deleting = deleteProvider('provider_1');
    preparation.reject(error);
    expect(await saving).toBe(error);
    await deleting;

    expect(readProviderRow('provider_1')).toBeUndefined();
    expect(testState.secrets.size).toBe(0);
    expect(readSecretDeletionTasks()).toEqual([]);
  });

  it('returns only provider and settings slices', async () => {
    const saved = await saveProvider({ name: 'Provider' });
    const providerId = saved.providers[0]?.id;

    expect(Object.keys(saved).toSorted()).toEqual(['agents', 'providers', 'settings']);
    expect(providerId).toBeTruthy();
    expect(saved.agents.length).toBeGreaterThan(0);

    const deleted = await deleteProvider(providerId || '');

    expect(Object.keys(deleted).toSorted()).toEqual(['agents', 'providers', 'settings']);
    expect(deleted.providers).toEqual([]);
  });

  it('preserves credentials when provider deletion cannot commit', async () => {
    insertProviderRow({ id: 'provider_1', apiKeyRef: 'provider:provider_1:apiKey' });
    testState.secrets.set('provider:provider_1:apiKey', 'sk-stored');
    getDatabase().run(`
      CREATE TRIGGER fail_provider_delete
      BEFORE DELETE ON providers
      BEGIN
        SELECT RAISE(ABORT, 'injected provider delete failure');
      END
    `);

    await expect(deleteProvider('provider_1')).rejects.toThrow('injected provider delete failure');

    expect(readProviderRow('provider_1')).toBeDefined();
    expect(testState.secrets.get('provider:provider_1:apiKey')).toBe('sk-stored');
    expect(readSecretDeletionTasks()).toEqual([]);
  });

  it('preserves credentials when provider api key removal cannot commit', async () => {
    insertProviderRow({ id: 'provider_1', apiKeyRef: 'provider:provider_1:apiKey' });
    testState.secrets.set('provider:provider_1:apiKey', 'sk-stored');
    getDatabase().run(`
      CREATE TRIGGER fail_provider_update
      BEFORE UPDATE ON providers
      BEGIN
        SELECT RAISE(ABORT, 'injected provider update failure');
      END
    `);

    await expect(saveProvider({ id: 'provider_1', removeApiKey: true })).rejects.toThrow(
      'injected provider update failure',
    );

    expect(readProviderRow('provider_1')?.apiKeyRef).toBe('provider:provider_1:apiKey');
    expect(testState.secrets.get('provider:provider_1:apiKey')).toBe('sk-stored');
    expect(readSecretDeletionTasks()).toEqual([]);
  });

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

  it('removes a prepared credential when a new provider cannot commit', async () => {
    getDatabase().run(`
      CREATE TRIGGER fail_provider_insert
      BEFORE INSERT ON providers
      BEGIN
        SELECT RAISE(ABORT, 'injected provider insert failure');
      END
    `);

    await expect(saveProvider({ name: 'Provider', apiKey: 'sk-new' })).rejects.toThrow(
      'injected provider insert failure',
    );

    expect(testState.secrets.size).toBe(0);
    expect(getDatabase().select().from(schema.providers).all()).toEqual([]);
    expect(readSecretDeletionTasks()).toEqual([]);
  });

  it('recovers prepared credential cleanup after replacement rollback', async () => {
    insertProviderRow({ id: 'provider_1', apiKeyRef: 'provider:provider_1:apiKey' });
    testState.secrets.set('provider:provider_1:apiKey', 'sk-old');
    testState.deleteStoredSecretError = new Error('keyring locked');
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

    const preparedRef = [...testState.secrets.keys()].find((ref) => ref.includes(':version:'));
    expect(preparedRef).toBeDefined();
    expect(readSecretDeletionTasks()).toEqual([
      expect.objectContaining({ secretRef: preparedRef }),
    ]);
    expect(testState.logErrors).toContainEqual({
      event: 'credential_swap.abort_cleanup_deferred',
      error: testState.deleteStoredSecretError,
      data: { secretRef: preparedRef },
    });

    testState.deleteStoredSecretError = undefined;
    closeDatabase();
    await readStore();

    expect(testState.secrets.get('provider:provider_1:apiKey')).toBe('sk-old');
    expect(testState.secrets.has(preparedRef || '')).toBe(false);
    expect(readSecretDeletionTasks()).toEqual([]);
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

  it('cancels pending cleanup when a provider api key is saved again', async () => {
    insertProviderRow({ id: 'provider_1', apiKeyRef: 'provider:provider_1:apiKey' });
    testState.secrets.set('provider:provider_1:apiKey', 'sk-old');
    testState.deleteStoredSecretError = new Error('keyring locked');

    await expect(saveProvider({ id: 'provider_1', removeApiKey: true })).resolves.toBeDefined();

    testState.deleteStoredSecretError = undefined;
    await saveProvider({ id: 'provider_1', apiKey: 'sk-new' });
    closeDatabase();
    await readStore();

    const replacementRef = readProviderRow('provider_1')?.apiKeyRef;
    expect(replacementRef).toMatch(/^provider:provider_1:apiKey:version:/);
    expect(testState.secrets.get(replacementRef || '')).toBe('sk-new');
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

  it('does not preserve existing legacy api keys as SQLite fallback', async () => {
    await expect(
      resolveProviderApiKeyStorage('provider_1', {}, { apiKey: 'legacy-key', apiKeyRef: null }),
    ).resolves.toEqual({ credentialChange: {}, storedApiKey: '' });
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
        storedApiKey: '',
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

  it('builds provider records after api key removal without deleting settings', () => {
    const existing = {
      id: 'provider_1',
      name: 'DeepSeek',
      type: 'openai-chat' as const,
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      hasApiKey: true,
      modelName: 'deepseek-chat',
      modelInputMode: 'custom' as const,
      reasoningEffort: 'none' as const,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    const provider = buildProviderRecord(
      { id: 'provider_1', removeApiKey: true },
      {
        id: 'provider_1',
        now: '2026-05-16T00:00:00.000Z',
        existing,
        storedApiKey: '',
      },
    );

    expect(provider).toMatchObject({
      name: 'DeepSeek',
      apiKey: '',
      hasApiKey: false,
      modelName: 'deepseek-chat',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    });
  });

  it('reads stored provider api keys from the keyring', async () => {
    testState.secrets.set('provider:provider_1:apiKey', 'sk-stored');

    await expect(readStoredProviderApiKey('provider_1')).resolves.toBe('sk-stored');
  });

  it('does not read legacy provider api keys from SQLite', async () => {
    insertProviderRow({ id: 'provider_1', apiKey: 'legacy-key' });

    await expect(readStoredProviderApiKey('provider_1')).resolves.toBe('');
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

  it('shares an in-flight provider api key migration', async () => {
    const migration = deferred<void>();
    testState.saveProviderApiKeyPause = migration.promise;
    insertProviderRow({ id: 'provider_1', apiKey: 'legacy-key' });

    const firstRead = readStore();
    const secondRead = readStore();
    await vi.waitFor(() => expect(testState.saveProviderApiKeyCalls).toBe(1));
    migration.resolve();
    await Promise.all([firstRead, secondRead]);

    expect(testState.saveProviderApiKeyCalls).toBe(1);
    expect(readProviderRow('provider_1')).toMatchObject({
      apiKey: '',
      apiKeyRef: 'provider:provider_1:apiKey',
    });
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
