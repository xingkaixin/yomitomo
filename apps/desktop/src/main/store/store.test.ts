import { rm } from 'node:fs/promises';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPdfTextAnchor,
  isPdfTextAnchor,
  type Annotation,
  type ArticleRecord,
  type ArticleSummaryRecord,
  type Comment,
  type ReaderChatState,
} from '@yomitomo/shared';

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
    getPath: () => '/tmp/yomitomo-store-test',
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

import { buildArticleChildRows } from '../articles/article-repository-child-rows';
import {
  buildArticleReaderChatStatePatch,
  buildArticleReadingProgressPatch,
} from '../articles/article-reading-state';
import { buildArticleUpsertPatch, writeArticleRows } from '../articles/article-row-writes';
import {
  findArticleInListByIdentity,
  readArticleRows,
  readArticleSiteIconRawRows,
} from '../articles/article-row-queries';
import { buildAgentRecord } from '../agents/agent-repository';
import {
  buildProviderRecord,
  readStoredProviderApiKey,
  resolveProviderApiKeyStorage,
} from '../providers/provider-repository';
import { addCollectionMembers, createCollection, setLibraryPin } from './store-collections';
import { deleteAgent, saveAgent } from './store-agents';
import { getDatabase } from './store-db';
import { closeDatabase } from './store-lifecycle';
import { deleteProvider, saveProvider } from './store-providers';
import { saveUser } from './store-settings';
import { ensureArticleSiteIcon } from './store-articles';
import { readShellStore, readStore } from './store-snapshot';
import {
  mergeSettingsForUpsert,
  rowToAnnotation,
  rowToArticleSummary,
  rowToComment,
  type ArticleSummaryRow,
} from './store-normalizers';
import { normalizeWeReadReadingStats } from '../weread/weread-repository';
import { upsertSettings } from './settings-repository';
import * as schema from '../db/schema';

beforeEach(async () => {
  closeDatabase();
  await rm('/tmp/yomitomo-store-test', { recursive: true, force: true });
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
  await rm('/tmp/yomitomo-store-test', { recursive: true, force: true });
});

