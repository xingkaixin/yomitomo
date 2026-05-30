export type DatabaseMigration = {
  id: string;
  sql: string;
  minReaderLevel?: number;
};

export const migrations: DatabaseMigration[] = [
  {
    id: '0001_initial',
    sql: `
CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  nickname TEXT NOT NULL,
  username TEXT NOT NULL,
  avatar TEXT NOT NULL,
  annotation_color TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY NOT NULL,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE cascade,
  nickname TEXT NOT NULL,
  username TEXT NOT NULL,
  avatar TEXT NOT NULL,
  annotation_color TEXT NOT NULL,
  soul TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY NOT NULL,
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  byline TEXT,
  excerpt TEXT,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY NOT NULL,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE cascade,
  anchor TEXT NOT NULL,
  author TEXT NOT NULL,
  color TEXT NOT NULL,
  agent_id TEXT,
  agent_username TEXT,
  agent_nickname TEXT,
  agent_avatar TEXT,
  agent_annotation_color TEXT,
  user_id TEXT,
  user_username TEXT,
  user_nickname TEXT,
  user_avatar TEXT,
  user_annotation_color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY NOT NULL,
  annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE cascade,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reply_to TEXT,
  agent_id TEXT,
  agent_username TEXT,
  agent_nickname TEXT,
  agent_avatar TEXT,
  agent_annotation_color TEXT,
  user_id TEXT,
  user_username TEXT,
  user_nickname TEXT,
  user_avatar TEXT,
  user_annotation_color TEXT,
  pending INTEGER
);

CREATE INDEX IF NOT EXISTS articles_updated_at_idx ON articles(updated_at);
CREATE INDEX IF NOT EXISTS articles_canonical_url_idx ON articles(canonical_url);
CREATE INDEX IF NOT EXISTS annotations_article_id_idx ON annotations(article_id);
CREATE INDEX IF NOT EXISTS annotations_updated_at_idx ON annotations(updated_at);
CREATE INDEX IF NOT EXISTS comments_annotation_id_idx ON comments(annotation_id);
CREATE INDEX IF NOT EXISTS comments_created_at_idx ON comments(created_at);
`,
  },
  {
    id: '0002_annotation_type_density',
    sql: `
ALTER TABLE agents ADD COLUMN annotation_density TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE annotations ADD COLUMN annotation_type TEXT;
`,
  },
  {
    id: '0003_agent_temperature',
    sql: `
ALTER TABLE agents ADD COLUMN temperature REAL NOT NULL DEFAULT 0.5;
`,
  },
  {
    id: '0004_article_content_html',
    sql: `
ALTER TABLE articles ADD COLUMN content_html TEXT;
`,
  },
  {
    id: '0005_settings_reading_card',
    sql: `
CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY NOT NULL,
  default_provider_id TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO app_settings (id, default_provider_id, updated_at)
VALUES ('default', NULL, datetime('now'));

ALTER TABLE articles ADD COLUMN reading_card_id TEXT;
ALTER TABLE articles ADD COLUMN reading_card_markdown TEXT;
ALTER TABLE articles ADD COLUMN reading_card_sections TEXT;
ALTER TABLE articles ADD COLUMN reading_card_provider_id TEXT;
ALTER TABLE articles ADD COLUMN reading_card_provider_name TEXT;
ALTER TABLE articles ADD COLUMN reading_card_model_name TEXT;
ALTER TABLE articles ADD COLUMN reading_card_created_at TEXT;
ALTER TABLE articles ADD COLUMN reading_card_updated_at TEXT;
`,
  },
  {
    id: '0006_agent_kind',
    sql: `
ALTER TABLE agents ADD COLUMN kind TEXT NOT NULL DEFAULT 'annotation';
`,
  },
  {
    id: '0007_reading_card_review',
    sql: `
ALTER TABLE articles ADD COLUMN reading_card_review_id TEXT;
ALTER TABLE articles ADD COLUMN reading_card_review_results TEXT;
ALTER TABLE articles ADD COLUMN reading_card_review_created_at TEXT;
ALTER TABLE articles ADD COLUMN reading_card_review_updated_at TEXT;
`,
  },
  {
    id: '0008_reading_deliberation',
    sql: `
ALTER TABLE articles ADD COLUMN reading_deliberation_id TEXT;
ALTER TABLE articles ADD COLUMN reading_deliberation_markdown TEXT;
ALTER TABLE articles ADD COLUMN reading_deliberation_sections TEXT;
ALTER TABLE articles ADD COLUMN reading_deliberation_provider_id TEXT;
ALTER TABLE articles ADD COLUMN reading_deliberation_provider_name TEXT;
ALTER TABLE articles ADD COLUMN reading_deliberation_model_name TEXT;
ALTER TABLE articles ADD COLUMN reading_deliberation_created_at TEXT;
ALTER TABLE articles ADD COLUMN reading_deliberation_updated_at TEXT;
`,
  },
  {
    id: '0009_provider_presets_reasoning',
    sql: `
ALTER TABLE providers ADD COLUMN preset_id TEXT;
ALTER TABLE providers ADD COLUMN logo TEXT;
ALTER TABLE providers ADD COLUMN reasoning_effort TEXT;
UPDATE providers SET type = 'openai-chat' WHERE type = 'openai';
`,
  },
  {
    id: '0010_provider_model_names',
    sql: `
ALTER TABLE providers ADD COLUMN model_names TEXT;
`,
  },
  {
    id: '0011_provider_model_input_mode',
    sql: `
ALTER TABLE providers ADD COLUMN model_input_mode TEXT NOT NULL DEFAULT 'list';
`,
  },
  {
    id: '0012_reading_intent',
    sql: `
ALTER TABLE annotations ADD COLUMN reading_intent TEXT;
ALTER TABLE comments ADD COLUMN reading_intent TEXT;
`,
  },
  {
    id: '0013_question_status',
    sql: `
ALTER TABLE annotations ADD COLUMN question_status TEXT;
ALTER TABLE comments ADD COLUMN question_status TEXT;
`,
  },
  {
    id: '0014_article_cover_metadata',
    sql: `
ALTER TABLE articles ADD COLUMN site_name TEXT;
ALTER TABLE articles ADD COLUMN site_icon_url TEXT;
ALTER TABLE articles ADD COLUMN lead_image_url TEXT;
ALTER TABLE articles ADD COLUMN theme_color TEXT;
`,
  },
  {
    id: '0015_save_article_images',
    sql: `
ALTER TABLE app_settings ADD COLUMN save_article_images INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    id: '0016_agent_presets_enabled',
    sql: `
ALTER TABLE agents ADD COLUMN preset_id TEXT;
ALTER TABLE agents ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;
`,
  },
  {
    id: '0017_task_provider_routes',
    sql: `
ALTER TABLE app_settings ADD COLUMN reading_assistant_provider_id TEXT;
ALTER TABLE app_settings ADD COLUMN review_assistant_provider_id TEXT;
ALTER TABLE app_settings ADD COLUMN reading_note_provider_id TEXT;

UPDATE app_settings
SET
  reading_assistant_provider_id = default_provider_id,
  review_assistant_provider_id = default_provider_id,
  reading_note_provider_id = default_provider_id
WHERE default_provider_id IS NOT NULL;
`,
  },
  {
    id: '0018_onboarding_completed_at',
    sql: `
ALTER TABLE app_settings ADD COLUMN onboarding_completed_at TEXT;
`,
  },
  {
    id: '0019_message_send_shortcut',
    sql: `
ALTER TABLE app_settings ADD COLUMN message_send_shortcut TEXT NOT NULL DEFAULT 'enter';
`,
  },
  {
    id: '0020_focus_co_reading_plan',
    sql: `
ALTER TABLE articles ADD COLUMN focus_co_reading_plan TEXT;
`,
  },
  {
    id: '0021_selection_action_shortcuts',
    sql: `
ALTER TABLE app_settings ADD COLUMN selection_action_shortcuts TEXT;
UPDATE app_settings
SET selection_action_shortcuts = '{"copy":"C","annotate":"A"}'
WHERE selection_action_shortcuts IS NULL;
`,
  },
  {
    id: '0022_article_ebook_source',
    sql: `
ALTER TABLE articles ADD COLUMN source_type TEXT NOT NULL DEFAULT 'web';
ALTER TABLE articles ADD COLUMN ebook_metadata TEXT;
ALTER TABLE articles ADD COLUMN ebook_chapters TEXT;
`,
  },
  {
    id: '0023_article_reading_progress',
    sql: `
ALTER TABLE articles ADD COLUMN reading_progress TEXT;
`,
  },
  {
    id: '0024_article_ebook_index',
    sql: `
ALTER TABLE articles ADD COLUMN ebook_index TEXT;
`,
  },
  {
    id: '0025_annotation_generation_fields',
    sql: `
ALTER TABLE annotations ADD COLUMN move_type TEXT;
ALTER TABLE annotations ADD COLUMN why_here TEXT;
ALTER TABLE annotations ADD COLUMN evidence_used TEXT;
ALTER TABLE annotations ADD COLUMN confidence TEXT;
ALTER TABLE annotations ADD COLUMN should_show INTEGER;
`,
  },
  {
    id: '0026_provider_api_key_ref',
    minReaderLevel: 2,
    sql: `
ALTER TABLE providers ADD COLUMN api_key_ref TEXT;
`,
  },
  {
    // Historical dev migration kept so local databases that applied it remain readable.
    id: '0027_reading_receipt_state',
    sql: `
ALTER TABLE articles ADD COLUMN reading_receipt_state TEXT;
`,
  },
  {
    id: '0027_remove_reading_outputs',
    minReaderLevel: 2,
    sql: `
ALTER TABLE app_settings DROP COLUMN reading_note_provider_id;

ALTER TABLE articles DROP COLUMN reading_card_id;
ALTER TABLE articles DROP COLUMN reading_card_markdown;
ALTER TABLE articles DROP COLUMN reading_card_sections;
ALTER TABLE articles DROP COLUMN reading_card_provider_id;
ALTER TABLE articles DROP COLUMN reading_card_provider_name;
ALTER TABLE articles DROP COLUMN reading_card_model_name;
ALTER TABLE articles DROP COLUMN reading_card_created_at;
ALTER TABLE articles DROP COLUMN reading_card_updated_at;
ALTER TABLE articles DROP COLUMN reading_card_review_id;
ALTER TABLE articles DROP COLUMN reading_card_review_results;
ALTER TABLE articles DROP COLUMN reading_card_review_created_at;
ALTER TABLE articles DROP COLUMN reading_card_review_updated_at;
ALTER TABLE articles DROP COLUMN reading_deliberation_id;
ALTER TABLE articles DROP COLUMN reading_deliberation_markdown;
ALTER TABLE articles DROP COLUMN reading_deliberation_sections;
ALTER TABLE articles DROP COLUMN reading_deliberation_provider_id;
ALTER TABLE articles DROP COLUMN reading_deliberation_provider_name;
ALTER TABLE articles DROP COLUMN reading_deliberation_model_name;
ALTER TABLE articles DROP COLUMN reading_deliberation_created_at;
ALTER TABLE articles DROP COLUMN reading_deliberation_updated_at;
`,
  },
  {
    id: '0028_remove_question_status',
    minReaderLevel: 2,
    sql: `
ALTER TABLE annotations DROP COLUMN question_status;
ALTER TABLE comments DROP COLUMN question_status;
`,
  },
  {
    id: '0029_comment_review_label',
    sql: `
ALTER TABLE comments ADD COLUMN review_label TEXT;
`,
  },
  {
    id: '0030_log_retention_days',
    sql: `
ALTER TABLE app_settings ADD COLUMN log_retention_days INTEGER;
`,
  },
  {
    id: '0031_article_summary_cover_index',
    sql: `
CREATE INDEX IF NOT EXISTS articles_summary_cover_idx
ON articles(
  updated_at,
  id,
  url,
  canonical_url,
  source_type,
  title,
  byline,
  excerpt,
  site_name,
  theme_color,
  content_hash,
  ebook_metadata,
  reading_progress,
  created_at
);
`,
  },
  {
    id: '0032_article_pdf_metadata',
    sql: `
ALTER TABLE articles ADD COLUMN pdf_metadata TEXT;

DROP INDEX IF EXISTS articles_summary_cover_idx;
CREATE INDEX IF NOT EXISTS articles_summary_cover_idx
ON articles(
  updated_at,
  id,
  url,
  canonical_url,
  source_type,
  title,
  byline,
  excerpt,
  site_name,
  theme_color,
  content_hash,
  ebook_metadata,
  pdf_metadata,
  reading_progress,
  created_at
);
`,
  },
  {
    id: '0033_weread_sync',
    sql: `
CREATE TABLE IF NOT EXISTS weread_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  api_key_ref TEXT,
  open_method TEXT NOT NULL DEFAULT 'deeplink',
  skill_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  message TEXT,
  last_sync_at TEXT,
  last_test_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS weread_books (
  book_id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  cover TEXT,
  intro TEXT,
  review_count INTEGER NOT NULL DEFAULT 0,
  note_count INTEGER NOT NULL DEFAULT 0,
  bookmark_count INTEGER NOT NULL DEFAULT 0,
  reading_progress INTEGER NOT NULL DEFAULT 0,
  marked_status INTEGER,
  sort INTEGER,
  current_chapter_uid INTEGER,
  current_chapter_offset INTEGER,
  record_reading_time INTEGER,
  last_read_at INTEGER,
  synced_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS weread_chapters (
  book_id TEXT NOT NULL,
  chapter_uid INTEGER NOT NULL,
  chapter_idx INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  word_count INTEGER
);

CREATE TABLE IF NOT EXISTS weread_highlights (
  bookmark_id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT NOT NULL,
  chapter_uid INTEGER NOT NULL,
  chapter_idx INTEGER,
  range TEXT,
  mark_text TEXT NOT NULL,
  color_style INTEGER,
  create_time INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS weread_thoughts (
  review_id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT NOT NULL,
  user_vid INTEGER,
  author TEXT,
  chapter_uid INTEGER,
  chapter_idx INTEGER,
  chapter_name TEXT,
  range TEXT,
  abstract TEXT,
  content TEXT NOT NULL,
  create_time INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS weread_books_updated_at_idx ON weread_books(updated_at);
CREATE INDEX IF NOT EXISTS weread_books_sort_idx ON weread_books(sort);
CREATE INDEX IF NOT EXISTS weread_chapters_book_idx ON weread_chapters(book_id, chapter_idx);
CREATE INDEX IF NOT EXISTS weread_chapters_uid_idx ON weread_chapters(book_id, chapter_uid);
CREATE INDEX IF NOT EXISTS weread_highlights_book_idx ON weread_highlights(book_id, chapter_uid);
CREATE INDEX IF NOT EXISTS weread_thoughts_book_idx ON weread_thoughts(book_id, chapter_uid);
`,
  },
  {
    id: '0034_weread_reading_stats',
    sql: `
ALTER TABLE weread_books ADD COLUMN reading_time INTEGER;

CREATE TABLE IF NOT EXISTS weread_reading_stats (
  id TEXT PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  source_base_time INTEGER,
  payload TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS weread_reading_stats_period_idx
ON weread_reading_stats(mode, period_start);

CREATE INDEX IF NOT EXISTS weread_reading_stats_fetched_at_idx
ON weread_reading_stats(fetched_at);
`,
  },
  {
    id: '0035_reading_memory_tape',
    sql: `
CREATE TABLE IF NOT EXISTS reading_memory_entries (
  id TEXT PRIMARY KEY NOT NULL,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  scope TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'default',
  payload_version INTEGER NOT NULL DEFAULT 1,
  chapter_id TEXT,
  segment_id TEXT,
  paragraph_id TEXT,
  text_start INTEGER,
  text_end INTEGER,
  agent_id TEXT,
  reader_id TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT,
  source_annotation_id TEXT,
  source_comment_id TEXT,
  source_task_id TEXT,
  source_entry_ids TEXT NOT NULL DEFAULT '[]',
  supersedes_entry_id TEXT REFERENCES reading_memory_entries(id) ON DELETE SET NULL,
  anchor TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  deletion_reason TEXT
);

CREATE INDEX IF NOT EXISTS reading_memory_article_idx
ON reading_memory_entries(article_id, created_at);

CREATE INDEX IF NOT EXISTS reading_memory_location_idx
ON reading_memory_entries(article_id, chapter_id, segment_id, text_start);

CREATE INDEX IF NOT EXISTS reading_memory_source_idx
ON reading_memory_entries(article_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS reading_memory_annotation_source_idx
ON reading_memory_entries(article_id, source_annotation_id);

CREATE INDEX IF NOT EXISTS reading_memory_comment_source_idx
ON reading_memory_entries(article_id, source_comment_id);

CREATE INDEX IF NOT EXISTS reading_memory_active_kind_idx
ON reading_memory_entries(article_id, kind, scope, visibility, deleted_at);

CREATE VIRTUAL TABLE IF NOT EXISTS reading_memory_entry_fts
USING fts5(
  entry_id UNINDEXED,
  article_id UNINDEXED,
  kind UNINDEXED,
  scope UNINDEXED,
  search_text,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS reading_memory_projections (
  id TEXT PRIMARY KEY NOT NULL,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  view_type TEXT NOT NULL,
  view_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  source_entry_ids TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS reading_memory_projection_article_idx
ON reading_memory_projections(article_id);

CREATE UNIQUE INDEX IF NOT EXISTS reading_memory_projection_key_idx
ON reading_memory_projections(article_id, view_type, view_key);
`,
  },
  {
    id: '0036_reading_memory_agent_lookup',
    sql: `
CREATE INDEX IF NOT EXISTS reading_memory_agent_lookup_idx
ON reading_memory_entries(article_id, agent_id, visibility, deleted_at, created_at);
`,
  },
  {
    id: '0037_developer_mode_setting',
    sql: `
ALTER TABLE app_settings ADD COLUMN developer_mode_enabled INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    id: '0038_assistant_execution_runtime',
    sql: `
ALTER TABLE app_settings ADD COLUMN assistant_execution_mode TEXT NOT NULL DEFAULT 'fast_response';

CREATE TABLE IF NOT EXISTS assistant_execution_runs (
  id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_username TEXT,
  agent_nickname TEXT,
  task_type TEXT NOT NULL,
  requested_mode TEXT NOT NULL,
  effective_mode TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  status TEXT NOT NULL,
  fallback_reason TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  cached_input_tokens INTEGER,
  cache_write_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost_micros INTEGER,
  currency TEXT,
  duration_ms INTEGER,
  step_count INTEGER NOT NULL DEFAULT 0,
  trace_json TEXT
);

CREATE INDEX IF NOT EXISTS assistant_execution_runs_agent_idx
ON assistant_execution_runs(agent_id, created_at);

CREATE INDEX IF NOT EXISTS assistant_execution_runs_provider_model_idx
ON assistant_execution_runs(provider_id, model_name, created_at);
`,
  },
  {
    id: '0039_model_price_records',
    sql: `
CREATE TABLE IF NOT EXISTS model_price_records (
  id TEXT PRIMARY KEY NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  input_cost_per_million REAL,
  output_cost_per_million REAL,
  cache_read_cost_per_million REAL,
  cache_write_cost_per_million REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  source TEXT NOT NULL,
  fetched_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS model_price_records_provider_model_idx
ON model_price_records(provider_id, model_id);

CREATE INDEX IF NOT EXISTS model_price_records_updated_at_idx
ON model_price_records(updated_at);
`,
  },
  {
    id: '0040_theme_setting',
    sql: `
ALTER TABLE app_settings ADD COLUMN theme_id TEXT;
`,
  },
  {
    id: '0041_library_page_size_setting',
    sql: `
ALTER TABLE app_settings ADD COLUMN library_page_size INTEGER;
`,
  },
  {
    id: '0042_annotation_memory_backfill_marker',
    sql: `
ALTER TABLE app_settings ADD COLUMN annotation_memory_backfill_version TEXT;
`,
  },
  {
    id: '0043_annotation_distillation',
    sql: `
ALTER TABLE annotations ADD COLUMN distillation_status TEXT;
ALTER TABLE annotations ADD COLUMN distillation_content TEXT;
ALTER TABLE annotations ADD COLUMN distillation_published_at TEXT;
ALTER TABLE annotations ADD COLUMN distillation_updated_at TEXT;
ALTER TABLE annotations ADD COLUMN distillation_review_sessions TEXT;
`,
  },
];
