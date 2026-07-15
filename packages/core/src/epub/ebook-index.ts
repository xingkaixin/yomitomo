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

export type PreparedEpubTextAnchorResolver = {
  locate(anchor: TextAnchor, options?: LocateEpubIndexOptions): EpubIndexLocation | null;
  resolve(
    anchor: TextAnchor,
    options?: LocateEpubIndexOptions,
  ): { start: number; end: number } | null;
};

export type CreateEpubTextAnchorFromQuoteOptions = {
  chapterId?: string;
  segmentId?: string;
  paragraphId?: string;
  prefix?: string;
  suffix?: string;
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
  const chapter = findRange(index.chapters, cursor)?.item || null;
  const segment = findRange(index.segments, cursor)?.item || null;
  if (!chapter || !segment) return null;

  const paragraph = findRange(index.paragraphs, cursor);

  return {
    textStart: cursor,
    textEnd: cursor,
    chapter,
    segment,
    paragraph: paragraph?.item || null,
    paragraphWindow: paragraphWindow(index.paragraphs, paragraph, options.paragraphWindowSize),
  };
}

export function locateEpubTextAnchor(
  index: EpubBookIndex,
  text: string,
  anchor: TextAnchor,
  options: LocateEpubIndexOptions = {},
): EpubIndexLocation | null {
  return prepareEpubTextAnchorResolver(index, text).locate(anchor, options);
}

export function prepareEpubTextAnchorResolver(
  index: EpubBookIndex,
  text: string,
): PreparedEpubTextAnchorResolver {
  const chapters = prepareEpubRangeLookup(index.chapters);
  const segments = prepareEpubRangeLookup(index.segments);
  const paragraphs = prepareEpubRangeLookup(index.paragraphs);
  const paragraphsById = firstEpubRangeById(index.paragraphs);
  const lookups = { chapters, segments, paragraphs };

  const locate = (
    anchor: TextAnchor,
    options: LocateEpubIndexOptions = {},
  ): EpubIndexLocation | null => {
    const structural = resolveEpubStructuralTextAnchor(paragraphsById, text, anchor);
    if (structural) {
      const location = locateAllowedEpubPosition(index, lookups, structural, options);
      if (location) return location;
    }

    const fallback = resolveTextAnchor(text, anchor);
    return fallback ? locateAllowedEpubPosition(index, lookups, fallback, options) : null;
  };

  return {
    locate,
    resolve(anchor, options) {
      const location = locate(anchor, options);
      return location ? { start: location.textStart, end: location.textEnd } : null;
    },
  };
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

export function createEpubTextAnchorFromQuote(
  index: EpubBookIndex,
  text: string,
  quote: string,
  options: CreateEpubTextAnchorFromQuoteOptions = {},
): TextAnchor | null {
  const normalizedQuote = normalizeText(quote);
  if (!normalizedQuote) return null;

  const ranges = anchorSearchRanges(index, text.length, options);
  let bestMatch: { start: number; end: number } | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const range of ranges) {
    const normalizedRange = normalizeTextWithMap(text.slice(range.start, range.end));
    let indexInRange = normalizedRange.text.indexOf(normalizedQuote);

    while (indexInRange >= 0) {
      const start = range.start + normalizedRange.map[indexInRange];
      const end = range.start + normalizedRange.map[indexInRange + normalizedQuote.length - 1] + 1;
      const score = anchorMatchScore(text, start, end, options);
      if (score > bestScore) {
        bestMatch = { start, end };
        bestScore = score;
      }
      indexInRange = normalizedRange.text.indexOf(
        normalizedQuote,
        indexInRange + Math.max(1, normalizedQuote.length),
      );
    }
  }

  return bestMatch ? createEpubTextAnchor(index, text, bestMatch.start, bestMatch.end) : null;
}

export function resolveEpubTextAnchor(
  index: EpubBookIndex,
  text: string,
  anchor: TextAnchor,
  options: LocateEpubIndexOptions = {},
): { start: number; end: number } | null {
  return prepareEpubTextAnchorResolver(index, text).resolve(anchor, options);
}

function resolveEpubStructuralTextAnchor(
  paragraphsById: ReadonlyMap<string, EpubParagraphIndex>,
  text: string,
  anchor: TextAnchor,
): { start: number; end: number } | null {
  const paragraph = anchor.paragraphId ? paragraphsById.get(anchor.paragraphId) : null;
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

function anchorSearchRanges(
  index: EpubBookIndex,
  textLength: number,
  options: CreateEpubTextAnchorFromQuoteOptions,
) {
  const paragraph = options.paragraphId
    ? index.paragraphs.find((item) => item.id === options.paragraphId)
    : null;
  if (paragraph) return [{ start: paragraph.textStart, end: paragraph.textEnd }];

  const segment = options.segmentId
    ? index.segments.find((item) => item.id === options.segmentId)
    : null;
  if (segment) return [{ start: segment.textStart, end: segment.textEnd }];

  const chapter = options.chapterId
    ? index.chapters.find((item) => item.id === options.chapterId)
    : null;
  if (chapter) return [{ start: chapter.textStart, end: chapter.textEnd }];

  return [{ start: 0, end: textLength }];
}

function anchorMatchScore(
  text: string,
  start: number,
  end: number,
  options: CreateEpubTextAnchorFromQuoteOptions,
) {
  const prefix = normalizeText(options.prefix || '');
  const suffix = normalizeText(options.suffix || '');
  const before = normalizeText(
    text.slice(Math.max(0, start - Math.max(120, prefix.length * 3)), start),
  );
  const after = normalizeText(
    text.slice(end, Math.min(text.length, end + Math.max(120, suffix.length * 3))),
  );

  return commonSuffixLength(before, prefix) + commonPrefixLength(after, suffix);
}

type EpubRange = {
  id: string;
  textStart: number;
  textEnd: number;
};

type PreparedEpubRangeLookup<T extends EpubRange> = {
  overlapping(location: Pick<EpubIndexLocation, 'textStart' | 'textEnd'>): T[];
};

type PreparedEpubRangeLookups = {
  chapters: PreparedEpubRangeLookup<EpubChapterIndex>;
  segments: PreparedEpubRangeLookup<EpubSegmentIndex>;
  paragraphs: PreparedEpubRangeLookup<EpubParagraphIndex>;
};

function locateAllowedEpubPosition(
  index: EpubBookIndex,
  lookups: PreparedEpubRangeLookups,
  position: { start: number; end: number },
  options: LocateEpubIndexOptions,
): EpubIndexLocation | null {
  const location = locateEpubOffset(index, position.start, options);
  if (!location) return null;
  const resolvedLocation = { ...location, textStart: position.start, textEnd: position.end };
  return epubLocationAllowed(lookups, resolvedLocation, options) ? resolvedLocation : null;
}

function epubLocationAllowed(
  lookups: PreparedEpubRangeLookups,
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
    rangeLookupAllowed(lookups.chapters, location, options.allowedChapterIds) &&
    rangeLookupAllowed(lookups.segments, location, options.allowedSegmentIds) &&
    rangeLookupAllowed(lookups.paragraphs, location, options.allowedParagraphIds)
  );
}

