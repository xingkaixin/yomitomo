import {
  createTextAnchor,
  resolveTextAnchor,
  textAnchorQuoteHash,
  type EpubBookIndex,
  type EpubChapterIndex,
  type EpubParagraphIndex,
  type EpubSegmentIndex,
  type TextAnchor,
} from '@yomitomo/shared';

const DEFAULT_MAX_SEGMENT_TEXT_LENGTH = 2800;
const DEFAULT_MIN_SEGMENT_TEXT_LENGTH = 900;
const PREVIEW_LENGTH = 80;

export type EpubBookIndexChapterInput = {
  id: string;
  title: string;
  href?: string;
  paragraphs: string[];
};

export type BuildEpubBookIndexInput = {
  articleId: string;
  chapters: EpubBookIndexChapterInput[];
  maxSegmentTextLength?: number;
  minSegmentTextLength?: number;
};

export type LocateEpubIndexOptions = {
  paragraphWindowSize?: number;
  allowedChapterIds?: string[];
  allowedSegmentIds?: string[];
  allowedParagraphIds?: string[];
  allowedTextStart?: number;
  allowedTextEnd?: number;
};

export type EpubIndexLocation = {
  textStart: number;
  textEnd: number;
  chapter: EpubChapterIndex;
  segment: EpubSegmentIndex;
  paragraph: EpubParagraphIndex | null;
  paragraphWindow: EpubParagraphIndex[];
};

type ParagraphBuildState = EpubParagraphIndex & {
  text: string;
};

export function buildEpubBookIndex(input: BuildEpubBookIndexInput): EpubBookIndex {
  const maxSegmentTextLength = positiveInteger(
    input.maxSegmentTextLength,
    DEFAULT_MAX_SEGMENT_TEXT_LENGTH,
  );
  const minSegmentTextLength = Math.min(
    maxSegmentTextLength,
    positiveInteger(input.minSegmentTextLength, DEFAULT_MIN_SEGMENT_TEXT_LENGTH),
  );
  const chapters: EpubChapterIndex[] = [];
  const segments: EpubSegmentIndex[] = [];
  const paragraphs: EpubParagraphIndex[] = [];
  let bookOffset = 0;

  input.chapters.forEach((chapterInput, chapterIndex) => {
    const chapterParagraphTexts = normalizedParagraphs(chapterInput.paragraphs);
    if (chapterParagraphTexts.length === 0) return;
    if (chapters.length > 0) bookOffset += 2;

    const chapterId = chapterInput.id || `chapter-${chapterIndex + 1}`;
    const chapterStart = bookOffset;
    const chapterParagraphs: ParagraphBuildState[] = [];

    chapterParagraphTexts.forEach((text, paragraphIndex) => {
      if (paragraphIndex > 0) bookOffset += 2;
      const textStart = bookOffset;
      const textEnd = textStart + text.length;
      chapterParagraphs.push({
        id: `${chapterId}-paragraph-${paragraphIndex + 1}`,
        chapterId,
        segmentId: '',
        indexInChapter: paragraphIndex,
        indexInSegment: 0,
        textStart,
        textEnd,
        textLength: text.length,
        previewStart: previewStart(text),
        previewEnd: previewEnd(text),
        text,
      });
      bookOffset = textEnd;
    });

    const chapterSegments = buildChapterSegments({
      chapterId,
      paragraphs: chapterParagraphs,
      maxSegmentTextLength,
      minSegmentTextLength,
    });
    const chapterIndexRecord: EpubChapterIndex = {
      id: chapterId,
      title: chapterInput.title,
      href: chapterInput.href,
      indexInBook: chapters.length,
      textStart: chapterStart,
      textEnd: bookOffset,
      textLength: bookOffset - chapterStart,
      previewStart: previewStart(chapterParagraphTexts[0] || ''),
      previewEnd: previewEnd(chapterParagraphTexts[chapterParagraphTexts.length - 1] || ''),
      segmentIds: chapterSegments.map((segment) => segment.id),
      paragraphIds: chapterParagraphs.map((paragraph) => paragraph.id),
    };

    chapters.push(chapterIndexRecord);
    segments.push(...chapterSegments);
    paragraphs.push(...chapterParagraphs.map(toParagraphIndex));
  });

  return {
    version: 1,
    articleId: input.articleId,
    textLength: bookOffset,
    chapters,
    segments,
    paragraphs,
  };
}

