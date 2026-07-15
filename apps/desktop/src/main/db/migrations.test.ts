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

  it('adds telemetry settings and private heartbeat state storage', () => {
    const database = new DatabaseSync(':memory:');
    for (const id of ['0001_initial', '0005_settings_reading_card', '0056_telemetry_settings']) {
      const migration = migrations.find((item) => item.id === id);
      if (!migration) throw new Error(`missing migration ${id}`);
      database.exec(migration.sql);
    }

    expect(columnNames(database, 'app_settings')).toContain('telemetry_enabled');
    expect(tableNames(database)).toContain('telemetry_state');
  });

  it('adds durable secret deletion tasks', () => {
    const database = new DatabaseSync(':memory:');
    const migration = migrations.find((item) => item.id === '0061_secret_deletion_tasks');
    if (!migration) throw new Error('missing migration 0061_secret_deletion_tasks');

    database.exec(migration.sql);

    expect(tableNames(database)).toContain('secret_deletion_tasks');
  });

  it('adds the article catalog pagination index', () => {
    const database = new DatabaseSync(':memory:');
    const initial = migrations.find((item) => item.id === '0001_initial');
    const articleSource = migrations.find((item) => item.id === '0022_article_ebook_source');
    const migration = migrations.find((item) => item.id === '0062_library_catalog_index');
    if (!initial || !articleSource || !migration) {
      throw new Error('missing library catalog migration');
    }

    database.exec(initial.sql);
    database.exec(articleSource.sql);
    database.exec(migration.sql);

    expect(indexNames(database)).toContain('articles_library_catalog_idx');
  });

  it('scopes persisted translations by article or ebook chapter', () => {
    const database = new DatabaseSync(':memory:');
    for (const id of [
      '0001_initial',
      '0005_settings_reading_card',
      '0051_article_translations',
      '0065_ebook_translation_scope',
    ]) {
      const migration = migrations.find((item) => item.id === id);
      if (!migration) throw new Error(`missing migration ${id}`);
      database.exec(migration.sql);
    }
    insertArticle(database, 'article_translation');
    database.exec(`
INSERT INTO article_translations (
  id, article_id, source_content_hash, target_language, prompt_version,
  status, created_at, updated_at
) VALUES (
  'web', 'article_translation', 'hash', '简体中文', 1,
  'ready', '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z'
);

INSERT INTO article_translations (
  id, article_id, source_id, source_content_hash, target_language, prompt_version,
  status, created_at, updated_at
) VALUES (
  'chapter', 'article_translation', 'chapter-1', 'hash', '简体中文', 1,
  'ready', '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z'
);
`);

    const rows = database
      .prepare('SELECT id, source_id AS sourceId FROM article_translations ORDER BY id')
      .all() as Array<{ id: string; sourceId: string }>;
    expect(rows).toEqual([
      { id: 'chapter', sourceId: 'chapter-1' },
      { id: 'web', sourceId: 'article' },
    ]);
  });

  it('keeps the trigram catalog search index in sync', () => {
    const database = new DatabaseSync(':memory:');
    for (const id of [
      '0001_initial',
      '0014_article_cover_metadata',
      '0022_article_ebook_source',
      '0023_article_reading_progress',
      '0032_article_pdf_metadata',
      '0033_weread_sync',
      '0054_library_collections_pins',
      '0060_article_text_metadata',
      '0063_library_catalog_search',
    ]) {
      const migration = migrations.find((item) => item.id === id);
      if (!migration) throw new Error(`missing migration ${id}`);
      database.exec(migration.sql);
    }
    insertArticle(database, 'article_search');
    database.exec("UPDATE articles SET title = 'Catalog needle' WHERE id = 'article_search'");

    const row = database
      .prepare(`
        SELECT id
        FROM library_catalog_fts
        WHERE kind = 'article' AND library_catalog_fts MATCH '"needle"'
      `)
      .get() as { id: string } | undefined;

    expect(row?.id).toBe('article_search');

    database.exec("DELETE FROM articles WHERE id = 'article_search'");
    expect(countRows(database, 'library_catalog_fts')).toBe(0);
  });

  it('indexes only published distillations and keeps the index in sync', () => {
    const database = new DatabaseSync(':memory:');
    for (const id of [
      '0001_initial',
      '0043_annotation_distillation',
      '0064_distillation_library_search',
    ]) {
      const migration = migrations.find((item) => item.id === id);
      if (!migration) throw new Error(`missing migration ${id}`);
      database.exec(migration.sql);
    }
    insertArticle(database, 'article_distillation');
    database.exec(`
INSERT INTO annotations (
  id, article_id, anchor, author, color, distillation_status, distillation_content,
  distillation_published_at, distillation_updated_at, created_at, updated_at
) VALUES
  (
    'published', 'article_distillation', '{"exact":"quote"}', 'user', '#f59e0b',
    'published', 'A searchable insight', '2026-07-15T00:00:00.000Z',
    '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z'
  ),
  (
    'draft', 'article_distillation', '{"exact":"quote"}', 'user', '#f59e0b',
    'draft', 'A private draft', null, '2026-07-15T00:00:00.000Z',
    '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z'
  );
`);

    expect(countRows(database, 'distillation_library_fts')).toBe(1);
    database.exec(`
UPDATE annotations
SET distillation_status = 'draft', distillation_content = 'Hidden again'
WHERE id = 'published';
UPDATE annotations
SET distillation_status = 'published', distillation_content = 'Now searchable'
WHERE id = 'draft';
`);

    const row = database
      .prepare(`
        SELECT annotation_id
        FROM distillation_library_fts
        WHERE distillation_library_fts MATCH '"searchable"'
      `)
      .get() as { annotation_id: string } | undefined;
    expect(row?.annotation_id).toBe('draft');

    database.exec("DELETE FROM articles WHERE id = 'article_distillation'");
    expect(countRows(database, 'distillation_library_fts')).toBe(0);
  });

  it('clears derived ebook content html without touching web articles', () => {
    const database = new DatabaseSync(':memory:');
    for (const id of ['0001_initial', '0004_article_content_html', '0022_article_ebook_source']) {
      const migration = migrations.find((item) => item.id === id);
      if (!migration) throw new Error(`missing migration ${id}`);
      database.exec(migration.sql);
    }
    database
      .prepare(
        `
INSERT INTO articles (
  id,
  url,
  canonical_url,
  title,
  content_hash,
  source_type,
  content_html,
  created_at,
  updated_at
)
VALUES
  ('web-1', 'https://example.com/web', 'https://example.com/web', 'Web', 'web-hash', 'web', '<p>web</p>', ?, ?),
  ('ebook-1', 'ebook:1', 'ebook:1', 'Ebook', 'ebook-hash', 'ebook', '<p>ebook</p>', ?, ?)
`,
      )
      .run(
        '2026-06-22T00:00:00.000Z',
        '2026-06-22T00:00:00.000Z',
        '2026-06-22T00:00:00.000Z',
        '2026-06-22T00:00:00.000Z',
      );

    const migration = migrations.find((item) => item.id === '0057_ebook_content_html_cleanup');
    if (!migration) throw new Error('missing migration 0057_ebook_content_html_cleanup');
    database.exec(migration.sql);

    expect(articleContentHtml(database, 'web-1')).toBe('<p>web</p>');
    expect(articleContentHtml(database, 'ebook-1')).toBeNull();
  });

  it('clears inline annotation and comment avatars', () => {
    const database = new DatabaseSync(':memory:');
    for (const id of ['0001_initial']) {
      const migration = migrations.find((item) => item.id === id);
      if (!migration) throw new Error(`missing migration ${id}`);
      database.exec(migration.sql);
    }
    insertArticle(database, 'article-1');
    database.exec(`
INSERT INTO annotations (
  id,
  article_id,
  anchor,
  author,
  color,
  agent_avatar,
  user_avatar,
  created_at,
  updated_at
)
VALUES (
  'annotation-1',
  'article-1',
  '{"exact":"quote","start":0,"end":5}',
  'user',
  '#f59e0b',
  'agent-avatar',
  'user-avatar',
  '2026-06-22T00:00:00.000Z',
  '2026-06-22T00:00:00.000Z'
);
INSERT INTO comments (
  id,
  annotation_id,
  author,
  content,
  created_at,
  agent_avatar,
  user_avatar
)
VALUES (
  'comment-1',
  'annotation-1',
  'user',
  'comment',
  '2026-06-22T00:00:00.000Z',
  'agent-avatar',
  'user-avatar'
);
`);

    const migration = migrations.find((item) => item.id === '0058_annotation_avatar_cleanup');
    if (!migration) throw new Error('missing migration 0058_annotation_avatar_cleanup');
    database.exec(migration.sql);

    expect(annotationAvatars(database, 'annotation-1')).toEqual({
      agent_avatar: null,
      user_avatar: null,
    });
    expect(commentAvatars(database, 'comment-1')).toEqual({
      agent_avatar: null,
      user_avatar: null,
    });
  });

  it('adds private sqlite maintenance state storage', () => {
    const database = new DatabaseSync(':memory:');
    const migration = migrations.find((item) => item.id === '0059_database_maintenance_state');
    if (!migration) throw new Error('missing migration 0059_database_maintenance_state');

    database.exec(migration.sql);

    expect(tableNames(database)).toContain('database_maintenance_state');
    expect(columnNames(database, 'database_maintenance_state')).toEqual([
      'id',
      'last_vacuum_at',
      'updated_at',
    ]);
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
      'app_settings.app_lock_enabled',
      'app_settings.app_lock_locked',
      'app_settings.app_lock_lock_on_startup',
      'app_settings.app_lock_shortcut',
      'app_settings.allow_local_network_article_import',
      'app_settings.telemetry_enabled',
    ]);
    expect(columnNames(database, 'app_settings')).toEqual(
      expect.arrayContaining([
        'bilingual_translation_provider_id',
        'bilingual_translation_target_language',
        'bilingual_translation_style',
        'bilingual_translation_ai_context_aware',
        'app_lock_enabled',
        'app_lock_locked',
        'app_lock_lock_on_startup',
        'app_lock_shortcut',
        'allow_local_network_article_import',
        'telemetry_enabled',
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

  it('creates library collection member and pin tables', () => {
    const database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON');
    for (const id of ['0001_initial', '0054_library_collections_pins']) {
      const migration = migrations.find((item) => item.id === id);
      if (!migration) throw new Error(`missing migration ${id}`);
      database.exec(migration.sql);
    }

    expect(tableNames(database)).toEqual(
      expect.arrayContaining(['collections', 'collection_members', 'library_pins']),
    );
    expect(indexNames(database)).toEqual(
      expect.arrayContaining([
        'collections_updated_at_idx',
        'collection_members_unique_idx',
        'collection_members_collection_idx',
        'collection_members_member_idx',
        'library_pins_unique_idx',
        'library_pins_pinned_at_idx',
      ]),
    );

    database
      .prepare(
        `
INSERT INTO collections (id, name, created_at, updated_at)
VALUES ('collection_1', '合集', '2026-06-21T00:00:00.000Z', '2026-06-21T00:00:00.000Z')
`,
      )
      .run();
    database
      .prepare(
        `
INSERT INTO collection_members (collection_id, member_kind, member_id, added_at)
VALUES ('collection_1', 'article', 'article_1', '2026-06-21T00:01:00.000Z')
`,
      )
      .run();
    database.prepare("DELETE FROM collections WHERE id = 'collection_1'").run();

    expect(countRows(database, 'collection_members')).toBe(0);
  });

  it('adds WeRead sync mode with manual default', () => {
    const database = new DatabaseSync(':memory:');
    for (const id of ['0001_initial', '0033_weread_sync', '0055_weread_sync_mode']) {
      const migration = migrations.find((item) => item.id === id);
      if (!migration) throw new Error(`missing migration ${id}`);
      database.exec(migration.sql);
    }

    expect(columnNames(database, 'weread_accounts')).toContain('sync_mode');
    database
      .prepare(
        `
INSERT INTO weread_accounts (
  id,
  skill_version,
  updated_at
)
VALUES (
  'default',
  '1.0.3',
  '2026-06-22T00:00:00.000Z'
)
`,
      )
      .run();

    const row = database
      .prepare("SELECT sync_mode AS syncMode FROM weread_accounts WHERE id = 'default'")
      .get() as { syncMode: string } | undefined;
    expect(row?.syncMode).toBe('manual');
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

function articleContentHtml(database: DatabaseSync, id: string) {
  return (
    database.prepare('SELECT content_html FROM articles WHERE id = ?').get(id) as {
      content_html: string | null;
    }
  ).content_html;
}

function annotationAvatars(database: DatabaseSync, id: string) {
  return database
    .prepare('SELECT agent_avatar, user_avatar FROM annotations WHERE id = ?')
    .get(id) as { agent_avatar: string | null; user_avatar: string | null };
}

function commentAvatars(database: DatabaseSync, id: string) {
  return database
    .prepare('SELECT agent_avatar, user_avatar FROM comments WHERE id = ?')
    .get(id) as {
    agent_avatar: string | null;
    user_avatar: string | null;
  };
}

function countRows(database: DatabaseSync, table: string) {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
    count: number;
  };
  return row.count;
}