describe('desktop store settings', () => {
  it('returns only the saved user slice', async () => {
    const patch = await saveUser({ nickname: 'Updated User' });

    expect(Object.keys(patch)).toEqual(['user']);
    expect(patch.user.nickname).toBe('Updated User');
  });

  it('preserves missing settings fields during partial upserts', () => {
    expect(
      mergeSettingsForUpsert(
        {
          defaultProviderId: undefined,
          readingAssistantProviderId: undefined,
          reviewAssistantProviderId: undefined,
          saveArticleImages: true,
        },
        {
          defaultProviderId: 'provider_1',
          uiLanguage: 'en',
          themeId: 'ink-paper',
          libraryPageSize: 18,
          libraryContentSources: [
            { id: 'web', enabled: true },
            { id: 'ebook', enabled: false },
            { id: 'pdf', enabled: true },
            { id: 'text', enabled: true },
            { id: 'weread', enabled: false },
          ],
          readingAssistantProviderId: 'provider_1',
          reviewAssistantProviderId: 'provider_1',
          assistantExecutionMode: 'deep_verification',
          messageSendShortcut: 'mod-enter',
          selectionActionShortcuts: { copy: 'X', annotate: 'B', ask: 'Q' },
          soundEffectsEnabled: false,
          soundEffectsVolume: 0.3,
          saveArticleImages: true,
          allowLocalNetworkArticleImport: true,
          telemetryEnabled: false,
          developerModeEnabled: false,
          logRetentionDays: 30,
          onboardingCompletedAt: '2026-05-12T00:00:00.000Z',
        },
      ),
    ).toEqual({
      defaultProviderId: undefined,
      uiLanguage: 'en',
      themeId: 'ink-paper',
      libraryPageSize: 18,
      libraryContentSources: [
        { id: 'web', enabled: true },
        { id: 'ebook', enabled: false },
        { id: 'pdf', enabled: true },
        { id: 'text', enabled: true },
        { id: 'weread', enabled: false },
      ],
      readingAssistantProviderId: undefined,
      reviewAssistantProviderId: undefined,
      bilingualTranslationProviderId: undefined,
      bilingualTranslationTargetLanguage: 'zh-CN',
      bilingualTranslationStyle: 'dashedLine',
      bilingualTranslationAiContextAware: false,
      assistantExecutionMode: 'deep_verification',
      messageSendShortcut: 'mod-enter',
      selectionActionShortcuts: { copy: 'X', annotate: 'B', ask: 'Q' },
      soundEffectsEnabled: false,
      soundEffectsVolume: 0.3,
      appLockEnabled: false,
      appLockLocked: false,
      appLockLockOnStartup: false,
      appLockShortcut: undefined,
      saveArticleImages: true,
      allowLocalNetworkArticleImport: true,
      telemetryEnabled: false,
      developerModeEnabled: false,
      logRetentionDays: 30,
      onboardingCompletedAt: '2026-05-12T00:00:00.000Z',
      lastSeenVersion: undefined,
    });
  });

  it('defaults assistant execution mode to fast response', () => {
    expect(mergeSettingsForUpsert({}, {})).toMatchObject({
      assistantExecutionMode: 'fast_response',
    });
  });

  it('defaults interface language to Simplified Chinese', () => {
    expect(mergeSettingsForUpsert({}, {})).toMatchObject({
      uiLanguage: 'zh-CN',
    });
  });

  it('defaults library content sources to the current source order', () => {
    expect(mergeSettingsForUpsert({}, {})).toMatchObject({
      libraryContentSources: [
        { id: 'web', enabled: true },
        { id: 'ebook', enabled: true },
        { id: 'pdf', enabled: true },
        { id: 'text', enabled: true },
        { id: 'weread', enabled: true },
      ],
    });
  });

  it('defaults log retention to 90 days', () => {
    expect(mergeSettingsForUpsert({}, {})).toMatchObject({
      logRetentionDays: 90,
    });
    expect(mergeSettingsForUpsert({}, { logRetentionDays: undefined })).toMatchObject({
      logRetentionDays: 90,
    });
  });

  it('normalizes persisted library page size settings', () => {
    expect(mergeSettingsForUpsert({ libraryPageSize: 18 }, {})).toMatchObject({
      libraryPageSize: 18,
    });
    expect(mergeSettingsForUpsert({ libraryPageSize: 10 }, { libraryPageSize: 24 })).toMatchObject({
      libraryPageSize: undefined,
    });
  });

  it('updates the theme id while preserving other settings fields', () => {
    expect(
      mergeSettingsForUpsert(
        { themeId: 'ink-paper' },
        {
          themeId: 'default',
          saveArticleImages: true,
          messageSendShortcut: 'mod-enter',
        },
      ),
    ).toMatchObject({
      themeId: 'ink-paper',
      saveArticleImages: true,
      messageSendShortcut: 'mod-enter',
    });
  });

  it('preserves onboarding completion when merging a log retention patch', () => {
    expect(
      mergeSettingsForUpsert(
        { logRetentionDays: 15 },
        {
          onboardingCompletedAt: '2026-05-12T00:00:00.000Z',
          saveArticleImages: true,
        },
      ),
    ).toMatchObject({
      onboardingCompletedAt: '2026-05-12T00:00:00.000Z',
      logRetentionDays: 15,
      saveArticleImages: true,
    });
  });

  it('defaults telemetry on and preserves it during partial settings updates', () => {
    expect(mergeSettingsForUpsert({}, {})).toMatchObject({ telemetryEnabled: true });
    expect(
      mergeSettingsForUpsert(
        { saveArticleImages: true },
        {
          telemetryEnabled: false,
          saveArticleImages: false,
        },
      ),
    ).toMatchObject({
      saveArticleImages: true,
      telemetryEnabled: false,
    });
  });
});

