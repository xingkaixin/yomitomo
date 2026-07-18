import { describe, expect, it } from 'vitest';
import {
  createMergedReadingContextRangeLookup,
  intersectTextRanges,
  mergeReadingContextTextRanges,
  rangeDistance,
  type ReadingContextTextRange,
} from './reading-context-ranges';

describe('reading context range arithmetic', () => {
  it('returns intersections in source order', () => {
    expect(
      intersectTextRanges(
        [
          { textStart: 0, textEnd: 10 },
          { textStart: 20, textEnd: 30 },
        ],
        { textStart: 5, textEnd: 24 },
      ),
    ).toEqual([
      { textStart: 5, textEnd: 10 },
      { textStart: 20, textEnd: 24 },
    ]);
  });

  it('measures the gap between ranges', () => {
    expect(rangeDistance({ textStart: 10, textEnd: 20 }, { textStart: 15, textEnd: 25 })).toBe(0);
    expect(rangeDistance({ textStart: 10, textEnd: 20 }, { textStart: 30, textEnd: 40 })).toBe(10);
    expect(rangeDistance({ textStart: 30, textEnd: 40 }, { textStart: 10, textEnd: 20 })).toBe(10);
  });
});

describe('mergeReadingContextTextRanges', () => {
  it.each([
    { name: 'empty', ranges: [] },
    {
      name: 'ordered disjoint',
      ranges: [
        { textStart: 0, textEnd: 3 },
        { textStart: 5, textEnd: 8 },
      ],
    },
    {
      name: 'ordered adjacent and overlapping',
      ranges: [
        { textStart: 0, textEnd: 4 },
        { textStart: 4, textEnd: 7 },
        { textStart: 6, textEnd: 9 },
      ],
    },
    {
      name: 'unordered with empty ranges',
      ranges: [
        { textStart: 10, textEnd: 14 },
        { textStart: 2, textEnd: 8 },
        { textStart: 5, textEnd: 12 },
        { textStart: 7, textEnd: 7 },
      ],
    },
    {
      name: 'duplicate starts',
      ranges: [
        { textStart: 3, textEnd: 5 },
        { textStart: 3, textEnd: 9 },
        { textStart: 1, textEnd: 2 },
      ],
    },
  ])('matches the insertion-sort oracle for $name', ({ ranges }) => {
    const input = ranges.map((range) => ({ ...range }));

    expect(mergeReadingContextTextRanges(input)).toEqual(legacyMergeTextRanges(ranges));
    expect(input).toEqual(ranges);
  });
});

describe('createMergedReadingContextRangeLookup', () => {
  const ranges = [
    { textStart: 0, textEnd: 5 },
    { textStart: 10, textEnd: 20 },
    { textStart: 25, textEnd: 30 },
  ];
  const lookup = createMergedReadingContextRangeLookup(ranges);

  it('finds only intersecting ranges', () => {
    expect(lookup.intersections({ textStart: 3, textEnd: 27 })).toEqual([
      { textStart: 3, textEnd: 5 },
      { textStart: 10, textEnd: 20 },
      { textStart: 25, textEnd: 27 },
    ]);
    expect(lookup.intersections({ textStart: 5, textEnd: 10 })).toEqual([]);
    expect(lookup.intersections({ textStart: 31, textEnd: 40 })).toEqual([]);
  });

  it('checks containment at range boundaries', () => {
    expect(lookup.fullyCovers({ textStart: 10, textEnd: 20 })).toBe(true);
    expect(lookup.fullyCovers({ textStart: 12, textEnd: 18 })).toBe(true);
    expect(lookup.fullyCovers({ textStart: 5, textEnd: 10 })).toBe(false);
    expect(lookup.fullyCovers({ textStart: 18, textEnd: 26 })).toBe(false);
  });
});

function legacyMergeTextRanges(ranges: ReadingContextTextRange[]) {
  const ordered: ReadingContextTextRange[] = [];
  for (const range of ranges) {
    if (range.textEnd <= range.textStart) continue;
    const insertAt = ordered.findIndex((item) => range.textStart < item.textStart);
    if (insertAt < 0) ordered.push(range);
    else ordered.splice(insertAt, 0, range);
  }
  const merged: ReadingContextTextRange[] = [];
  for (const range of ordered) {
    const previous = merged[merged.length - 1];
    if (!previous || range.textStart > previous.textEnd) merged.push({ ...range });
    else previous.textEnd = Math.max(previous.textEnd, range.textEnd);
  }
  return merged;
}
