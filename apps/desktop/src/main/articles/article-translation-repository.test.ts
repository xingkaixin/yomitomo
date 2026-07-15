import { describe, expect, it } from 'vitest';
import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { ArticleTranslation } from '@yomitomo/shared';
import * as schema from '../db/schema';
import { migrations } from '../db/migrations';
import {
  readCurrentArticleTranslationRows,
  upsertArticleTranslationRows,
} from './article-translation-repository';

describe('article translation repository', () => {
  it('stores independent chapter translations for one ebook', () => {
    const database = translationDatabase();
    upsertArticleTranslationRows(database, translation('chapter-1'));
    upsertArticleTranslationRows(database, translation('chapter-2'));

    const first = readCurrentArticleTranslationRows(database, {
      articleId: 'ebook-1',
      sourceId: 'chapter-1',
      sourceContentHash: 'ebook-hash',
      targetLanguage: '简体中文',
      promptVersion: 1,
    });
    const second = readCurrentArticleTranslationRows(database, {
      articleId: 'ebook-1',
      sourceId: 'chapter-2',
      sourceContentHash: 'ebook-hash',
      targetLanguage: '简体中文',
      promptVersion: 1,
    });

    expect(first?.sourceId).toBe('chapter-1');
    expect(first?.segments[0]?.translatedText).toBe('chapter-1 translated');
    expect(second?.sourceId).toBe('chapter-2');
    expect(second?.segments[0]?.translatedText).toBe('chapter-2 translated');
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

function translation(sourceId: string): ArticleTranslation {
  const timestamp = '2026-07-15T00:00:00.000Z';
  const translationId = `translation-${sourceId}`;
  return {
    id: translationId,
    articleId: 'ebook-1',
    sourceId,
    sourceContentHash: 'ebook-hash',
    targetLanguage: '简体中文',
    promptVersion: 1,
    status: 'ready',
    segments: [
      {
        id: `segment-${sourceId}`,
        translationId,
        sourceBlockId: 'block-1',
        sourceTextHash: 'source-hash',
        sourceText: `${sourceId} source`,
        translatedText: `${sourceId} translated`,
        status: 'ready',
        order: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
