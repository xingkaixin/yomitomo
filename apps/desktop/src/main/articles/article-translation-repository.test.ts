import { describe, expect, it } from 'vitest';
import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import { migrations } from '../db/migrations';
import {
  initializeArticleTranslationRows,
  readCurrentArticleTranslationRows,
  type ArticleTranslationInitializeInput,
  type ArticleTranslationSegmentInitializer,
} from './article-translation-repository';
import type { ArticleTranslationIdentity } from './article-translation-identity';

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
