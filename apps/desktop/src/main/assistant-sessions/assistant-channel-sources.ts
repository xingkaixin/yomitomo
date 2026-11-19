import { and, eq, inArray } from 'drizzle-orm';
import type {
  ArticleStorePatch,
  AssistantChannel,
  Comment,
  ReaderChatMessage,
  ReaderChatState,
  TextAnchor,
} from '@yomitomo/shared';
import { readArticleAnnotation } from '../articles/article-annotation-hydration';
import { upsertCommentRows } from '../articles/article-annotation-upsert';
import { writeArticleReaderChatStateRows } from '../articles/article-reading-state';
import * as schema from '../db/schema';
import {
  getDatabase,
  readDatabaseLifecycle,
  withDatabaseLease,
  type StoreDatabase,
  type StoreExecutor,
} from '../store/store-db';
import { normalizeTextAnchor } from '../store/store-normalizers';
import { getReadingMemorySqliteExecutor } from '../store/store-reading-memory-lifecycle';
import { threadComments } from './assistant-channel-format';
import type { ReplyDiscussion } from './assistant-reply-links';

export type ChannelSnapshot = { messages: Comment[]; quote?: string; anchor?: TextAnchor };

export type ChannelReply = Pick<
  Comment,
  'id' | 'author' | 'content' | 'createdAt' | 'assistantProgress'
>;

export type PinnedDatabaseRunner = <T>(
  operation: (database: StoreDatabase) => Promise<T> | T,
) => Promise<T>;

export type AssistantChannelSourcesOptions = {
  isDisposed?: () => boolean;
  withDatabase?: PinnedDatabaseRunner;
};

export function createPinnedDatabaseRunner(isDisposed?: () => boolean): PinnedDatabaseRunner {
  let pinnedGeneration: number | undefined = readDatabaseLifecycle().generation || undefined;

  return async function withPinnedDatabase<T>(
    operation: (database: StoreDatabase) => Promise<T> | T,
  ): Promise<T> {
    if (isDisposed?.()) throw new Error('DATA_MANAGEMENT_DATABASE_REPLACING');
    return withDatabaseLease(async () => {
      if (isDisposed?.()) throw new Error('DATA_MANAGEMENT_DATABASE_REPLACING');
      const database = getDatabase();
      const { generation } = readDatabaseLifecycle();
      pinnedGeneration ??= generation;
      if (generation !== pinnedGeneration) {
        throw new Error('DATA_MANAGEMENT_DATABASE_REPLACING');
      }
      return operation(database);
    });
  };
}

// Annotation threads live in the comments table and 问一问 sessions in the article's reader
// chat state; agents see both as channels of messages.
export function createAssistantChannelSources(
  publishPatch: (patch: ArticleStorePatch) => void,
  options?: AssistantChannelSourcesOptions,
) {
  const withPinnedDatabase =
    options?.withDatabase ?? createPinnedDatabaseRunner(options?.isDisposed);

  async function publishReply(articleId: string, channel: AssistantChannel, reply: ChannelReply) {
    if (channel.kind === 'chat') return publishChatReply(articleId, channel.sessionId, reply);
    const patch = await withPinnedDatabase((database) => {
      if (!readChannelRows(database, articleId, channel)) return null;
      const comment: Comment = {
        ...reply,
        ...(channel.kind === 'thread' ? { replyTo: channel.threadId } : {}),
      };
      return upsertCommentRows(
        database,
        { articleId, annotationId: channel.annotationId, comment },
        getReadingMemorySqliteExecutor(),
      );
    });
    if (patch) publishPatch(patch);
    return Boolean(patch);
  }

  async function publishChatReply(articleId: string, sessionId: string, reply: ChannelReply) {
    const result = await withPinnedDatabase((database) =>
      database.transaction((tx) => {
        const state = readChatState(tx, articleId);
        const session = state?.sessions.find((item) => item.id === sessionId);
        if (!state || !session) return { saved: false as const };
        if (session.messages.some((message) => message.id === reply.id)) {
          return { saved: true as const };
        }
        const message: ReaderChatMessage = {
          id: reply.id,
          role: 'assistant',
          content: reply.content,
          assistantId: reply.author.kind === 'agent' ? reply.author.agentId : undefined,
          ...(reply.assistantProgress ? { assistantProgress: reply.assistantProgress } : {}),
          createdAt: reply.createdAt,
        };
        const sessions = [...state.sessions];
        sessions[sessions.indexOf(session)] = {
          ...session,
          messages: [...session.messages, message],
          updatedAt: reply.createdAt,
        };
        const nextState: ReaderChatState = { ...state, updatedAt: reply.createdAt, sessions };
        return {
          saved: true as const,
          patch: writeArticleReaderChatStateRows(tx, articleId, nextState),
        };
      }),
    );
    if (result.patch) publishPatch(result.patch);
    return result.saved;
  }

  function readChannel(articleId: string, channel: AssistantChannel) {
    return withPinnedDatabase((database) => readChannelRows(database, articleId, channel));
  }

  function findDiscussion(articleId: string, id: string) {
    return withPinnedDatabase((database) => findDiscussionRow(database, articleId, id));
  }

  function existingMessageIds(articleId: string, ids: string[]) {
    return withPinnedDatabase((database) => {
      const existing = new Set(
        ids.length > 0
          ? database
              .select({ id: schema.comments.id })
              .from(schema.comments)
              .where(inArray(schema.comments.id, ids))
              .all()
              .map((row) => row.id)
          : [],
      );
      for (const session of readChatState(database, articleId)?.sessions ?? []) {
        for (const message of session.messages) existing.add(message.id);
      }
      return existing;
    });
  }

  return { readChannel, publishReply, existingMessageIds, findDiscussion };
}

