import type { TextAnchor } from '@yomitomo/shared';

export type ReadingContextTextRange = {
  textStart: number;
  textEnd: number;
};

export type ReadingContextRangeLookup = {
  intersections(target: ReadingContextTextRange): ReadingContextTextRange[];
};

export function anchorTextRange(anchor: TextAnchor): ReadingContextTextRange | undefined {
  const textStart = anchor.textStartInBook ?? anchor.start;
  const textEnd = anchor.textEndInBook ?? anchor.end;
  if (!Number.isInteger(textStart) || !Number.isInteger(textEnd)) return undefined;
  if (textEnd <= textStart) return undefined;
  return { textStart, textEnd };
}

export function isTextRangeWithinVisibleRanges(
  target: ReadingContextTextRange | null | undefined,
  visibleRanges: ReadingContextTextRange[] | null | undefined,
): boolean {
  if (visibleRanges == null) return true;
  if (
    !target ||
    !Number.isInteger(target.textStart) ||
    !Number.isInteger(target.textEnd) ||
    target.textEnd <= target.textStart
  ) {
    return false;
  }
  const merged = mergeReadingContextTextRanges(visibleRanges);
  if (merged.length === 0) return false;
  return merged.some(
    (range) => target.textStart >= range.textStart && target.textEnd <= range.textEnd,
  );
}

export function mergeReadingContextTextRanges(
  ranges: ReadingContextTextRange[],
): ReadingContextTextRange[] {
  const ordered = rangesAreMonotonic(ranges)
    ? ranges
    : ranges.toSorted((left, right) => left.textStart - right.textStart);
  const merged: ReadingContextTextRange[] = [];

  for (const range of ordered) {
    if (!Number.isFinite(range.textStart) || !Number.isFinite(range.textEnd)) continue;
    if (range.textEnd <= range.textStart) continue;
    const previous = merged[merged.length - 1];
    if (!previous || range.textStart > previous.textEnd) {
      merged.push({ ...range });
      continue;
    }
    previous.textEnd = Math.max(previous.textEnd, range.textEnd);
  }

  return merged;
}

export function createMergedReadingContextRangeLookup(
  ranges: ReadingContextTextRange[],
): ReadingContextRangeLookup {
  return {
    intersections: (target) => intersectSortedRanges(ranges, target),
  };
}

function rangesAreMonotonic(ranges: ReadingContextTextRange[]) {
  let previousStart = Number.NEGATIVE_INFINITY;
  for (const range of ranges) {
    if (!Number.isFinite(range.textStart) || !Number.isFinite(range.textEnd)) continue;
    if (range.textEnd <= range.textStart) continue;
    if (range.textStart < previousStart) return false;
    previousStart = range.textStart;
  }
  return true;
}

function intersectSortedRanges(ranges: ReadingContextTextRange[], target: ReadingContextTextRange) {
  const intersections: ReadingContextTextRange[] = [];
  for (
    let index = firstRangeEndingAfter(ranges, target.textStart);
    index < ranges.length;
    index++
  ) {
    const range = ranges[index];
    if (!range || range.textStart >= target.textEnd) break;
    const textStart = Math.max(range.textStart, target.textStart);
    const textEnd = Math.min(range.textEnd, target.textEnd);
    if (textEnd > textStart) intersections.push({ textStart, textEnd });
  }
  return intersections;
}

function firstRangeEndingAfter(ranges: ReadingContextTextRange[], offset: number) {
  let start = 0;
  let end = ranges.length;
  while (start < end) {
    const middle = start + Math.floor((end - start) / 2);
    const range = ranges[middle];
    if (range && range.textEnd <= offset) start = middle + 1;
    else end = middle;
  }
  return start;
}
