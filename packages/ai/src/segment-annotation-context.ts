import type {
  Agent,
  AgentAnnotatePayload,
  AgentReadingPlanItem,
  Annotation,
  ChapterTrace,
  EpubBookIndex,
  EpubChapterIndex,
  EpubSegmentIndex,
  ReadingMemory,
  ReaderProgress,
  ReadingTrace,
  SegmentAnnotationContext,
  SegmentMemory,
  SegmentTraceMemory,
  TextSummary,
  TextRange,
} from '@yomitomo/shared';
import {
  buildCurrentChapterLexicalRelatedPassages,
  buildReadingContextBundle,
  segmentAnnotationSpoilerPolicy,
  type CreateAgentAnnotationOptions,
  type ReadingContextPassageInput,
} from '@yomitomo/core';
import { packReadingContext } from './context-packing';
import { relatedPassagesFromReadingContext } from './related-passages';

const SEGMENT_CONTEXT_TOKEN_BUDGET = 9000;
const SEGMENT_TEXT_CHAR_LIMIT = 6500;
const SEGMENT_DEDUP_LIMIT = 8;
const SEGMENT_DEDUP_WINDOW = 2400;

export type SegmentAnnotationTask = {
  planItem: AgentReadingPlanItem;
  chapter: EpubChapterIndex;
  segment: EpubSegmentIndex;
  context: SegmentAnnotationContext;
  createOptions: CreateAgentAnnotationOptions;
  targetDensity: AgentReadingPlanItem['targetDensity'];
};

export function buildSegmentAnnotationTasks(
  payload: AgentAnnotatePayload,
  agent: Agent,
): SegmentAnnotationTask[] {
  const index = payload.article.ebookIndex;
  if (!index || !payload.readingPlan?.length) return [];

  return payload.readingPlan.flatMap((planItem) =>
    index.segments.flatMap((segment) =>
      segmentAnnotationRanges(payload, segment, planItem).flatMap((visibleRange) => {
        const task = buildSegmentAnnotationTask(payload, agent, planItem, segment, visibleRange);
        return task ? [task] : [];
      }),
    ),
  );
}

export function buildSegmentAnnotationTask(
  payload: AgentAnnotatePayload,
  agent: Agent,
  planItem: AgentReadingPlanItem,
  segment: EpubSegmentIndex,
  visibleRange?: TextRange,
): SegmentAnnotationTask | null {
  const index = payload.article.ebookIndex;
  if (!index || !rangesOverlap(segment, planItem)) return null;
  const chapter = index.chapters.find((item) => item.id === segment.chapterId);
  if (!chapter) return null;
  const allowedAnchorRange = clippedSegmentRange(segment, planItem);
  const taskRange =
    visibleRange || visibleSegmentRanges(payload.article.text, allowedAnchorRange)[0];
  if (!taskRange) return null;
  const allowedParagraphIds = paragraphIdsInRange(index, segment, taskRange);
  if (taskRange.textEnd <= taskRange.textStart || allowedParagraphIds.length === 0) return null;

  return {
    planItem,
    chapter,
    segment,
    context: buildSegmentAnnotationContext({
      payload,
      agent,
      index,
      planItem,
      chapter,
      segment,
      visibleRange: taskRange,
      allowedParagraphIds,
    }),
    createOptions: {
      ebookIndex: index,
      allowedTextStart: taskRange.textStart,
      allowedTextEnd: taskRange.textEnd,
      allowedSegmentIds: [segment.id],
      allowedParagraphIds,
    },
    targetDensity: planItem.targetDensity,
  };
}

