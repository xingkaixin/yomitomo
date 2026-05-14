import type {
  AgentReadingPlanItem,
  EpubBookIndex,
  EpubChapterIndex,
  EpubSegmentIndex,
  ReaderProgress,
  RelatedPassageInput,
  SpoilerPolicy,
  TextAnchor,
} from '@yomitomo/shared';
import { locateEpubOffset, locateEpubTextAnchor } from './ebook-index';

export const selectionAnnotationSpoilerPolicy: SpoilerPolicy = {
  allowedScope: 'current-chapter-so-far',
  allowFutureChapterEvidence: false,
  allowFuturePlotEvents: false,
};

export const selectionThreadSpoilerPolicy: SpoilerPolicy = {
  allowedScope: 'read-so-far',
  allowFutureChapterEvidence: false,
  allowFuturePlotEvents: false,
};

export const segmentAnnotationSpoilerPolicy: SpoilerPolicy = {
  allowedScope: 'read-so-far',
  allowFutureChapterEvidence: false,
  allowFuturePlotEvents: false,
};

export const wholeBookSpoilerPolicy: SpoilerPolicy = {
  allowedScope: 'whole-book',
  allowFutureChapterEvidence: true,
  allowFuturePlotEvents: true,
  userOverride: true,
};

export type ReadingContextTextRange = {
  textStart: number;
  textEnd: number;
};

export type ReadingContextPassageInput = RelatedPassageInput;

export type ReadingContextChapterSummaryInput = {
  chapterId: string;
  title?: string;
  summary: string;
  scope?: 'descriptor' | 'summary';
};

export type BuildReadingContextBundleInput = {
  articleText: string;
  ebookIndex?: EpubBookIndex;
  targetAnchor?: TextAnchor;
  readingPlan?: AgentReadingPlanItem[];
  readerProgress?: ReaderProgress;
  spoilerPolicy?: SpoilerPolicy;
  relatedPassages?: ReadingContextPassageInput[];
  chapterSummaries?: ReadingContextChapterSummaryInput[];
};

export type ReadingContextBundle = {
  articleText: string;
  textRanges: ReadingContextTextRange[];
  readerProgress?: ReaderProgress;
  spoilerPolicy: SpoilerPolicy;
  relatedPassages: ReadingContextPassageInput[];
  chapterSummaries: ReadingContextChapterSummaryInput[];
};

export function buildReadingContextBundle(
  input: BuildReadingContextBundleInput,
): ReadingContextBundle {
  const policy = input.spoilerPolicy || defaultSpoilerPolicy(input);
  if (!input.ebookIndex) {
    const range = { textStart: 0, textEnd: input.articleText.length };
    return {
      articleText: input.articleText,
      textRanges: input.articleText ? [range] : [],
      readerProgress: input.readerProgress,
      spoilerPolicy: policy,
      relatedPassages: input.relatedPassages || [],
      chapterSummaries: input.chapterSummaries || [],
    };
  }

  const targetRange = resolveTargetRange(input.ebookIndex, input.articleText, input.targetAnchor);
  const progress =
    input.readerProgress || inferReaderProgress(input.ebookIndex, input.articleText, input);
  const ranges = mergeTextRanges(scopeTextRanges(input.ebookIndex, progress, targetRange, policy));

  return {
    articleText: readingContextText(input.articleText, ranges),
    textRanges: ranges,
    readerProgress: progress,
    spoilerPolicy: policy,
    relatedPassages: filterRelatedPassages(
      input.ebookIndex,
      input.articleText,
      ranges,
      input.relatedPassages || [],
    ),
    chapterSummaries: filterChapterSummaries(
      input.ebookIndex,
      ranges,
      input.chapterSummaries || [],
    ),
  };
}

export function readingContextTextForRange(
  articleText: string,
  ranges: ReadingContextTextRange[],
  textStart: number,
  textEnd: number,
) {
  return readingContextText(articleText, intersectTextRanges(ranges, { textStart, textEnd }));
}

function defaultSpoilerPolicy(input: BuildReadingContextBundleInput): SpoilerPolicy {
  if (input.targetAnchor) return selectionAnnotationSpoilerPolicy;
  if (input.readingPlan?.length) return segmentAnnotationSpoilerPolicy;
  return wholeBookSpoilerPolicy;
}

function resolveTargetRange(
  index: EpubBookIndex,
  articleText: string,
  anchor: TextAnchor | undefined,
): ReadingContextTextRange | null {
  if (!anchor) return null;
  const position = locateEpubTextAnchor(index, articleText, anchor);
  if (position) return { textStart: position.textStart, textEnd: position.textEnd };
  if (Number.isInteger(anchor.start) && Number.isInteger(anchor.end)) {
    return {
      textStart: Math.max(0, Math.min(anchor.start, articleText.length)),
      textEnd: Math.max(0, Math.min(anchor.end, articleText.length)),
    };
  }
  return null;
}

