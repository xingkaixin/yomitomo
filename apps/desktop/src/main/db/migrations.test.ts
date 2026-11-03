import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { ensureAdditiveSchemaColumns, migrations } from './migrations';

describe('reading memory migrations', () => {
  it('defaults remote reading consent to false without changing existing privacy settings', () => {
    const database = new DatabaseSync(':memory:');
    for (const id of [
      '0001_initial',
      '0005_settings_reading_card',
      '0018_onboarding_completed_at',
      '0056_telemetry_settings',
    ]) {
      const migration = migrations.find((item) => item.id === id);
      if (!migration) throw new Error(`missing migration ${id}`);
      database.exec(migration.sql);
    }
    database.exec(
      "UPDATE app_settings SET telemetry_enabled = 0, onboarding_completed_at = '2026-08-30T00:00:00.000Z'",
    );
    const migration = migrations.find((item) => item.id === '0070_reading_memory_remote_consent');
    if (!migration) throw new Error('missing migration 0070_reading_memory_remote_consent');

    database.exec(migration.sql);

    expect(
      database
        .prepare(
          'SELECT reading_memory_remote_consent, telemetry_enabled, onboarding_completed_at FROM app_settings',
        )
        .get(),
    ).toEqual({
      reading_memory_remote_consent: 0,
      telemetry_enabled: 0,
      onboarding_completed_at: '2026-08-30T00:00:00.000Z',
    });
  });

  it('strips inlined images from legacy ebook chapters without touching their text', () => {
    const database = new DatabaseSync(':memory:');
    const migration = migrations.find(
      (item) => item.id === '0074_strip_legacy_ebook_chapter_images',
    );
    if (!migration?.apply) throw new Error('missing migration 0074');
    database.exec('CREATE TABLE article_bodies (article_id TEXT PRIMARY KEY, ebook_chapters TEXT)');
    const insert = database.prepare('INSERT INTO article_bodies VALUES (?, ?)');
    const chapter = (html: string) => JSON.stringify([{ id: 'chapter-1', html, textLength: 4 }]);
    const quotedInText = '<p>src="data:image/png;base64,AA"</p>';
    insert.run(
      'legacy',
      chapter(
        `<figure><img src="data:image/jpeg;base64,/9j/AA==" alt="Cover"></figure>${quotedInText}`,
      ),
    );
    insert.run('current', chapter(`<img alt="Cover">${quotedInText}`));
    insert.run('malformed', '[{"html":"<img src=\\"data:image/png;base64,AA');

    migration.apply(database);

    const rows = database
      .prepare('SELECT article_id, ebook_chapters FROM article_bodies ORDER BY article_id')
      .all();
    expect(rows.map((row) => row.ebook_chapters)).toEqual([
      chapter(`<img alt="Cover">${quotedInText}`),
      chapter(`<figure><img alt="Cover"></figure>${quotedInText}`),
      '[{"html":"<img src=\\"data:image/png;base64,AA',
    ]);
  });

  it('turns task routes that copy the default provider into inherited routes', () => {
    const database = new DatabaseSync(':memory:');
    const migration = migrations.find((item) => item.id === '0075_inherit_default_provider_routes');
    if (!migration) throw new Error('missing migration 0075');
    database.exec(`
      CREATE TABLE app_settings (
        default_provider_id TEXT,
        reading_assistant_provider_id TEXT,
        review_assistant_provider_id TEXT,
        bilingual_translation_provider_id TEXT
      )
    `);
    database
      .prepare('INSERT INTO app_settings VALUES (?, ?, ?, ?)')
      .run('provider_default', 'provider_default', 'provider_review', null);

    database.exec(migration.sql);

    expect(database.prepare('SELECT * FROM app_settings').get()).toEqual({
      default_provider_id: 'provider_default',
      reading_assistant_provider_id: null,
      review_assistant_provider_id: 'provider_review',
      bilingual_translation_provider_id: null,
    });
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

  it('moves article bodies out of the articles row', () => {
    const database = new DatabaseSync(':memory:');
    database.exec('PRAGMA foreign_keys = ON');
    for (const migration of migrations) {
      if (migration.id === '0072_article_bodies') break;
      database.exec(migration.sql);
    }
    database
      .prepare(
        `
INSERT INTO articles (
  id, url, canonical_url, title, content_hash, source_type, lead_image_url, content_html,
  ebook_chapters, ebook_index, focus_co_reading_plan, reading_progress, reading_receipt_state,
  created_at, updated_at
)
VALUES ('book', 'ebook:1', 'ebook:1', 'Book', 'hash', 'ebook', 'data:image/png;base64,AA', NULL,
  '[{"id":"c1"}]', '{"textLength":4}', '{"steps":[]}', '{"kind":"ebook"}', '{}', ?, ?)
`,
      )
      .run('2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z');

    const migration = migrations.find((item) => item.id === '0072_article_bodies');
    if (!migration) throw new Error('missing migration 0072_article_bodies');
    database.exec(migration.sql);

    const articleColumns = columnNames(database, 'articles');
    for (const column of [
      'lead_image_url',
      'content_html',
      'ebook_chapters',
      'ebook_index',
      'focus_co_reading_plan',
      'reading_receipt_state',
    ]) {
      expect(articleColumns).not.toContain(column);
    }
    expect(articleColumns).toContain('reading_progress');
    expect(database.prepare('SELECT * FROM article_bodies').all()).toEqual([
      {
        article_id: 'book',
        lead_image_url: 'data:image/png;base64,AA',
        content_html: null,
        ebook_chapters: '[{"id":"c1"}]',
        ebook_index: '{"textLength":4}',
        focus_co_reading_plan: '{"steps":[]}',
      },
    ]);
    database.exec("DELETE FROM articles WHERE id = 'book'");
    expect(countRows(database, 'article_bodies')).toBe(0);
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
        'telemetry_enabled',
      ]),
    );
    expect(ensureAdditiveSchemaColumns(database)).toEqual([]);
  });
});

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

function countRows(database: DatabaseSync, table: string) {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
    count: number;
  };
  return row.count;
}