describe('desktop store providers', () => {
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

  it('recovers a pending provider secret deletion after restart', async () => {
    const deleteError = new Error('keyring locked');
    insertProviderRow({ id: 'provider_1', apiKeyRef: 'provider:provider_1:apiKey' });
    testState.secrets.set('provider:provider_1:apiKey', 'sk-stored');
    testState.deleteStoredSecretError = deleteError;

    await expect(deleteProvider('provider_1')).rejects.toThrow(deleteError);

    expect(readProviderRow('provider_1')).toBeUndefined();
    expect(testState.secrets.get('provider:provider_1:apiKey')).toBe('sk-stored');
    expect(readSecretDeletionTasks()).toEqual([
      expect.objectContaining({ secretRef: 'provider:provider_1:apiKey' }),
    ]);

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

    await expect(saveProvider({ id: 'provider_1', removeApiKey: true })).rejects.toThrow(
      'keyring locked',
    );

    testState.deleteStoredSecretError = undefined;
    await saveProvider({ id: 'provider_1', apiKey: 'sk-new' });
    closeDatabase();
    await readStore();

    expect(testState.secrets.get('provider:provider_1:apiKey')).toBe('sk-new');
    expect(readProviderRow('provider_1')?.apiKeyRef).toBe('provider:provider_1:apiKey');
    expect(readSecretDeletionTasks()).toEqual([]);
  });

  it('resolves new provider api keys into keyring refs', async () => {
    testState.secrets.clear();

    await expect(
      resolveProviderApiKeyStorage('provider_1', { apiKey: ' sk-test ' }, undefined),
    ).resolves.toEqual({
      apiKeyRef: 'provider:provider_1:apiKey',
      storedApiKey: '',
    });
    expect(testState.secrets.get('provider:provider_1:apiKey')).toBe('sk-test');
  });

  it('does not preserve existing legacy api keys as SQLite fallback', async () => {
    await expect(
      resolveProviderApiKeyStorage('provider_1', {}, { apiKey: 'legacy-key', apiKeyRef: null }),
    ).resolves.toEqual({ storedApiKey: '' });
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

  it('clears legacy provider api keys and marks providers unconfigured when keyring migration fails', async () => {
    const error = new Error('keyring locked');
    testState.saveProviderApiKeyError = error;
    insertProviderRow({
      id: 'provider_1',
      apiKey: 'legacy-key',
      apiKeyRef: 'provider:provider_1:apiKey',
    });

    const store = await readStore();
    const row = readProviderRow('provider_1');

    expect(testState.secrets.has('provider:provider_1:apiKey')).toBe(false);
    expect(row).toMatchObject({ apiKey: '', apiKeyRef: null });
    expect(store.providers.find((provider) => provider.id === 'provider_1')).toMatchObject({
      hasApiKey: false,
    });
    expect(testState.logErrors).toEqual([
      {
        event: 'provider.migrate_api_key_failed',
        error,
        data: { providerId: 'provider_1' },
      },
    ]);
  });
});

describe('desktop store annotation memory backfill', () => {
  it('does not retry a failed annotation memory backfill in the same process', async () => {
    const error = new Error('backfill failed');
    testState.backfillAnnotationMemoryEntries.mockImplementation(() => {
      throw error;
    });

    await readStore();
    await readStore();

    expect(testState.backfillAnnotationMemoryEntries).toHaveBeenCalledTimes(1);
    expect(testState.logErrors).toEqual([
      {
        event: 'reading-memory.backfill_annotation_memory_failed',
        error,
        data: undefined,
      },
    ]);
    expect(readAnnotationMemoryBackfillVersion()).toBeNull();
  });
});

describe('desktop store weread reading stats', () => {
  it('preserves detailed reading stats when normalizing cached snapshots', () => {
    expect(
      normalizeWeReadReadingStats(
        {
          totalReadTime: 3660,
          readDays: 3,
          dayAverageReadTime: 1220,
          readStat: [
            { stat: '阅读书籍', counts: '4' },
            { stat: '阅读时长', counts: '61分钟' },
          ],
          readTimes: {
            '1779638400': 1200,
            '1779724800': 2460,
            invalid: 'ignored',
          },
          readLongest: [
            {
              bookId: 'book_1',
              title: '自卑与超越',
              author: '阿德勒',
              cover: 'https://example.com/book.jpg',
              readTime: 1800,
              finishReadingTime: 1779724800,
            },
          ],
          preferCategory: [{ stat: '心理学', counts: '2本' }],
          preferCategoryWord: '这个周期偏爱心理学',
          preferTimeWord: '晚上读得更多',
          preferTime: [20, 21, 'ignored'],
          authorCount: 2,
        },
        'weekly',
      ),
    ).toEqual({
      mode: 'weekly',
      totalReadTime: 3660,
      readDays: 3,
      dayAverageReadTime: 1220,
      compare: undefined,
      readRate: undefined,
      wrReadTime: undefined,
      wrListenTime: undefined,
      readStat: [
        { stat: '阅读书籍', counts: '4' },
        { stat: '阅读时长', counts: '61分钟' },
      ],
      readTimes: {
        '1779638400': 1200,
        '1779724800': 2460,
      },
      readLongest: [
        {
          bookId: 'book_1',
          title: '自卑与超越',
          author: '阿德勒',
          cover: 'https://example.com/book.jpg',
          readTime: 1800,
          finishReadingTime: 1779724800,
        },
      ],
      preferCategory: [{ stat: '心理学', counts: '2本' }],
      preferCategoryWord: '这个周期偏爱心理学',
      preferTimeWord: '晚上读得更多',
      preferTime: [20, 21],
      preferAuthor: undefined,
      preferPublisher: undefined,
      authorCount: 2,
      registTime: undefined,
    });
  });
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

describe('desktop store reading progress', () => {
  it('builds only the article progress patch', () => {
    const readingProgress = {
      pageIndex: 3,
      pageCount: 12,
      chapterIndex: 1,
      chapterProgress: 0.25,
      progress: 0.31,
      updatedAt: '2026-05-17T08:00:00.000Z',
    };

    expect(buildArticleReadingProgressPatch('article_progress', readingProgress)).toEqual({
      articleId: 'article_progress',
      readingProgress,
      updatedAt: readingProgress.updatedAt,
    });
  });
});

describe('desktop store articles', () => {
  it('applies import network settings when localizing a site icon', async () => {
    const database = getDatabase();
    const remoteUrl = 'http://127.0.0.1/favicon.png';
    const dataUrl = 'data:image/png;base64,AQI=';
    writeArticleRows(database, {
      ...articleRecord({ id: 'article-site-icon' }),
      siteIconUrl: remoteUrl,
    });
    upsertSettings(database, { allowLocalNetworkArticleImport: true });
    testState.fetchFaviconDataUrl.mockResolvedValue(dataUrl);

    await expect(ensureArticleSiteIcon('article-site-icon')).resolves.toBe(dataUrl);

    expect(testState.fetchFaviconDataUrl).toHaveBeenCalledWith(remoteUrl, {
      allowLocalNetworkArticleImport: true,
    });
    expect(readArticleRows(database, 'article-site-icon')?.siteIconUrl).toBe(dataUrl);
  });

  it('clears a remote site icon after localization fails', async () => {
    const database = getDatabase();
    const remoteUrl = 'https://example.com/favicon.png';
    writeArticleRows(database, {
      ...articleRecord({ id: 'article-failed-site-icon' }),
      siteIconUrl: remoteUrl,
    });
    testState.fetchFaviconDataUrl.mockResolvedValue('');

    await expect(ensureArticleSiteIcon('article-failed-site-icon')).resolves.toBe('');
    await expect(ensureArticleSiteIcon('article-failed-site-icon')).resolves.toBe('');

    expect(testState.fetchFaviconDataUrl).toHaveBeenCalledOnce();
    expect(testState.fetchFaviconDataUrl).toHaveBeenCalledWith(remoteUrl, {
      allowLocalNetworkArticleImport: false,
    });
    expect(readArticleSiteIconRawRows(database, 'article-failed-site-icon')).toBe('');
  });

  it('builds only the article upsert patch', () => {
    const article: ArticleSummaryRecord = {
      id: 'article-upsert',
      url: 'https://example.com/article-upsert',
      canonicalUrl: 'https://example.com/article-upsert',
      title: 'Upsert article',
      contentHash: 'hash-upsert',
      annotations: [],
      createdAt: '2026-05-17T07:00:00.000Z',
      updatedAt: '2026-05-17T08:00:00.000Z',
    };

    expect(buildArticleUpsertPatch(article)).toEqual({
      type: 'article-upsert',
      article,
    });
  });

  it('keeps aggregate counts on lightweight article summaries', () => {
    const article = rowToArticleSummary(storeSummaryRow(), [], {
      annotationCount: 2,
      thoughtCount: 1,
      discussionCommentCount: 3,
      aiCommentCount: 1,
      distillationCount: 1,
    });

    expect(article.annotations).toEqual([]);
    expect(article.annotationCount).toBe(2);
    expect(article.thoughtCount).toBe(1);
    expect(article.discussionCommentCount).toBe(3);
    expect(article.aiCommentCount).toBe(1);
    expect(article.distillationCount).toBe(1);
  });

  it('keeps ebook summaries free of full chapter data', () => {
    const article = rowToArticleSummary(
      {
        ...storeSummaryRow(),
        sourceType: 'ebook',
        ebookMetadata: {
          format: 'epub',
          fileName: 'book.epub',
          fileSize: 1200,
        },
      },
      [],
    );

    expect(article.ebook).toEqual({
      metadata: {
        format: 'epub',
        fileName: 'book.epub',
        fileSize: 1200,
      },
    });
  });

  it('preserves non-EPUB ebook formats in article summaries', () => {
    const article = rowToArticleSummary(
      {
        ...storeSummaryRow(),
        sourceType: 'ebook',
        ebookMetadata: {
          format: 'azw3',
          fileName: 'book.azw3',
          fileSize: 2400,
        },
      },
      [],
    );

    expect(article.ebook?.metadata.format).toBe('azw3');
    expect(article.ebook?.metadata.fileName).toBe('book.azw3');
  });

  it('keeps reader chat state out of article summaries', () => {
    const article = rowToArticleSummary(storeSummaryRow(), []);

    expect(Object.hasOwn(article, 'readerChatState')).toBe(false);
  });

  it('keeps shell store reads free of article summaries', async () => {
    const database = getDatabase();
    writeArticleRows(database, articleRecord({ id: 'shell_article' }));

    const fullStore = await readStore();
    const shellStore = await readShellStore();

    expect(fullStore.articles.map((article) => article.id)).toEqual(['shell_article']);
    expect(shellStore.articles).toEqual([]);
  });

  it('does not persist derived content html for ebook articles', () => {
    const database = getDatabase();
    const ebookArticle: ArticleRecord = {
      ...articleRecord({
        id: 'ebook_article',
        sourceType: 'ebook',
        contentHtml: '<section><p>derived html</p></section>',
      }),
      ebook: {
        metadata: { format: 'epub', fileName: 'book.epub', fileSize: 1200 },
        chapters: [
          {
            id: 'chapter-1',
            title: '第一章',
            href: 'chapter-1.xhtml',
            html: '<p>chapter html</p>',
            textLength: 12,
          },
        ],
      },
    };

    writeArticleRows(database, ebookArticle);

    const row = database
      .select()
      .from(schema.articles)
      .all()
      .find((item) => item.id === 'ebook_article');
    expect(row?.contentHtml).toBeNull();
    expect(row?.ebookChapters).toEqual(ebookArticle.ebook?.chapters);
  });

  it('hydrates annotation avatars from current actor rows without persisting copies', () => {
    const database = getDatabase();
    insertProviderRow({ id: 'provider_avatar' });
    database.insert(schema.agents).values(agentRow()).run();
    database.insert(schema.userProfiles).values(userProfileRow()).run();

    const article = articleRecord({
      id: 'avatar_article',
      annotations: [
        {
          ...annotationRecord('annotation_user_avatar', [
            {
              ...commentRecord('comment_user_avatar', '用户评论'),
              userAvatar: 'stale-user-avatar',
            },
          ]),
          userAvatar: 'stale-user-avatar',
        },
        {
          ...annotationRecord('annotation_agent_avatar', [
            {
              ...commentRecord('comment_agent_avatar', '助手评论'),
              author: 'ai',
              agentId: 'agent_avatar',
              agentAvatar: 'stale-agent-avatar',
            },
          ]),
          author: 'ai',
          agentId: 'agent_avatar',
          agentAvatar: 'stale-agent-avatar',
        },
      ],
    });

    writeArticleRows(database, article);

    const annotationRows = database.select().from(schema.annotations).all();
    const commentRows = database.select().from(schema.comments).all();
    expect(annotationRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'annotation_user_avatar', userAvatar: null }),
        expect.objectContaining({ id: 'annotation_agent_avatar', agentAvatar: null }),
      ]),
    );
    expect(commentRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'comment_user_avatar', userAvatar: null }),
        expect.objectContaining({ id: 'comment_agent_avatar', agentAvatar: null }),
      ]),
    );

    const hydratedArticle = readArticleRows(database, 'avatar_article');
    expect(hydratedArticle?.annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'annotation_user_avatar',
          userAvatar: 'current-user-avatar',
          comments: [
            expect.objectContaining({
              id: 'comment_user_avatar',
              userAvatar: 'current-user-avatar',
            }),
          ],
        }),
        expect.objectContaining({
          id: 'annotation_agent_avatar',
          agentAvatar: 'current-agent-avatar',
          comments: [
            expect.objectContaining({
              id: 'comment_agent_avatar',
              agentAvatar: 'current-agent-avatar',
            }),
          ],
        }),
      ]),
    );
  });

  it('includes collections members and pins in store snapshots', async () => {
    const { collection } = await createCollection({ name: '主题研究' });
    await addCollectionMembers({
      collectionId: collection.id,
      members: [
        { kind: 'article', id: 'article_1' },
        { kind: 'weread', id: 'book_1' },
      ],
    });
    await setLibraryPin({
      target: { kind: 'collection', id: collection.id },
      pinned: true,
    });

    const store = await readStore();

    expect(store.collections).toMatchObject([{ id: collection.id, name: '主题研究' }]);
    expect(store.collectionMembers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collectionId: collection.id,
          member: { kind: 'article', id: 'article_1' },
        }),
        expect.objectContaining({
          collectionId: collection.id,
          member: { kind: 'weread', id: 'book_1' },
        }),
      ]),
    );
    expect(store.pins).toEqual([
      expect.objectContaining({
        targetKind: 'collection',
        targetId: collection.id,
      }),
    ]);
  });

  it('normalizes reader chat state patches', () => {
    const readerChatState: ReaderChatState = {
      articleId: 'store-summary-article',
      activeSessionId: 'session_1',
      selectedAssistantId: 'agent_reader',
      createdAt: '2026-06-06T08:00:00.000Z',
      updatedAt: '2026-06-06T08:05:00.000Z',
      sessions: [
        {
          id: 'session_1',
          articleId: 'store-summary-article',
          createdAt: '2026-06-06T08:00:00.000Z',
          updatedAt: '2026-06-06T08:05:00.000Z',
          messages: [
            {
              id: 'message_1',
              role: 'user',
              content: '这里的概念是什么意思？',
              context: {
                sourceType: 'pdf',
                quote: '关键概念',
                anchor: createPdfTextAnchor({
                  pageText: '这里有一个关键概念需要解释。',
                  start: 5,
                  end: 9,
                  pageIndex: 2,
                  pageWidth: 612,
                  pageHeight: 792,
                  rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
                }),
              },
              createdAt: '2026-06-06T08:01:00.000Z',
            },
          ],
        },
      ],
    };
    const patch = buildArticleReaderChatStatePatch('store-summary-article', readerChatState);

    expect(patch).toEqual({
      type: 'article-reader-chat-state',
      articleId: 'store-summary-article',
      readerChatState,
      updatedAt: readerChatState.updatedAt,
    });
  });

  it('drops reader chat state that belongs to another article', () => {
    const readerChatState: ReaderChatState = {
      articleId: 'other-article',
      activeSessionId: 'session_1',
      createdAt: '2026-06-06T08:00:00.000Z',
      updatedAt: '2026-06-06T08:05:00.000Z',
      sessions: [
        {
          id: 'session_1',
          articleId: 'other-article',
          createdAt: '2026-06-06T08:00:00.000Z',
          updatedAt: '2026-06-06T08:05:00.000Z',
          messages: [],
        },
      ],
    };

    expect(
      buildArticleReaderChatStatePatch('store-summary-article', readerChatState).readerChatState,
    ).toBeUndefined();
  });

  it('builds child rows for multiple annotations and comments', () => {
    const rows = buildArticleChildRows({
      id: 'store-batch-article',
      annotations: [
        annotationRecord('store-batch-annotation-1', [
          {
            ...commentRecord('store-batch-comment-1', '第一条评论。'),
            assistantProgress: {
              steps: [{ id: 'get_current_thread', label: '读取当前讨论', status: 'done' }],
            },
          },
          commentRecord('store-batch-comment-2', '第二条评论。'),
        ]),
        annotationRecord('store-batch-annotation-2', [
          commentRecord('store-batch-comment-3', '第三条评论。'),
        ]),
      ],
    });

    expect(rows.annotationRows.map((annotation) => annotation.id)).toEqual([
      'store-batch-annotation-1',
      'store-batch-annotation-2',
    ]);
    expect(rows.annotationRows.map((annotation) => annotation.articleId)).toEqual([
      'store-batch-article',
      'store-batch-article',
    ]);
    expect(rows.commentRows.map((comment) => comment.id)).toEqual([
      'store-batch-comment-1',
      'store-batch-comment-2',
      'store-batch-comment-3',
    ]);
    expect(rows.commentRows.map((comment) => comment.annotationId)).toEqual([
      'store-batch-annotation-1',
      'store-batch-annotation-1',
      'store-batch-annotation-2',
    ]);
    const firstCommentRow = rows.commentRows[0];
    if (!firstCommentRow) throw new Error('expected comment row');
    expect(firstCommentRow.assistantProgress).toEqual({
      steps: [{ id: 'get_current_thread', label: '读取当前讨论', status: 'done' }],
    });
    expect(
      rowToComment({
        ...firstCommentRow,
        replyTo: firstCommentRow.replyTo ?? null,
        agentId: firstCommentRow.agentId ?? null,
        agentUsername: firstCommentRow.agentUsername ?? null,
        agentNickname: firstCommentRow.agentNickname ?? null,
        agentAvatar: firstCommentRow.agentAvatar ?? null,
        agentAnnotationColor: firstCommentRow.agentAnnotationColor ?? null,
        readingIntent: firstCommentRow.readingIntent ?? null,
        reviewLabel: firstCommentRow.reviewLabel ?? null,
        assistantProgress: firstCommentRow.assistantProgress ?? null,
        userId: firstCommentRow.userId ?? null,
        userUsername: firstCommentRow.userUsername ?? null,
        userNickname: firstCommentRow.userNickname ?? null,
        userAvatar: firstCommentRow.userAvatar ?? null,
        userAnnotationColor: firstCommentRow.userAnnotationColor ?? null,
        pending: firstCommentRow.pending ?? null,
      }),
    ).toMatchObject({
      assistantProgress: {
        steps: [{ id: 'get_current_thread', label: '读取当前讨论', status: 'done' }],
      },
    });
  });

  it('builds annotation distillation rows for published reading assets', () => {
    const rows = buildArticleChildRows({
      id: 'store-distillation-article',
      annotations: [
        {
          ...annotationRecord('store-distillation-annotation', []),
          distillation: {
            status: 'published',
            content: '最终沉淀',
            publishedAt: '2026-05-17T01:00:00.000Z',
            updatedAt: '2026-05-17T02:00:00.000Z',
            reviewSessions: [
              {
                id: 'review-session-1',
                agentId: 'review-agent-1',
                agentNickname: '梁证言',
                messages: [
                  {
                    id: 'review-message-1',
                    author: 'ai',
                    content: '这里还可以追问前提。',
                    createdAt: '2026-05-17T01:30:00.000Z',
                    agentId: 'review-agent-1',
                  },
                ],
                createdAt: '2026-05-17T01:20:00.000Z',
                updatedAt: '2026-05-17T01:30:00.000Z',
              },
            ],
          },
        },
      ],
    });

    expect(rows.annotationRows[0]).toMatchObject({
      distillationStatus: 'published',
      distillationContent: '最终沉淀',
      distillationPublishedAt: '2026-05-17T01:00:00.000Z',
      distillationUpdatedAt: '2026-05-17T02:00:00.000Z',
      distillationReviewSessions: [
        expect.objectContaining({
          id: 'review-session-1',
          agentId: 'review-agent-1',
        }),
      ],
    });
  });

  it('preserves PDF annotation anchors when reading rows', () => {
    const pdfAnchor = createPdfTextAnchor({
      pageText: '第一页 PDF 正文',
      pageIndex: 2,
      start: 4,
      end: 7,
      pageWidth: 612,
      pageHeight: 792,
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
    });
    const rows = buildArticleChildRows({
      id: 'pdf-article',
      annotations: [{ ...annotationRecord('pdf-annotation', []), anchor: pdfAnchor }],
    });

    const annotationRow = rows.annotationRows[0];
    if (!annotationRow) throw new Error('expected annotation row');
    const annotation = rowToAnnotation(
      {
        ...annotationRow,
        annotationType: annotationRow.annotationType ?? null,
        readingIntent: annotationRow.readingIntent ?? null,
        whyHere: annotationRow.whyHere ?? null,
        confidence: annotationRow.confidence ?? null,
        moveType: annotationRow.moveType ?? null,
        shouldShow: annotationRow.shouldShow ?? null,
        agentId: annotationRow.agentId ?? null,
        agentUsername: annotationRow.agentUsername ?? null,
        agentNickname: annotationRow.agentNickname ?? null,
        agentAvatar: annotationRow.agentAvatar ?? null,
        agentAnnotationColor: annotationRow.agentAnnotationColor ?? null,
        userId: annotationRow.userId ?? null,
        userUsername: annotationRow.userUsername ?? null,
        userNickname: annotationRow.userNickname ?? null,
        userAvatar: annotationRow.userAvatar ?? null,
        userAnnotationColor: annotationRow.userAnnotationColor ?? null,
        distillationStatus: annotationRow.distillationStatus ?? null,
        distillationContent: annotationRow.distillationContent ?? null,
        distillationPublishedAt: annotationRow.distillationPublishedAt ?? null,
        distillationUpdatedAt: annotationRow.distillationUpdatedAt ?? null,
        distillationReviewSessions: annotationRow.distillationReviewSessions ?? null,
      },
      [],
    );

    expect(isPdfTextAnchor(annotation.anchor)).toBe(true);
    expect(annotation.anchor).toMatchObject({
      kind: 'pdf-text',
      pageIndex: 2,
      pageWidth: 612,
      pageHeight: 792,
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
    });
  });

  it('normalizes distillation review proposals from persisted rows', () => {
    const rows = buildArticleChildRows({
      id: 'store-distillation-proposals-article',
      annotations: [
        {
          ...annotationRecord('store-distillation-proposals-annotation', []),
          distillation: {
            status: 'unpublished',
            content: '草稿',
            reviewSessions: [
              {
                id: 'review-session-proposals',
                agentId: 'review-agent-1',
                messages: [
                  {
                    id: 'review-message-proposals',
                    author: 'ai',
                    content: '可以把讨论沉淀成可执行判断。',
                    createdAt: '2026-05-17T01:30:00.000Z',
                    proposals: [
                      {
                        id: 'proposal-insert',
                        kind: 'insert',
                        status: 'pending',
                        title: '',
                        content: '新增判断',
                        sourceDraftHash: 'draft_hash_1',
                        sourceReviewSessionId: 'review-session-proposals',
                        sourceReviewMessageId: 'review-message-proposals',
                        sourceAgentId: 'review-agent-1',
                        updatedAt: '2026-05-17T01:31:00.000Z',
                      },
                      {
                        id: 'proposal-invalid-replace',
                        kind: 'replace',
                        status: 'pending',
                        title: '无效修改',
                        targetText: '旧判断',
                        updatedAt: '2026-05-17T01:32:00.000Z',
                      },
                    ],
                  },
                ],
                createdAt: '2026-05-17T01:20:00.000Z',
                updatedAt: '2026-05-17T01:30:00.000Z',
              },
            ],
          },
        },
      ],
    });

    const annotationRow = rows.annotationRows[0];
    if (!annotationRow) throw new Error('expected annotation row');
    const annotation = rowToAnnotation(
      {
        ...annotationRow,
        annotationType: annotationRow.annotationType ?? null,
        readingIntent: annotationRow.readingIntent ?? null,
        whyHere: annotationRow.whyHere ?? null,
        confidence: annotationRow.confidence ?? null,
        moveType: annotationRow.moveType ?? null,
        shouldShow: annotationRow.shouldShow ?? null,
        agentId: annotationRow.agentId ?? null,
        agentUsername: annotationRow.agentUsername ?? null,
        agentNickname: annotationRow.agentNickname ?? null,
        agentAvatar: annotationRow.agentAvatar ?? null,
        agentAnnotationColor: annotationRow.agentAnnotationColor ?? null,
        userId: annotationRow.userId ?? null,
        userUsername: annotationRow.userUsername ?? null,
        userNickname: annotationRow.userNickname ?? null,
        userAvatar: annotationRow.userAvatar ?? null,
        userAnnotationColor: annotationRow.userAnnotationColor ?? null,
        distillationStatus: annotationRow.distillationStatus ?? null,
        distillationContent: annotationRow.distillationContent ?? null,
        distillationPublishedAt: annotationRow.distillationPublishedAt ?? null,
        distillationUpdatedAt: annotationRow.distillationUpdatedAt ?? null,
        distillationReviewSessions: annotationRow.distillationReviewSessions ?? null,
      },
      [],
    );

    const message = annotation.distillation?.reviewSessions?.[0]?.messages[0];
    expect(message?.proposals).toEqual([
      expect.objectContaining({
        id: 'proposal-insert',
        kind: 'insert',
        status: 'pending',
        title: '新增：新增判断',
        content: '新增判断',
        sourceDraftHash: 'draft_hash_1',
        sourceReviewSessionId: 'review-session-proposals',
        sourceReviewMessageId: 'review-message-proposals',
        sourceAgentId: 'review-agent-1',
      }),
    ]);
  });

  it('finds existing import articles by id before url identity', () => {
    const idMatch = articleSummaryRecord({
      id: 'id-match',
      url: 'https://example.com/id-match',
      canonicalUrl: 'https://example.com/id-match',
    });
    const urlMatch = articleSummaryRecord({
      id: 'url-match',
      url: 'https://example.com/import',
      canonicalUrl: 'https://example.com/import',
    });

    expect(
      findArticleInListByIdentity([urlMatch, idMatch], {
        id: 'id-match',
        url: 'https://example.com/import',
        canonicalUrl: 'https://example.com/import',
      })?.id,
    ).toBe('id-match');
  });

  it('finds existing import articles by cross-url identity in list order', () => {
    const newer = articleSummaryRecord({
      id: 'newer',
      url: 'https://example.com/newer',
      canonicalUrl: 'https://example.com/import',
    });
    const older = articleSummaryRecord({
      id: 'older',
      url: 'https://example.com/import',
      canonicalUrl: 'https://example.com/older',
    });

    expect(
      findArticleInListByIdentity([newer, older], {
        id: 'missing',
        url: 'https://example.com/import',
        canonicalUrl: 'https://example.com/canonical',
      })?.id,
    ).toBe('newer');
  });
});

