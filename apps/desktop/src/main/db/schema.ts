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
    pdfMetadata: text('pdf_metadata', { mode: 'json' }),
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
      table.pdfMetadata,
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

export const wereadAccounts = sqliteTable('weread_accounts', {
  id: text('id').primaryKey(),
  apiKeyRef: text('api_key_ref'),
  openMethod: text('open_method').notNull().default('deeplink'),
  skillVersion: text('skill_version').notNull(),
  status: text('status').notNull().default('idle'),
  message: text('message'),
  lastSyncAt: text('last_sync_at'),
  lastTestAt: text('last_test_at'),
  updatedAt: text('updated_at').notNull(),
});

export const wereadBooks = sqliteTable(
  'weread_books',
  {
    bookId: text('book_id').primaryKey(),
    title: text('title').notNull(),
    author: text('author'),
    cover: text('cover'),
    intro: text('intro'),
    reviewCount: integer('review_count').notNull().default(0),
    noteCount: integer('note_count').notNull().default(0),
    bookmarkCount: integer('bookmark_count').notNull().default(0),
    readingProgress: integer('reading_progress').notNull().default(0),
    markedStatus: integer('marked_status'),
    sort: integer('sort'),
    currentChapterUid: integer('current_chapter_uid'),
    currentChapterOffset: integer('current_chapter_offset'),
    recordReadingTime: integer('record_reading_time'),
    lastReadAt: integer('last_read_at'),
    syncedAt: text('synced_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('weread_books_updated_at_idx').on(table.updatedAt),
    index('weread_books_sort_idx').on(table.sort),
  ],
);

export const wereadChapters = sqliteTable(
  'weread_chapters',
  {
    bookId: text('book_id').notNull(),
    chapterUid: integer('chapter_uid').notNull(),
    chapterIdx: integer('chapter_idx').notNull().default(0),
    title: text('title').notNull(),
    level: integer('level').notNull().default(1),
    wordCount: integer('word_count'),
  },
  (table) => [
    index('weread_chapters_book_idx').on(table.bookId, table.chapterIdx),
    index('weread_chapters_uid_idx').on(table.bookId, table.chapterUid),
  ],
);

export const wereadHighlights = sqliteTable(
  'weread_highlights',
  {
    bookmarkId: text('bookmark_id').primaryKey(),
    bookId: text('book_id').notNull(),
    chapterUid: integer('chapter_uid').notNull(),
    chapterIdx: integer('chapter_idx'),
    range: text('range'),
    markText: text('mark_text').notNull(),
    colorStyle: integer('color_style'),
    createTime: integer('create_time').notNull().default(0),
  },
  (table) => [index('weread_highlights_book_idx').on(table.bookId, table.chapterUid)],
);

export const wereadThoughts = sqliteTable(
  'weread_thoughts',
  {
    reviewId: text('review_id').primaryKey(),
    bookId: text('book_id').notNull(),
    userVid: integer('user_vid'),
    author: text('author', { mode: 'json' }),
    chapterUid: integer('chapter_uid'),
    chapterIdx: integer('chapter_idx'),
    chapterName: text('chapter_name'),
    range: text('range'),
    abstract: text('abstract'),
    content: text('content').notNull(),
    createTime: integer('create_time').notNull().default(0),
  },
  (table) => [index('weread_thoughts_book_idx').on(table.bookId, table.chapterUid)],
);
