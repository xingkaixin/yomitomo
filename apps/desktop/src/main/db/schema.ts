import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userProfiles = sqliteTable("user_profiles", {
  id: text("id").primaryKey(),
  nickname: text("nickname").notNull(),
  username: text("username").notNull(),
  avatar: text("avatar").notNull(),
  annotationColor: text("annotation_color").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  baseUrl: text("base_url").notNull(),
  apiKey: text("api_key").notNull(),
  modelName: text("model_name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  providerId: text("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  nickname: text("nickname").notNull(),
  username: text("username").notNull(),
  avatar: text("avatar").notNull(),
  annotationColor: text("annotation_color").notNull(),
  soul: text("soul").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const articles = sqliteTable(
  "articles",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    title: text("title").notNull(),
    byline: text("byline"),
    excerpt: text("excerpt"),
    contentHash: text("content_hash").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("articles_updated_at_idx").on(table.updatedAt),
    index("articles_canonical_url_idx").on(table.canonicalUrl),
  ],
);

export const annotations = sqliteTable(
  "annotations",
  {
    id: text("id").primaryKey(),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    anchor: text("anchor", { mode: "json" }).notNull(),
    author: text("author").notNull(),
    color: text("color").notNull(),
    agentId: text("agent_id"),
    agentUsername: text("agent_username"),
    agentNickname: text("agent_nickname"),
    agentAvatar: text("agent_avatar"),
    agentAnnotationColor: text("agent_annotation_color"),
    userId: text("user_id"),
    userUsername: text("user_username"),
    userNickname: text("user_nickname"),
    userAvatar: text("user_avatar"),
    userAnnotationColor: text("user_annotation_color"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("annotations_article_id_idx").on(table.articleId),
    index("annotations_updated_at_idx").on(table.updatedAt),
  ],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    annotationId: text("annotation_id")
      .notNull()
      .references(() => annotations.id, { onDelete: "cascade" }),
    author: text("author").notNull(),
    content: text("content").notNull(),
    createdAt: text("created_at").notNull(),
    replyTo: text("reply_to"),
    agentId: text("agent_id"),
    agentUsername: text("agent_username"),
    agentNickname: text("agent_nickname"),
    agentAvatar: text("agent_avatar"),
    agentAnnotationColor: text("agent_annotation_color"),
    userId: text("user_id"),
    userUsername: text("user_username"),
    userNickname: text("user_nickname"),
    userAvatar: text("user_avatar"),
    userAnnotationColor: text("user_annotation_color"),
    pending: integer("pending", { mode: "boolean" }),
  },
  (table) => [
    index("comments_annotation_id_idx").on(table.annotationId),
    index("comments_created_at_idx").on(table.createdAt),
  ],
);
