import {
  resolveTextAnchor,
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
  const position = resolveTextAnchor(text, anchor);
  if (!position) return null;
  const location = locateEpubOffset(index, position.start, options);
  return location ? { ...location, textStart: position.start, textEnd: position.end } : null;
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

function previewStart(text: string) {
  return text.slice(0, PREVIEW_LENGTH);
}

function previewEnd(text: string) {
  return text.length <= PREVIEW_LENGTH ? text : text.slice(text.length - PREVIEW_LENGTH);
}