function readChannelRows(
  database: StoreExecutor,
  articleId: string,
  channel: AssistantChannel,
): ChannelSnapshot | undefined {
  if (channel.kind === 'chat') return readChat(database, articleId, channel.sessionId);
  const annotation = readArticleAnnotation(database, articleId, channel.annotationId);
  if (!annotation) return undefined;
  if (
    channel.kind === 'thread' &&
    !annotation.comments.some((comment) => comment.id === channel.threadId)
  ) {
    return undefined;
  }
  const messages =
    channel.kind === 'thread'
      ? threadComments(annotation, channel.threadId)
      : annotation.comments.filter((comment) => !comment.replyTo && comment.content.trim());
  return {
    messages: messages.toSorted((left, right) => left.createdAt.localeCompare(right.createdAt)),
    quote: annotation.anchor.exact,
    anchor: annotation.anchor,
  };
}

function readChat(
  database: StoreExecutor,
  articleId: string,
  sessionId: string,
): ChannelSnapshot | undefined {
  const session = readChatState(database, articleId)?.sessions.find(
    (item) => item.id === sessionId,
  );
  if (!session) return undefined;
  const messages = session.messages.filter((message) => message.content.trim());
  const context = messages.findLast(
    (message) => message.role === 'user' && message.context,
  )?.context;
  return {
    messages: messages.map((message) => chatComment(database, message)),
    quote: context?.quote,
    anchor: context?.anchor,
  };
}

function findDiscussionRow(
  database: StoreExecutor,
  articleId: string,
  id: string,
): ReplyDiscussion | undefined {
  const row =
    database
      .select({ id: schema.annotations.id, anchor: schema.annotations.anchor })
      .from(schema.annotations)
      .where(and(eq(schema.annotations.id, id), eq(schema.annotations.articleId, articleId)))
      .get() ??
    database
      .select({ id: schema.annotations.id, anchor: schema.annotations.anchor })
      .from(schema.comments)
      .innerJoin(schema.annotations, eq(schema.comments.annotationId, schema.annotations.id))
      .where(and(eq(schema.comments.id, id), eq(schema.annotations.articleId, articleId)))
      .get();
  if (!row) return undefined;
  const anchor = normalizeTextAnchor(row.anchor);
  return {
    annotationId: row.id,
    quote: anchor.exact,
    anchor,
  };
}

function readChatState(database: StoreExecutor, articleId: string) {
  const row = database
    .select({ readerChatState: schema.articles.readerChatState })
    .from(schema.articles)
    .where(eq(schema.articles.id, articleId))
    .get();
  return (row?.readerChatState as ReaderChatState | null | undefined) ?? undefined;
}

function chatComment(database: StoreExecutor, message: ReaderChatMessage): Comment {
  if (message.role === 'assistant') {
    const agentId = message.assistantId ?? 'assistant';
    const agent = database
      .select({ nickname: schema.agents.nickname, username: schema.agents.username })
      .from(schema.agents)
      .where(eq(schema.agents.id, agentId))
      .get();
    return {
      id: message.id,
      author: {
        kind: 'agent',
        agentId,
        username: agent?.username ?? agentId,
        nickname: agent?.nickname,
      },
      content: message.content,
      createdAt: message.createdAt,
    };
  }
  const quote = message.context?.quote.trim();
  return {
    id: message.id,
    author: { kind: 'user', username: 'reader' },
    content: quote ? `${message.content}\n（针对选中的原文：「${quote}」）` : message.content,
    createdAt: message.createdAt,
  };
}