function inferReaderProgress(
  index: EpubBookIndex,
  articleText: string,
  input: BuildReadingContextBundleInput,
): ReaderProgress | undefined {
  const target = input.targetAnchor
    ? locateEpubTextAnchor(index, articleText, input.targetAnchor)
    : null;
  if (target) {
    const location = locateEpubOffset(index, target.textStart);
    return location
      ? progressFromLocation(index, location.chapter, location.segment, target.textEnd)
      : undefined;
  }

  const firstPlanItem = input.readingPlan?.[0];
  if (!firstPlanItem) return undefined;
  const location = locateEpubOffset(index, firstPlanItem.sectionStart);
  return location
    ? progressFromLocation(index, location.chapter, location.segment, firstPlanItem.sectionEnd)
    : undefined;
}

function progressFromLocation(
  index: EpubBookIndex,
  chapter: EpubChapterIndex,
  segment: EpubSegmentIndex,
  readUntilTextOffset: number,
): ReaderProgress {
  return {
    currentChapterId: chapter.id,
    currentSegmentId: segment.id,
    readChapterIds: index.chapters
      .filter((item) => item.indexInBook < chapter.indexInBook)
      .map((item) => item.id),
    readUntilTextOffset,
  };
}

function scopeTextRanges(
  index: EpubBookIndex,
  progress: ReaderProgress | undefined,
  targetRange: ReadingContextTextRange | null,
  policy: SpoilerPolicy,
): ReadingContextTextRange[] {
  if (wholeBookAllowed(policy)) return [{ textStart: 0, textEnd: index.textLength }];
  if (policy.allowedScope === 'current-selection') return targetRange ? [targetRange] : [];
  if (!progress) return targetRange ? [targetRange] : [];

  const currentChapter = index.chapters.find((chapter) => chapter.id === progress.currentChapterId);
  if (!currentChapter) return targetRange ? [targetRange] : [];
  const currentSegment =
    index.segments.find((segment) => segment.id === progress.currentSegmentId) ||
    (targetRange
      ? locateEpubOffset(index, targetRange.textStart)?.segment
      : index.segments.find((segment) => segment.chapterId === currentChapter.id));
  const readUntil = progressReadUntil(index, progress, currentChapter, currentSegment, targetRange);

  if (policy.allowedScope === 'current-segment') {
    return currentSegment
      ? [clipRange(currentSegment, currentSegment.textStart, plotSafeEnd(policy, readUntil))]
      : [];
  }

  if (policy.allowedScope === 'current-chapter') {
    const end = policy.allowFuturePlotEvents ? currentChapter.textEnd : readUntil;
    return [clipRange(currentChapter, currentChapter.textStart, end)];
  }

  if (policy.allowedScope === 'current-chapter-so-far') {
    return [clipRange(currentChapter, currentChapter.textStart, readUntil)];
  }

  if (policy.allowedScope === 'read-so-far') {
    const readChapters = new Set(progress.readChapterIds);
    const ranges = index.chapters.flatMap((chapter) => {
      if (chapter.id === currentChapter.id) {
        return [clipRange(chapter, chapter.textStart, readUntil)];
      }
      if (readChapters.has(chapter.id) || chapter.textEnd <= readUntil) {
        return [{ textStart: chapter.textStart, textEnd: chapter.textEnd }];
      }
      return [];
    });
    return policy.allowFutureChapterEvidence ? ranges : filterFutureChapterRanges(index, ranges);
  }

  return targetRange ? [targetRange] : [];
}

function wholeBookAllowed(policy: SpoilerPolicy) {
  return (
    policy.allowedScope === 'whole-book' &&
    (policy.userOverride || (policy.allowFutureChapterEvidence && policy.allowFuturePlotEvents))
  );
}

function progressReadUntil(
  index: EpubBookIndex,
  progress: ReaderProgress,
  chapter: EpubChapterIndex,
  segment: EpubSegmentIndex | undefined,
  targetRange: ReadingContextTextRange | null,
) {
  const raw =
    integerValue(progress.readUntilTextOffset) ??
    targetRange?.textEnd ??
    segment?.textEnd ??
    chapter.textEnd;
  return Math.max(chapter.textStart, Math.min(raw, index.textLength));
}

function plotSafeEnd(policy: SpoilerPolicy, readUntil: number) {
  return policy.allowFuturePlotEvents ? Number.POSITIVE_INFINITY : readUntil;
}

function clipRange(
  range: { textStart: number; textEnd: number },
  textStart: number,
  textEnd: number,
): ReadingContextTextRange {
  return {
    textStart: Math.max(range.textStart, textStart),
    textEnd: Math.min(range.textEnd, textEnd),
  };
}

function filterFutureChapterRanges(index: EpubBookIndex, ranges: ReadingContextTextRange[]) {
  const maxEnd = ranges.reduce((value, range) => Math.max(value, range.textEnd), 0);
  const current = locateEpubOffset(index, Math.max(0, maxEnd - 1))?.chapter;
  if (!current) return ranges;
  return ranges.filter((range) => {
    const chapter = locateEpubOffset(index, range.textStart)?.chapter;
    return !chapter || chapter.indexInBook <= current.indexInBook;
  });
}