function articleSummaryRecord(input: Partial<ArticleSummaryRecord>): ArticleSummaryRecord {
  const id = input.id || 'article';
  return {
    id,
    url: input.url || `https://example.com/${id}`,
    canonicalUrl: input.canonicalUrl || input.url || `https://example.com/${id}`,
    sourceType: input.sourceType || 'web',
    title: input.title || id,
    contentHash: input.contentHash || `hash-${id}`,
    annotations: input.annotations || [],
    createdAt: input.createdAt || '2026-05-17T07:00:00.000Z',
    updatedAt: input.updatedAt || '2026-05-17T08:00:00.000Z',
  };
}

function articleRecord(input: Partial<ArticleRecord>): ArticleRecord {
  const id = input.id || 'article';
  return {
    id,
    url: input.url || `https://example.com/${id}`,
    canonicalUrl: input.canonicalUrl || input.url || `https://example.com/${id}`,
    sourceType: input.sourceType || 'web',
    title: input.title || id,
    contentHash: input.contentHash || `hash-${id}`,
    annotations: input.annotations || [],
    contentHtml: input.contentHtml || '<p>正文</p>',
    createdAt: input.createdAt || '2026-05-17T07:00:00.000Z',
    updatedAt: input.updatedAt || '2026-05-17T08:00:00.000Z',
  };
}

