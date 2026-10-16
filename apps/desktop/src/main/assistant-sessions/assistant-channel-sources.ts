import { eq, inArray } from 'drizzle-orm';
import type {
  ArticleStorePatch,
  AssistantChannel,
  Comment,
  ReaderChatMessage,
  ReaderChatState,
  TextAnchor,
} from '@yomitomo/shared';
import { readArticleAnnotations } from '../articles/article-annotation-hydration';
import { upsertCommentRows } from '../articles/article-annotation-upsert';
import { saveArticleReaderChatStateRows } from '../articles/article-reading-state';
import * as schema from '../db/schema';
import { getDatabase } from '../store/store-db';
import { getReadingMemorySqliteExecutor } from '../store/store-reading-memory-lifecycle';
import { threadComments } from './assistant-channel-format';

export type ChannelSnapshot = { messages: Comment[]; quote?: string; anchor?: TextAnchor };

export type ChannelReply = Pick<
  Comment,
  'id' | 'author' | 'content' | 'createdAt' | 'readingIntent' | 'assistantProgress'
>;

// Annotation threads live in the comments table and 问一问 sessions in the article's reader
// chat state; agents see both as channels of messages.
export function createAssistantChannelSources(publishPatch: (patch: ArticleStorePatch) => void) {
  function publishReply(articleId: string, channel: AssistantChannel, reply: ChannelReply) {
    if (channel.kind === 'chat') return publishChatReply(articleId, channel.sessionId, reply);
    if (!readChannel(articleId, channel)) return false;
    const comment: Comment = {
      ...reply,
      ...(channel.kind === 'thread' ? { replyTo: channel.threadId } : {}),
    };
    const patch = upsertCommentRows(
      getDatabase(),
      { articleId, annotationId: channel.annotationId, comment },
      getReadingMemorySqliteExecutor(),
    );
    if (patch) publishPatch(patch);
    return Boolean(patch);
  }

  function publishChatReply(articleId: string, sessionId: string, reply: ChannelReply) {
    const state = readChatState(articleId);
    const session = state?.sessions.find((item) => item.id === sessionId);
    if (!state || !session) return false;
    if (session.messages.some((message) => message.id === reply.id)) return true;
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
    publishPatch(saveArticleReaderChatStateRows(getDatabase(), articleId, nextState));
    return true;
  }

  return { readChannel, publishReply, existingMessageIds };
}

function readChannel(articleId: string, channel: AssistantChannel): ChannelSnapshot | undefined {
  if (channel.kind === 'chat') return readChat(articleId, channel.sessionId);
  const annotation = readArticleAnnotations(getDatabase(), articleId).find(
    (item) => item.id === channel.annotationId,
  );
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

function readChat(articleId: string, sessionId: string): ChannelSnapshot | undefined {
  const session = readChatState(articleId)?.sessions.find((item) => item.id === sessionId);
  if (!session) return undefined;
  const messages = session.messages.filter((message) => message.content.trim());
  const context = messages.findLast(
    (message) => message.role === 'user' && message.context,
  )?.context;
  return {
    messages: messages.map(chatComment),
    quote: context?.quote,
    anchor: context?.anchor,
  };
}

function existingMessageIds(articleId: string, ids: string[]) {
  const existing = new Set(
    getDatabase()
      .select({ id: schema.comments.id })
      .from(schema.comments)
      .where(inArray(schema.comments.id, ids))
      .all()
      .map((row) => row.id),
  );
  for (const session of readChatState(articleId)?.sessions ?? []) {
    for (const message of session.messages) existing.add(message.id);
  }
  return existing;
}

function readChatState(articleId: string) {
  const row = getDatabase()
    .select({ readerChatState: schema.articles.readerChatState })
    .from(schema.articles)
    .where(eq(schema.articles.id, articleId))
    .get();
  return (row?.readerChatState as ReaderChatState | null | undefined) ?? undefined;
}

function chatComment(message: ReaderChatMessage): Comment {
  if (message.role === 'assistant') {
    const agentId = message.assistantId ?? 'assistant';
    const agent = getDatabase()
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