export function segmentAnnotationContextPrompt(task: SegmentAnnotationTask) {
  const packed = packReadingContext(task.context);
  if (packed.blocks.length === 0) return '';

  return `\n\nsegment-level 上下文：\n${JSON.stringify(
    {
      book: {
        articleId: task.context.book.articleId,
        title: task.context.book.title,
        url: task.context.book.url,
        textLength: task.context.book.textLength,
      },
      chapter: {
        chapterId: task.chapter.id,
        title: task.chapter.title || `第 ${task.chapter.indexInBook + 1} 章`,
        indexInBook: task.chapter.indexInBook,
      },
      currentSegment: {
        segmentId: task.segment.id,
        indexInChapter: task.segment.indexInChapter,
        textRange: task.context.currentSegment.textRange,
      },
      routeInstruction: {
        sectionSummary: task.planItem.sectionSummary || '',
        sectionTag: task.planItem.sectionTag || '',
        readingIntent: task.planItem.readingIntent || '',
        readerMessages: task.planItem.messages || [],
      },
      targetDensity: task.targetDensity || '',
      allowedAnchorRange: {
        ...task.context.allowedAnchorRange,
        coreParagraphIds: task.createOptions.allowedParagraphIds || [],
      },
      assistant: task.context.agent,
      blocks: packed.blocks.map((block) => ({
        id: block.id,
        source: block.source,
        truncated: block.truncated,
        text: block.text,
      })),
    },
    null,
    2,
  )}\n\nsegment-level 规则：\n- currentSegment 是本次唯一可落锚原文；exact 必须来自 allowedAnchorRange.coreParagraphIds 覆盖的 current segment 文本。\n- retrieved_evidence、segment_memory、segment_trace、next_preview 和 chapter_trace 是辅助阅读记忆，不能从这些块里选 exact。\n- 涉及作者观点、跨章节判断、关键概念出处时，必须由 currentSegment 原文支撑；summary/trace 不能当作原文事实证据，relatedPassage 也只能作为辅助检索线索。\n- dedup 块用于避免重复选点、重复 moveType 和相邻批注。\n- 没有足够讨论价值时返回空结果。`;
}

function buildSegmentAnnotationContext(input: {
  payload: AgentAnnotatePayload;
  agent: Agent;
  index: EpubBookIndex;
  planItem: AgentReadingPlanItem;
  chapter: EpubChapterIndex;
  segment: EpubSegmentIndex;
  visibleRange: TextRange;
  allowedParagraphIds: string[];
}): SegmentAnnotationContext {
  const { payload, agent, index, planItem, chapter, segment, visibleRange, allowedParagraphIds } =
    input;
  const dedupAnnotations = nearbyDedupAnnotations(payload.annotations || [], chapter, visibleRange);
  const readerProgress = segmentReaderProgress(index, chapter, segment, visibleRange);
  const readingContext = buildReadingContextBundle({
    articleText: payload.article.text,
    ebookIndex: index,
    readerProgress,
    spoilerPolicy: payload.spoilerPolicy || segmentAnnotationSpoilerPolicy,
    relatedPassages: segmentRelatedPassages(
      payload,
      index,
      planItem,
      chapter,
      segment,
      visibleRange,
      readerProgress,
    ),
  });

  return {
    task: 'chapter_segment_annotation',
    book: {
      articleId: index.articleId,
      title: payload.article.title,
      url: payload.article.url,
      sourceType: 'ebook',
      textLength: index.textLength,
      ebookIndex: index,
    },
    location: {
      chapterId: chapter.id,
      segmentId: segment.id,
      textRange: visibleRange,
      readerProgress,
    },
    agent: {
      agentId: agent.id,
      agentUsername: agent.username,
      agentNickname: agent.nickname,
      readingIntent: planItem.readingIntent || payload.readingIntent,
    },
    budget: {
      maxTokens: SEGMENT_CONTEXT_TOKEN_BUDGET,
      blockTypeOrder: [
        'segment',
        'retrieved_evidence',
        'segment_memory',
        'segment_trace',
        'next_preview',
        'chapter_trace',
        'dedup',
      ],
      reserveTokensByType: {
        retrieved_evidence: 1200,
        segment_memory: 800,
        segment_trace: 700,
        next_preview: 500,
        chapter_trace: 1400,
        dedup: 1200,
      },
    },
    evidencePolicy: {
      spoilerPolicy: readingContext.spoilerPolicy,
      allowedSourceTypes: [
        'segment',
        'retrieved_evidence',
        'segment_memory',
        'segment_trace',
        'next_preview',
        'chapter_trace',
        'dedup',
      ],
    },
    currentSegment: {
      segmentId: segment.id,
      text: payload.article.text.slice(visibleRange.textStart, visibleRange.textEnd),
      textRange: visibleRange,
      source: {
        type: 'segment',
        articleId: index.articleId,
        chapterId: chapter.id,
        segmentId: segment.id,
        source: 'epub-index',
      },
    },
    retrievedEvidence: relatedPassagesFromReadingContext(index, readingContext),
    previousMemory: previousSegmentMemory(
      index,
      payload.article.text,
      segment,
      visibleRange,
      payload.readingMemory,
    ),
    previousTrace: previousSegmentTrace(index, segment, visibleRange, payload.readingMemory),
    nextPreview: nextSegmentPreview(index, payload.article.text, segment),
    chapterTrace: chapterTrace(index, chapter, planItem, dedupAnnotations, payload.readingMemory),
    allowedAnchorRange: visibleRange,
    dedupContext: {
      recentAnchors: dedupAnnotations.map((annotation) => annotation.anchor),
      recentComments: dedupAnnotations.flatMap((annotation) =>
        annotation.comments
          .map((comment) => comment.content.trim())
          .filter(Boolean)
          .slice(0, 1),
      ),
      source: {
        type: 'dedup',
        articleId: index.articleId,
        chapterId: chapter.id,
        segmentId: segment.id,
        paragraphId: allowedParagraphIds[0],
        source: 'nearby-annotations',
      },
    },
  };
}

