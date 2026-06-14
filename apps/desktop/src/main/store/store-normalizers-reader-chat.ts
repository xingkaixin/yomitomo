import type {
  ReaderChatMessage,
  ReaderChatSession,
  ReaderChatState,
  ReaderQuestionContext,
} from '@yomitomo/shared';
import { recordValue, stringValue } from './store-normalizers-common';
import { normalizeTextAnchor } from './store-normalizers-annotations';
import { normalizeArticleSourceType } from './store-normalizers-sources';

export function normalizeReaderChatState(
  value: unknown,
  ownerArticleId?: string,
): ReaderChatState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const state = recordValue(value);
  const articleId = stringValue(state.articleId);
  const activeSessionId = stringValue(state.activeSessionId);
  const createdAt = stringValue(state.createdAt);
  const updatedAt = stringValue(state.updatedAt);
  const expectedArticleId = ownerArticleId || articleId;
  if (!articleId || articleId !== expectedArticleId || !activeSessionId || !createdAt || !updatedAt)
    return undefined;

  const sessions = normalizeReaderChatSessions(state.sessions, articleId);
  if (!sessions.some((session) => session.id === activeSessionId)) return undefined;

  return {
    articleId,
    activeSessionId,
    selectedAssistantId: stringValue(state.selectedAssistantId) || undefined,
    sessions,
    createdAt,
    updatedAt,
  };
}

function normalizeReaderChatSessions(value: unknown, articleId: string): ReaderChatSession[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const session = recordValue(item);
    const id = stringValue(session.id);
    const sessionArticleId = stringValue(session.articleId);
    const createdAt = stringValue(session.createdAt);
    const updatedAt = stringValue(session.updatedAt);
    if (!id || sessionArticleId !== articleId || !createdAt || !updatedAt) return [];
    return [
      {
        id,
        articleId,
        title: stringValue(session.title) || undefined,
        createdAt,
        updatedAt,
        messages: normalizeReaderChatMessages(session.messages),
      },
    ];
  });
}

function normalizeReaderChatMessages(value: unknown): ReaderChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const message = recordValue(item);
    const id = stringValue(message.id);
    const role = normalizeReaderChatMessageRole(message.role);
    const content = stringValue(message.content);
    const createdAt = stringValue(message.createdAt);
    if (!id || !role || !content || !createdAt) return [];
    return [
      {
        id,
        role,
        content,
        assistantId: stringValue(message.assistantId) || undefined,
        context: normalizeReaderQuestionContext(message.context),
        createdAt,
      },
    ];
  });
}

function normalizeReaderChatMessageRole(value: unknown): ReaderChatMessage['role'] | null {
  return value === 'user' || value === 'assistant' ? value : null;
}

function normalizeReaderQuestionContext(value: unknown): ReaderQuestionContext | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const context = recordValue(value);
  const sourceType = normalizeArticleSourceType(context.sourceType);
  const quote = stringValue(context.quote);
  if (!quote) return undefined;
  return {
    sourceType,
    quote,
    title: stringValue(context.title) || undefined,
    locationLabel: stringValue(context.locationLabel) || undefined,
    anchor:
      context.anchor && typeof context.anchor === 'object'
        ? normalizeTextAnchor(context.anchor)
        : undefined,
    nearbyText: stringValue(context.nearbyText) || undefined,
  };
}
