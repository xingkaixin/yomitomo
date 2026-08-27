import type { Comment, PublicAgent, ReaderChatState } from '@yomitomo/shared';

const HISTORY_MAX_CHARACTERS = 12_000;
const HISTORY_MAX_MESSAGES = 20;

export function readerChatHistoryComments(
  state: ReaderChatState | undefined,
  agents: PublicAgent[],
): Comment[] {
  const messages = state?.sessions.find(
    (session) => session.id === state.activeSessionId,
  )?.messages;
  if (!messages) return [];

  const comments: Comment[] = [];
  let remaining = HISTORY_MAX_CHARACTERS;
  for (let index = messages.length - 1; index >= 0 && remaining > 0; index -= 1) {
    if (comments.length >= HISTORY_MAX_MESSAGES) break;
    const message = messages[index];
    if (!message.content.trim()) continue;
    const text = message.context?.quote
      ? `${message.content}\n\n> ${message.context.quote}`
      : message.content;
    const content = text.length > remaining ? `${text.slice(0, remaining - 1)}…` : text;
    const agent = agents.find((candidate) => candidate.id === message.assistantId);
    comments.push({
      id: message.id,
      author:
        message.role === 'user'
          ? { kind: 'user', username: 'reader' }
          : {
              kind: 'agent',
              agentId: message.assistantId || 'unknown-assistant',
              username: agent?.username || message.assistantId || 'assistant',
              nickname: agent?.nickname,
            },
      content,
      createdAt: message.createdAt,
    });
    remaining -= content.length;
  }
  return comments.reverse();
}
