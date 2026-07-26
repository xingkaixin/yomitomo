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
import { prepareEpubBookIndex, type PreparedEpubBookIndex } from '../epub/ebook-index';
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

export type ReadingContextScope = Omit<ReadingContextBundle, 'articleText'>;

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

  const prepared = prepareEpubBookIndex(input.ebookIndex);
  const scope = buildEpubReadingContextScope(prepared, input);

  return {
    articleText: readingContextText(input.articleText, scope.textRanges),
    ...scope,
  };
}

export function buildEpubReadingContextScope(
  prepared: PreparedEpubBookIndex,
  input: Omit<BuildReadingContextBundleInput, 'ebookIndex'>,
): ReadingContextScope {
  const policy = input.spoilerPolicy || defaultSpoilerPolicy(input);
  const targetRange = resolveTargetRange(prepared, input.articleText, input.targetAnchor);
  const progress = input.readerProgress || inferReaderProgress(prepared, input.articleText, input);
  const ranges = mergeReadingContextTextRanges(
    scopeTextRanges(prepared, progress, targetRange, policy),
  );
  const rangeLookup = createMergedReadingContextRangeLookup(ranges);

  return {
    textRanges: ranges,
    readerProgress: progress,
    spoilerPolicy: policy,
    relatedPassages: filterRelatedPassages(
      prepared,
      input.articleText,
      rangeLookup,
      input.relatedPassages || [],
    ),
    chapterSummaries: filterChapterSummaries(prepared, rangeLookup, input.chapterSummaries || []),
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
  prepared: PreparedEpubBookIndex,
  articleText: string,
  anchor: TextAnchor | undefined,
): ReadingContextTextRange | null {
  if (!anchor) return null;
  const position = prepared.locateAnchor(articleText, anchor);
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
  prepared: PreparedEpubBookIndex,
  articleText: string,
  input: BuildReadingContextBundleInput,
): ReaderProgress | undefined {
  const target = input.targetAnchor ? prepared.locateAnchor(articleText, input.targetAnchor) : null;
  if (target) {
    const location = prepared.locateOffset(target.textStart);
    return location
      ? progressFromLocation(prepared, location.chapter, location.segment, target.textEnd)
      : undefined;
  }

  const firstPlanItem = input.readingPlan?.[0];
  if (!firstPlanItem) return undefined;
  const location = prepared.locateOffset(firstPlanItem.sectionStart);
  return location
    ? progressFromLocation(prepared, location.chapter, location.segment, firstPlanItem.sectionEnd)
    : undefined;
}

function progressFromLocation(
  prepared: PreparedEpubBookIndex,
  chapter: EpubChapterIndex,
  segment: EpubSegmentIndex,
  readUntilTextOffset: number,
): ReaderProgress {
  return {
    currentChapterId: chapter.id,
    currentSegmentId: segment.id,
    readChapterIds: prepared.chaptersBefore(chapter),
    readUntilTextOffset,
  };
}

function scopeTextRanges(
  prepared: PreparedEpubBookIndex,
  progress: ReaderProgress | undefined,
  targetRange: ReadingContextTextRange | null,
  policy: SpoilerPolicy,
): ReadingContextTextRange[] {
  if (wholeBookAllowed(policy)) return [{ textStart: 0, textEnd: prepared.textLength }];
  if (policy.allowedScope === 'current-selection') return targetRange ? [targetRange] : [];
  if (!progress) return targetRange ? [targetRange] : [];

  const currentChapter = prepared.chapter(progress.currentChapterId);
  if (!currentChapter) return targetRange ? [targetRange] : [];
  const currentSegment =
    (progress.currentSegmentId ? prepared.segment(progress.currentSegmentId) : undefined) ||
    (targetRange
      ? prepared.locateOffset(targetRange.textStart)?.segment
      : prepared.firstSegmentInChapter(currentChapter.id));
  const readUntil = progressReadUntil(
    prepared.textLength,
    progress,
    currentChapter,
    currentSegment,
    targetRange,
  );

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
    const ranges = prepared.chapters().flatMap((chapter) => {
      if (chapter.id === currentChapter.id) {
        return [clipRange(chapter, chapter.textStart, readUntil)];
      }
      if (readChapters.has(chapter.id) || chapter.textEnd <= readUntil) {
        return [{ textStart: chapter.textStart, textEnd: chapter.textEnd }];
      }
      return [];
    });
    return policy.allowFutureChapterEvidence ? ranges : filterFutureChapterRanges(prepared, ranges);
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
  textLength: number,
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
  return Math.max(chapter.textStart, Math.min(raw, textLength));
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

function filterFutureChapterRanges(
  prepared: PreparedEpubBookIndex,
  ranges: ReadingContextTextRange[],
) {
  const maxEnd = ranges.reduce((value, range) => Math.max(value, range.textEnd), 0);
  const current = prepared.locateOffset(Math.max(0, maxEnd - 1))?.chapter;
  if (!current) return ranges;
  return ranges.filter((range) => {
    const chapter = prepared.locateOffset(range.textStart)?.chapter;
    return !chapter || chapter.indexInBook <= current.indexInBook;
  });
}

function filterRelatedPassages(
  prepared: PreparedEpubBookIndex,
  articleText: string,
  allowedRanges: ReadingContextRangeLookup,
  passages: ReadingContextPassageInput[],
): ReadingContextPassageInput[] {
  return passages.flatMap((passage) => {
    const range = passageRange(prepared, passage);
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
  prepared: PreparedEpubBookIndex,
  allowedRanges: ReadingContextRangeLookup,
  summaries: ReadingContextChapterSummaryInput[],
) {
  return summaries.filter((summary) => {
    if (summary.scope === 'descriptor') return true;
    const chapter = prepared.chapter(summary.chapterId);
    return chapter ? allowedRanges.fullyCovers(chapter) : false;
  });
}

function passageRange(
  prepared: PreparedEpubBookIndex,
  passage: ReadingContextPassageInput,
): ReadingContextTextRange | null {
  const textStart = integerValue(passage.textStart);
  const textEnd = integerValue(passage.textEnd);
  if (textStart !== null && textEnd !== null && textEnd > textStart) return { textStart, textEnd };

  if (passage.paragraphId) {
    const paragraph = prepared.paragraph(passage.paragraphId);
    if (paragraph) return { textStart: paragraph.textStart, textEnd: paragraph.textEnd };
  }
  if (passage.segmentId) {
    const segment = prepared.segment(passage.segmentId);
    if (segment) return { textStart: segment.textStart, textEnd: segment.textEnd };
  }
  if (passage.chapterId) {
    const chapter = prepared.chapter(passage.chapterId);
    if (chapter) return { textStart: chapter.textStart, textEnd: chapter.textEnd };
  }
  return null;
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
