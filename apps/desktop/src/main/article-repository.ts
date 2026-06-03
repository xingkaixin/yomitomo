import { count, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import type {
  Annotation,
  ArticleDeletePatch,
  ArticleRecord,
  ArticleReadingProgress,
  ArticleReadingProgressPatch,
  ArticleSummaryRecord,
  ArticleUpsertPatch,
  Comment,
  ReadingMemoryEntry,
} from '@yomitomo/shared';
import { readingMemoryEntriesFromAnnotationThread } from '@yomitomo/core';
import * as schema from './db/schema';
import {
  getDatabase,
  getSqliteExecutor,
  type StoreDatabase,
  type StoreExecutor,
  type StoreReadProfileEntry,
} from './store-db';
import {
  deleteReadingMemoryForArticle,
  softDeleteReadingMemoryEntriesBySource,
  upsertReadingMemoryEntries,
  withReadingMemoryTransaction,
  type ReadingMemorySqliteExecutor,
} from './reading-memory-store';
import {
  normalizeArticleReadingProgress,
  normalizeArticleSourceType,
  rowToAnnotation,
  rowToArticle,
  rowToArticleSummary,
  rowToComment,
  sortByCreatedAt,
  type ArticleSummaryCounts,
  type ArticleSummaryRow,
} from './store-normalizers';

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

  return rowToArticleSummary(row, [], readArticleSummaryCounts(database).get(id));
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
  if (!article) throw new Error('文章保存失败');
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

  const rows = database
    .select({ id: schema.articles.id, sourceType: schema.articles.sourceType })
    .from(schema.articles)
    .where(options.articleIds ? inArray(schema.articles.id, options.articleIds) : undefined)
    .all();
  const articles: Array<Pick<ArticleRecord, 'id' | 'sourceType' | 'annotations'>> = [];

  for (const row of rows) {
    if (!options.includePdf && row.sourceType === 'pdf') continue;
    const article = readArticleRows(database, row.id);
    if (article) articles.push(article);
  }

  return backfillArticleAnnotationMemoryEntries(articles, executor, options);
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

export function deleteArticleRows(database: StoreDatabase, id: string): ArticleDeletePatch {
  deleteReadingMemoryForArticle(id);
  database.delete(schema.articles).where(eq(schema.articles.id, id)).run();
  return { articleId: id };
}

export function deleteArticleRowsWithMemoryLifecycle(
  executor: ReadingMemorySqliteExecutor,
  articleId: string,
): ArticleDeletePatch {
  withReadingMemoryTransaction(executor, () => {
    deleteReadingMemoryForArticle(articleId, executor, { useTransaction: false });
    executor.prepare('DELETE FROM articles WHERE id = ?').run(articleId);
  });
  return { articleId };
}

export function deleteAnnotationRowsWithMemoryLifecycle(
  executor: ReadingMemorySqliteExecutor,
  input: { articleId: string; annotationId: string; deletedAt?: string },
) {
  return withReadingMemoryTransaction(executor, () => {
    const deletedMemoryCount = softDeleteReadingMemoryEntriesBySource({
      articleId: input.articleId,
      sourceAnnotationId: input.annotationId,
      deletedAt: input.deletedAt,
      deletionReason: 'annotation_deleted',
      executor,
      useTransaction: false,
    });
    const deletedAnnotationCount = runChanges(
      executor
        .prepare('DELETE FROM annotations WHERE article_id = ? AND id = ?')
        .run(input.articleId, input.annotationId),
    );
    return { deletedAnnotationCount, deletedMemoryCount };
  });
}

export function deleteCommentRowsWithMemoryLifecycle(
  executor: ReadingMemorySqliteExecutor,
  input: { articleId: string; annotationId: string; commentId: string; deletedAt?: string },
) {
  return withReadingMemoryTransaction(executor, () => {
    const commentIds = deletedCommentThreadIds(executor, input.annotationId, input.commentId);
    let deletedMemoryCount = 0;
    let deletedCommentCount = 0;

    for (const commentId of commentIds) {
      deletedMemoryCount += softDeleteReadingMemoryEntriesBySource({
        articleId: input.articleId,
        sourceCommentId: commentId,
        deletedAt: input.deletedAt,
        deletionReason: 'comment_deleted',
        executor,
        useTransaction: false,
      });
      deletedCommentCount += runChanges(
        executor
          .prepare(
            `
DELETE FROM comments
WHERE id = ?
  AND annotation_id = ?
  AND EXISTS (
    SELECT 1 FROM annotations
    WHERE annotations.id = comments.annotation_id
      AND annotations.article_id = ?
  )
`,
          )
          .run(commentId, input.annotationId, input.articleId),
      );
    }

    return { deletedCommentCount, deletedMemoryCount };
  });
}

function deletedCommentThreadIds(
  executor: ReadingMemorySqliteExecutor,
  annotationId: string,
  commentId: string,
) {
  const rows = executor
    .prepare(
      `
SELECT id, reply_to AS replyTo
FROM comments
WHERE annotation_id = ?
`,
    )
    .all(annotationId);
  const deletedIds = new Set([commentId]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const row of rows) {
      const id = stringField(recordField(row, 'id'));
      const replyTo = stringField(recordField(row, 'replyTo'));
      if (!replyTo || !deletedIds.has(replyTo) || deletedIds.has(id)) continue;
      deletedIds.add(id);
      expanded = true;
    }
  }
  return rows
    .map((row) => stringField(recordField(row, 'id')))
    .filter((id) => deletedIds.has(id))
    .toSorted();
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
  const annotationCounts = measureStoreRead(profile, 'count_annotations_by_article', () =>
    database
      .select({
        articleId: schema.annotations.articleId,
        count: count(),
      })
      .from(schema.annotations)
      .groupBy(schema.annotations.articleId)
      .all(),
  );
  const commentCounts = measureStoreRead(profile, 'count_comments_by_article', () =>
    database
      .select({
        articleId: schema.annotations.articleId,
        count: count(),
      })
      .from(schema.comments)
      .innerJoin(schema.annotations, eq(schema.comments.annotationId, schema.annotations.id))
      .where(isNull(schema.comments.replyTo))
      .groupBy(schema.annotations.articleId)
      .all(),
  );
  const distillationCounts = measureStoreRead(profile, 'count_distillations_by_article', () =>
    database
      .select({
        articleId: schema.annotations.articleId,
        count: count(),
      })
      .from(schema.annotations)
      .where(eq(schema.annotations.distillationStatus, 'published'))
      .groupBy(schema.annotations.articleId)
      .all(),
  );
  const countsByArticle = new Map<string, ArticleSummaryCounts>();

  for (const row of annotationCounts) {
    countsByArticle.set(row.articleId, {
      annotationCount: row.count,
      commentCount: 0,
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
        distillationCount: row.count,
      });
  }

  return countsByArticle;
}