function segmentRelatedPassages(
  payload: AgentAnnotatePayload,
  index: EpubBookIndex,
  planItem: AgentReadingPlanItem,
  chapter: EpubChapterIndex,
  segment: EpubSegmentIndex,
  visibleRange: TextRange,
  readerProgress: ReaderProgress,
): ReadingContextPassageInput[] {
  const query = [
    payload.article.text.slice(visibleRange.textStart, visibleRange.textEnd),
    planItem.sectionSummary || '',
    planItem.sectionTag || '',
    ...(planItem.messages || []).map((message) => message.content),
  ];
  const passages = buildCurrentChapterLexicalRelatedPassages({
    articleText: payload.article.text,
    ebookIndex: index,
    query,
    chapterId: chapter.id,
    segmentId: segment.id,
    readerProgress,
    spoilerPolicy: payload.spoilerPolicy || segmentAnnotationSpoilerPolicy,
    excludeParagraphIds: segment.paragraphIds,
    maxPassages: 3,
    neighborParagraphs: 1,
  });
  return passages;
}

function segmentReaderProgress(
  index: EpubBookIndex,
  chapter: EpubChapterIndex,
  segment: EpubSegmentIndex,
  visibleRange: TextRange,
): ReaderProgress {
  return {
    currentChapterId: chapter.id,
    currentSegmentId: segment.id,
    readChapterIds: index.chapters
      .filter((item) => item.indexInBook < chapter.indexInBook)
      .map((item) => item.id),
    readUntilTextOffset: visibleRange.textEnd,
  };
}

function previousSegmentMemory(
  index: EpubBookIndex,
  articleText: string,
  segment: EpubSegmentIndex,
  visibleRange: TextRange,
  memory: ReadingMemory | undefined,
): SegmentMemory | undefined {
  const summaries = priorSegmentSummaries(index, segment, visibleRange, memory);
  if (summaries.length > 0) {
    const last = summaries[summaries.length - 1];
    return {
      segmentId: last?.segmentId || segment.id,
      summary: summaries.map(formatTextSummary).join('\n'),
      source: {
        type: 'segment_memory',
        articleId: index.articleId,
        chapterId: segment.chapterId,
        segmentId: last?.segmentId,
        source: 'reading-memory-summary',
      },
    };
  }

  const previous = index.segments.find(
    (item) =>
      item.chapterId === segment.chapterId && item.indexInChapter === segment.indexInChapter - 1,
  );
  if (!previous) return undefined;
  const preview =
    previous.previewEnd ||
    articleText.slice(Math.max(previous.textStart, previous.textEnd - 160), previous.textEnd);
  return {
    segmentId: previous.id,
    summary: `上一 segment 预览：${preview}`,
    source: {
      type: 'segment_memory',
      articleId: index.articleId,
      chapterId: previous.chapterId,
      segmentId: previous.id,
      source: 'previous-segment-preview',
    },
  };
}

