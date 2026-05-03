export type DatabaseMigration = {
  id: string;
  sql: string;
};

export const migrations: DatabaseMigration[] = [
  {
    id: "0001_initial",
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
];
