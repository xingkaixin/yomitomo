import { rm } from 'node:fs/promises';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { type ArticleSummaryRecord } from '@yomitomo/shared';

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
    getPath: () => '/tmp/yomitomo-store-article-identity-test',
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

import { findArticleInListByIdentity } from '../articles/article-row-queries';
import { closeDatabase } from './store-lifecycle';

beforeEach(async () => {
  closeDatabase();
  await rm('/tmp/yomitomo-store-article-identity-test', { recursive: true, force: true });
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
  await rm('/tmp/yomitomo-store-article-identity-test', { recursive: true, force: true });
});

describe('desktop store article identity', () => {
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

type WebArticleSummaryRecord = Extract<ArticleSummaryRecord, { sourceType: 'web' }>;

function articleSummaryRecord(input: Partial<WebArticleSummaryRecord>): WebArticleSummaryRecord {
  const id = input.id || 'article';
  return {
    id,
    url: input.url || `https://example.com/${id}`,
    canonicalUrl: input.canonicalUrl || input.url || `https://example.com/${id}`,
    sourceType: 'web',
    title: input.title || id,
    contentHash: input.contentHash || `hash-${id}`,
    counts: input.counts || {
      annotationCount: 0,
      thoughtCount: 0,
      discussionCommentCount: 0,
      aiCommentCount: 0,
      distillationCount: 0,
    },
    createdAt: input.createdAt || '2026-05-17T07:00:00.000Z',
    updatedAt: input.updatedAt || '2026-05-17T08:00:00.000Z',
  };
}
