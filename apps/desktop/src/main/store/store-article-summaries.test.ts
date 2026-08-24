import { rm } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { type ArticleRecord, type ArticleSummaryRecord } from '@yomitomo/shared';

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

import { buildArticleUpsertPatch, writeArticleRows } from '../articles/article-row-writes';
import { readArticleRows, readArticleSiteIconRawRows } from '../articles/article-row-queries';
import { getDatabase } from './store-db';
import { closeDatabase } from './store-lifecycle';
import { ensureArticleSiteIcon, readArticle } from './store-articles';
import { readShellStore, readStore } from './store-snapshot';
import { rowToArticleSummary, type ArticleSummaryRow } from './store-normalizers';
import { upsertSettings } from './settings-repository';
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
      .set({ ebookMetadata: null, ebookChapters: null })
      .where(eq(schema.articles.id, 'corrupt_ebook'))
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
      sourceType: 'web',
      title: 'Upsert article',
      contentHash: 'hash-upsert',
      counts: {
        annotationCount: 0,
        thoughtCount: 0,
        discussionCommentCount: 0,
        aiCommentCount: 0,
        distillationCount: 0,
      },
      createdAt: '2026-05-17T07:00:00.000Z',
      updatedAt: '2026-05-17T08:00:00.000Z',
    };

    expect(buildArticleUpsertPatch(article)).toEqual({
      type: 'article-upsert',
      article,
    });
  });

  it('keeps aggregate counts on lightweight article summaries', () => {
    const counts = {
      annotationCount: 2,
      thoughtCount: 1,
      discussionCommentCount: 3,
      aiCommentCount: 1,
      distillationCount: 1,
    };
    const article = rowToArticleSummary(storeSummaryRow(), counts);

    expect(article).not.toHaveProperty('annotations');
    expect(article.counts).toEqual(counts);
  });

  it('keeps ebook summaries free of full chapter data', () => {
    const article = rowToArticleSummary({
      ...storeSummaryRow(),
      sourceType: 'ebook',
      ebookMetadata: {
        format: 'epub',
        fileName: 'book.epub',
        fileSize: 1200,
      },
    });

    expect(article.ebook).toEqual({
      metadata: {
        format: 'epub',
        fileName: 'book.epub',
        fileSize: 1200,
      },
    });
  });

  it('preserves non-EPUB ebook formats in article summaries', () => {
    const article = rowToArticleSummary({
      ...storeSummaryRow(),
      sourceType: 'ebook',
      ebookMetadata: {
        format: 'azw3',
        fileName: 'book.azw3',
        fileSize: 2400,
      },
    });

    expect(article.ebook?.metadata.format).toBe('azw3');
    expect(article.ebook?.metadata.fileName).toBe('book.azw3');
  });

  it('keeps reader chat state out of article summaries', () => {
    const article = rowToArticleSummary(storeSummaryRow());

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
        contentHtml: '<section><p>derived html</p></section>',
      }),
      sourceType: 'ebook',
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
