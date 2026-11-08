import type { Annotation } from '@yomitomo/shared';
import { describe, expect, it } from 'vitest';
import { buildFootnoteGroups } from './annotation-footnotes';

describe('buildFootnoteGroups', () => {
  it('merges only highlights with the same end, orders by ordinal and collapses past three', () => {
    const annotations = [
      source('tail-of-sentence', 40, 'published'),
      source('whole-sentence', 40),
      source('overlaps-but-ends-later', 46),
      source('a', 90),
      source('b', 90, 'published'),
      source('c', 90),
      source('d', 90),
      source('other-chapter', 40, undefined, 'chapter-2'),
    ];
    const ordinals = new Map([
      ['whole-sentence', 1],
      ['tail-of-sentence', 2],
      ['overlaps-but-ends-later', 3],
      ['d', 4],
      ['c', 5],
      ['b', 6],
      ['a', 7],
      ['other-chapter', 8],
    ]);

    expect(
      buildFootnoteGroups(annotations, ordinals).map((group) => ({
        entries: group.entries.map((entry) => [entry.ordinal, entry.distilled]),
        overflow: group.overflow,
      })),
    ).toEqual([
      {
        entries: [
          [1, false],
          [2, true],
        ],
        overflow: null,
      },
      { entries: [[3, false]], overflow: null },
      {
        entries: [
          [4, false],
          [5, false],
        ],
        overflow: { annotationId: 'b', ordinal: 6, count: 2 },
      },
      { entries: [[8, false]], overflow: null },
    ]);
  });
});

function source(id: string, end: number, status?: 'published', chapterId?: string) {
  return {
    id,
    anchor: { end, chapterId },
    distillation: status ? ({ status } as Annotation['distillation']) : undefined,
  };
}