function recordField(input: unknown, field: string): unknown {
  return isRecord(input) ? input[field] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function runChanges(result: unknown) {
  const changes = recordField(result, 'changes');
  return typeof changes === 'number' ? changes : 0;
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

export function buildArticleChildRows(article: Pick<ArticleRecord, 'id' | 'annotations'>) {
  const annotationRows = article.annotations.map((annotation) =>
    annotationToRow(article.id, annotation),
  );
  const commentRows = article.annotations.flatMap(commentRowsForAnnotation);
  return { annotationRows, commentRows };
}

function readArticleAnnotations(database: StoreDatabase, articleId: string) {
  const annotationRows = database
    .select()
    .from(schema.annotations)
    .where(eq(schema.annotations.articleId, articleId))
    .all();
  const annotationIds = annotationRows.map((row) => row.id);
  const commentRows =
    annotationIds.length > 0
      ? database
          .select()
          .from(schema.comments)
          .where(inArray(schema.comments.annotationId, annotationIds))
          .all()
      : [];
  return sortByCreatedAt(
    groupAnnotationsByArticle(annotationRows, commentRows).get(articleId) || [],
  );
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

function annotationToRow(articleId: string, annotation: Annotation) {
  return {
    id: annotation.id,
    articleId,
    anchor: annotation.anchor,
    author: annotation.author,
    annotationType: annotation.annotationType,
    readingIntent: annotation.readingIntent,
    moveType: annotation.moveType,
    whyHere: annotation.whyHere,
    evidenceUsed: annotation.evidenceUsed,
    confidence: annotation.confidence,
    shouldShow: annotation.shouldShow,
    color: annotation.color,
    agentId: annotation.agentId,
    agentUsername: annotation.agentUsername,
    agentNickname: annotation.agentNickname,
    agentAvatar: annotation.agentAvatar,
    agentAnnotationColor: annotation.agentAnnotationColor,
    userId: annotation.userId,
    userUsername: annotation.userUsername,
    userNickname: annotation.userNickname,
    userAvatar: annotation.userAvatar,
    userAnnotationColor: annotation.userAnnotationColor,
    distillationStatus: annotation.distillation?.status,
    distillationContent: annotation.distillation?.content,
    distillationPublishedAt: annotation.distillation?.publishedAt,
    distillationUpdatedAt: annotation.distillation?.updatedAt,
    distillationReviewSessions: annotation.distillation?.reviewSessions,
    createdAt: annotation.createdAt,
    updatedAt: annotation.updatedAt,
  };
}

function commentRowsForAnnotation(annotation: Annotation) {
  return annotation.comments.map((comment) => ({
    id: comment.id,
    annotationId: annotation.id,
    author: comment.author,
    content: comment.content,
    createdAt: comment.createdAt,
    replyTo: comment.replyTo,
    agentId: comment.agentId,
    agentUsername: comment.agentUsername,
    agentNickname: comment.agentNickname,
    agentAvatar: comment.agentAvatar,
    agentAnnotationColor: comment.agentAnnotationColor,
    readingIntent: comment.readingIntent,
    reviewLabel: comment.reviewLabel,
    assistantProgress: comment.assistantProgress,
    userId: comment.userId,
    userUsername: comment.userUsername,
    userNickname: comment.userNickname,
    userAvatar: comment.userAvatar,
    userAnnotationColor: comment.userAnnotationColor,
    pending: comment.pending,
  }));
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
