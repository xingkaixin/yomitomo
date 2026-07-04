import { inArray } from 'drizzle-orm';
import type { ArticleRecord, ReadingMemoryEntry } from '@yomitomo/shared';
import { readingMemoryEntriesFromAnnotationThread } from '@yomitomo/core';
import * as schema from '../db/schema';
import { getSqliteExecutor, type StoreDatabase } from '../store/store-db';
import {
  upsertReadingMemoryEntries,
  type ReadingMemorySqliteExecutor,
} from '../reading-memory/reading-memory-store';
import { normalizeArticleSourceType, sortByCreatedAt } from '../store/store-normalizers';
import {
  groupAnnotationsByArticle,
  readAnnotationActorAvatars,
  readAnnotationRowsForArticles,
  readCommentRowsForAnnotations,
} from './article-annotation-hydration';

export function trySyncArticleAnnotationMemoryEntries(
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
