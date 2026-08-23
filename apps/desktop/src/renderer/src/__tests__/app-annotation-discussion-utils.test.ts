import { describe, expect, it } from 'vitest';
import type { Annotation, Comment } from '@yomitomo/shared';

import { discussionThreads } from '../annotation-discussion/app-annotation-discussion-utils';

const author = { kind: 'user' as const, userId: 'user', username: 'reader' };

function comment(id: string, replyTo?: string): Comment {
  return {
    id,
    author,
    content: id,
    createdAt: '2026-01-01T00:00:00.000Z',
    replyTo,
  };
}

describe('discussionThreads', () => {
  it('keeps nested replies with their actual root thought', () => {
    const annotation: Annotation = {
      id: 'annotation',
      anchor: { exact: 'quote', prefix: '', suffix: '', start: 0, end: 5 },
      author,
      color: '#fff',
      comments: [
        comment('root-a'),
        comment('root-b'),
        comment('reply-b', 'root-b'),
        comment('nested-b', 'reply-b'),
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const grouped = discussionThreads(annotation, new Set());
    expect(
      grouped.map((thread) => [thread.root.id, thread.replies.map((reply) => reply.id)]),
    ).toEqual([
      ['root-a', []],
      ['root-b', ['reply-b', 'nested-b']],
    ]);
  });
});
