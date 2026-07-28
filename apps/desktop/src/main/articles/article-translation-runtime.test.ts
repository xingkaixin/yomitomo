import { beforeEach, describe, expect, it, vi } from 'vitest';
import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { AppSettings, ArticleRecord, ArticleTranslation } from '@yomitomo/shared';
import * as schema from '../db/schema';
import { migrations } from '../db/migrations';
import {
  deleteArticleTranslationRows,
  finalizeArticleTranslationRows,
  initializeArticleTranslationRows,
  readCurrentArticleTranslationRows,
  updateArticleTranslationSegmentRows,
  type ArticleTranslationInitializeInput,
  type ArticleTranslationKey,
  type ArticleTranslationSegmentUpdateInput,
} from './article-translation-repository';
import { createArticleTranslationRuntime } from './article-translation-runtime';

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

  it('writes one segment update per block instead of rewriting the translation', async () => {
    const harness = translationHarness(4);

    await harness.runtime.translate(translateRequest(4), () => {});

    expect(harness.calls.initialize).toBe(1);
    expect(harness.calls.updateSegment).toBe(4);
    expect(harness.calls.finalize).toBe(1);
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

  it('retranslates every block when a concurrent request forces a refresh', async () => {
    const harness = translationHarness(2);

    await harness.runtime.translate(translateRequest(2), () => {});
    const [, forced] = await Promise.all([
      harness.runtime.translate(translateRequest(2), () => {}),
      harness.runtime.translate({ ...translateRequest(2), force: true }, () => {}),
    ]);

    expect(harness.translateBlocks).toHaveBeenCalledTimes(4);
    expect(harness.countTranslations()).toBe(1);
    expect(forced.segments.map((segment) => segment.translatedText)).toEqual([
      'translated block-0',
      'translated block-1',
    ]);
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
});

function translationHarness(
  blockCount: number,
  translateBlock: (blockId: string) => Promise<string> = async (blockId) => `translated ${blockId}`,
) {
  const sqlite = new SQLiteDatabase(':memory:');
  for (const migration of migrations) sqlite.exec(migration.sql);
  sqlite.exec(`
INSERT INTO articles (
  id, url, canonical_url, source_type, title, content_hash, created_at, updated_at
) VALUES (
  'ebook-1', 'ebook:test', 'ebook:test', 'ebook', 'Test ebook', 'ebook-hash',
  '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z'
);
`);
  const database = drizzle(sqlite, { schema });
  const calls = { initialize: 0, updateSegment: 0, finalize: 0 };

  const translateBlocks = vi.fn(async (input: { blocks: { id: string; text: string }[] }) => ({
    translations: await Promise.all(
      input.blocks.map(async (block) => ({
        id: block.id,
        translation: await translateBlock(block.id),
      })),
    ),
    inputTokens: 0,
    outputTokens: 0,
  }));

  const runtime: TranslationRuntime = createArticleTranslationRuntime({
    getAiModule: async () => ({
      bilingualTranslationPromptVersion: 1,
      translateBilingualArticleBlocks: translateBlocks,
    }),
    getPersistenceModules: async () => ({
      providerRepository: { hydrateProviderApiKey: vi.fn() },
      storeAgents: {
        readAgentRuntimeContext: async () => ({
          agents: [],
          providers: [],
          settings: { uiLanguage: 'zh-CN' } as AppSettings,
        }),
      },
      storeArticles: {
        readArticle: async () => ebookArticle(blockCount),
        readCurrentArticleTranslation: async (key: ArticleTranslationKey) =>
          readCurrentArticleTranslationRows(database, key),
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
          key: ArticleTranslationKey,
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
