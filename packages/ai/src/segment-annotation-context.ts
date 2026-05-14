import type {
  Agent,
  AgentAnnotatePayload,
  AgentReadingPlanItem,
  Annotation,
  ChapterTrace,
  EpubBookIndex,
  EpubChapterIndex,
  EpubSegmentIndex,
  SegmentAnnotationContext,
  SegmentMemory,
  TextRange,
} from '@yomitomo/shared';
import type { CreateAgentAnnotationOptions } from '@yomitomo/core';
import { packReadingContext } from './context-packing';

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
    index.segments.flatMap((segment) => {
      if (!rangesOverlap(segment, planItem)) return [];
      const chapter = index.chapters.find((item) => item.id === segment.chapterId);
      if (!chapter) return [];
      const allowedAnchorRange = clippedSegmentRange(segment, planItem);
      const visibleRange = visibleSegmentRange(allowedAnchorRange);
      const allowedParagraphIds = paragraphIdsInRange(index, segment, visibleRange);
      if (visibleRange.textEnd <= visibleRange.textStart || allowedParagraphIds.length === 0)
        return [];

      const context = buildSegmentAnnotationContext({
        payload,
        agent,
        index,
        planItem,
        chapter,
        segment,
        visibleRange,
        allowedParagraphIds,
      });

      return [
        {
          planItem,
          chapter,
          segment,
          context,
          createOptions: {
            ebookIndex: index,
            allowedTextStart: visibleRange.textStart,
            allowedTextEnd: visibleRange.textEnd,
            allowedSegmentIds: [segment.id],
            allowedParagraphIds,
          },
          targetDensity: planItem.targetDensity,
        },
      ];
    }),
  );
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
  )}\n\nsegment-level 规则：\n- currentSegment 是本次唯一可落锚原文；exact 必须来自 allowedAnchorRange.coreParagraphIds 覆盖的 current segment 文本。\n- segment_memory、next_preview 和 chapter_trace 只用于理解上下文，不能从这些块里选 exact。\n- dedup 块用于避免重复选点、重复 moveType 和相邻批注。\n- 没有足够讨论价值时返回空结果。`;
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
      readerProgress: {
        currentChapterId: chapter.id,
        currentSegmentId: segment.id,
        readChapterIds: index.chapters
          .filter((item) => item.indexInBook < chapter.indexInBook)
          .map((item) => item.id),
        readUntilTextOffset: visibleRange.textEnd,
      },
    },
    agent: {
      agentId: agent.id,
      agentUsername: agent.username,
      agentNickname: agent.nickname,
      readingIntent: planItem.readingIntent || payload.readingIntent,
    },
    budget: {
      maxTokens: SEGMENT_CONTEXT_TOKEN_BUDGET,
      blockTypeOrder: ['segment', 'segment_memory', 'next_preview', 'chapter_trace', 'dedup'],
      reserveTokensByType: {
        segment_memory: 800,
        next_preview: 500,
        chapter_trace: 1400,
        dedup: 1200,
      },
    },
    evidencePolicy: {
      spoilerPolicy: payload.spoilerPolicy || {
        allowedScope: 'read-so-far',
        allowFutureChapterEvidence: false,
        allowFuturePlotEvents: false,
      },
      allowedSourceTypes: ['segment', 'segment_memory', 'next_preview', 'chapter_trace', 'dedup'],
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
    previousMemory: previousSegmentMemory(index, payload.article.text, segment),
    nextPreview: nextSegmentPreview(index, payload.article.text, segment),
    chapterTrace: chapterTrace(index, chapter, planItem, dedupAnnotations),
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

function previousSegmentMemory(
  index: EpubBookIndex,
  articleText: string,
  segment: EpubSegmentIndex,
): SegmentMemory | undefined {
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
): ChapterTrace {
  const events = [
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
      source: 'route-and-nearby-annotations',
    },
  };
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

function visibleSegmentRange(range: TextRange): TextRange {
  return {
    textStart: range.textStart,
    textEnd: Math.min(range.textEnd, range.textStart + SEGMENT_TEXT_CHAR_LIMIT),
  };
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
