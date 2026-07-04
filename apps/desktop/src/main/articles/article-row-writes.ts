import { eq } from 'drizzle-orm';
import type { ArticleRecord, ArticleSummaryRecord, ArticleUpsertPatch } from '@yomitomo/shared';
import * as schema from '../db/schema';
import {
  getDatabase,
  getSqliteExecutor,
  type StoreDatabase,
  type StoreExecutor,
} from '../store/store-db';
import type { ReadingMemorySqliteExecutor } from '../reading-memory/reading-memory-store';
import {
  normalizeArticleReadingProgress,
  normalizeArticleSourceType,
  normalizeReaderChatState,
} from '../store/store-normalizers';
import { buildArticleChildRows, commentRowsForAnnotation } from './article-repository-child-rows';
import {
  softDeleteAnnotationMemoryEntries,
  softDeleteCommentMemoryEntries,
} from './article-repository-lifecycle';
import { trySyncArticleAnnotationMemoryEntries } from './article-annotation-memory';
import { readArticleSummaryRows } from './article-row-queries';

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

export function buildArticleUpsertPatch(article: ArticleSummaryRecord): ArticleUpsertPatch {
  return { type: 'article-upsert', article };
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
  insertCommentRows(database, commentRows);
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

export function insertCommentRows(
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

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}