function previousSegmentTrace(
  index: EpubBookIndex,
  segment: EpubSegmentIndex,
  visibleRange: TextRange,
  memory: ReadingMemory | undefined,
): SegmentTraceMemory | undefined {
  const previousSegmentIds = new Set(priorSegments(index, segment).map((item) => item.id));
  const traces = (memory?.readingTraces || [])
    .filter(
      (trace) =>
        trace.scope === 'segment' &&
        trace.chapterId === segment.chapterId &&
        trace.segmentId &&
        (previousSegmentIds.has(trace.segmentId) ||
          (trace.segmentId === segment.id &&
            Boolean(trace.sourceRange) &&
            trace.sourceRange!.textEnd <= visibleRange.textStart)),
    )
    .toSorted(
      (left, right) => (left.sourceRange?.textStart || 0) - (right.sourceRange?.textStart || 0),
    );
  const events = traces.flatMap((trace) => trace.items.map(formatTraceItem)).slice(-8);
  if (events.length === 0) return undefined;
  return {
    segmentId: traces[traces.length - 1]?.segmentId || segment.id,
    events,
    source: {
      type: 'segment_trace',
      articleId: index.articleId,
      chapterId: segment.chapterId,
      segmentId: traces[traces.length - 1]?.segmentId,
      source: 'reading-memory-trace',
    },
  };
}

function nextSegmentPreview(index: EpubBookIndex, articleText: string, segment: EpubSegmentIndex) {
  const next = index.segments.find(
    (item) =>
      item.chapterId === segment.chapterId && item.indexInChapter === segment.indexInChapter + 1,
  );
  if (!next) return undefined;
  return (
    next.previewStart ||
    articleText.slice(next.textStart, Math.min(next.textEnd, next.textStart + 160))
  );
}

function chapterTrace(
  index: EpubBookIndex,
  chapter: EpubChapterIndex,
  planItem: AgentReadingPlanItem,
  dedupAnnotations: Annotation[],
  memory: ReadingMemory | undefined,
): ChapterTrace {
  const memoryEvents =
    memory?.readingTraces
      ?.filter((trace) => trace.scope === 'chapter' && trace.chapterId === chapter.id)
      .flatMap((trace) => trace.items.map(formatTraceItem))
      .slice(-12) || [];
  const events = [
    ...memoryEvents,
    `章节：${chapter.title || `第 ${chapter.indexInBook + 1} 章`}`,
    planItem.sectionSummary ? `route summary：${planItem.sectionSummary}` : '',
    planItem.sectionTag ? `route tag：${planItem.sectionTag}` : '',
    ...(planItem.messages || []).map((message) => `reader message：${message.content}`),
    ...dedupAnnotations.slice(0, 3).map((annotation) => {
      const move = annotation.moveType ? ` / moveType=${annotation.moveType}` : '';
      return `nearby annotation：${annotation.anchor.exact}${move}`;
    }),
  ].filter(Boolean);

  return {
    chapterId: chapter.id,
    events,
    source: {
      type: 'chapter_trace',
      articleId: index.articleId,
      chapterId: chapter.id,
      source:
        memoryEvents.length > 0
          ? 'reading-memory-route-and-nearby-annotations'
          : 'route-and-nearby-annotations',
    },
  };
}

function priorSegmentSummaries(
  index: EpubBookIndex,
  segment: EpubSegmentIndex,
  visibleRange: TextRange,
  memory: ReadingMemory | undefined,
) {
  const previousSegmentIds = new Set(priorSegments(index, segment).map((item) => item.id));
  return (memory?.textSummaries || [])
    .filter(
      (summary) =>
        summary.scope === 'segment' &&
        summary.chapterId === segment.chapterId &&
        summary.segmentId &&
        (previousSegmentIds.has(summary.segmentId) ||
          (summary.segmentId === segment.id &&
            summary.sourceRange.textEnd <= visibleRange.textStart)),
    )
    .toSorted((left, right) => left.sourceRange.textStart - right.sourceRange.textStart)
    .slice(-3);
}

function priorSegments(index: EpubBookIndex, segment: EpubSegmentIndex) {
  return index.segments
    .filter(
      (item) =>
        item.chapterId === segment.chapterId && item.indexInChapter < segment.indexInChapter,
    )
    .toSorted((left, right) => left.indexInChapter - right.indexInChapter);
}

function formatTextSummary(summary: TextSummary) {
  const terms = summary.keyTerms.length > 0 ? `；关键词：${summary.keyTerms.join('、')}` : '';
  return `${summary.segmentId || 'segment'} summary：${summary.summary}${terms}`;
}

