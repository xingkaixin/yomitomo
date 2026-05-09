export type DatabaseMigration = {
  id: string;
  sql: string;
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
];
