import { eq } from 'drizzle-orm';
import type {
  ArticleReaderChatStatePatch,
  ArticleRecord,
  ArticleReadingProgress,
  ArticleReadingProgressPatch,
} from '@yomitomo/shared';
import { createReaderChatState } from '../../reader-chat-state';
import type { ArticleReaderChatStateSaveInput } from '../../ipc-contract';
import * as schema from '../db/schema';
import type { StoreDatabase, StoreExecutor } from '../store/store-db';
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

export function selectArticleChatAssistantRows(
  database: StoreDatabase,
  {
    articleId,
    selectedAssistantId,
    initialSessionId,
  }: Extract<ArticleReaderChatStateSaveInput, { selectedAssistantId: string }>,
): ArticleReaderChatStatePatch {
  return database.transaction((tx) => {
    const row = tx
      .select({ state: schema.articles.readerChatState })
      .from(schema.articles)
      .where(eq(schema.articles.id, articleId))
      .get();
    const current = normalizeReaderChatState(row?.state, articleId);
    const now = new Date().toISOString();
    const next = current
      ? { ...current, selectedAssistantId, updatedAt: now }
      : createReaderChatState(articleId, initialSessionId, selectedAssistantId, now);
    return saveArticleReaderChatStateRows(tx, articleId, next);
  });
}

export function saveArticleReaderChatStateRows(
  database: StoreExecutor,
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