function annotationRecord(id: string, comments: Comment[]): Annotation {
  return {
    id,
    anchor: {
      exact: '正文',
      prefix: '',
      suffix: '。',
      start: 0,
      end: 2,
    },
    author: 'user',
    color: '#f59e0b',
    userId: 'user-test',
    comments,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
  };
}

function commentRecord(id: string, content: string): Comment {
  return {
    id,
    author: 'user',
    content,
    createdAt: '2026-05-17T00:00:00.000Z',
    userId: 'user-test',
  };
}

function storeSummaryRow(): ArticleSummaryRow {
  return {
    id: 'store-summary-article',
    url: 'https://example.com/article',
    canonicalUrl: 'https://example.com/article',
    sourceType: 'web',
    title: '摘要计数文章',
    byline: null,
    excerpt: null,
    siteName: null,
    themeColor: null,
    contentHash: 'hash-summary',
    ebookMetadata: null,
    pdfMetadata: null,
    textMetadata: null,
    readingProgress: null,
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
  };
}

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

function agentRow(): typeof schema.agents.$inferInsert {
  return {
    id: 'agent_avatar',
    kind: 'annotation',
    presetId: null,
    enabled: true,
    providerId: 'provider_avatar',
    nickname: 'Agent',
    username: 'agent',
    avatar: 'current-agent-avatar',
    annotationColor: '#8ab6d6',
    annotationDensity: 'medium',
    temperature: 0.7,
    soul: 'test',
    createdAt: '2026-05-16T00:00:00.000Z',
    updatedAt: '2026-05-16T00:00:00.000Z',
  };
}

function userProfileRow(): typeof schema.userProfiles.$inferInsert {
  return {
    id: 'user-test',
    nickname: 'Kevin',
    username: 'kevin',
    avatar: 'current-user-avatar',
    annotationColor: '#f59e0b',
    updatedAt: '2026-05-16T00:00:00.000Z',
  };
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

function readAnnotationMemoryBackfillVersion() {
  return (
    getDatabase()
      .select({ version: schema.appSettings.annotationMemoryBackfillVersion })
      .from(schema.appSettings)
      .limit(1)
      .get()?.version || null
  );
}
