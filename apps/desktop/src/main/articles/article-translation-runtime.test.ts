import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type {
  ResolvedAppSettings,
  ArticleRecord,
  ArticleTranslation,
  ArticleTranslationUpdateEvent,
} from '@yomitomo/shared';
import * as schema from '../db/schema';
import { migrations } from '../db/migrations';
import {
  deleteArticleTranslationRows,
  finalizeArticleTranslationRows,
  initializeArticleTranslationRows,
  readCurrentArticleTranslationRows,
  recoverInterruptedArticleTranslationRows,
  updateArticleTranslationSegmentRows,
  type ArticleTranslationInitializeInput,
  type ArticleTranslationSegmentUpdateInput,
} from './article-translation-repository';
import type { ArticleTranslationIdentity } from './article-translation-identity';
import { createArticleTranslationRuntime } from './article-translation-runtime';
import { readDatabaseLifecycle, withDatabaseMaintenance } from '../store/store-db';

vi.mock('../app/logger', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

const routingMocks = vi.hoisted(() => ({ taskProvider: vi.fn() }));

vi.mock('../agents/agent-runtime-routing', () => ({
  taskProvider: routingMocks.taskProvider,
}));

type TranslationRuntime = ReturnType<typeof createArticleTranslationRuntime>;

describe('article translation runtime', () => {
  beforeEach(() => {
    routingMocks.taskProvider.mockResolvedValue({
      id: 'provider-1',
      name: 'Provider',
      modelName: 'model-1',
      baseUrl: 'https://example.com',
    });
  });

  it.each([
    { readyBlocks: [], status: 'failed', error: 'TRANSLATION_INCOMPLETE' },
    { readyBlocks: ['block-0'], status: 'ready', error: 'TRANSLATION_INCOMPLETE' },
    { readyBlocks: ['block-0', 'block-1'], status: 'ready', error: undefined },
  ])('recovers an interrupted translation with $readyBlocks completed', async (expected) => {
    const harness = translationHarness(2);
    const interrupted = harness.seedInterruptedTranslation(expected.readyBlocks);

    const [recovered, concurrentRead] = await Promise.all([
      harness.runtime.readCurrent(translateRequest(2)),
      harness.runtime.readCurrent(translateRequest(2)),
    ]);

    expect(recovered).toMatchObject({ status: expected.status, error: expected.error });
    expect(recovered?.segments.filter((segment) => segment.status === 'ready')).toEqual(
      interrupted.segments.filter((segment) => segment.status === 'ready'),
    );
    expect(recovered?.segments.some((segment) => segment.status === 'translating')).toBe(false);
    expect(await harness.runtime.readCurrent(translateRequest(2))).toEqual(recovered);
    expect(concurrentRead).toEqual(recovered);
    expect(harness.translateBlocks).not.toHaveBeenCalled();
  });

  it('keeps a live translation busy while reading its progress', async () => {
    const pending = new Map<string, (translation: string) => void>();
    const harness = translationHarness(
      2,
      (blockId) =>
        new Promise((resolve) => {
          pending.set(blockId, resolve);
        }),
    );
    const running = harness.runtime.translate(translateRequest(2), () => {});
    await vi.waitFor(() => expect(pending.size).toBe(2));

    expect(readDatabaseLifecycle().leases).toBe(0);
    await expect(withDatabaseMaintenance(async () => 'maintenance-ok')).resolves.toBe(
      'maintenance-ok',
    );

    const current = await harness.runtime.readCurrent(translateRequest(2));
    for (const [blockId, resolve] of pending) resolve(`translated ${blockId}`);
    const completed = await running;

    expect(current?.status).toBe('translating');
    expect(current?.segments.every((segment) => segment.status === 'translating')).toBe(true);
    expect(completed.status).toBe('ready');
  });

  it('serializes two first-time requests for one key onto a single owner', async () => {
    const harness = translationHarness(2);

    const [first, second] = await Promise.all([
      harness.runtime.translate(translateRequest(2), () => {}),
      harness.runtime.translate(translateRequest(2), () => {}),
    ]);

    expect(second.id).toBe(first.id);
    expect(harness.translateBlocks).toHaveBeenCalledTimes(2);
    expect(harness.calls.initialize).toBe(1);
    expect(harness.countTranslations()).toBe(1);
  });

  it('applies out-of-order provider completions to their own segment', async () => {
    const pending = new Map<string, (translation: string) => void>();
    const harness = translationHarness(3, (blockId) => {
      return new Promise<string>((resolve) => {
        pending.set(blockId, resolve);
      });
    });

    const running = harness.runtime.translate(translateRequest(3), () => {});
    await vi.waitFor(() => expect(pending.size).toBe(3));
    for (const blockId of ['block-2', 'block-0', 'block-1']) {
      pending.get(blockId)?.(`late ${blockId}`);
    }

    const translation = await running;
    expect(translation.segments.map((segment) => segment.translatedText)).toEqual([
      'late block-0',
      'late block-1',
      'late block-2',
    ]);
  });

  it('keeps successful blocks and retries only the failed one', async () => {
    const failing = new Set(['block-1']);
    const harness = translationHarness(2, async (blockId) => {
      if (failing.has(blockId)) throw new Error('PROVIDER_DOWN');
      return `translated ${blockId}`;
    });

    const failed = await harness.runtime.translate(translateRequest(2), () => {});
    expect(failed).toMatchObject({ status: 'ready', error: 'TRANSLATION_INCOMPLETE' });

    failing.clear();
    const retried = await harness.runtime.translate(
      { ...translateRequest(2), sourceBlockIds: ['block-1'] },
      () => {},
    );

    expect(retried.status).toBe('ready');
    expect(retried.error).toBeUndefined();
    expect(retried.segments.map((segment) => segment.translatedText)).toEqual([
      'translated block-0',
      'translated block-1',
    ]);
    expect(harness.translateBlocks).toHaveBeenCalledTimes(3);
  });

  it('stops writing when a delete cancels the running session', async () => {
    const release = new Map<string, () => void>();
    const harness = translationHarness(3, (blockId) => {
      return new Promise<string>((resolve) => {
        release.set(blockId, () => resolve(`translated ${blockId}`));
      });
    });

    const running = harness.runtime.translate(translateRequest(3), () => {});
    await vi.waitFor(() => expect(release.size).toBe(3));
    release.get('block-0')?.();
    await vi.waitFor(() => expect(harness.calls.updateSegment).toBe(1));

    const deleted = harness.runtime.deleteCurrent({ articleId: 'ebook-1', sourceId: 'chapter-1' });
    for (const resolve of release.values()) resolve();
    await running;

    expect(await deleted).not.toBeNull();
    expect(harness.calls.updateSegment).toBe(1);
    expect(harness.countTranslations()).toBe(0);
  });

  it('reuses a ready translation instead of calling the provider again', async () => {
    const harness = translationHarness(2);

    await harness.runtime.translate(translateRequest(2), () => {});
    const reused = await harness.runtime.translate(translateRequest(2), () => {});

    expect(reused.status).toBe('ready');
    expect(harness.translateBlocks).toHaveBeenCalledTimes(2);
    expect(harness.calls.initialize).toBe(1);
  });

  it('does not reuse a translation after the source content changes', async () => {
    const harness = translationHarness(1);

    await harness.runtime.translate(translateRequest(1), () => {});
    harness.changeContentHash('updated-ebook-hash');
    await harness.runtime.translate(translateRequest(1), () => {});

    expect(harness.translateBlocks).toHaveBeenCalledTimes(2);
    expect(harness.calls.initialize).toBe(2);
    expect(harness.countTranslations()).toBe(2);
  });

  it('emits incremental segment patches between initial and final snapshots', async () => {
    const harness = translationHarness(3);
    const updates: ArticleTranslationUpdateEvent[] = [];

    const completed = await harness.runtime.translate(translateRequest(3), (update) => {
      updates.push(update);
    });

    expect(updates).toHaveLength(5);
    expect(updates[0]).toMatchObject({
      type: 'snapshot',
      translation: { id: completed.id, status: 'translating' },
    });
    const segmentUpdates = updates.slice(1, 4);
    expect(segmentUpdates.every((event) => event.type === 'segment')).toBe(true);
    expect(
      segmentUpdates
        .map((event) => (event.type === 'segment' ? event.segment.sourceBlockId : ''))
        .toSorted(),
    ).toEqual(['block-0', 'block-1', 'block-2']);
    expect(updates[4]).toEqual({ type: 'snapshot', translation: completed });
  });

  it('reuses cached PDF page translation and rejects scanned PDFs with no text layer', async () => {
    const harness = translationHarness(1, undefined, pdfArticle());
    const request = {
      articleId: 'pdf-1',
      sourceId: 'pdf-page-0',
      sourceBlocks: [{ id: 'pdf-p0-b0-hash', text: 'First single-column paragraph.' }],
    };

    const first = await harness.runtime.translate(request, () => {});
    const second = await harness.runtime.translate(request, () => {});

    expect(first.status).toBe('ready');
    expect(second.id).toBe(first.id);
    expect(harness.translateBlocks).toHaveBeenCalledTimes(1);
    expect(harness.calls.initialize).toBe(1);

    await expect(
      harness.runtime.translate(
        {
          articleId: 'pdf-1',
          sourceId: 'pdf-page-1',
          sourceBlocks: [],
        },
        () => {},
      ),
    ).rejects.toThrow('PDF_TRANSLATION_NO_TEXT_LAYER');
    expect(harness.translateBlocks).toHaveBeenCalledTimes(1);
    expect(harness.calls.initialize).toBe(1);
  });
});

function translationHarness(
  blockCount: number,
  translateBlock: (blockId: string, signal: AbortSignal) => Promise<string> = async (blockId) =>
    `translated ${blockId}`,
  initialArticle: ArticleRecord = ebookArticle(blockCount),
) {
  const sqlite = new SQLiteDatabase(':memory:');
  for (const migration of migrations) sqlite.exec(migration.sql);
  sqlite
    .prepare(
      `INSERT INTO articles (
        id, url, canonical_url, source_type, title, content_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      initialArticle.id,
      initialArticle.url,
      initialArticle.canonicalUrl,
      initialArticle.sourceType,
      initialArticle.title,
      initialArticle.contentHash,
      initialArticle.createdAt,
      initialArticle.updatedAt,
    );
  const database = drizzle(sqlite, { schema });
  let article = initialArticle;
  const calls = { initialize: 0, updateSegment: 0, finalize: 0 };

  const translateBlocks = vi.fn(
    async (input: { blocks: { id: string; text: string }[]; signal: AbortSignal }) => ({
      translations: await Promise.all(
        input.blocks.map(async (block) => ({
          id: block.id,
          translation: await translateBlock(block.id, input.signal),
        })),
      ),
      inputTokens: 0,
      outputTokens: 0,
    }),
  );

  const runtime: TranslationRuntime = createArticleTranslationRuntime({
    getAiModule: async () => ({
      bilingualTranslationPromptVersion: 1,
      translateBilingualArticleBlocksEffect: (input) =>
        Effect.tryPromise({
          try: (signal) => translateBlocks({ ...input, signal }),
          catch: (error) => error,
        }),
    }),
    getPersistenceModules: async () => ({
      providerRepository: { hydrateProviderApiKey: vi.fn() },
      storeAgents: {
        readAgentRuntimeContext: async () => ({
          agents: [],
          providers: [],
          settings: { uiLanguage: 'zh-CN' } as ResolvedAppSettings,
        }),
      },
      storeArticles: {
        readArticle: async () => article,
        readCurrentArticleTranslation: async (key: ArticleTranslationIdentity) =>
          readCurrentArticleTranslationRows(database, key),
        recoverInterruptedArticleTranslation: (key: ArticleTranslationIdentity) =>
          recoverInterruptedArticleTranslationRows(database, key, new Date().toISOString()),
        initializeArticleTranslation: async (input: ArticleTranslationInitializeInput) => {
          calls.initialize += 1;
          return initializeArticleTranslationRows(database, input);
        },
        updateArticleTranslationSegment: async (input: ArticleTranslationSegmentUpdateInput) => {
          calls.updateSegment += 1;
          return updateArticleTranslationSegmentRows(database, input);
        },
        finalizeArticleTranslation: async (input: { translationId: string; updatedAt: string }) => {
          calls.finalize += 1;
          return finalizeArticleTranslationRows(database, input);
        },
        deleteCurrentArticleTranslation: async (
          key: ArticleTranslationIdentity,
        ): Promise<ArticleTranslation | null> => {
          const translation = readCurrentArticleTranslationRows(database, key);
          if (!translation) return null;
          deleteArticleTranslationRows(database, translation.id);
          return translation;
        },
      },
    }),
  });

  return {
    seedInterruptedTranslation(readyBlocks: string[]) {
      const key: ArticleTranslationIdentity = {
        articleId: article.id,
        sourceId: 'chapter-1',
        sourceContentHash: article.contentHash,
        targetLanguage: '简体中文',
        promptVersion: 1,
      };
      const initial = initializeArticleTranslationRows(database, {
        ...key,
        updatedAt: '2026-07-15T00:00:00.000Z',
        segments: translateRequest(blockCount).sourceBlocks.map((block, order) => ({
          sourceBlockId: block.id,
          sourceText: block.text,
          sourceTextHash: `hash-${block.id}`,
          order,
          retranslate: true,
        })),
      });
      for (const blockId of readyBlocks) {
        updateArticleTranslationSegmentRows(database, {
          translationId: initial.id,
          sourceBlockId: blockId,
          status: 'ready',
          translatedText: `saved ${blockId}`,
          updatedAt: '2026-07-15T00:01:00.000Z',
        });
      }
      return readCurrentArticleTranslationRows(database, key)!;
    },
    changeContentHash: (contentHash: string) => {
      article = { ...article, contentHash };
    },
    calls,
    countTranslations: () =>
      (
        sqlite.prepare('select count(*) as total from article_translations').get() as {
          total: number;
        }
      ).total,
    runtime,
    translateBlocks,
  };
}

function translateRequest(blockCount: number) {
  return {
    articleId: 'ebook-1',
    sourceId: 'chapter-1',
    sourceBlocks: Array.from({ length: blockCount }, (_, index) => ({
      id: `block-${index}`,
      text: `Source paragraph ${index}.`,
    })),
  };
}

function ebookArticle(blockCount: number): ArticleRecord {
  return {
    id: 'ebook-1',
    url: 'ebook:test',
    canonicalUrl: 'ebook:test',
    sourceType: 'ebook',
    title: 'Test ebook',
    contentHash: 'ebook-hash',
    annotations: [],
    ebook: {
      metadata: {
        format: 'epub',
        fileName: 'test.epub',
        fileSize: 1024,
        description: 'A test ebook.',
      },
      chapters: [
        {
          id: 'chapter-1',
          title: 'First chapter',
          html: Array.from(
            { length: blockCount },
            (_, index) => `<p>Source paragraph ${index}.</p>`,
          ).join(''),
          textLength: 23 * blockCount,
        },
      ],
    },
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  };
}

function pdfArticle(): ArticleRecord {
  return {
    id: 'pdf-1',
    url: 'pdf://pdf-1',
    canonicalUrl: 'pdf://pdf-1',
    sourceType: 'pdf',
    title: 'Test PDF',
    contentHash: 'pdf-hash',
    annotations: [],
    pdf: {
      metadata: {
        format: 'pdf',
        fileName: 'test.pdf',
        fileSize: 2048,
        pageCount: 3,
      },
    },
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  };
}
