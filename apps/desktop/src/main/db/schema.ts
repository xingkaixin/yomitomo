import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const userProfiles = sqliteTable('user_profiles', {
  id: text('id').primaryKey(),
  nickname: text('nickname').notNull(),
  username: text('username').notNull(),
  avatar: text('avatar').notNull(),
  annotationColor: text('annotation_color').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const appSettings = sqliteTable('app_settings', {
  id: text('id').primaryKey(),
  defaultProviderId: text('default_provider_id'),
  readingAssistantProviderId: text('reading_assistant_provider_id'),
  reviewAssistantProviderId: text('review_assistant_provider_id'),
  messageSendShortcut: text('message_send_shortcut').notNull().default('enter'),
  selectionActionShortcuts: text('selection_action_shortcuts', { mode: 'json' }),
  saveArticleImages: integer('save_article_images', { mode: 'boolean' }).notNull().default(false),
  logRetentionDays: integer('log_retention_days'),
  onboardingCompletedAt: text('onboarding_completed_at'),
  updatedAt: text('updated_at').notNull(),
});

export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  presetId: text('preset_id'),
  logo: text('logo'),
  baseUrl: text('base_url').notNull(),
  apiKey: text('api_key').notNull(),
  apiKeyRef: text('api_key_ref'),
  modelName: text('model_name').notNull(),
  modelNames: text('model_names', { mode: 'json' }),
  modelInputMode: text('model_input_mode'),
  reasoningEffort: text('reasoning_effort'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  presetId: text('preset_id'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  providerId: text('provider_id')
    .notNull()
    .references(() => providers.id, { onDelete: 'cascade' }),
  nickname: text('nickname').notNull(),
  username: text('username').notNull(),
  avatar: text('avatar').notNull(),
  annotationColor: text('annotation_color').notNull(),
  annotationDensity: text('annotation_density').notNull(),
  temperature: real('temperature').notNull(),
  soul: text('soul').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const articles = sqliteTable(
  'articles',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull(),
    canonicalUrl: text('canonical_url').notNull(),
    sourceType: text('source_type').notNull().default('web'),
    title: text('title').notNull(),
    byline: text('byline'),
    excerpt: text('excerpt'),
    siteName: text('site_name'),
    siteIconUrl: text('site_icon_url'),
    leadImageUrl: text('lead_image_url'),
    themeColor: text('theme_color'),
    contentHtml: text('content_html'),
    contentHash: text('content_hash').notNull(),
    ebookMetadata: text('ebook_metadata', { mode: 'json' }),
    ebookChapters: text('ebook_chapters', { mode: 'json' }),
    ebookIndex: text('ebook_index', { mode: 'json' }),
    readingProgress: text('reading_progress', { mode: 'json' }),
    focusCoReadingPlan: text('focus_co_reading_plan', { mode: 'json' }),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('articles_updated_at_idx').on(table.updatedAt),
    index('articles_canonical_url_idx').on(table.canonicalUrl),
    index('articles_summary_cover_idx').on(
      table.updatedAt,
      table.id,
      table.url,
      table.canonicalUrl,
      table.sourceType,
      table.title,
      table.byline,
      table.excerpt,
      table.siteName,
      table.themeColor,
      table.contentHash,
      table.ebookMetadata,
      table.readingProgress,
      table.createdAt,
    ),
  ],
);

export const annotations = sqliteTable(
  'annotations',
  {
    id: text('id').primaryKey(),
    articleId: text('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    anchor: text('anchor', { mode: 'json' }).notNull(),
    author: text('author').notNull(),
    annotationType: text('annotation_type'),
    readingIntent: text('reading_intent'),
    moveType: text('move_type'),
    whyHere: text('why_here'),
    evidenceUsed: text('evidence_used', { mode: 'json' }),
    confidence: text('confidence'),
    shouldShow: integer('should_show', { mode: 'boolean' }),
    color: text('color').notNull(),
    agentId: text('agent_id'),
    agentUsername: text('agent_username'),
    agentNickname: text('agent_nickname'),
    agentAvatar: text('agent_avatar'),
    agentAnnotationColor: text('agent_annotation_color'),
    userId: text('user_id'),
    userUsername: text('user_username'),
    userNickname: text('user_nickname'),
    userAvatar: text('user_avatar'),
    userAnnotationColor: text('user_annotation_color'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('annotations_article_id_idx').on(table.articleId),
    index('annotations_updated_at_idx').on(table.updatedAt),
  ],
);

export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey(),
    annotationId: text('annotation_id')
      .notNull()
      .references(() => annotations.id, { onDelete: 'cascade' }),
    author: text('author').notNull(),
    content: text('content').notNull(),
    createdAt: text('created_at').notNull(),
    replyTo: text('reply_to'),
    agentId: text('agent_id'),
    agentUsername: text('agent_username'),
    agentNickname: text('agent_nickname'),
    agentAvatar: text('agent_avatar'),
    agentAnnotationColor: text('agent_annotation_color'),
    readingIntent: text('reading_intent'),
    reviewLabel: text('review_label'),
    userId: text('user_id'),
    userUsername: text('user_username'),
    userNickname: text('user_nickname'),
    userAvatar: text('user_avatar'),
    userAnnotationColor: text('user_annotation_color'),
    pending: integer('pending', { mode: 'boolean' }),
  },
  (table) => [
    index('comments_annotation_id_idx').on(table.annotationId),
    index('comments_created_at_idx').on(table.createdAt),
  ],
);