function formatTraceItem(item: ReadingTrace['items'][number]) {
  return `${item.type} / ${item.confidence}：${item.content}`;
}

function nearbyDedupAnnotations(
  annotations: Annotation[],
  chapter: EpubChapterIndex,
  range: TextRange,
) {
  const candidates = annotations.flatMap((annotation) => {
    const annotationRange = annotationTextRange(annotation);
    if (!annotationRange) return [];
    if (annotation.anchor.chapterId && annotation.anchor.chapterId !== chapter.id) return [];
    if (
      annotationRange.textEnd <= chapter.textStart ||
      annotationRange.textStart >= chapter.textEnd
    ) {
      return [];
    }
    const distance = rangeDistance(range, annotationRange);
    return distance <= SEGMENT_DEDUP_WINDOW ? [{ annotation, distance }] : [];
  });
  candidates.sort((left, right) => left.distance - right.distance);
  return candidates.slice(0, SEGMENT_DEDUP_LIMIT).map((item) => item.annotation);
}

function annotationTextRange(annotation: Annotation): TextRange | null {
  const textStart =
    integerValue(annotation.anchor.textStartInBook) ?? integerValue(annotation.anchor.start);
  const textEnd =
    integerValue(annotation.anchor.textEndInBook) ?? integerValue(annotation.anchor.end);
  return textStart !== null && textEnd !== null && textEnd > textStart
    ? { textStart, textEnd }
    : null;
}

function clippedSegmentRange(segment: EpubSegmentIndex, planItem: AgentReadingPlanItem): TextRange {
  return {
    textStart: Math.max(segment.textStart, planItem.sectionStart),
    textEnd: Math.min(segment.textEnd, planItem.sectionEnd),
  };
}

function segmentAnnotationRanges(
  payload: AgentAnnotatePayload,
  segment: EpubSegmentIndex,
  planItem: AgentReadingPlanItem,
): TextRange[] {
  if (!rangesOverlap(segment, planItem)) return [];
  return visibleSegmentRanges(payload.article.text, clippedSegmentRange(segment, planItem));
}

function visibleSegmentRanges(articleText: string, range: TextRange): TextRange[] {
  if (range.textEnd <= range.textStart) return [];
  const ranges: TextRange[] = [];
  let textStart = range.textStart;

  while (textStart < range.textEnd) {
    const hardEnd = Math.min(range.textEnd, textStart + SEGMENT_TEXT_CHAR_LIMIT);
    const textEnd =
      hardEnd < range.textEnd ? segmentChunkBoundary(articleText, textStart, hardEnd) : hardEnd;
    if (textEnd <= textStart) break;
    ranges.push({ textStart, textEnd });
    textStart = textEnd;
  }

  return ranges;
}

function segmentChunkBoundary(articleText: string, textStart: number, hardEnd: number) {
  const minEnd = textStart + Math.floor(SEGMENT_TEXT_CHAR_LIMIT * 0.72);
  for (let index = hardEnd - 1; index >= minEnd; index -= 1) {
    if ('。！？.!?；;'.includes(articleText[index] || '')) return index + 1;
  }
  for (let index = hardEnd - 1; index >= minEnd; index -= 1) {
    if (/\s/.test(articleText[index] || '')) return index + 1;
  }
  return hardEnd;
}

function paragraphIdsInRange(index: EpubBookIndex, segment: EpubSegmentIndex, range: TextRange) {
  return index.paragraphs
    .filter(
      (paragraph) =>
        paragraph.segmentId === segment.id &&
        paragraph.textStart < range.textEnd &&
        paragraph.textEnd > range.textStart,
    )
    .map((paragraph) => paragraph.id);
}

function rangesOverlap(
  segment: EpubSegmentIndex,
  planItem: Pick<AgentReadingPlanItem, 'sectionStart' | 'sectionEnd'>,
) {
  return segment.textStart < planItem.sectionEnd && segment.textEnd > planItem.sectionStart;
}

function rangeDistance(left: TextRange, right: TextRange) {
  if (left.textStart < right.textEnd && right.textStart < left.textEnd) return 0;
  if (left.textEnd <= right.textStart) return right.textStart - left.textEnd;
  return left.textStart - right.textEnd;
}

function integerValue(value: number | undefined): number | null {
  return Number.isInteger(value) && value !== undefined ? value : null;
}
