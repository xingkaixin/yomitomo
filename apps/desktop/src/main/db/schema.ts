import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

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
  uiLanguage: text('ui_language').notNull().default('zh-CN'),
  themeId: text('theme_id'),
  soundEffectsEnabled: integer('sound_effects_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  soundEffectsVolume: real('sound_effects_volume').notNull().default(0.7),
  appLockEnabled: integer('app_lock_enabled', { mode: 'boolean' }).notNull().default(false),
  appLockLocked: integer('app_lock_locked', { mode: 'boolean' }).notNull().default(false),
  appLockLockOnStartup: integer('app_lock_lock_on_startup', { mode: 'boolean' })
    .notNull()
    .default(false),
  appLockShortcut: text('app_lock_shortcut'),
  libraryPageSize: integer('library_page_size'),
  libraryContentSources: text('library_content_sources', { mode: 'json' }),
  defaultProviderId: text('default_provider_id'),
  readingAssistantProviderId: text('reading_assistant_provider_id'),
  reviewAssistantProviderId: text('review_assistant_provider_id'),
  bilingualTranslationProviderId: text('bilingual_translation_provider_id'),
  bilingualTranslationTargetLanguage: text('bilingual_translation_target_language'),
  bilingualTranslationStyle: text('bilingual_translation_style'),
  bilingualTranslationAiContextAware: integer('bilingual_translation_ai_context_aware', {
    mode: 'boolean',
  }),
  assistantExecutionMode: text('assistant_execution_mode').notNull().default('fast_response'),
  messageSendShortcut: text('message_send_shortcut').notNull().default('enter'),
  selectionActionShortcuts: text('selection_action_shortcuts', { mode: 'json' }),
  saveArticleImages: integer('save_article_images', { mode: 'boolean' }).notNull().default(false),
  allowLocalNetworkArticleImport: integer('allow_local_network_article_import', {
    mode: 'boolean',
  })
    .notNull()
    .default(false),
  developerModeEnabled: integer('developer_mode_enabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  logRetentionDays: integer('log_retention_days'),
  annotationMemoryBackfillVersion: text('annotation_memory_backfill_version'),
  onboardingCompletedAt: text('onboarding_completed_at'),
  lastSeenVersion: text('last_seen_version'),
  updatedAt: text('updated_at').notNull(),
});

