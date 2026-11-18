import type { ReaderChatState } from '@yomitomo/shared';

export function createReaderChatState(
  articleId: string,
  sessionId: string,
  assistantId: string,
  now = new Date().toISOString(),
): ReaderChatState {
  return {
    articleId,
    activeSessionId: sessionId,
    selectedAssistantId: assistantId,
    sessions: [
      {
        id: sessionId,
        articleId,
        createdAt: now,
        updatedAt: now,
        messages: [],
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}
