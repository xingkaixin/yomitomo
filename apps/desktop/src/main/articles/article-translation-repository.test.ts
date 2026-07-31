import { describe, expect, it } from 'vitest';
import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import { migrations } from '../db/migrations';
import {
  finalizeArticleTranslationRows,
  initializeArticleTranslationRows,
  readCurrentArticleTranslationRows,
  updateArticleTranslationSegmentRows,
  type ArticleTranslationInitializeInput,
  type ArticleTranslationSegmentInitializer,
} from './article-translation-repository';
import type { ArticleTranslationIdentity } from './article-translation-identity';

type TranslationDatabase = ReturnType<typeof translationDatabase>;

describe('article translation repository', () => {
  it('stores independent chapter translations for one ebook', () => {
    const database = translationDatabase();
    initializeArticleTranslationRows(database, initializeInput('chapter-1'));
    initializeArticleTranslationRows(database, initializeInput('chapter-2'));

    const first = readCurrentArticleTranslationRows(database, translationKey('chapter-1'));
    const second = readCurrentArticleTranslationRows(database, translationKey('chapter-2'));

    expect(first?.sourceId).toBe('chapter-1');
    expect(second?.sourceId).toBe('chapter-2');
    expect(first?.id).not.toBe(second?.id);
  });

  it('claims a single owner for repeated initialization of one logical key', () => {
    const database = translationDatabase();
    const first = initializeArticleTranslationRows(database, initializeInput('chapter-1'));
    const second = initializeArticleTranslationRows(database, initializeInput('chapter-1'));

    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(countRows(database, 'article_translations')).toBe(1);
    expect(countRows(database, 'article_translation_segments')).toBe(2);
  });

  it('keeps segments that are not retranslated and resets the ones that are', () => {
    const database = translationDatabase();
    const initial = initializeArticleTranslationRows(database, initializeInput('chapter-1'));
    updateArticleTranslationSegmentRows(database, {
      translationId: initial.id,
      sourceBlockId: 'block-1',
      status: 'ready',
      translatedText: 'first translated',
      updatedAt: '2026-07-15T00:01:00.000Z',
    });
    updateArticleTranslationSegmentRows(database, {
      translationId: initial.id,
      sourceBlockId: 'block-2',
      status: 'ready',
      translatedText: 'second translated',
      updatedAt: '2026-07-15T00:01:00.000Z',
    });

    const retried = initializeArticleTranslationRows(database, {
      ...initializeInput('chapter-1'),
      updatedAt: '2026-07-15T00:02:00.000Z',
      segments: [segmentInitializer('block-1', 0, true), segmentInitializer('block-2', 1, false)],
    });

    expect(retried.segments[0]).toMatchObject({
      sourceBlockId: 'block-1',
      status: 'translating',
      translatedText: undefined,
    });
    expect(retried.segments[1]).toMatchObject({
      sourceBlockId: 'block-2',
      status: 'ready',
      translatedText: 'second translated',
    });
  });

  it('updates one segment without rewriting the others', () => {
    const database = translationDatabase();
    const initial = initializeArticleTranslationRows(database, initializeInput('chapter-1'));

    const segment = updateArticleTranslationSegmentRows(database, {
      translationId: initial.id,
      sourceBlockId: 'block-2',
      status: 'failed',
      error: 'TRANSLATION_MISSING',
      updatedAt: '2026-07-15T00:03:00.000Z',
    });

    const stored = readCurrentArticleTranslationRows(database, translationKey('chapter-1'));
    expect(segment).toMatchObject({ sourceBlockId: 'block-2', status: 'failed' });
    expect(stored?.segments[0]).toMatchObject({ sourceBlockId: 'block-1', status: 'translating' });
    expect(stored?.segments[1]?.updatedAt).toBe('2026-07-15T00:03:00.000Z');
    expect(stored?.status).toBe('translating');
  });

  it('ignores segment updates for a block that is not part of the translation', () => {
    const database = translationDatabase();
    const initial = initializeArticleTranslationRows(database, initializeInput('chapter-1'));

    const segment = updateArticleTranslationSegmentRows(database, {
      translationId: initial.id,
      sourceBlockId: 'block-unknown',
      status: 'ready',
      translatedText: 'ignored',
      updatedAt: '2026-07-15T00:03:00.000Z',
    });

    expect(segment).toBeNull();
    expect(countRows(database, 'article_translation_segments')).toBe(2);
  });

  it('derives the owner status from persisted segments', () => {
    const database = translationDatabase();
    const initial = initializeArticleTranslationRows(database, initializeInput('chapter-1'));
    updateArticleTranslationSegmentRows(database, {
      translationId: initial.id,
      sourceBlockId: 'block-1',
      status: 'ready',
      translatedText: 'first translated',
      updatedAt: '2026-07-15T00:04:00.000Z',
    });
    updateArticleTranslationSegmentRows(database, {
      translationId: initial.id,
      sourceBlockId: 'block-2',
      status: 'failed',
      error: 'TRANSLATION_MISSING',
      updatedAt: '2026-07-15T00:04:00.000Z',
    });

    const finalized = finalizeArticleTranslationRows(database, {
      translationId: initial.id,
      updatedAt: '2026-07-15T00:05:00.000Z',
    });

    expect(finalized).toMatchObject({ status: 'ready', error: 'TRANSLATION_INCOMPLETE' });
  });

  it('reports a failed translation when no segment succeeded', () => {
    const database = translationDatabase();
    const initial = initializeArticleTranslationRows(database, initializeInput('chapter-1'));
    for (const sourceBlockId of ['block-1', 'block-2']) {
      updateArticleTranslationSegmentRows(database, {
        translationId: initial.id,
        sourceBlockId,
        status: 'failed',
        error: 'TRANSLATION_FAILED',
        updatedAt: '2026-07-15T00:04:00.000Z',
      });
    }

    const finalized = finalizeArticleTranslationRows(database, {
      translationId: initial.id,
      updatedAt: '2026-07-15T00:05:00.000Z',
    });

    expect(finalized?.status).toBe('failed');
  });

  it('keeps the owner translating while a segment is still pending', () => {
    const database = translationDatabase();
    const initial = initializeArticleTranslationRows(database, initializeInput('chapter-1'));
    updateArticleTranslationSegmentRows(database, {
      translationId: initial.id,
      sourceBlockId: 'block-1',
      status: 'ready',
      translatedText: 'first translated',
      updatedAt: '2026-07-15T00:04:00.000Z',
    });

    const finalized = finalizeArticleTranslationRows(database, {
      translationId: initial.id,
      updatedAt: '2026-07-15T00:05:00.000Z',
    });

    expect(finalized?.status).toBe('translating');
  });

  it('writes large chapters in chunks without exceeding statement limits', () => {
    const database = translationDatabase();
    const segments = Array.from({ length: 450 }, (_, index) =>
      segmentInitializer(`block-${index}`, index, true),
    );

    const initial = initializeArticleTranslationRows(database, {
      ...initializeInput('chapter-1'),
      segments,
    });

    expect(initial.segments).toHaveLength(450);
    expect(initial.segments[449]?.sourceBlockId).toBe('block-449');
  });
});

function translationDatabase() {
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
  return drizzle(sqlite, { schema });
}

function countRows(database: TranslationDatabase, table: string) {
  const row = database.$client.prepare(`select count(*) as total from ${table}`).get() as {
    total: number;
  };
  return row.total;
}

function translationKey(sourceId: string): ArticleTranslationIdentity {
  return {
    articleId: 'ebook-1',
    sourceId,
    sourceContentHash: 'ebook-hash',
    targetLanguage: '简体中文',
    promptVersion: 1,
  };
}

function initializeInput(sourceId: string): ArticleTranslationInitializeInput {
  return {
    ...translationKey(sourceId),
    providerId: 'provider-1',
    providerName: 'Provider',
    modelName: 'model-1',
    updatedAt: '2026-07-15T00:00:00.000Z',
    segments: [segmentInitializer('block-1', 0, true), segmentInitializer('block-2', 1, true)],
  };
}

function segmentInitializer(
  sourceBlockId: string,
  order: number,
  retranslate: boolean,
): ArticleTranslationSegmentInitializer {
  return {
    sourceBlockId,
    sourceText: `${sourceBlockId} source`,
    sourceTextHash: `${sourceBlockId}-hash`,
    order,
    retranslate,
  };
}