export function epubIndexText(chapters: EpubBookIndexChapterInput[]) {
  return chapters
    .map((chapter) => normalizedParagraphs(chapter.paragraphs).join('\n\n'))
    .filter(Boolean)
    .join('\n\n');
}

export function locateEpubOffset(
  index: EpubBookIndex,
  offset: number,
  options: LocateEpubIndexOptions = {},
): EpubIndexLocation | null {
  if (index.textLength <= 0) return null;
  const cursor = clampInteger(offset, 0, index.textLength - 1);
  const chapter = findRange(index.chapters, cursor);
  const segment = findRange(index.segments, cursor, (item) => item.chapterId === chapter?.id);
  if (!chapter || !segment) return null;

  const paragraph = findRange(
    index.paragraphs,
    cursor,
    (item) => item.chapterId === chapter.id && item.segmentId === segment.id,
  );

  return {
    textStart: cursor,
    textEnd: cursor,
    chapter,
    segment,
    paragraph,
    paragraphWindow: paragraphWindow(index.paragraphs, paragraph, options.paragraphWindowSize),
  };
}

export function locateEpubTextAnchor(
  index: EpubBookIndex,
  text: string,
  anchor: TextAnchor,
  options: LocateEpubIndexOptions = {},
): EpubIndexLocation | null {
  const position = resolveEpubTextAnchor(index, text, anchor, options);
  if (!position) return null;
  const location = locateEpubOffset(index, position.start, options);
  if (!location) return null;

  const resolvedLocation = { ...location, textStart: position.start, textEnd: position.end };
  return epubLocationAllowed(index, resolvedLocation, options) ? resolvedLocation : null;
}

export function createEpubTextAnchor(
  index: EpubBookIndex,
  text: string,
  start: number,
  end: number,
): TextAnchor {
  const anchor = createTextAnchor(text, start, end);
  const location = locateEpubOffset(index, anchor.start);
  const paragraph = location?.paragraph;
  if (!paragraph) {
    return {
      ...anchor,
      textStartInBook: anchor.start,
      textEndInBook: anchor.end,
    };
  }

  return {
    ...anchor,
    chapterId: location.chapter.id,
    segmentId: location.segment.id,
    paragraphId: paragraph.id,
    textStartInParagraph: anchor.start - paragraph.textStart,
    textEndInParagraph:
      anchor.end <= paragraph.textEnd ? anchor.end - paragraph.textStart : undefined,
    textStartInBook: anchor.start,
    textEndInBook: anchor.end,
  };
}

export function resolveEpubTextAnchor(
  index: EpubBookIndex,
  text: string,
  anchor: TextAnchor,
  options: LocateEpubIndexOptions = {},
): { start: number; end: number } | null {
  const structural = resolveEpubStructuralTextAnchor(index, text, anchor);
  if (structural && epubPositionAllowed(index, structural, options)) return structural;

  const fallback = resolveTextAnchor(text, anchor);
  return fallback && epubPositionAllowed(index, fallback, options) ? fallback : null;
}

