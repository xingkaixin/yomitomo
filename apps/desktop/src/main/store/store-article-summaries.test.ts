import { rm } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
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
    getPath: () => '/tmp/yomitomo-store-article-summaries-test',
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

import { writeArticleRows } from '../articles/article-row-writes';
import { readArticleRows } from '../articles/article-row-queries';
import { getDatabase } from './store-db';
import { closeDatabase } from './store-lifecycle';
import { readArticle } from './store-articles';
import { readStore } from './store-snapshot';
import * as schema from '../db/schema';

beforeEach(async () => {
  closeDatabase();
  await rm('/tmp/yomitomo-store-article-summaries-test', { recursive: true, force: true });
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
  await rm('/tmp/yomitomo-store-article-summaries-test', { recursive: true, force: true });
});

describe('desktop store articles', () => {
  it('preserves corrupt source summaries and reports full content as unavailable', async () => {
    const database = getDatabase();
    const base = articleRecord({ id: 'corrupt_ebook' });
    writeArticleRows(database, {
      ...base,
      sourceType: 'ebook',
      ebook: {
        metadata: { format: 'epub', fileName: 'book.epub', fileSize: 1024 },
        chapters: [{ id: 'chapter_1', title: 'Chapter', html: '<p>Text</p>', textLength: 4 }],
      },
    });
    database
      .update(schema.articles)
      .set({ ebookMetadata: null })
      .where(eq(schema.articles.id, 'corrupt_ebook'))
      .run();
    database
      .update(schema.articleBodies)
      .set({ ebookChapters: null })
      .where(eq(schema.articleBodies.articleId, 'corrupt_ebook'))
      .run();

    await expect(readStore()).resolves.toMatchObject({
      articles: [
        {
          id: 'corrupt_ebook',
          sourceType: 'ebook',
          ebook: { metadata: { format: 'epub', fileName: '', fileSize: 0 } },
        },
      ],
    });
    await expect(readArticle('corrupt_ebook')).rejects.toMatchObject({
      articleId: 'corrupt_ebook',
      code: 'ARTICLE_SOURCE_PAYLOAD_INVALID',
      sourceType: 'ebook',
    });
    expect(testState.logErrors).toContainEqual({
      event: 'article.source_payload_invalid',
      error: expect.objectContaining({
        articleId: 'corrupt_ebook',
        code: 'ARTICLE_SOURCE_PAYLOAD_INVALID',
        sourceType: 'ebook',
      }),
      data: { articleId: 'corrupt_ebook', sourceType: 'ebook' },
    });
  });
});

describe('desktop store article bodies', () => {
  it('saves and re-saves a PDF article without body fields', () => {
    const database = getDatabase();
    const { contentHtml: _contentHtml, ...base } = articleRecord({ id: 'pdf_article' });
    const pdfArticle: ArticleRecord = {
      ...base,
      sourceType: 'pdf',
      pdf: { metadata: { format: 'pdf', fileName: 'paper.pdf', fileSize: 1024, pageCount: 1 } },
    };

    writeArticleRows(database, pdfArticle);
    writeArticleRows(database, { ...pdfArticle, title: 'Renamed' });

    expect(readArticleRows(database, 'pdf_article')).toMatchObject({
      sourceType: 'pdf',
      title: 'Renamed',
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
