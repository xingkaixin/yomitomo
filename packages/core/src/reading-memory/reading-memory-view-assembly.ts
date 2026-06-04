import type {
  AgentAnnotatePayload,
  AgentMessagePayload,
  MemoryViewType,
  ReaderProgress,
  TextRange,
} from '@yomitomo/shared';

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

  const segment = index.segments.find(
    (item) =>
      item.textStart < firstPlanItem.sectionEnd && item.textEnd > firstPlanItem.sectionStart,
  );
  if (!segment) return undefined;
  const chapter = index.chapters.find((item) => item.id === segment.chapterId);
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
      readChapterIds: index.chapters
        .filter((item) => item.indexInBook < chapter.indexInBook)
        .map((item) => item.id),
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
  const location = textRange ? ebookLocationForRange(payload, textRange) : undefined;
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
  const location = textRange ? ebookLocationForRange(payload, textRange) : undefined;
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

function ebookLocationForRange(
  payload: Pick<AgentAnnotatePayload | AgentMessagePayload, 'article'>,
  textRange: { textEnd: number },
) {
  const index = payload.article.ebookIndex;
  if (!index) return undefined;
  const segment = index.segments.find(
    (item) => item.textStart < textRange.textEnd && item.textEnd >= textRange.textEnd,
  );
  if (!segment) return undefined;
  const chapter = index.chapters.find((item) => item.id === segment.chapterId);
  if (!chapter) return undefined;
  return {
    chapterId: chapter.id,
    segmentId: segment.id,
    readChapterIds: index.chapters
      .filter((item) => item.indexInBook < chapter.indexInBook)
      .map((item) => item.id),
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