function resolveEpubStructuralTextAnchor(
  index: EpubBookIndex,
  text: string,
  anchor: TextAnchor,
): { start: number; end: number } | null {
  const paragraph = anchor.paragraphId
    ? index.paragraphs.find((item) => item.id === anchor.paragraphId)
    : null;
  if (paragraph && paragraphMatchesAnchor(paragraph, anchor)) {
    const paragraphOffset = numberValue(anchor.textStartInParagraph);
    if (paragraphOffset !== null) {
      const start = paragraph.textStart + paragraphOffset;
      const end = structuralEndOffset(paragraph, start, anchor);
      const direct = resolveDirectAnchorSpan(text, start, end, anchor);
      if (direct) return direct;

      const paragraphMatch = resolveAnchorInRange(
        text,
        anchor,
        paragraph.textStart,
        paragraph.textEnd,
      );
      if (paragraphMatch) return paragraphMatch;
    }
  }

  const bookStart = numberValue(anchor.textStartInBook);
  const bookEnd = numberValue(anchor.textEndInBook);
  if (bookStart !== null && bookEnd !== null) {
    const direct = resolveDirectAnchorSpan(text, bookStart, bookEnd, anchor);
    if (direct) return direct;
  }

  return null;
}

function paragraphMatchesAnchor(paragraph: EpubParagraphIndex, anchor: TextAnchor) {
  if (anchor.chapterId && paragraph.chapterId !== anchor.chapterId) return false;
  if (anchor.segmentId && paragraph.segmentId !== anchor.segmentId) return false;
  return true;
}

function structuralEndOffset(paragraph: EpubParagraphIndex, start: number, anchor: TextAnchor) {
  const paragraphEnd = numberValue(anchor.textEndInParagraph);
  if (paragraphEnd !== null) return paragraph.textStart + paragraphEnd;

  const bookEnd = numberValue(anchor.textEndInBook);
  if (bookEnd !== null) return bookEnd;

  return start + anchor.exact.length;
}

function resolveDirectAnchorSpan(text: string, start: number, end: number, anchor: TextAnchor) {
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 0 || end < start || end > text.length) return null;

  const quote = text.slice(start, end);
  if (quote === anchor.exact) return { start, end };
  if (normalizeText(quote) === normalizeText(anchor.exact)) return { start, end };
  if (anchor.quoteHash && textAnchorQuoteHash(quote) === anchor.quoteHash) return { start, end };
  return null;
}

function resolveAnchorInRange(
  text: string,
  anchor: TextAnchor,
  rangeStart: number,
  rangeEnd: number,
) {
  const rangeText = text.slice(rangeStart, rangeEnd);
  const position = resolveTextAnchor(rangeText, {
    ...anchor,
    start: Math.max(0, Math.min(anchor.start - rangeStart, rangeText.length)),
    end: Math.max(0, Math.min(anchor.end - rangeStart, rangeText.length)),
  });
  return position ? { start: rangeStart + position.start, end: rangeStart + position.end } : null;
}

function epubPositionAllowed(
  index: EpubBookIndex,
  position: { start: number; end: number },
  options: LocateEpubIndexOptions,
) {
  const location = locateEpubOffset(index, position.start, options);
  if (!location) return false;
  return epubLocationAllowed(
    index,
    { ...location, textStart: position.start, textEnd: position.end },
    options,
  );
}

function epubLocationAllowed(
  index: EpubBookIndex,
  location: EpubIndexLocation,
  options: LocateEpubIndexOptions,
) {
  const allowedTextStart = numberValue(options.allowedTextStart);
  const allowedTextEnd = numberValue(options.allowedTextEnd);

  if (allowedTextStart !== null && location.textStart < allowedTextStart) {
    return false;
  }
  if (allowedTextEnd !== null && location.textEnd > allowedTextEnd) {
    return false;
  }

  return (
    rangesAllowed(overlappingRanges(index.chapters, location), options.allowedChapterIds) &&
    rangesAllowed(overlappingRanges(index.segments, location), options.allowedSegmentIds) &&
    rangesAllowed(overlappingRanges(index.paragraphs, location), options.allowedParagraphIds)
  );
}

function overlappingRanges<T extends { textStart: number; textEnd: number }>(
  ranges: T[],
  location: Pick<EpubIndexLocation, 'textStart' | 'textEnd'>,
) {
  return ranges.filter(
    (item) => location.textStart < item.textEnd && location.textEnd > item.textStart,
  );
}

