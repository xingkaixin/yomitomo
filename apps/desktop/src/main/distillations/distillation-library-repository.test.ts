import { describe, expect, it } from 'vitest';
import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import { migrations } from '../db/migrations';
import { readDistillationLibraryRows } from './distillation-library-repository';

describe('distillation library repository', () => {
  it('returns only published distillations with source context', () => {
    const database = createDistillationDatabase();

    const result = readDistillationLibraryRows(database, { pageSize: 10 });

    expect(result).toMatchObject({
      page: 1,
      pageSize: 10,
      totalCount: 2,
      unfilteredCount: 2,
    });
    expect(result.items).toEqual([
      {
        annotationId: 'annotation_newer',
        articleId: 'article_ebook',
        articleTitle: 'The Deep Module',
        articleByline: 'A. Reader',
        sourceType: 'ebook',
        anchorText: 'A narrow interface hides substantial complexity.',
        content: 'Good modules optimize for information hiding.',
        publishedAt: '2026-07-14T00:00:00.000Z',
        updatedAt: '2026-07-15T00:00:00.000Z',
      },
      expect.objectContaining({ annotationId: 'annotation_older' }),
    ]);
  });

  it('searches long queries with trigram FTS and short queries with escaped LIKE', () => {
    const database = createDistillationDatabase();

    const ftsResult = readDistillationLibraryRows(database, { query: 'information hiding' });
    const shortResult = readDistillationLibraryRows(database, { query: 'O(' });
    const wildcardResult = readDistillationLibraryRows(database, { query: '%' });

    expect(ftsResult.items.map((item) => item.annotationId)).toEqual(['annotation_newer']);
    expect(ftsResult.unfilteredCount).toBe(2);
    expect(shortResult.items.map((item) => item.annotationId)).toEqual(['annotation_older']);
    expect(wildcardResult.items).toEqual([]);
  });
});

function createDistillationDatabase() {
  const sqlite = new SQLiteDatabase(':memory:');
  for (const migration of migrations) sqlite.exec(migration.sql);
  const database = drizzle(sqlite, { schema });
  sqlite.exec(`
INSERT INTO articles (
  id, url, canonical_url, source_type, title, byline, content_hash, created_at, updated_at
) VALUES
  (
    'article_ebook', 'ebook:deep-module', 'ebook:deep-module', 'ebook', 'The Deep Module',
    'A. Reader', 'hash-ebook', '2026-07-01T00:00:00.000Z', '2026-07-15T00:00:00.000Z'
  ),
  (
    'article_web', 'https://example.com/complexity', 'https://example.com/complexity',
    'web', 'Complexity Notes', null, 'hash-web', '2026-07-01T00:00:00.000Z',
    '2026-07-13T00:00:00.000Z'
  );

INSERT INTO annotations (
  id, article_id, anchor, author, color, distillation_status, distillation_content,
  distillation_published_at, distillation_updated_at, created_at, updated_at
) VALUES
  (
    'annotation_newer', 'article_ebook',
    '{"exact":"A narrow interface hides substantial complexity."}', 'user', '#f59e0b',
    'published', 'Good modules optimize for information hiding.',
    '2026-07-14T00:00:00.000Z', '2026-07-15T00:00:00.000Z',
    '2026-07-14T00:00:00.000Z', '2026-07-15T00:00:00.000Z'
  ),
  (
    'annotation_older', 'article_web', '{"exact":"Quadratic work compounds quickly."}',
    'user', '#f59e0b', 'published', 'Replace O(n) rescans with one indexed pass.',
    '2026-07-12T00:00:00.000Z', '2026-07-13T00:00:00.000Z',
    '2026-07-12T00:00:00.000Z', '2026-07-13T00:00:00.000Z'
  ),
  (
    'annotation_draft', 'article_web', '{"exact":"Private quote"}', 'user', '#f59e0b',
    'draft', 'This should stay private.', null, '2026-07-15T00:00:00.000Z',
    '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z'
  );
`);
  return database;
}
