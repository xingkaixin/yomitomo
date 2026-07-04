import { eq } from 'drizzle-orm';
import type {
  ArticleDeletePatch,
  ArticleReaderChatStatePatch,
  ArticleRecord,
  ArticleReadingProgress,
  ArticleReadingProgressPatch,
} from '@yomitomo/shared';
import * as schema from '../db/schema';
import type { StoreDatabase } from '../store/store-db';
import { deleteReadingMemoryForArticle } from '../reading-memory/reading-memory-store';
import {
  normalizeArticleReadingProgress,
  normalizeReaderChatState,
} from '../store/store-normalizers';

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