function prepareEpubRangeLookup<T extends EpubRange>(ranges: T[]): PreparedEpubRangeLookup<T> {
  let ordered = true;

  ranges.forEach((range, index) => {
    const previous = ranges[index - 1];
    if (previous && (range.textStart < previous.textStart || range.textEnd < previous.textEnd)) {
      ordered = false;
    }
  });

  return {
    overlapping(location) {
      if (!ordered) return overlappingRanges(ranges, location);

      const overlapping: T[] = [];
      let index = firstRangeStartingAtOrAfter(ranges, location.textEnd) - 1;
      while (index >= 0) {
        const range = ranges[index];
        if (range.textEnd <= location.textStart) break;
        overlapping.push(range);
        index -= 1;
      }
      return overlapping.toReversed();
    },
  };
}

function firstEpubRangeById<T extends EpubRange>(ranges: T[]) {
  const byId = new Map<string, T>();
  for (const range of ranges) {
    if (!byId.has(range.id)) byId.set(range.id, range);
  }
  return byId;
}

function firstRangeStartingAtOrAfter(ranges: EpubRange[], offset: number) {
  let low = 0;
  let high = ranges.length;

  while (low < high) {
    const index = Math.floor((low + high) / 2);
    if (ranges[index].textStart < offset) {
      low = index + 1;
    } else {
      high = index;
    }
  }

  return low;
}

function overlappingRanges<T extends EpubRange>(
  ranges: T[],
  location: Pick<EpubIndexLocation, 'textStart' | 'textEnd'>,
) {
  return ranges.filter(
    (item) => location.textStart < item.textEnd && location.textEnd > item.textStart,
  );
}

function rangeLookupAllowed<T extends EpubRange>(
  lookup: PreparedEpubRangeLookup<T>,
  location: Pick<EpubIndexLocation, 'textStart' | 'textEnd'>,
  allowedIds: string[] | undefined,
) {
  if (!allowedIds?.length) return true;
  const allowed = new Set(allowedIds);
  const ranges = lookup.overlapping(location);
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

function normalizeTextWithMap(value: string) {
  let text = '';
  const map: number[] = [];
  let pendingWhitespace = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (/\s/.test(char)) {
      pendingWhitespace = text.length > 0;
      continue;
    }
    if (pendingWhitespace && !text.endsWith(' ')) {
      text += ' ';
      map.push(index);
    }
    pendingWhitespace = false;
    text += char;
    map.push(index);
  }

  return { text, map };
}

function commonPrefixLength(left: string, right: string) {
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) {
    length += 1;
  }
  return length;
}

function commonSuffixLength(left: string, right: string) {
  let length = 0;
  while (
    length < left.length &&
    length < right.length &&
    left[left.length - 1 - length] === right[right.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}

function findRange<T extends { textStart: number; textEnd: number }>(items: T[], offset: number) {
  if (items.length === 0) return null;

  let low = 0;
  let high = items.length - 1;
  let candidateIndex = 0;

  while (low <= high) {
    const index = Math.floor((low + high) / 2);
    const item = items[index];
    if (item.textStart <= offset) {
      candidateIndex = index;
      low = index + 1;
    } else {
      high = index - 1;
    }
  }

  for (let index = candidateIndex; index >= 0; index -= 1) {
    const item = items[index];
    if (offset >= item.textStart && offset < item.textEnd) return { item, index };
    if (offset >= item.textStart) return { item, index };
  }

  const first = items[0];
  return first ? { item: first, index: 0 } : null;
}

function paragraphWindow(
  paragraphs: EpubParagraphIndex[],
  paragraph: { item: EpubParagraphIndex; index: number } | null,
  windowSize = 1,
) {
  if (!paragraph) return [];
  const size = Math.max(0, Math.floor(windowSize));
  let start = paragraph.index;
  let end = paragraph.index;

  while (
    start > 0 &&
    paragraph.index - start < size &&
    paragraphs[start - 1]?.chapterId === paragraph.item.chapterId
  ) {
    start -= 1;
  }
  while (
    end + 1 < paragraphs.length &&
    end - paragraph.index < size &&
    paragraphs[end + 1]?.chapterId === paragraph.item.chapterId
  ) {
    end += 1;
  }

  return paragraphs.slice(start, end + 1);
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
