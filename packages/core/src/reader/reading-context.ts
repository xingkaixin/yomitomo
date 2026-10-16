import type {
  EpubChapterIndex,
  EpubSegmentIndex,
  ReaderProgress,
  SpoilerPolicy,
  TextAnchor,
} from '@yomitomo/shared';
import type { PreparedEpubBookIndex } from '../epub/ebook-index';
import {
  mergeReadingContextTextRanges,
  type ReadingContextTextRange,
} from './reading-context-ranges';

export type { ReadingContextTextRange } from './reading-context-ranges';

export const selectionThreadSpoilerPolicy: SpoilerPolicy = {
  allowedScope: 'read-so-far',
  allowFutureChapterEvidence: false,
  allowFuturePlotEvents: false,
};

export type EpubReadableRangeInput = {
  articleText: string;
  targetAnchor?: TextAnchor;
  readerProgress?: ReaderProgress;
  spoilerPolicy: SpoilerPolicy;
};

export function epubReadableTextRanges(
  prepared: PreparedEpubBookIndex,
  input: EpubReadableRangeInput,
): ReadingContextTextRange[] {
  const targetRange = resolveTargetRange(prepared, input.articleText, input.targetAnchor);
  const progress =
    input.readerProgress || inferReaderProgress(prepared, input.articleText, input.targetAnchor);
  return mergeReadingContextTextRanges(
    scopeTextRanges(prepared, progress, targetRange, input.spoilerPolicy),
  );
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
  anchor: TextAnchor | undefined,
): ReaderProgress | undefined {
  const target = anchor ? prepared.locateAnchor(articleText, anchor) : null;
  if (!target) return undefined;
  const location = prepared.locateOffset(target.textStart);
  return location
    ? progressFromLocation(prepared, location.chapter, location.segment, target.textEnd)
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

function integerValue(value: number | undefined): number | null {
  return Number.isInteger(value) && value !== undefined ? value : null;
}
