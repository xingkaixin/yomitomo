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
  queueDeletedAnnotationThreadProjection,
  queueStoredArticleAnnotationThreadProjections,
} from '../reading-memory/reading-memory-projection-job-queue';
import {
  normalizeArticleReadingProgress,
  normalizeArticleSourceType,
  normalizeReaderChatState,
} from '../store/store-normalizers';
import { buildArticleChildRows, commentRowsForAnnotation } from './article-repository-child-rows';
import {
  deleteRemovedAssetReviews,
  trySoftDeleteAnnotationMemoryEntries,
  trySoftDeleteCommentMemoryEntries,
} from './article-repository-lifecycle';
import {
  readStoredArticleAssetRevisions,
  type StoredArticleAssetRevisions,
} from './article-asset-revisions';
import { trySyncArticleAnnotationMemoryEntries } from './article-annotation-memory';
import { readArticleSummaryRows } from './article-row-queries';

const INSERT_BATCH_SIZE = 32;

export async function saveArticleRows(input: ArticleRecord): Promise<ArticleUpsertPatch> {
  const database = getDatabase();
  const executor: ReadingMemorySqliteExecutor = getSqliteExecutor();
  const removedSources = writeArticleRowsInTransaction(database, input, executor);
  for (const annotationId of removedSources.annotationIds) {
    trySoftDeleteAnnotationMemoryEntries(executor, { articleId: input.id, annotationId });
  }
  trySoftDeleteCommentMemoryEntries(executor, {
    articleId: input.id,
    commentIds: removedSources.commentIds,
  });
  trySyncArticleAnnotationMemoryEntries(input, executor);
  const article = readArticleSummaryRows(database, input.id);
  if (!article) throw new Error('ARTICLE_SAVE_FAILED');
  return buildArticleUpsertPatch(article);
}

export function buildArticleUpsertPatch(article: ArticleSummaryRecord): ArticleUpsertPatch {
  return { type: 'article-upsert', article };
}

export function writeArticleRows(
  database: StoreExecutor,
  article: ArticleRecord,
  previous = readStoredArticleAssetRevisions(database, article.id),
) {
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
      readingProgress: normalizeArticleReadingProgress(article.readingProgress, sourceType),
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
        readingProgress: normalizeArticleReadingProgress(article.readingProgress, sourceType),
        focusCoReadingPlan: article.focusCoReadingPlan,
        readerChatState: normalizeReaderChatState(article.readerChatState, article.id),
        updatedAt: article.updatedAt,
      },
    })
    .run();

  database.delete(schema.annotations).where(eq(schema.annotations.articleId, article.id)).run();
  const { annotationRows, commentRows } = buildArticleChildRows(article, previous);
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
  const queuedAt = new Date().toISOString();
  return database.transaction((tx) => {
    const previous = readStoredArticleAssetRevisions(tx, article.id);
    const removedSources = removedArticleAnnotationSources(previous, article);
    writeArticleRows(tx, article, previous);
    deleteRemovedAssetReviews(executor, { articleId: article.id, ...removedSources });
    queueStoredArticleAnnotationThreadProjections(executor, {
      articleId: article.id,
      queuedAt,
    });
    for (const annotationId of removedSources.annotationIds) {
      queueDeletedAnnotationThreadProjection(executor, {
        articleId: article.id,
        annotationId,
        queuedAt,
      });
    }
    return removedSources;
  });
}

function removedArticleAnnotationSources(
  previous: StoredArticleAssetRevisions,
  article: Pick<ArticleRecord, 'id' | 'annotations'>,
) {
  const currentAnnotationIds = new Set(article.annotations.map((item) => item.id));
  const currentCommentIds = new Set(
    article.annotations.flatMap((item) => item.comments.map((comment) => comment.id)),
  );
  const annotationIds = [...previous.annotations.keys()].filter(
    (annotationId) => !currentAnnotationIds.has(annotationId),
  );
  const removedAnnotationIdSet = new Set(annotationIds);
  const commentIds = [...previous.comments.values()]
    .filter(
      (comment) =>
        !removedAnnotationIdSet.has(comment.annotationId) && !currentCommentIds.has(comment.id),
    )
    .map((comment) => comment.id);
  const distillationAnnotationIds = article.annotations
    .filter((annotation) => !annotation.distillation)
    .map((annotation) => annotation.id);
  return { annotationIds, commentIds, distillationAnnotationIds };
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