function filterRelatedPassages(
  index: EpubBookIndex,
  articleText: string,
  allowedRanges: ReadingContextTextRange[],
  passages: ReadingContextPassageInput[],
): ReadingContextPassageInput[] {
  return passages.flatMap((passage) => {
    const range = passageRange(index, passage);
    if (!range) return passageAllowedByIds(index, allowedRanges, passage) ? [passage] : [];

    const intersections = intersectTextRanges(allowedRanges, range);
    if (intersections.length === 0) return [];
    if (rangeFullyCovered(range, allowedRanges)) return [passage];

    return intersections.flatMap((item) => {
      const text = articleText.slice(item.textStart, item.textEnd).trim();
      return text ? [{ ...passage, text, textStart: item.textStart, textEnd: item.textEnd }] : [];
    });
  });
}

function filterChapterSummaries(
  index: EpubBookIndex,
  allowedRanges: ReadingContextTextRange[],
  summaries: ReadingContextChapterSummaryInput[],
) {
  return summaries.filter((summary) => {
    if (summary.scope === 'descriptor') return true;
    const chapter = index.chapters.find((item) => item.id === summary.chapterId);
    return chapter ? rangeFullyCovered(chapter, allowedRanges) : false;
  });
}

function passageRange(
  index: EpubBookIndex,
  passage: ReadingContextPassageInput,
): ReadingContextTextRange | null {
  const textStart = integerValue(passage.textStart);
  const textEnd = integerValue(passage.textEnd);
  if (textStart !== null && textEnd !== null && textEnd > textStart) return { textStart, textEnd };

  if (passage.paragraphId) {
    const paragraph = index.paragraphs.find((item) => item.id === passage.paragraphId);
    if (paragraph) return { textStart: paragraph.textStart, textEnd: paragraph.textEnd };
  }
  if (passage.segmentId) {
    const segment = index.segments.find((item) => item.id === passage.segmentId);
    if (segment) return { textStart: segment.textStart, textEnd: segment.textEnd };
  }
  if (passage.chapterId) {
    const chapter = index.chapters.find((item) => item.id === passage.chapterId);
    if (chapter) return { textStart: chapter.textStart, textEnd: chapter.textEnd };
  }
  return null;
}

function passageAllowedByIds(
  index: EpubBookIndex,
  allowedRanges: ReadingContextTextRange[],
  passage: ReadingContextPassageInput,
) {
  if (passage.paragraphId) {
    const paragraph = index.paragraphs.find((item) => item.id === passage.paragraphId);
    return paragraph ? rangeFullyCovered(paragraph, allowedRanges) : false;
  }
  if (passage.segmentId) {
    const segment = index.segments.find((item) => item.id === passage.segmentId);
    return segment ? rangeFullyCovered(segment, allowedRanges) : false;
  }
  if (passage.chapterId) {
    const chapter = index.chapters.find((item) => item.id === passage.chapterId);
    return chapter ? rangeFullyCovered(chapter, allowedRanges) : false;
  }
  return false;
}

function readingContextText(articleText: string, ranges: ReadingContextTextRange[]) {
  return ranges
    .map((range) => articleText.slice(range.textStart, range.textEnd).trim())
    .filter(Boolean)
    .join('\n\n');
}

function mergeTextRanges(ranges: ReadingContextTextRange[]) {
  const ordered: ReadingContextTextRange[] = [];
  for (const range of ranges) {
    if (range.textEnd <= range.textStart) continue;
    const insertAt = ordered.findIndex((item) => range.textStart < item.textStart);
    if (insertAt < 0) {
      ordered.push(range);
    } else {
      ordered.splice(insertAt, 0, range);
    }
  }
  const merged: ReadingContextTextRange[] = [];

  for (const range of ordered) {
    const previous = merged[merged.length - 1];
    if (!previous || range.textStart > previous.textEnd) {
      merged.push({ ...range });
      continue;
    }
    previous.textEnd = Math.max(previous.textEnd, range.textEnd);
  }

  return merged;
}

function intersectTextRanges(ranges: ReadingContextTextRange[], target: ReadingContextTextRange) {
  return ranges.flatMap((range) => {
    const textStart = Math.max(range.textStart, target.textStart);
    const textEnd = Math.min(range.textEnd, target.textEnd);
    return textEnd > textStart ? [{ textStart, textEnd }] : [];
  });
}

function rangeFullyCovered(
  target: ReadingContextTextRange,
  allowedRanges: ReadingContextTextRange[],
) {
  return allowedRanges.some(
    (range) => range.textStart <= target.textStart && range.textEnd >= target.textEnd,
  );
}

function integerValue(value: number | undefined): number | null {
  return Number.isInteger(value) && value !== undefined ? value : null;
}
