import { describe, expect, it } from 'vitest';
import type { Comment } from '@yomitomo/shared';
import type { ReadingContextBundle } from '@yomitomo/core';
import {
  clippedThreadContextComments,
  clipText,
  intersectTextRanges,
  rangeAllowed,
  rangeDistance,
} from './selection-context-utils';

describe('selection context pure utilities', () => {
  it('clips thread comments while preserving the root comment', () => {
    const comments = [
      comment('root', '根评论'),
      comment('empty', '   '),
      comment('reply-1', '回复 1', 'root'),
      comment('reply-2', '回复 2', 'root'),
      comment('reply-3', '回复 3', 'root'),
    ];

    expect(clippedThreadContextComments(comments, 2).map((item) => item.id)).toEqual([
      'root',
      'reply-2',
      'reply-3',
    ]);
  });

  it('returns intersected ranges and tests range allowance', () => {
    const ranges = [
      { textStart: 0, textEnd: 10 },
      { textStart: 20, textEnd: 30 },
    ];

    expect(intersectTextRanges(ranges, { textStart: 5, textEnd: 24 })).toEqual([
      { textStart: 5, textEnd: 10 },
      { textStart: 20, textEnd: 24 },
    ]);
    expect(rangeAllowed({ textStart: 8, textEnd: 12 }, readingContext(ranges))).toBe(true);
    expect(rangeAllowed({ textStart: 12, textEnd: 18 }, readingContext(ranges))).toBe(false);
  });

  it('measures gap distance between ranges', () => {
    expect(rangeDistance({ textStart: 10, textEnd: 20 }, { textStart: 15, textEnd: 25 })).toBe(0);
    expect(rangeDistance({ textStart: 10, textEnd: 20 }, { textStart: 30, textEnd: 40 })).toBe(10);
    expect(rangeDistance({ textStart: 30, textEnd: 40 }, { textStart: 10, textEnd: 20 })).toBe(10);
  });

  it('normalizes whitespace before clipping text', () => {
    expect(clipText('  第一行\n第二行   第三行  ', 7)).toBe('第一行 第二行...');
  });
});

function comment(id: string, content: string, replyTo?: string): Comment {
  return {
    id,
    author: 'user',
    content,
    createdAt: '2026-05-29T00:00:00.000Z',
    replyTo,
  };
}

function readingContext(
  textRanges: Array<{ textStart: number; textEnd: number }>,
): ReadingContextBundle {
  return {
    articleText: '',
    textRanges,
    spoilerPolicy: {
      allowedScope: 'read-so-far',
      allowFutureChapterEvidence: false,
      allowFuturePlotEvents: false,
    },
    relatedPassages: [],
    chapterSummaries: [],
  };
}
