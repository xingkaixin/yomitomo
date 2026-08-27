import { describe, expect, it } from 'vitest';
import type { ReaderChatMessage, ReaderChatState } from '@yomitomo/shared';
import { readerChatHistoryComments } from '../source/bookcase/reader-chat-history';

const now = '2026-08-27T00:00:00.000Z';

function message(id: string, content = id): ReaderChatMessage {
  return { id, role: 'user', content, createdAt: now };
}

function state(messages: ReaderChatMessage[]): ReaderChatState {
  return {
    articleId: 'article',
    activeSessionId: 'active',
    createdAt: now,
    updatedAt: now,
    sessions: [
      {
        id: 'other',
        articleId: 'article',
        createdAt: now,
        updatedAt: now,
        messages: [message('private')],
      },
      { id: 'active', articleId: 'article', createdAt: now, updatedAt: now, messages },
    ],
  };
}

describe('readerChatHistoryComments', () => {
  it('keeps active-session quotes and historical assistant identities without empty replies', () => {
    const history = state([
      { ...message('question'), context: { sourceType: 'web', quote: 'selected passage' } },
      { ...message('answer'), role: 'assistant', assistantId: 'deleted-agent' },
      { ...message('empty', ' '), role: 'assistant' },
    ]);

    expect(readerChatHistoryComments(history, [])).toEqual([
      {
        id: 'question',
        author: { kind: 'user', username: 'reader' },
        content: 'question\n\n> selected passage',
        createdAt: now,
      },
      {
        id: 'answer',
        author: {
          kind: 'agent',
          agentId: 'deleted-agent',
          username: 'deleted-agent',
          nickname: undefined,
        },
        content: 'answer',
        createdAt: now,
      },
    ]);
    expect(readerChatHistoryComments(undefined, [])).toEqual([]);
  });

  it('bounds history characters, keeping the newest content without changing stored messages', () => {
    const history = state([
      message('old'),
      message('large', 'x'.repeat(13_000)),
      message('latest'),
    ]);
    const comments = readerChatHistoryComments(history, []);

    expect(comments.map((comment) => comment.id)).toEqual(['large', 'latest']);
    expect(comments.reduce((total, comment) => total + comment.content.length, 0)).toBe(12_000);
    expect(comments[0].content.endsWith('…')).toBe(true);
    expect(comments[1].content).toBe('latest');
    expect(history.sessions[1].messages[1].content).toHaveLength(13_000);
  });

  it('bounds the number of recent messages while preserving chronological order', () => {
    const history = state(Array.from({ length: 25 }, (_, index) => message(String(index))));
    const comments = readerChatHistoryComments(history, []);

    expect(comments).toHaveLength(20);
    expect(comments[0].id).toBe('5');
    expect(comments.at(-1)?.id).toBe('24');
  });
});
