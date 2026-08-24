import { rm } from 'node:fs/promises';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  secrets: new Map<string, string>(),
  saveProviderApiKeyError: undefined as Error | undefined,
  saveProviderApiKeyPause: undefined as Promise<void> | undefined,
  saveProviderApiKeyCalls: 0,
  deleteStoredSecretError: undefined as Error | undefined,
  providerApiKeyRef: (providerId: string) => `provider:${providerId}:apiKey`,
  backfillAnnotationMemoryEntries: vi.fn(),
  fetchFaviconDataUrl: vi.fn(),
  logErrors: [] as Array<{ event: string; error: unknown; data?: Record<string, unknown> }>,
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/yomitomo-store-agents-test',
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

import { buildAgentRecord } from '../agents/agent-repository';
import { deleteAgent, saveAgent } from './store-agents';
import { closeDatabase } from './store-lifecycle';
import { saveProvider } from './store-providers';

beforeEach(async () => {
  closeDatabase();
  await rm('/tmp/yomitomo-store-agents-test', { recursive: true, force: true });
  testState.secrets.clear();
  testState.saveProviderApiKeyError = undefined;
  testState.saveProviderApiKeyPause = undefined;
  testState.saveProviderApiKeyCalls = 0;
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
  await rm('/tmp/yomitomo-store-agents-test', { recursive: true, force: true });
});

describe('desktop store agents', () => {
  it('returns only the agent slice after saves and deletes', async () => {
    const provider = await saveProvider({ name: 'Provider' });
    const saved = await saveAgent({
      nickname: 'Custom Agent',
      providerId: provider.providers[0]?.id,
    });
    const agentId = saved.agents.find((agent) => agent.nickname === 'Custom Agent')?.id;

    expect(Object.keys(saved)).toEqual(['agents']);
    expect(agentId).toBeTruthy();

    const deleted = await deleteAgent(agentId || '');

    expect(Object.keys(deleted)).toEqual(['agents']);
    expect(deleted.agents.some((agent) => agent.id === agentId)).toBe(false);
  });

  it('normalizes new agent records against the selected provider', () => {
    const agent = buildAgentRecord(
      {
        kind: 'review',
        providerId: 'provider_1',
        nickname: ' Reviewer ',
        username: ' @Reviewer Bot ',
        enabled: false,
        annotationDensity: 'high',
        temperature: 2,
      },
      {
        agents: [],
        providers: [
          {
            id: 'provider_1',
            name: 'Provider',
            type: 'openai-chat',
            baseUrl: 'https://api.example.com',
            apiKey: '',
            hasApiKey: false,
            modelName: 'model-a',
            modelInputMode: 'custom',
            reasoningEffort: 'none',
            createdAt: '2026-05-16T00:00:00.000Z',
            updatedAt: '2026-05-16T00:00:00.000Z',
          },
        ],
      },
      '2026-05-16T00:00:00.000Z',
    );

    expect(agent).toMatchObject({
      kind: 'review',
      providerId: 'provider_1',
      nickname: 'Reviewer',
      username: 'ReviewerBot',
      enabled: false,
      annotationDensity: 'high',
      temperature: 1,
    });
  });

  it('preserves existing agent fields on partial updates', () => {
    const created = buildAgentRecord(
      {
        kind: 'review',
        providerId: 'provider_1',
        nickname: 'Reviewer',
        username: 'reviewer',
        enabled: false,
        annotationDensity: 'low',
        temperature: 0.25,
      },
      {
        agents: [],
        providers: [],
      },
      '2026-05-16T00:00:00.000Z',
    );
    const updated = buildAgentRecord(
      { id: created.id, nickname: 'Updated Reviewer' },
      {
        agents: [created],
        providers: [],
      },
      '2026-05-16T01:00:00.000Z',
    );

    expect(updated).toMatchObject({
      id: created.id,
      kind: 'review',
      providerId: 'provider_1',
      nickname: 'Updated Reviewer',
      username: 'reviewer',
      enabled: false,
      annotationDensity: 'low',
      temperature: 0.25,
    });
  });
});
