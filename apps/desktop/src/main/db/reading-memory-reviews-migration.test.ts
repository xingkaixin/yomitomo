import SQLiteDatabase from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migrations } from './migrations';

const databases: SQLiteDatabase.Database[] = [];
const timestamp = '2026-08-30T00:00:00.000Z';

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe('reading memory review migration', () => {
  it('allows one ordered chain per asset version and rejects forks, invalid parents, and updates', () => {
    const database = reviewDatabase();
    insertReview(database, 'root');
    insertReview(database, 'next', { previous: 'root' });
    insertReview(database, 'new-version', { version: 'version-2' });

    expect(() => insertReview(database, 'other-root')).toThrow(/UNIQUE/);
    expect(() => insertReview(database, 'fork', { previous: 'root' })).toThrow(/UNIQUE/);
    expect(() => insertReview(database, 'self', { previous: 'self' })).toThrow();
    expect(() => insertReview(database, 'missing', { previous: 'missing-parent' })).toThrow(
      /PARENT_INVALID/,
    );
    expect(() =>
      insertReview(database, 'old-time', {
        previous: 'next',
        createdAt: '2026-08-29T00:00:00.000Z',
      }),
    ).toThrow(/PARENT_INVALID/);
    expect(() =>
      insertReview(database, 'other-asset', { previous: 'next', assetId: 'other-comment' }),
    ).toThrow(/PARENT_INVALID/);
    expect(() =>
      insertReview(database, 'other-version', { previous: 'next', version: 'version-2' }),
    ).toThrow(/PARENT_INVALID/);
    expect(() =>
      database
        .prepare('UPDATE reading_memory_reviews SET answer = ? WHERE id = ?')
        .run('rewritten', 'root'),
    ).toThrow(/IMMUTABLE/);
    expect(database.prepare('SELECT id FROM reading_memory_reviews ORDER BY id').all()).toEqual([
      { id: 'new-version' },
      { id: 'next' },
      { id: 'root' },
    ]);
  });

  it('retains reviews across temporary annotation replacement and cascades actual article deletion', () => {
    const database = reviewDatabase();
    insertReview(database, 'root');
    insertReview(database, 'next', { previous: 'root' });

    database.prepare('DELETE FROM annotations WHERE id = ?').run('annotation');
    expect(database.prepare('SELECT COUNT(*) AS count FROM reading_memory_reviews').get()).toEqual({
      count: 2,
    });
    database.prepare('DELETE FROM articles WHERE id = ?').run('article');
    expect(database.prepare('SELECT COUNT(*) AS count FROM reading_memory_reviews').get()).toEqual({
      count: 0,
    });
  });

  it('initializes original asset revisions without changing existing content', () => {
    const database = new SQLiteDatabase(':memory:');
    databases.push(database);
    database.pragma('foreign_keys = ON');
    const migration = migrations.find((item) => item.id === '0071_reading_memory_reviews');
    if (!migration) throw new Error('missing migration 0071_reading_memory_reviews');
    for (const previous of migrations) {
      if (previous.id === migration.id) break;
      database.exec(previous.sql);
    }
    insertSources(database);

    database.exec(migration.sql);

    expect(migration.minReaderLevel).toBe(3);
    expect(database.prepare('SELECT content, asset_revision FROM comments').get()).toEqual({
      content: 'original comment',
      asset_revision: expect.stringMatching(/\S/),
    });
    expect(
      database.prepare('SELECT distillation_content, distillation_revision FROM annotations').get(),
    ).toEqual({
      distillation_content: 'original distillation',
      distillation_revision: expect.stringMatching(/\S/),
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM reading_memory_reviews').get()).toEqual({
      count: 0,
    });
  });
});

function reviewDatabase() {
  const database = new SQLiteDatabase(':memory:');
  databases.push(database);
  database.pragma('foreign_keys = ON');
  for (const migration of migrations) database.exec(migration.sql);
  insertSources(database);
  return database;
}

function insertReview(
  database: SQLiteDatabase.Database,
  id: string,
  {
    previous = null,
    version = 'version-1',
    assetId = 'comment',
    createdAt = timestamp,
  }: {
    previous?: string | null;
    version?: string;
    assetId?: string;
    createdAt?: string;
  } = {},
) {
  database
    .prepare(`
INSERT INTO reading_memory_reviews (
  id, article_id, annotation_id, asset_type, asset_id, asset_version,
  judgment_snapshot, judgment_digest, previous_review_id, decision, answer, created_at
) VALUES (?, 'article', 'annotation', 'comment', ?, ?, 'snapshot', 'digest', ?, 'still_agree', '', ?)
`)
    .run(id, assetId, version, previous, createdAt);
}

function insertSources(database: SQLiteDatabase.Database) {
  database
    .prepare(`
INSERT INTO articles (id, url, canonical_url, title, content_hash, created_at, updated_at)
VALUES ('article', 'url', 'url', 'title', 'hash', ?, ?)
`)
    .run(timestamp, timestamp);
  database
    .prepare(`
INSERT INTO annotations (
  id, article_id, anchor, author, color, distillation_status, distillation_content, created_at, updated_at
) VALUES ('annotation', 'article', '{}', 'user', 'color', 'published', 'original distillation', ?, ?)
`)
    .run(timestamp, timestamp);
  database
    .prepare(`
INSERT INTO comments (id, annotation_id, author, content, created_at)
VALUES ('comment', 'annotation', 'user', 'original comment', ?)
`)
    .run(timestamp);
}
