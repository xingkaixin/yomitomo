import { rm } from 'node:fs/promises';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { type ArticleRecord } from '@yomitomo/shared';

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
    getPath: () => '/tmp/yomitomo-store-settings-test',
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

import { writeArticleRows } from '../articles/article-row-writes';
import { getDatabase } from './store-db';
import { closeDatabase } from './store-lifecycle';
import { saveUser } from './store-settings';
import { mergeSettingsForUpsert } from './store-normalizers';
import * as schema from '../db/schema';

beforeEach(async () => {
  closeDatabase();
  await rm('/tmp/yomitomo-store-settings-test', { recursive: true, force: true });
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
  await rm('/tmp/yomitomo-store-settings-test', { recursive: true, force: true });
});

describe('desktop store initialization', () => {
  it('fills missing default rows without replacing existing data', () => {
    const database = getDatabase();
    writeArticleRows(database, articleRecord({ id: 'article_preserved_during_seed' }));
    database.update(schema.appSettings).set({ uiLanguage: 'en' }).run();
    database.delete(schema.userProfiles).run();
    closeDatabase();

    const reopened = getDatabase();

    expect(reopened.select().from(schema.userProfiles).all()).toHaveLength(1);
    expect(reopened.select().from(schema.appSettings).limit(1).get()?.uiLanguage).toBe('en');
    expect(
      reopened
        .select({ id: schema.articles.id })
        .from(schema.articles)
        .all()
        .map((row) => row.id),
    ).toContain('article_preserved_during_seed');

    reopened.delete(schema.appSettings).run();
    closeDatabase();

    const reopenedWithoutSettings = getDatabase();

    expect(reopenedWithoutSettings.select().from(schema.userProfiles).all()).toHaveLength(1);
    expect(reopenedWithoutSettings.select().from(schema.appSettings).all()).toHaveLength(1);
    expect(
      reopenedWithoutSettings
        .select({ id: schema.articles.id })
        .from(schema.articles)
        .all()
        .map((row) => row.id),
    ).toContain('article_preserved_during_seed');
  });
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

type WebArticleRecord = Extract<ArticleRecord, { sourceType: 'web' }>;

function articleRecord(input: Partial<WebArticleRecord>): WebArticleRecord {
  const id = input.id || 'article';
  return {
    id,
    url: input.url || `https://example.com/${id}`,
    canonicalUrl: input.canonicalUrl || input.url || `https://example.com/${id}`,
    sourceType: 'web',
    title: input.title || id,
    contentHash: input.contentHash || `hash-${id}`,
    annotations: input.annotations || [],
    contentHtml: input.contentHtml || '<p>正文</p>',
    createdAt: input.createdAt || '2026-05-17T07:00:00.000Z',
    updatedAt: input.updatedAt || '2026-05-17T08:00:00.000Z',
  };
}
