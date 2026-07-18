import type {
  AgentReadingPlanItem,
  EpubBookIndex,
  EpubChapterIndex,
  EpubParagraphIndex,
  EpubSegmentIndex,
  ReaderProgress,
  RelatedPassageInput,
  SpoilerPolicy,
  TextAnchor,
} from '@yomitomo/shared';
import { locateEpubOffset, locateEpubTextAnchor } from '../epub/ebook-index';
import {
  createMergedReadingContextRangeLookup,
  intersectTextRanges,
  mergeReadingContextTextRanges,
  type ReadingContextRangeLookup,
  type ReadingContextTextRange,
} from './reading-context-ranges';

export type { ReadingContextTextRange } from './reading-context-ranges';

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

type EpubContextLookup = {
  chapterById: Map<string, EpubChapterIndex>;
  segmentById: Map<string, EpubSegmentIndex>;
  paragraphById: Map<string, EpubParagraphIndex>;
  firstSegmentByChapterId: Map<string, EpubSegmentIndex>;
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

  const lookup = buildEpubContextLookup(input.ebookIndex);
  const targetRange = resolveTargetRange(input.ebookIndex, input.articleText, input.targetAnchor);
  const progress =
    input.readerProgress || inferReaderProgress(input.ebookIndex, input.articleText, input);
  const ranges = mergeReadingContextTextRanges(
    scopeTextRanges(input.ebookIndex, lookup, progress, targetRange, policy),
  );
  const rangeLookup = createMergedReadingContextRangeLookup(ranges);

  return {
    articleText: readingContextText(input.articleText, ranges),
    textRanges: ranges,
    readerProgress: progress,
    spoilerPolicy: policy,
    relatedPassages: filterRelatedPassages(
      lookup,
      input.articleText,
      rangeLookup,
      input.relatedPassages || [],
    ),
    chapterSummaries: filterChapterSummaries(lookup, rangeLookup, input.chapterSummaries || []),
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
  lookup: EpubContextLookup,
  progress: ReaderProgress | undefined,
  targetRange: ReadingContextTextRange | null,
  policy: SpoilerPolicy,
): ReadingContextTextRange[] {
  if (wholeBookAllowed(policy)) return [{ textStart: 0, textEnd: index.textLength }];
  if (policy.allowedScope === 'current-selection') return targetRange ? [targetRange] : [];
  if (!progress) return targetRange ? [targetRange] : [];

  const currentChapter = lookup.chapterById.get(progress.currentChapterId);
  if (!currentChapter) return targetRange ? [targetRange] : [];
  const currentSegment =
    (progress.currentSegmentId ? lookup.segmentById.get(progress.currentSegmentId) : undefined) ||
    (targetRange
      ? locateEpubOffset(index, targetRange.textStart)?.segment
      : lookup.firstSegmentByChapterId.get(currentChapter.id));
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
  lookup: EpubContextLookup,
  articleText: string,
  allowedRanges: ReadingContextRangeLookup,
  passages: ReadingContextPassageInput[],
): ReadingContextPassageInput[] {
  return passages.flatMap((passage) => {
    const range = passageRange(lookup, passage);
    if (!range) return [];

    const intersections = allowedRanges.intersections(range);
    if (intersections.length === 0) return [];
    if (
      intersections.length === 1 &&
      intersections[0]?.textStart === range.textStart &&
      intersections[0].textEnd === range.textEnd
    ) {
      return [passage];
    }

    return intersections.flatMap((item) => {
      const text = articleText.slice(item.textStart, item.textEnd).trim();
      return text ? [{ ...passage, text, textStart: item.textStart, textEnd: item.textEnd }] : [];
    });
  });
}

function filterChapterSummaries(
  lookup: EpubContextLookup,
  allowedRanges: ReadingContextRangeLookup,
  summaries: ReadingContextChapterSummaryInput[],
) {
  return summaries.filter((summary) => {
    if (summary.scope === 'descriptor') return true;
    const chapter = lookup.chapterById.get(summary.chapterId);
    return chapter ? allowedRanges.fullyCovers(chapter) : false;
  });
}

function passageRange(
  lookup: EpubContextLookup,
  passage: ReadingContextPassageInput,
): ReadingContextTextRange | null {
  const textStart = integerValue(passage.textStart);
  const textEnd = integerValue(passage.textEnd);
  if (textStart !== null && textEnd !== null && textEnd > textStart) return { textStart, textEnd };

  if (passage.paragraphId) {
    const paragraph = lookup.paragraphById.get(passage.paragraphId);
    if (paragraph) return { textStart: paragraph.textStart, textEnd: paragraph.textEnd };
  }
  if (passage.segmentId) {
    const segment = lookup.segmentById.get(passage.segmentId);
    if (segment) return { textStart: segment.textStart, textEnd: segment.textEnd };
  }
  if (passage.chapterId) {
    const chapter = lookup.chapterById.get(passage.chapterId);
    if (chapter) return { textStart: chapter.textStart, textEnd: chapter.textEnd };
  }
  return null;
}

function buildEpubContextLookup(index: EpubBookIndex): EpubContextLookup {
  const chapterById = new Map<string, EpubChapterIndex>();
  const segmentById = new Map<string, EpubSegmentIndex>();
  const paragraphById = new Map<string, EpubParagraphIndex>();
  const firstSegmentByChapterId = new Map<string, EpubSegmentIndex>();

  for (const chapter of index.chapters) {
    if (!chapterById.has(chapter.id)) chapterById.set(chapter.id, chapter);
  }
  for (const segment of index.segments) {
    if (!segmentById.has(segment.id)) segmentById.set(segment.id, segment);
    if (!firstSegmentByChapterId.has(segment.chapterId)) {
      firstSegmentByChapterId.set(segment.chapterId, segment);
    }
  }
  for (const paragraph of index.paragraphs) {
    if (!paragraphById.has(paragraph.id)) paragraphById.set(paragraph.id, paragraph);
  }

  return { chapterById, segmentById, paragraphById, firstSegmentByChapterId };
}

function readingContextText(articleText: string, ranges: ReadingContextTextRange[]) {
  return ranges
    .map((range) => articleText.slice(range.textStart, range.textEnd).trim())
    .filter(Boolean)
    .join('\n\n');
}

function integerValue(value: number | undefined): number | null {
  return Number.isInteger(value) && value !== undefined ? value : null;
}
