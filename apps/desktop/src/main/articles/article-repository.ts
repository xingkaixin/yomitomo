import { and, count, desc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type {
  Annotation,
  AnnotationDistillationReviewSession,
  ArticleDeletePatch,
  ArticleReaderChatStatePatch,
  ArticleRecord,
  ArticleReadingProgress,
  ArticleReadingProgressPatch,
  ArticleSummaryRecord,
  ArticleUpsertPatch,
  Comment,
  ReadingMemoryEntry,
} from '@yomitomo/shared';
import { readingMemoryEntriesFromAnnotationThread } from '@yomitomo/core';
import * as schema from '../db/schema';
import {
  getDatabase,
  getSqliteExecutor,
  type StoreDatabase,
  type StoreExecutor,
  type StoreReadProfileEntry,
} from '../store/store-db';
import {
  deleteReadingMemoryForArticle,
  upsertReadingMemoryEntries,
  type ReadingMemorySqliteExecutor,
} from '../reading-memory/reading-memory-store';
import {
  annotationToRow,
  buildArticleChildRows,
  commentRowsForAnnotation,
  commentToRow,
} from './article-repository-child-rows';
export { buildArticleChildRows } from './article-repository-child-rows';
export {
  deleteAnnotationRowsWithMemoryLifecycle,
  deleteArticleRowsWithMemoryLifecycle,
  deleteCommentRowsWithMemoryLifecycle,
} from './article-repository-lifecycle';
import {
  normalizeArticleReadingProgress,
  normalizeArticleSourceType,
  normalizeReaderChatState,
  rowToAnnotation,
  rowToArticle,
  rowToArticleSummary,
  rowToComment,
  sortByCreatedAt,
  type ArticleSummaryCounts,
  type ArticleSummaryRow,
} from '../store/store-normalizers';

const INSERT_BATCH_SIZE = 32;

export type ArticleIdentity = Pick<ArticleRecord, 'id' | 'url' | 'canonicalUrl'>;

export const articleSummaryColumns = {
  id: schema.articles.id,
  url: schema.articles.url,
  canonicalUrl: schema.articles.canonicalUrl,
  sourceType: schema.articles.sourceType,
  title: schema.articles.title,
  byline: schema.articles.byline,
  excerpt: schema.articles.excerpt,
  siteName: schema.articles.siteName,
  themeColor: schema.articles.themeColor,
  contentHash: schema.articles.contentHash,
  ebookMetadata: schema.articles.ebookMetadata,
  pdfMetadata: schema.articles.pdfMetadata,
  readingProgress: schema.articles.readingProgress,
  createdAt: schema.articles.createdAt,
  updatedAt: schema.articles.updatedAt,
} satisfies Record<keyof ArticleSummaryRow, unknown>;

const articleIdentityColumns = {
  id: schema.articles.id,
  url: schema.articles.url,
  canonicalUrl: schema.articles.canonicalUrl,
};

export function readArticleRows(database: StoreDatabase, id: string): ArticleRecord | null {
  const row = database.select().from(schema.articles).where(eq(schema.articles.id, id)).get();
  if (!row) return null;

  return rowToArticle(row, readArticleAnnotations(database, id));
}

export function readArticleSummaryRows(
  database: StoreDatabase,
  id: string,
): ArticleSummaryRecord | null {
  const row = database
    .select(articleSummaryColumns)
    .from(schema.articles)
    .where(eq(schema.articles.id, id))
    .get();
  if (!row) return null;

  return rowToArticleSummary(row, [], readArticleSummaryCountsForArticles(database, [id]).get(id));
}

export function findArticleByIdentityRows(
  database: StoreDatabase,
  identity: ArticleIdentity,
): ArticleIdentity | null {
  const idMatch = database
    .select(articleIdentityColumns)
    .from(schema.articles)
    .where(eq(schema.articles.id, identity.id))
    .get();
  if (idMatch) return idMatch;

  const candidates = Array.from(new Set([identity.canonicalUrl, identity.url]));
  const row = database
    .select(articleIdentityColumns)
    .from(schema.articles)
    .where(
      or(
        inArray(schema.articles.canonicalUrl, candidates),
        inArray(schema.articles.url, candidates),
      ),
    )
    .orderBy(desc(schema.articles.updatedAt))
    .get();
  return row ? findArticleInListByIdentity([row], identity) : null;
}

export function findArticleInListByIdentity<T extends ArticleIdentity>(
  articles: T[],
  identity: ArticleIdentity,
): T | null {
  return (
    articles.find((item) => item.id === identity.id) ||
    articles.find(
      (item) =>
        item.canonicalUrl === identity.canonicalUrl ||
        item.url === identity.url ||
        item.url === identity.canonicalUrl ||
        item.canonicalUrl === identity.url,
    ) ||
    null
  );
}

export function readArticleCoverRows(database: StoreDatabase, id: string): string {
  return (
    database
      .select({ leadImageUrl: schema.articles.leadImageUrl })
      .from(schema.articles)
      .where(eq(schema.articles.id, id))
      .get()?.leadImageUrl || ''
  );
}

export function readArticleSiteIconRawRows(database: StoreDatabase, id: string): string {
  return (
    database
      .select({ siteIconUrl: schema.articles.siteIconUrl })
      .from(schema.articles)
      .where(eq(schema.articles.id, id))
      .get()?.siteIconUrl || ''
  );
}

export function updateArticleSiteIconRows(
  database: StoreDatabase,
  id: string,
  siteIconUrl: string,
) {
  database.update(schema.articles).set({ siteIconUrl }).where(eq(schema.articles.id, id)).run();
}

export async function saveArticleRows(input: ArticleRecord): Promise<ArticleUpsertPatch> {
  writeArticleRowsInTransaction(getDatabase(), input);
  trySyncArticleAnnotationMemoryEntries(input);
  const article = readArticleSummaryRows(getDatabase(), input.id);
  if (!article) throw new Error('ARTICLE_SAVE_FAILED');
  return buildArticleUpsertPatch(article);
}

function trySyncArticleAnnotationMemoryEntries(article: Pick<ArticleRecord, 'id' | 'annotations'>) {
  try {
    return syncArticleAnnotationMemoryEntries(article);
  } catch (error) {
    console.warn('[reading-memory] sync annotation memory entries failed', {
      articleId: article.id,
      error,
    });
    return 0;
  }
}

export function syncArticleAnnotationMemoryEntries(
  article: Pick<ArticleRecord, 'id' | 'annotations'>,
  executor?: ReadingMemorySqliteExecutor,
) {
  const entries = articleAnnotationMemoryEntries(article);
  upsertReadingMemoryEntries(
    entries,
    executor || (getSqliteExecutor() as unknown as ReadingMemorySqliteExecutor),
  );
  return entries.length;
}

export type AnnotationMemoryBackfillResult = {
  articleCount: number;
  annotationCount: number;
  entryCount: number;
};

export function backfillStoredArticleAnnotationMemoryEntries(
  database: StoreDatabase,
  executor: ReadingMemorySqliteExecutor,
  options: { includePdf?: boolean; articleIds?: string[] } = {},
): AnnotationMemoryBackfillResult {
  if (options.articleIds && options.articleIds.length === 0) {
    return emptyAnnotationMemoryBackfillResult();
  }

  const articleRows = database
    .select({ id: schema.articles.id, sourceType: schema.articles.sourceType })
    .from(schema.articles)
    .where(options.articleIds ? inArray(schema.articles.id, options.articleIds) : undefined)
    .all()
    .filter((row) => options.includePdf || row.sourceType !== 'pdf');
  const articleIds = articleRows.map((row) => row.id);
  const annotationRows = readAnnotationRowsForArticles(database, articleIds);
  const annotationIds = annotationRows.map((row) => row.id);
  const commentRows = readCommentRowsForAnnotations(database, annotationIds);
  const annotationsByArticle = groupAnnotationsByArticle(annotationRows, commentRows);
  const articles = articleRows.map((row) => ({
    id: row.id,
    sourceType: normalizeArticleSourceType(row.sourceType),
    annotations: sortByCreatedAt(annotationsByArticle.get(row.id) || []),
  }));

  return backfillArticleAnnotationMemoryEntries(articles, executor, { includePdf: true });
}

export function backfillArticleAnnotationMemoryEntries(
  articles: Array<Pick<ArticleRecord, 'id' | 'sourceType' | 'annotations'>>,
  executor: ReadingMemorySqliteExecutor,
  options: { includePdf?: boolean } = {},
): AnnotationMemoryBackfillResult {
  const entries: ReadingMemoryEntry[] = [];
  const result = emptyAnnotationMemoryBackfillResult();

  for (const article of articles) {
    if (!options.includePdf && article.sourceType === 'pdf') continue;
    if (article.annotations.length === 0) continue;

    const articleEntries = articleAnnotationMemoryEntries(article);
    if (articleEntries.length === 0) continue;

    result.articleCount += 1;
    result.annotationCount += article.annotations.length;
    result.entryCount += articleEntries.length;
    entries.push(...articleEntries);
  }
  upsertReadingMemoryEntries(entries, executor);
  return result;
}

function emptyAnnotationMemoryBackfillResult(): AnnotationMemoryBackfillResult {
  return { articleCount: 0, annotationCount: 0, entryCount: 0 };
}

function articleAnnotationMemoryEntries(
  article: Pick<ArticleRecord, 'id' | 'annotations'>,
): ReadingMemoryEntry[] {
  return article.annotations.flatMap((annotation) =>
    readingMemoryEntriesFromAnnotationThread({
      articleId: article.id,
      annotation,
    }),
  );
}

export function buildArticleUpsertPatch(article: ArticleSummaryRecord): ArticleUpsertPatch {
  return { type: 'article-upsert', article };
}

export function saveArticleReadingProgressRows(
  database: StoreDatabase,
  articleId: string,
  progress: ArticleReadingProgress,
): ArticleReadingProgressPatch {
  const patch = buildArticleReadingProgressPatch(articleId, progress);
  database
    .update(schema.articles)
    .set({
      readingProgress: patch.readingProgress,
      updatedAt: patch.updatedAt,
    })
    .where(eq(schema.articles.id, articleId))
    .run();
  return patch;
}

export function buildArticleReadingProgressPatch(
  articleId: string,
  progress: ArticleReadingProgress,
): ArticleReadingProgressPatch {
  const readingProgress = normalizeArticleReadingProgress(progress) || progress;
  return { articleId, readingProgress, updatedAt: readingProgress.updatedAt };
}

export function saveArticleReaderChatStateRows(
  database: StoreDatabase,
  articleId: string,
  readerChatState: ArticleRecord['readerChatState'],
): ArticleReaderChatStatePatch {
  const patch = buildArticleReaderChatStatePatch(articleId, readerChatState);
  database
    .update(schema.articles)
    .set({
      readerChatState: patch.readerChatState,
      updatedAt: patch.updatedAt,
    })
    .where(eq(schema.articles.id, articleId))
    .run();
  return patch;
}

export function buildArticleReaderChatStatePatch(
  articleId: string,
  readerChatState: ArticleRecord['readerChatState'],
): ArticleReaderChatStatePatch {
  const normalized = normalizeReaderChatState(readerChatState, articleId);
  const updatedAt = normalized?.updatedAt || new Date().toISOString();
  return { type: 'article-reader-chat-state', articleId, readerChatState: normalized, updatedAt };
}

export function deleteArticleRows(database: StoreDatabase, id: string): ArticleDeletePatch {
  deleteReadingMemoryForArticle(id);
  database.delete(schema.articles).where(eq(schema.articles.id, id)).run();
  return { articleId: id };
}

export function readArticleSummaryRowsForStore(
  database: StoreDatabase,
  profile?: StoreReadProfileEntry[],
) {
  return measureStoreRead(profile, 'read_article_summaries', () =>
    database
      .select(articleSummaryColumns)
      .from(schema.articles)
      .orderBy(desc(schema.articles.updatedAt))
      .all(),
  );
}

export function readArticleSummaryCounts(
  database: StoreDatabase,
  profile?: StoreReadProfileEntry[],
) {
  return readArticleSummaryCountsInternal(database, profile);
}

export function readArticleSummaryCountsForArticles(
  database: StoreDatabase,
  articleIds: string[],
  profile?: StoreReadProfileEntry[],
) {
  if (articleIds.length === 0) return new Map<string, ArticleSummaryCounts>();
  return readArticleSummaryCountsInternal(database, profile, {
    articleIds: Array.from(new Set(articleIds)),
    profileNameSuffix: '_scoped',
  });
}

function readArticleSummaryCountsInternal(
  database: StoreDatabase,
  profile?: StoreReadProfileEntry[],
  scope?: { articleIds: string[]; profileNameSuffix: string },
) {
  const articleFilter = scope ? inArray(schema.annotations.articleId, scope.articleIds) : undefined;
  const profileName = (name: string) => `${name}${scope?.profileNameSuffix || ''}`;
  const annotationCounts = measureStoreRead(
    profile,
    profileName('count_annotations_by_article'),
    () =>
      database
        .select({
          articleId: schema.annotations.articleId,
          count: count(),
        })
        .from(schema.annotations)
        .where(articleFilter)
        .groupBy(schema.annotations.articleId)
        .all(),
  );
  const commentCounts = measureStoreRead(profile, profileName('count_comments_by_article'), () =>
    database
      .select({
        articleId: schema.annotations.articleId,
        count: count(),
      })
      .from(schema.comments)
      .innerJoin(schema.annotations, eq(schema.comments.annotationId, schema.annotations.id))
      .where(andConditions(isNull(schema.comments.replyTo), articleFilter))
      .groupBy(schema.annotations.articleId)
      .all(),
  );
  const aiCommentCounts = measureStoreRead(
    profile,
    profileName('count_ai_comments_by_article'),
    () =>
      database
        .select({
          articleId: schema.annotations.articleId,
          count: count(),
        })
        .from(schema.comments)
        .innerJoin(schema.annotations, eq(schema.comments.annotationId, schema.annotations.id))
        .where(andConditions(eq(schema.comments.author, 'ai'), articleFilter))
        .groupBy(schema.annotations.articleId)
        .all(),
  );
  const distillationCounts = measureStoreRead(
    profile,
    profileName('count_distillations_by_article'),
    () =>
      database
        .select({
          articleId: schema.annotations.articleId,
          count: count(),
        })
        .from(schema.annotations)
        .where(andConditions(eq(schema.annotations.distillationStatus, 'published'), articleFilter))
        .groupBy(schema.annotations.articleId)
        .all(),
  );
  const distillationReviewRows = measureStoreRead(
    profile,
    profileName('read_distillation_review_sessions_by_article'),
    () =>
      database
        .select({
          articleId: schema.annotations.articleId,
          reviewSessions: schema.annotations.distillationReviewSessions,
        })
        .from(schema.annotations)
        .where(articleFilter)
        .all(),
  );
  const countsByArticle = new Map<string, ArticleSummaryCounts>();

  for (const row of annotationCounts) {
    countsByArticle.set(row.articleId, {
      annotationCount: row.count,
      commentCount: 0,
      aiCommentCount: 0,
      distillationCount: 0,
    });
  }

  for (const row of commentCounts) {
    const counts = countsByArticle.get(row.articleId);
    if (counts) counts.commentCount = row.count;
    else
      countsByArticle.set(row.articleId, {
        annotationCount: 0,
        commentCount: row.count,
        aiCommentCount: 0,
        distillationCount: 0,
      });
  }

  for (const row of aiCommentCounts) {
    const counts = countsByArticle.get(row.articleId);
    if (counts) counts.aiCommentCount = row.count;
    else
      countsByArticle.set(row.articleId, {
        annotationCount: 0,
        commentCount: 0,
        aiCommentCount: row.count,
        distillationCount: 0,
      });
  }

  for (const row of distillationCounts) {
    const counts = countsByArticle.get(row.articleId);
    if (counts) counts.distillationCount = row.count;
    else
      countsByArticle.set(row.articleId, {
        annotationCount: 0,
        commentCount: 0,
        aiCommentCount: 0,
        distillationCount: row.count,
      });
  }

  for (const row of distillationReviewRows) {
    const aiReviewMessageCount = countAiDistillationReviewMessages(row.reviewSessions);
    if (aiReviewMessageCount === 0) continue;
    const counts = countsByArticle.get(row.articleId);
    if (counts) counts.aiCommentCount += aiReviewMessageCount;
    else
      countsByArticle.set(row.articleId, {
        annotationCount: 0,
        commentCount: 0,
        aiCommentCount: aiReviewMessageCount,
        distillationCount: 0,
      });
  }

  return countsByArticle;
}

function countAiDistillationReviewMessages(
  sessions: AnnotationDistillationReviewSession[] | unknown,
) {
  if (!Array.isArray(sessions)) return 0;
  return sessions.reduce(
    (total, session) => total + countAiDistillationReviewSessionMessages(session),
    0,
  );
}

function countAiDistillationReviewSessionMessages(session: unknown) {
  if (!session || typeof session !== 'object') return 0;
  const messages = (session as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return 0;
  return messages.filter(
    (message): message is { author: string } =>
      Boolean(message) &&
      typeof message === 'object' &&
      (message as { author?: unknown }).author === 'ai',
  ).length;
}

function andConditions(...conditions: Array<SQL | undefined>) {
  return conditions.filter(isSqlCondition).reduce<SQL | undefined>((current, condition) => {
    if (!current) return condition;
    return and(current, condition);
  }, undefined);
}

function isSqlCondition(condition: SQL | undefined): condition is SQL {
  return Boolean(condition);
}

export function writeArticleRows(database: StoreExecutor, article: ArticleRecord) {
  database
    .insert(schema.articles)
    .values({
      id: article.id,
      url: article.url,
      canonicalUrl: article.canonicalUrl,
      sourceType: normalizeArticleSourceType(article.sourceType),
      title: article.title,
      byline: article.byline,
      excerpt: article.excerpt,
      siteName: article.siteName,
      siteIconUrl: article.siteIconUrl,
      leadImageUrl: article.leadImageUrl,
      themeColor: article.themeColor,
      contentHtml: article.contentHtml,
      contentHash: article.contentHash,
      ebookMetadata: article.ebook?.metadata,
      ebookChapters: article.ebook?.chapters,
      ebookIndex: article.ebook?.index,
      pdfMetadata: article.pdf?.metadata,
      readingProgress: normalizeArticleReadingProgress(article.readingProgress),
      focusCoReadingPlan: article.focusCoReadingPlan,
      readerChatState: normalizeReaderChatState(article.readerChatState, article.id),
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
    })
    .onConflictDoUpdate({
      target: schema.articles.id,
      set: {
        url: article.url,
        canonicalUrl: article.canonicalUrl,
        sourceType: normalizeArticleSourceType(article.sourceType),
        title: article.title,
        byline: article.byline,
        excerpt: article.excerpt,
        siteName: article.siteName,
        siteIconUrl: article.siteIconUrl,
        leadImageUrl: article.leadImageUrl,
        themeColor: article.themeColor,
        contentHtml: article.contentHtml,
        contentHash: article.contentHash,
        ebookMetadata: article.ebook?.metadata,
        ebookChapters: article.ebook?.chapters,
        ebookIndex: article.ebook?.index,
        pdfMetadata: article.pdf?.metadata,
        readingProgress: normalizeArticleReadingProgress(article.readingProgress),
        focusCoReadingPlan: article.focusCoReadingPlan,
        readerChatState: normalizeReaderChatState(article.readerChatState, article.id),
        updatedAt: article.updatedAt,
      },
    })
    .run();

  database.delete(schema.annotations).where(eq(schema.annotations.articleId, article.id)).run();
  const { annotationRows, commentRows } = buildArticleChildRows(article);
  for (let index = 0; index < annotationRows.length; index += INSERT_BATCH_SIZE) {
    database
      .insert(schema.annotations)
      .values(annotationRows.slice(index, index + INSERT_BATCH_SIZE))
      .run();
  }
  for (let index = 0; index < commentRows.length; index += INSERT_BATCH_SIZE) {
    database
      .insert(schema.comments)
      .values(commentRows.slice(index, index + INSERT_BATCH_SIZE))
      .run();
  }
}

function writeArticleRowsInTransaction(database: StoreDatabase, article: ArticleRecord) {
  database.transaction((tx) => {
    writeArticleRows(tx, article);
  });
}

export function upsertAnnotationRows(
  database: StoreDatabase,
  input: { articleId: string; annotation: Annotation; updatedAt?: string },
  executor?: ReadingMemorySqliteExecutor,
): ArticleUpsertPatch | null {
  const existingArticleId = readAnnotationArticleId(database, input.annotation.id);
  if (existingArticleId && existingArticleId !== input.articleId) return null;

  database.transaction((tx) => {
    upsertAnnotationRow(tx, input.articleId, input.annotation);
    tx.delete(schema.comments).where(eq(schema.comments.annotationId, input.annotation.id)).run();
    insertCommentRows(tx, commentRowsForAnnotation(input.annotation));
    touchArticleRows(tx, input.articleId, input.updatedAt || input.annotation.updatedAt);
  });
  syncAnnotationMemoryEntries(input.articleId, input.annotation, executor);
  const article = readArticleSummaryRows(database, input.articleId);
  return article ? buildArticleUpsertPatch(article) : null;
}

export function upsertCommentRows(
  database: StoreDatabase,
  input: { articleId: string; annotationId: string; comment: Comment; updatedAt?: string },
  executor?: ReadingMemorySqliteExecutor,
): ArticleUpsertPatch | null {
  if (readAnnotationArticleId(database, input.annotationId) !== input.articleId) return null;

  database.transaction((tx) => {
    tx.insert(schema.comments)
      .values(commentToRow(input.annotationId, input.comment))
      .onConflictDoUpdate({
        target: schema.comments.id,
        set: commentToRow(input.annotationId, input.comment),
      })
      .run();
    touchArticleRows(tx, input.articleId, input.updatedAt || input.comment.createdAt);
  });
  syncStoredAnnotationMemoryEntries(database, input.articleId, input.annotationId, executor);
  const article = readArticleSummaryRows(database, input.articleId);
  return article ? buildArticleUpsertPatch(article) : null;
}

function upsertAnnotationRow(database: StoreExecutor, articleId: string, annotation: Annotation) {
  const row = annotationToRow(articleId, annotation);
  database
    .insert(schema.annotations)
    .values(row)
    .onConflictDoUpdate({
      target: schema.annotations.id,
      set: row,
    })
    .run();
}

function readAnnotationArticleId(database: StoreDatabase, annotationId: string) {
  return (
    database.select().from(schema.annotations).where(eq(schema.annotations.id, annotationId)).get()
      ?.articleId || null
  );
}

function insertCommentRows(
  database: StoreExecutor,
  commentRows: ReturnType<typeof commentRowsForAnnotation>,
) {
  for (let index = 0; index < commentRows.length; index += INSERT_BATCH_SIZE) {
    database
      .insert(schema.comments)
      .values(commentRows.slice(index, index + INSERT_BATCH_SIZE))
      .run();
  }
}

function touchArticleRows(database: StoreExecutor, articleId: string, updatedAt: string) {
  database
    .update(schema.articles)
    .set({ updatedAt })
    .where(eq(schema.articles.id, articleId))
    .run();
}

function syncStoredAnnotationMemoryEntries(
  database: StoreDatabase,
  articleId: string,
  annotationId: string,
  executor?: ReadingMemorySqliteExecutor,
) {
  const annotation = readArticleAnnotations(database, articleId).find(
    (item) => item.id === annotationId,
  );
  if (annotation) syncAnnotationMemoryEntries(articleId, annotation, executor);
}

function syncAnnotationMemoryEntries(
  articleId: string,
  annotation: Annotation,
  executor?: ReadingMemorySqliteExecutor,
) {
  upsertReadingMemoryEntries(
    readingMemoryEntriesFromAnnotationThread({ articleId, annotation }),
    executor || (getSqliteExecutor() as unknown as ReadingMemorySqliteExecutor),
  );
}

function readArticleAnnotations(database: StoreDatabase, articleId: string) {
  const annotationRows = readAnnotationRowsForArticles(database, [articleId]);
  const annotationIds = annotationRows.map((row) => row.id);
  const commentRows = readCommentRowsForAnnotations(database, annotationIds);
  return sortByCreatedAt(
    groupAnnotationsByArticle(annotationRows, commentRows).get(articleId) || [],
  );
}

function readAnnotationRowsForArticles(database: StoreDatabase, articleIds: string[]) {
  return articleIds.length > 0
    ? database
        .select()
        .from(schema.annotations)
        .where(inArray(schema.annotations.articleId, articleIds))
        .all()
    : [];
}

function readCommentRowsForAnnotations(database: StoreDatabase, annotationIds: string[]) {
  return annotationIds.length > 0
    ? database
        .select()
        .from(schema.comments)
        .where(inArray(schema.comments.annotationId, annotationIds))
        .all()
    : [];
}

function groupAnnotationsByArticle(
  annotationRows: Array<typeof schema.annotations.$inferSelect>,
  commentRows: Array<typeof schema.comments.$inferSelect>,
) {
  const commentsByAnnotation = new Map<string, Comment[]>();
  for (const row of commentRows) {
    const list = commentsByAnnotation.get(row.annotationId) || [];
    list.push(rowToComment(row));
    commentsByAnnotation.set(row.annotationId, list);
  }

  const annotationsByArticle = new Map<string, Annotation[]>();
  for (const row of annotationRows) {
    const list = annotationsByArticle.get(row.articleId) || [];
    list.push(rowToAnnotation(row, sortByCreatedAt(commentsByAnnotation.get(row.id) || [])));
    annotationsByArticle.set(row.articleId, list);
  }
  return annotationsByArticle;
}

function measureStoreRead<T>(
  profile: StoreReadProfileEntry[] | undefined,
  name: string,
  read: () => T,
  data?: Record<string, number>,
): T {
  const startedAt = performance.now();
  try {
    return read();
  } finally {
    profile?.push({ name, durationMs: elapsedMs(startedAt), data });
  }
}

function elapsedMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}
