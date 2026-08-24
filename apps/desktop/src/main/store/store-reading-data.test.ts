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
    getPath: () => '/tmp/yomitomo-store-reading-data-test',
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

import { buildArticleReadingProgressPatch } from '../articles/article-reading-state';
import { getDatabase } from './store-db';
import { closeDatabase } from './store-lifecycle';
import { readStore } from './store-snapshot';
import { normalizeWeReadReadingStats } from '../weread/weread-repository';
import * as schema from '../db/schema';

beforeEach(async () => {
  closeDatabase();
  await rm('/tmp/yomitomo-store-reading-data-test', { recursive: true, force: true });
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
  await rm('/tmp/yomitomo-store-reading-data-test', { recursive: true, force: true });
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

describe('desktop store reading progress', () => {
  it('builds only the article progress patch', () => {
    const readingProgress = {
      kind: 'chapter' as const,
      chapterIndex: 1,
      chapterProgress: 0.25,
      bookProgress: 0.31,
      updatedAt: '2026-05-17T08:00:00.000Z',
    };

    expect(buildArticleReadingProgressPatch('article_progress', readingProgress)).toEqual({
      articleId: 'article_progress',
      readingProgress,
      updatedAt: readingProgress.updatedAt,
    });
  });
});

function readAnnotationMemoryBackfillVersion() {
  return (
    getDatabase()
      .select({ version: schema.appSettings.annotationMemoryBackfillVersion })
      .from(schema.appSettings)
      .limit(1)
      .get()?.version || null
  );
}
