import { eq, inArray } from 'drizzle-orm';
import type {
  Annotation,
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
  softDeleteAnnotationMemoryEntries,
  softDeleteCommentMemoryEntries,
} from './article-repository-lifecycle';
import {
  normalizeArticleReadingProgress,
  normalizeArticleSourceType,
  normalizeReaderChatState,
  sortByCreatedAt,
} from '../store/store-normalizers';
import {
  groupAnnotationsByArticle,
  readAnnotationActorAvatars,
  readAnnotationRowsForArticles,
  readArticleAnnotations,
  readCommentRowsForAnnotations,
} from './article-annotation-hydration';
import { readArticleSummaryRows } from './article-row-queries';
export { articleSummaryColumns, type ArticleIdentity } from './article-repository-columns';
export {
  findArticleByIdentityRows,
  findArticleInListByIdentity,
  readArticleCoverRows,
  readArticleRows,
  readArticleSiteIconRawRows,
  readArticleSummaryRows,
  updateArticleSiteIconRows,
} from './article-row-queries';
export {
  readArticleSummaryCounts,
  readArticleSummaryCountsForArticles,
} from './article-summary-counts';
export { readArticleSummaryRowsForStore } from './article-summary-queries';
export { readArticleLibraryListRows } from './article-library-queries';
export { readArticleStatsSummaryRows } from './article-stats';

const INSERT_BATCH_SIZE = 32;

export async function saveArticleRows(input: ArticleRecord): Promise<ArticleUpsertPatch> {
  const database = getDatabase();
  const executor = getSqliteExecutor() as unknown as ReadingMemorySqliteExecutor;
  writeArticleRowsInTransaction(database, input, executor);
  trySyncArticleAnnotationMemoryEntries(input, executor);
  const article = readArticleSummaryRows(database, input.id);
  if (!article) throw new Error('ARTICLE_SAVE_FAILED');
  return buildArticleUpsertPatch(article);
}

function trySyncArticleAnnotationMemoryEntries(
  article: Pick<ArticleRecord, 'id' | 'annotations'>,
  executor?: ReadingMemorySqliteExecutor,
) {
  try {
    return syncArticleAnnotationMemoryEntries(article, executor);
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
  const actorAvatars = readAnnotationActorAvatars(database, annotationRows, commentRows);
  const annotationsByArticle = groupAnnotationsByArticle(annotationRows, commentRows, actorAvatars);
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

export function writeArticleRows(database: StoreExecutor, article: ArticleRecord) {
  const sourceType = normalizeArticleSourceType(article.sourceType);
  const contentHtml = sourceType === 'ebook' ? null : article.contentHtml;
  database
    .insert(schema.articles)
    .values({
      id: article.id,
      url: article.url,
      canonicalUrl: article.canonicalUrl,
      sourceType,
      title: article.title,
      byline: article.byline,
      excerpt: article.excerpt,
      siteName: article.siteName,
      siteIconUrl: article.siteIconUrl,
      leadImageUrl: article.leadImageUrl,
      themeColor: article.themeColor,
      contentHtml,
      contentHash: article.contentHash,
      ebookMetadata: article.ebook?.metadata,
      ebookChapters: article.ebook?.chapters,
      ebookIndex: article.ebook?.index,
      pdfMetadata: article.pdf?.metadata,
      textMetadata: article.text,
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
        sourceType,
        title: article.title,
        byline: article.byline,
        excerpt: article.excerpt,
        siteName: article.siteName,
        siteIconUrl: article.siteIconUrl,
        leadImageUrl: article.leadImageUrl,
        themeColor: article.themeColor,
        contentHtml,
        contentHash: article.contentHash,
        ebookMetadata: article.ebook?.metadata,
        ebookChapters: article.ebook?.chapters,
        ebookIndex: article.ebook?.index,
        pdfMetadata: article.pdf?.metadata,
        textMetadata: article.text,
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

function writeArticleRowsInTransaction(
  database: StoreDatabase,
  article: ArticleRecord,
  executor: ReadingMemorySqliteExecutor,
) {
  database.transaction((tx) => {
    softDeleteRemovedArticleAnnotationMemoryEntries(tx, executor, article);
    writeArticleRows(tx, article);
  });
}

type ArticleAnnotationSourceSnapshot = {
  annotationIds: string[];
  comments: Array<{ id: string; annotationId: string }>;
};

function softDeleteRemovedArticleAnnotationMemoryEntries(
  database: StoreExecutor,
  executor: ReadingMemorySqliteExecutor,
  article: Pick<ArticleRecord, 'id' | 'annotations'>,
) {
  const currentAnnotationIds = new Set(uniqueStrings(article.annotations.map((item) => item.id)));
  const currentCommentIds = new Set(
    uniqueStrings(
      article.annotations.flatMap((item) => item.comments.map((comment) => comment.id)),
    ),
  );
  const storedSources = readArticleAnnotationSourceSnapshot(database, article.id);
  const removedAnnotationIds = storedSources.annotationIds.filter(
    (annotationId) => !currentAnnotationIds.has(annotationId),
  );
  const removedAnnotationIdSet = new Set(removedAnnotationIds);
  const removedCommentIds = storedSources.comments
    .filter(
      (comment) =>
        !removedAnnotationIdSet.has(comment.annotationId) && !currentCommentIds.has(comment.id),
    )
    .map((comment) => comment.id);

  for (const annotationId of removedAnnotationIds) {
    softDeleteAnnotationMemoryEntries(executor, {
      articleId: article.id,
      annotationId,
      useTransaction: false,
    });
  }
  softDeleteCommentMemoryEntries(executor, {
    articleId: article.id,
    commentIds: removedCommentIds,
    useTransaction: false,
  });
}

function readArticleAnnotationSourceSnapshot(
  database: StoreExecutor,
  articleId: string,
): ArticleAnnotationSourceSnapshot {
  const annotationRows = database
    .select({ id: schema.annotations.id })
    .from(schema.annotations)
    .where(eq(schema.annotations.articleId, articleId))
    .all();
  const commentRows = database
    .select({ id: schema.comments.id, annotationId: schema.comments.annotationId })
    .from(schema.comments)
    .innerJoin(schema.annotations, eq(schema.annotations.id, schema.comments.annotationId))
    .where(eq(schema.annotations.articleId, articleId))
    .all();

  return {
    annotationIds: annotationRows.map((row) => row.id),
    comments: commentRows.map((row) => ({ id: row.id, annotationId: row.annotationId })),
  };
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

export function touchArticleRows(database: StoreExecutor, articleId: string, updatedAt: string) {
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

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}
