import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { ensureAdditiveSchemaColumns, migrations } from './migrations';

describe('reading memory migrations', () => {
  it('adds library content source preferences to app settings', () => {
    const database = new DatabaseSync(':memory:');
    for (const id of [
      '0001_initial',
      '0005_settings_reading_card',
      '0045_library_content_sources',
    ]) {
      const migration = migrations.find((item) => item.id === id);
      if (!migration) throw new Error(`missing migration ${id}`);
      database.exec(migration.sql);
    }

    expect(columnNames(database, 'app_settings')).toContain('library_content_sources');
  });

  it('adds a persistent annotation memory backfill marker to app settings', () => {
    const database = new DatabaseSync(':memory:');
    for (const id of [
      '0001_initial',
      '0005_settings_reading_card',
      '0042_annotation_memory_backfill_marker',
    ]) {
      const migration = migrations.find((item) => item.id === id);
      if (!migration) throw new Error(`missing migration ${id}`);
      database.exec(migration.sql);
    }

    expect(columnNames(database, 'app_settings')).toContain('annotation_memory_backfill_version');
  });

  it('adds article reader chat state storage', () => {
    const database = new DatabaseSync(':memory:');
    for (const id of ['0001_initial', '0048_article_reader_chat_state']) {
      const migration = migrations.find((item) => item.id === id);
      if (!migration) throw new Error(`missing migration ${id}`);
      database.exec(migration.sql);
    }

    expect(columnNames(database, 'articles')).toContain('reader_chat_state');
  });

  it('repairs bilingual translation settings columns for databases with old applied migrations', () => {
    const database = new DatabaseSync(':memory:');
    for (const id of ['0001_initial', '0005_settings_reading_card']) {
      const migration = migrations.find((item) => item.id === id);
      if (!migration) throw new Error(`missing migration ${id}`);
      database.exec(migration.sql);
    }
    database.exec(`
ALTER TABLE app_settings ADD COLUMN bilingual_translation_provider_id TEXT;
ALTER TABLE app_settings ADD COLUMN bilingual_translation_target_language TEXT;
`);

    expect(columnNames(database, 'app_settings')).not.toContain('bilingual_translation_style');

    expect(ensureAdditiveSchemaColumns(database)).toEqual([
      'app_settings.bilingual_translation_style',
      'app_settings.bilingual_translation_ai_context_aware',
    ]);
    expect(columnNames(database, 'app_settings')).toEqual(
      expect.arrayContaining([
        'bilingual_translation_provider_id',
        'bilingual_translation_target_language',
        'bilingual_translation_style',
        'bilingual_translation_ai_context_aware',
      ]),
    );
    expect(ensureAdditiveSchemaColumns(database)).toEqual([]);
  });

  it('creates reading memory tables, indexes, and fts virtual table', () => {
    const database = migratedDatabase();

    expect(tableNames(database)).toEqual(
      expect.arrayContaining([
        'reading_memory_entries',
        'reading_memory_entry_fts',
        'reading_memory_projections',
      ]),
    );
    expect(indexNames(database)).toEqual(
      expect.arrayContaining([
        'reading_memory_article_idx',
        'reading_memory_location_idx',
        'reading_memory_source_idx',
        'reading_memory_annotation_source_idx',
        'reading_memory_comment_source_idx',
        'reading_memory_active_kind_idx',
        'reading_memory_agent_lookup_idx',
        'reading_memory_projection_article_idx',
        'reading_memory_projection_key_idx',
      ]),
    );

    database
      .prepare(
        `
INSERT INTO reading_memory_entry_fts (entry_id, article_id, kind, scope, search_text)
VALUES ('entry_1', 'article_1', 'summary', 'segment', 'memory topic')
`,
      )
      .run();

    const row = database
      .prepare(
        `
SELECT entry_id AS entryId
FROM reading_memory_entry_fts
WHERE reading_memory_entry_fts MATCH 'memory'
`,
      )
      .get() as { entryId: string } | undefined;

    expect(row?.entryId).toBe('entry_1');
  });

  it('cascades reading memory facts and projections when an article is deleted', () => {
    const database = migratedDatabase();
    insertArticle(database, 'article_1');
    database
      .prepare(
        `
INSERT INTO reading_memory_entries (
  id,
  article_id,
  kind,
  scope,
  source_type,
  source_entry_ids,
  payload,
  created_at,
  updated_at
)
VALUES (
  'entry_1',
  'article_1',
  'summary',
  'segment',
  'ai_task',
  '[]',
  '{"summary":"摘要","keyTerms":[]}',
  '2026-05-26T00:00:00.000Z',
  '2026-05-26T00:00:00.000Z'
)
`,
      )
      .run();
    database
      .prepare(
        `
INSERT INTO reading_memory_projections (
  id,
  article_id,
  view_type,
  view_key,
  payload,
  source_entry_ids,
  updated_at
)
VALUES (
  'projection_1',
  'article_1',
  'legacy',
  'article_1',
  '{}',
  '["entry_1"]',
  '2026-05-26T00:00:00.000Z'
)
`,
      )
      .run();

    database.prepare('DELETE FROM articles WHERE id = ?').run('article_1');

    expect(countRows(database, 'reading_memory_entries')).toBe(0);
    expect(countRows(database, 'reading_memory_projections')).toBe(0);
  });
});

function migratedDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  const initial = migrations.find((migration) => migration.id === '0001_initial');
  const readingMemoryMigrations = migrations.filter(
    (migration) => migration.id.startsWith('0035_') || migration.id.startsWith('0036_'),
  );
  if (!initial || readingMemoryMigrations.length < 2)
    throw new Error('missing migrations for test');
  database.exec(initial.sql);
  for (const migration of readingMemoryMigrations) database.exec(migration.sql);
  return database;
}

function tableNames(database: DatabaseSync) {
  return database
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'virtual table')")
    .all()
    .map((row) => (row as { name: string }).name);
}

function indexNames(database: DatabaseSync) {
  return database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
    .all()
    .map((row) => (row as { name: string }).name);
}

function columnNames(database: DatabaseSync, table: string) {
  return database
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => (row as { name: string }).name);
}

function insertArticle(database: DatabaseSync, id: string) {
  database
    .prepare(
      `
INSERT INTO articles (
  id,
  url,
  canonical_url,
  title,
  content_hash,
  created_at,
  updated_at
)
VALUES (?, 'https://example.com/book', 'https://example.com/book', 'Book', 'hash', ?, ?)
`,
    )
    .run(id, '2026-05-26T00:00:00.000Z', '2026-05-26T00:00:00.000Z');
}

function countRows(database: DatabaseSync, table: string) {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
    count: number;
  };
  return row.count;
}