export const assistantExecutionRuns = sqliteTable(
  'assistant_execution_runs',
  {
    id: text('id').primaryKey(),
    createdAt: text('created_at').notNull(),
    agentId: text('agent_id').notNull(),
    agentUsername: text('agent_username'),
    agentNickname: text('agent_nickname'),
    taskType: text('task_type').notNull(),
    requestedMode: text('requested_mode').notNull(),
    effectiveMode: text('effective_mode').notNull(),
    providerId: text('provider_id').notNull(),
    providerName: text('provider_name').notNull(),
    modelName: text('model_name').notNull(),
    status: text('status').notNull(),
    fallbackReason: text('fallback_reason'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    reasoningTokens: integer('reasoning_tokens'),
    cachedInputTokens: integer('cached_input_tokens'),
    cacheWriteTokens: integer('cache_write_tokens'),
    totalTokens: integer('total_tokens'),
    estimatedCostMicros: integer('estimated_cost_micros'),
    currency: text('currency'),
    durationMs: integer('duration_ms'),
    stepCount: integer('step_count').notNull().default(0),
    traceJson: text('trace_json', { mode: 'json' }),
  },
  (table) => [
    index('assistant_execution_runs_created_at_idx').on(table.createdAt),
    index('assistant_execution_runs_agent_idx').on(table.agentId, table.createdAt),
    index('assistant_execution_runs_provider_model_idx').on(
      table.providerId,
      table.modelName,
      table.createdAt,
    ),
  ],
);

export const modelPriceRecords = sqliteTable(
  'model_price_records',
  {
    id: text('id').primaryKey(),
    providerId: text('provider_id').notNull(),
    modelId: text('model_id').notNull(),
    inputCostPerMillion: real('input_cost_per_million'),
    outputCostPerMillion: real('output_cost_per_million'),
    cacheReadCostPerMillion: real('cache_read_cost_per_million'),
    cacheWriteCostPerMillion: real('cache_write_cost_per_million'),
    currency: text('currency').notNull().default('USD'),
    source: text('source').notNull(),
    fetchedAt: text('fetched_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('model_price_records_provider_model_idx').on(table.providerId, table.modelId),
    index('model_price_records_updated_at_idx').on(table.updatedAt),
  ],
);

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
    readerChatState: text('reader_chat_state', { mode: 'json' }),
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
    distillationStatus: text('distillation_status'),
    distillationContent: text('distillation_content'),
    distillationPublishedAt: text('distillation_published_at'),
    distillationUpdatedAt: text('distillation_updated_at'),
    distillationReviewSessions: text('distillation_review_sessions', { mode: 'json' }),
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
    assistantProgress: text('assistant_progress', { mode: 'json' }),
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

export const readingMemoryEntries = sqliteTable(
  'reading_memory_entries',
  {
    id: text('id').primaryKey(),
    articleId: text('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    scope: text('scope').notNull(),
    visibility: text('visibility').notNull().default('default'),
    payloadVersion: integer('payload_version').notNull().default(1),
    chapterId: text('chapter_id'),
    segmentId: text('segment_id'),
    paragraphId: text('paragraph_id'),
    textStart: integer('text_start'),
    textEnd: integer('text_end'),
    agentId: text('agent_id'),
    readerId: text('reader_id'),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id'),
    sourceAnnotationId: text('source_annotation_id'),
    sourceCommentId: text('source_comment_id'),
    sourceTaskId: text('source_task_id'),
    sourceEntryIds: text('source_entry_ids', { mode: 'json' }).notNull(),
    supersedesEntryId: text('supersedes_entry_id').references(
      (): AnySQLiteColumn => readingMemoryEntries.id,
      { onDelete: 'set null' },
    ),
    anchor: text('anchor', { mode: 'json' }),
    payload: text('payload', { mode: 'json' }).notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
    deletionReason: text('deletion_reason'),
  },
  (table) => [
    index('reading_memory_article_idx').on(table.articleId, table.createdAt),
    index('reading_memory_location_idx').on(
      table.articleId,
      table.chapterId,
      table.segmentId,
      table.textStart,
    ),
    index('reading_memory_source_idx').on(table.articleId, table.sourceType, table.sourceId),
    index('reading_memory_annotation_source_idx').on(table.articleId, table.sourceAnnotationId),
    index('reading_memory_comment_source_idx').on(table.articleId, table.sourceCommentId),
    index('reading_memory_active_kind_idx').on(
      table.articleId,
      table.kind,
      table.scope,
      table.visibility,
      table.deletedAt,
    ),
  ],
);

export const readingMemoryProjections = sqliteTable(
  'reading_memory_projections',
  {
    id: text('id').primaryKey(),
    articleId: text('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    viewType: text('view_type').notNull(),
    viewKey: text('view_key').notNull(),
    payload: text('payload', { mode: 'json' }).notNull(),
    sourceEntryIds: text('source_entry_ids', { mode: 'json' }).notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('reading_memory_projection_article_idx').on(table.articleId),
    uniqueIndex('reading_memory_projection_key_idx').on(
      table.articleId,
      table.viewType,
      table.viewKey,
    ),
  ],
);

export const articleTranslations = sqliteTable(
  'article_translations',
  {
    id: text('id').primaryKey(),
    articleId: text('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    sourceContentHash: text('source_content_hash').notNull(),
    targetLanguage: text('target_language').notNull(),
    promptVersion: integer('prompt_version').notNull(),
    providerId: text('provider_id'),
    providerName: text('provider_name'),
    modelName: text('model_name'),
    status: text('status').notNull(),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('article_translations_article_idx').on(table.articleId, table.updatedAt),
    uniqueIndex('article_translations_current_idx').on(
      table.articleId,
      table.sourceContentHash,
      table.targetLanguage,
      table.promptVersion,
    ),
  ],
);

export const articleTranslationSegments = sqliteTable(
  'article_translation_segments',
  {
    id: text('id').primaryKey(),
    translationId: text('translation_id')
      .notNull()
      .references(() => articleTranslations.id, { onDelete: 'cascade' }),
    sourceBlockId: text('source_block_id').notNull(),
    sourceTextHash: text('source_text_hash').notNull(),
    sourceText: text('source_text').notNull(),
    translatedText: text('translated_text'),
    status: text('status').notNull(),
    error: text('error'),
    order: integer('order_index').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('article_translation_segments_translation_idx').on(table.translationId, table.order),
    uniqueIndex('article_translation_segments_block_idx').on(
      table.translationId,
      table.sourceBlockId,
    ),
  ],
);

export const collections = sqliteTable(
  'collections',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    desc: text('desc'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('collections_updated_at_idx').on(table.updatedAt)],
);

export const collectionMembers = sqliteTable(
  'collection_members',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    memberKind: text('member_kind').notNull(),
    memberId: text('member_id').notNull(),
    addedAt: text('added_at').notNull(),
  },
  (table) => [
    uniqueIndex('collection_members_unique_idx').on(
      table.collectionId,
      table.memberKind,
      table.memberId,
    ),
    index('collection_members_collection_idx').on(table.collectionId, table.addedAt),
    index('collection_members_member_idx').on(table.memberKind, table.memberId),
  ],
);

export const libraryPins = sqliteTable(
  'library_pins',
  {
    targetKind: text('target_kind').notNull(),
    targetId: text('target_id').notNull(),
    pinnedAt: text('pinned_at').notNull(),
  },
  (table) => [
    uniqueIndex('library_pins_unique_idx').on(table.targetKind, table.targetId),
    index('library_pins_pinned_at_idx').on(table.pinnedAt),
  ],
);

export const wereadAccounts = sqliteTable('weread_accounts', {
  id: text('id').primaryKey(),
  apiKeyRef: text('api_key_ref'),
  openMethod: text('open_method').notNull().default('deeplink'),
  syncMode: text('sync_mode').notNull().default('manual'),
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
    readingTime: integer('reading_time'),
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

export const wereadReadingStats = sqliteTable(
  'weread_reading_stats',
  {
    id: text('id').primaryKey(),
    mode: text('mode').notNull(),
    periodStart: integer('period_start').notNull(),
    sourceBaseTime: integer('source_base_time'),
    payload: text('payload', { mode: 'json' }).notNull(),
    fetchedAt: text('fetched_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('weread_reading_stats_period_idx').on(table.mode, table.periodStart),
    index('weread_reading_stats_fetched_at_idx').on(table.fetchedAt),
  ],
);
