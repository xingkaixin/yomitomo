import type {
  AgentAnnotatePayload,
  AgentMessagePayload,
  MemoryViewType,
  ReaderProgress,
  TextRange,
} from '@yomitomo/shared';
import { prepareEpubBookIndex, type PreparedEpubBookIndex } from '../epub/ebook-index';

export type ReadingMemoryViewRequest = {
  articleId: string;
  viewType: Extract<
    MemoryViewType,
    'selection' | 'selection_thread' | 'article_section' | 'segment'
  >;
  chapterId?: string;
  segmentId?: string;
  textRange?: TextRange;
  query?: string;
  readerProgress?: ReaderProgress;
};

export function readingMemoryViewRequestForAnnotatePayload(
  payload: AgentAnnotatePayload,
): ReadingMemoryViewRequest | undefined {
  const articleId = payload.article.id;
  if (!articleId) return undefined;
  if (payload.targetAnchor) return selectionAnnotateMemoryViewRequest(payload, articleId);

  const index = payload.article.ebookIndex;
  const firstPlanItem = payload.readingPlan?.[0];
  if (!firstPlanItem) return undefined;
  if (!index) return articleSectionMemoryViewRequest(payload, articleId);

  const prepared = prepareEpubBookIndex(index);
  const segment = prepared.segmentsOverlapping({
    textStart: firstPlanItem.sectionStart,
    textEnd: firstPlanItem.sectionEnd,
  })[0];
  if (!segment) return undefined;
  const chapter = prepared.chapter(segment.chapterId);
  if (!chapter) return undefined;
  const textRange = {
    textStart: Math.max(segment.textStart, firstPlanItem.sectionStart),
    textEnd: Math.min(segment.textEnd, firstPlanItem.sectionEnd),
  };
  if (textRange.textEnd <= textRange.textStart) return undefined;

  return {
    articleId,
    viewType: 'segment',
    chapterId: chapter.id,
    segmentId: segment.id,
    textRange,
    query: [
      firstPlanItem.sectionSummary || '',
      firstPlanItem.sectionTag || '',
      payload.readingIntent || '',
      payload.instruction || '',
      ...(firstPlanItem.messages || []).map((message) => message.content),
    ].join(' '),
    readerProgress: payload.readerProgress || {
      currentChapterId: chapter.id,
      currentSegmentId: segment.id,
      readChapterIds: prepared.chaptersBefore(chapter),
      readUntilTextOffset: textRange.textEnd,
    },
  };
}

export function readingMemoryViewRequestForMessagePayload(
  payload: AgentMessagePayload,
): ReadingMemoryViewRequest | undefined {
  const articleId = payload.article.id;
  if (!articleId) return undefined;

  const textRange = anchorTextRange(payload.annotation.anchor);
  const prepared = payload.article.ebookIndex
    ? prepareEpubBookIndex(payload.article.ebookIndex)
    : undefined;
  const location = textRange && prepared ? ebookLocationForRange(prepared, textRange) : undefined;
  return {
    articleId,
    viewType: 'selection_thread',
    chapterId: location?.chapterId,
    segmentId: location?.segmentId,
    textRange,
    query: [
      payload.annotation.anchor.exact,
      payload.userComment.content,
      payload.readingIntent || '',
      payload.instruction || '',
    ]
      .join(' ')
      .trim(),
    readerProgress:
      location && textRange
        ? {
            currentChapterId: location.chapterId,
            currentSegmentId: location.segmentId,
            readChapterIds: location.readChapterIds,
            readUntilTextOffset: textRange.textEnd,
          }
        : payload.readerProgress,
  };
}

function articleSectionMemoryViewRequest(
  payload: AgentAnnotatePayload,
  articleId: string,
): ReadingMemoryViewRequest | undefined {
  const ranges = (payload.readingPlan || []).flatMap((item) => {
    const textRange = normalizeTextRange(item.sectionStart, item.sectionEnd);
    return textRange ? [textRange] : [];
  });
  if (ranges.length === 0) return undefined;
  const textRange = {
    textStart: Math.min(...ranges.map((range) => range.textStart)),
    textEnd: Math.max(...ranges.map((range) => range.textEnd)),
  };
  return {
    articleId,
    viewType: 'article_section',
    textRange,
    query: articleSectionQuery(payload),
  };
}

function articleSectionQuery(payload: AgentAnnotatePayload) {
  const parts = [payload.readingIntent || '', payload.instruction || ''];
  for (const item of payload.readingPlan || []) {
    parts.push(item.sectionTitle, item.sectionSummary || '', item.sectionTag || '');
    for (const message of item.messages || []) parts.push(message.content);
  }
  return parts.join(' ').trim();
}

function selectionAnnotateMemoryViewRequest(
  payload: AgentAnnotatePayload,
  articleId: string,
): ReadingMemoryViewRequest {
  const textRange = anchorTextRange(payload.targetAnchor);
  const prepared = payload.article.ebookIndex
    ? prepareEpubBookIndex(payload.article.ebookIndex)
    : undefined;
  const location = textRange && prepared ? ebookLocationForRange(prepared, textRange) : undefined;
  return {
    articleId,
    viewType: 'selection',
    chapterId: location?.chapterId,
    segmentId: location?.segmentId,
    textRange,
    query: [
      payload.targetAnchor?.exact || '',
      payload.readingIntent || '',
      payload.instruction || '',
    ]
      .join(' ')
      .trim(),
    readerProgress:
      location && textRange
        ? {
            currentChapterId: location.chapterId,
            currentSegmentId: location.segmentId,
            readChapterIds: location.readChapterIds,
            readUntilTextOffset: textRange.textEnd,
          }
        : payload.readerProgress,
  };
}

function ebookLocationForRange(prepared: PreparedEpubBookIndex, textRange: { textEnd: number }) {
  const segment = prepared.segmentEndingAt(textRange.textEnd);
  if (!segment) return undefined;
  const chapter = prepared.chapter(segment.chapterId);
  if (!chapter) return undefined;
  return {
    chapterId: chapter.id,
    segmentId: segment.id,
    readChapterIds: prepared.chaptersBefore(chapter),
  };
}

function anchorTextRange(anchor: AgentAnnotatePayload['targetAnchor']) {
  if (!anchor) return undefined;
  const textStart = integerValue(anchor.textStartInBook) ?? integerValue(anchor.start);
  const textEnd = integerValue(anchor.textEndInBook) ?? integerValue(anchor.end);
  return textStart !== null && textEnd !== null && textEnd > textStart
    ? { textStart, textEnd }
    : undefined;
}

function integerValue(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function normalizeTextRange(textStart: unknown, textEnd: unknown) {
  const start = integerValue(textStart);
  const end = integerValue(textEnd);
  return start !== null && end !== null && end > start ? { textStart: start, textEnd: end } : null;
}