function rangesAllowed<T extends { id: string }>(ranges: T[], allowedIds: string[] | undefined) {
  if (!allowedIds?.length) return true;
  const allowed = new Set(allowedIds);
  return ranges.length > 0 && ranges.every((item) => allowed.has(item.id));
}

function buildChapterSegments(input: {
  chapterId: string;
  paragraphs: ParagraphBuildState[];
  maxSegmentTextLength: number;
  minSegmentTextLength: number;
}): EpubSegmentIndex[] {
  const segments: EpubSegmentIndex[] = [];
  let current: ParagraphBuildState[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const indexInChapter = segments.length;
    const id = `${input.chapterId}-segment-${indexInChapter + 1}`;
    current.forEach((paragraph, indexInSegment) => {
      paragraph.segmentId = id;
      paragraph.indexInSegment = indexInSegment;
    });
    const first = current[0];
    const last = current[current.length - 1];
    if (!first || !last) return;
    segments.push({
      id,
      chapterId: input.chapterId,
      indexInChapter,
      textStart: first.textStart,
      textEnd: last.textEnd,
      textLength: last.textEnd - first.textStart,
      previewStart: previewStart(first.text),
      previewEnd: previewEnd(last.text),
      paragraphIds: current.map((paragraph) => paragraph.id),
    });
    current = [];
  };

  for (const paragraph of input.paragraphs) {
    const nextLength =
      current.length === 0
        ? paragraph.textLength
        : paragraph.textEnd - (current[0]?.textStart ?? paragraph.textStart);
    const currentLength =
      current.length === 0
        ? 0
        : (current[current.length - 1]?.textEnd ?? paragraph.textEnd) -
          (current[0]?.textStart ?? paragraph.textStart);
    if (
      current.length > 0 &&
      nextLength > input.maxSegmentTextLength &&
      currentLength >= input.minSegmentTextLength
    ) {
      flush();
    }
    current.push(paragraph);
  }

  flush();
  return segments;
}

function normalizedParagraphs(paragraphs: string[]) {
  return paragraphs.map(normalizeText).filter(Boolean);
}

function toParagraphIndex(paragraph: ParagraphBuildState): EpubParagraphIndex {
  return {
    id: paragraph.id,
    chapterId: paragraph.chapterId,
    segmentId: paragraph.segmentId,
    indexInChapter: paragraph.indexInChapter,
    indexInSegment: paragraph.indexInSegment,
    textStart: paragraph.textStart,
    textEnd: paragraph.textEnd,
    textLength: paragraph.textLength,
    previewStart: paragraph.previewStart,
    previewEnd: paragraph.previewEnd,
  };
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function findRange<T extends { textStart: number; textEnd: number }>(
  items: T[],
  offset: number,
  predicate: (item: T) => boolean = () => true,
) {
  const candidates = items.filter(predicate);
  const direct = candidates.find((item) => offset >= item.textStart && offset < item.textEnd);
  if (direct) return direct;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const item = candidates[index];
    if (item && offset >= item.textStart) return item;
  }
  return candidates[0] || null;
}

function paragraphWindow(
  paragraphs: EpubParagraphIndex[],
  paragraph: EpubParagraphIndex | null,
  windowSize = 1,
) {
  if (!paragraph) return [];
  const siblingParagraphs = paragraphs.filter((item) => item.chapterId === paragraph.chapterId);
  const index = siblingParagraphs.findIndex((item) => item.id === paragraph.id);
  if (index < 0) return [];
  const size = Math.max(0, Math.floor(windowSize));
  return siblingParagraphs.slice(Math.max(0, index - size), index + size + 1);
}

function positiveInteger(value: number | undefined, fallback: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function previewStart(text: string) {
  return text.slice(0, PREVIEW_LENGTH);
}

function previewEnd(text: string) {
  return text.length <= PREVIEW_LENGTH ? text : text.slice(text.length - PREVIEW_LENGTH);
}
