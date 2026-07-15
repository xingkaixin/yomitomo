export type ReadingContextTextRange = {
  textStart: number;
  textEnd: number;
};

export type ReadingContextRangeLookup = {
  intersections(target: ReadingContextTextRange): ReadingContextTextRange[];
  fullyCovers(target: ReadingContextTextRange): boolean;
};

export function mergeReadingContextTextRanges(
  ranges: ReadingContextTextRange[],
): ReadingContextTextRange[] {
  const ordered = rangesAreMonotonic(ranges)
    ? ranges
    : ranges.toSorted((left, right) => left.textStart - right.textStart);
  const merged: ReadingContextTextRange[] = [];

  for (const range of ordered) {
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
    fullyCovers: (target) => {
      const index = firstRangeEndingAfter(ranges, target.textStart);
      if (index >= ranges.length) return false;
      const range = ranges[index];
      return range.textStart <= target.textStart && range.textEnd >= target.textEnd;
    },
  };
}

function rangesAreMonotonic(ranges: ReadingContextTextRange[]) {
  let previousStart = Number.NEGATIVE_INFINITY;
  for (const range of ranges) {
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
