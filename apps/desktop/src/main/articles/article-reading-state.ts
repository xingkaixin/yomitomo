import { eq } from 'drizzle-orm';
import type {
  ArticleReaderChatStatePatch,
  ArticleRecord,
  ArticleReadingProgress,
  ArticleReadingProgressPatch,
  ReaderChatMessage,
  ReaderChatSession,
  ReaderChatState,
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
    return writeArticleReaderChatStateRows(tx, articleId, next);
  });
}

export function saveArticleReaderChatStateRows(
  database: StoreDatabase,
  articleId: string,
  readerChatState: ArticleRecord['readerChatState'],
): ArticleReaderChatStatePatch {
  return database.transaction((tx) => {
    const incoming = normalizeReaderChatState(readerChatState, articleId);
    if (!incoming) return writeArticleReaderChatStateRows(tx, articleId, undefined);
    const row = tx
      .select({ state: schema.articles.readerChatState })
      .from(schema.articles)
      .where(eq(schema.articles.id, articleId))
      .get();
    const current = normalizeReaderChatState(row?.state, articleId);
    const merged = current ? mergeReaderChatStates(current, incoming) : incoming;
    return writeArticleReaderChatStateRows(tx, articleId, merged);
  });
}

export function writeArticleReaderChatStateRows(
  database: StoreExecutor,
  articleId: string,
  readerChatState: ArticleRecord['readerChatState'],
): ArticleReaderChatStatePatch {
  const patch = buildArticleReaderChatStatePatch(articleId, readerChatState);
  database
    .update(schema.articles)
    .set({
      readerChatState: patch.readerChatState ?? null,
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

function mergeReaderChatStates(
  current: ReaderChatState,
  incoming: ReaderChatState,
): ReaderChatState {
  const incomingSessionsById = new Map(incoming.sessions.map((session) => [session.id, session]));
  const mergedSessions: ReaderChatSession[] = [];

  for (const currentSession of current.sessions) {
    const incomingSession = incomingSessionsById.get(currentSession.id);
    if (incomingSession) {
      mergedSessions.push(mergeReaderChatSession(currentSession, incomingSession));
      incomingSessionsById.delete(currentSession.id);
    } else {
      mergedSessions.push(currentSession);
    }
  }
  for (const remainingSession of incomingSessionsById.values()) {
    mergedSessions.push(remainingSession);
  }

  const incomingIsNewerOrEqual = compareTimestamps(incoming.updatedAt, current.updatedAt) >= 0;
  let updatedAt = laterTimestamp(current.updatedAt, incoming.updatedAt);
  for (const session of mergedSessions) {
    updatedAt = laterTimestamp(updatedAt, session.updatedAt);
  }

  return {
    articleId: incoming.articleId,
    activeSessionId: incomingIsNewerOrEqual ? incoming.activeSessionId : current.activeSessionId,
    selectedAssistantId: incomingIsNewerOrEqual
      ? (incoming.selectedAssistantId ?? current.selectedAssistantId)
      : (current.selectedAssistantId ?? incoming.selectedAssistantId),
    sessions: mergedSessions,
    createdAt: earlierTimestamp(current.createdAt, incoming.createdAt),
    updatedAt,
  };
}

function mergeReaderChatSession(
  current: ReaderChatSession,
  incoming: ReaderChatSession,
): ReaderChatSession {
  const seenIds = new Set(current.messages.map((message) => message.id));
  const combined: ReaderChatMessage[] = [...current.messages];
  for (const message of incoming.messages) {
    if (!seenIds.has(message.id)) {
      seenIds.add(message.id);
      combined.push(message);
    }
  }
  const messages = combined.toSorted((left, right) =>
    compareTimestamps(left.createdAt, right.createdAt),
  );
  return {
    id: incoming.id,
    articleId: incoming.articleId,
    title: incoming.title ?? current.title,
    createdAt: earlierTimestamp(current.createdAt, incoming.createdAt),
    updatedAt: laterTimestamp(current.updatedAt, incoming.updatedAt),
    messages,
  };
}

function compareTimestamps(left: string, right: string) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime - rightTime;
  return left.localeCompare(right);
}

function earlierTimestamp(left: string, right: string) {
  return compareTimestamps(left, right) <= 0 ? left : right;
}

function laterTimestamp(left: string, right: string) {
  return compareTimestamps(left, right) >= 0 ? left : right;
}
