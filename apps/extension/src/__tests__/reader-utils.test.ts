import { describe, expect, it } from 'vitest';
import type { Annotation } from '@yomitomo/shared';
import { applyAgentCommentDelta } from '../reader-utils';

function annotation(): Annotation {
  return {
    id: 'annotation_1',
    anchor: {
      exact: '重要原文',
      prefix: '',
      suffix: '',
      start: 0,
      end: 4,
    },
    author: 'user',
    color: '#f4c95d',
    comments: [
      {
        id: 'comment_1',
        author: 'ai',
        content: '正在',
        createdAt: '2026-05-04T00:00:00.000Z',
        pending: true,
      },
    ],
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z',
  };
}

describe('applyAgentCommentDelta', () => {
  it('merges streamed deltas into the pending comment content', () => {
    const base = annotation();
    const first = applyAgentCommentDelta([base], 'annotation_1', 'comment_1', '回答');
    const second = applyAgentCommentDelta(first!, 'annotation_1', 'comment_1', '中');

    expect(second?.[0]?.comments[0]?.content).toBe('正在回答中');
    expect(second?.[0]).not.toBe(base);
  });
});
