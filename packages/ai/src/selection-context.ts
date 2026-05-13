import type {
  Agent,
  AgentAnnotatePayload,
  Annotation,
  AnnotationSummary,
  BaseReadingContext,
  ChapterMemory,
  ContextSourceLabel,
  EpubBookIndex,
  EpubParagraphIndex,
  SelectionAnnotationContext,
  SourceLabeledContextBlock,
  TextAnchor,
} from '@yomitomo/shared';
import {
  locateEpubOffset,
  locateEpubTextAnchor,
  selectionAnnotationSpoilerPolicy,
  type ReadingContextBundle,
  type ReadingContextTextRange,
} from '@yomitomo/core';
import { packReadingContext } from './context-packing';

const SELECTION_PARAGRAPH_WINDOW_SIZE = 2;
const SELECTION_CONTEXT_TOKEN_BUDGET = 9000;
const NEARBY_ANNOTATION_LIMIT = 4;

type SelectionLocation = NonNullable<
  ReturnType<typeof locateEpubTextAnchor> | ReturnType<typeof locateEpubOffset>
>;

export function buildSelectionAnnotationContext(
  payload: AgentAnnotatePayload,
  agent: Agent,
  readingContext?: ReadingContextBundle,
): SelectionAnnotationContext | null {
  const index = payload.article.ebookIndex;
  const selection = payload.targetAnchor;
  if (!index || !selection) return null;

  const location = selectionLocation(index, payload.article.text, selection);
  const textRange = selectionTextRange(payload.article.text, selection, location);
  const base = selectionBaseContext(payload, agent, index, location, textRange, readingContext);
  const localWindow = {
    anchor: selection,
    blocks: localWindowBlocks(index, payload.article.text, location, selection, readingContext),
  };

  return {
    ...base,
    task: 'selection_annotation',
    selection,
    localWindow,
    nearbyAnnotations: nearbyAnnotationSummaries(
      payload.annotations || [],
      index,
      payload.article.text,
      location,
      textRange,
      readingContext,
    ),
    chapterMemory: chapterMemory(index, location),
  };
}

export function selectionAnnotationContextPrompt(context: SelectionAnnotationContext) {
  const packed = packReadingContext(context);
  if (packed.blocks.length === 0) return '';

  return `\n\nselection-first 上下文：\n${JSON.stringify(
    {
      book: {
        articleId: context.book.articleId,
        title: context.book.title,
        url: context.book.url,
      },
      location: context.location,
      blocks: packed.blocks.map((block) => ({
        id: block.id,
        source: block.source,
        truncated: block.truncated,
        text: block.text,
      })),
    },
    null,
    2,
  )}\n\n上下文使用规则：\n- 你可以用 selection-first 上下文理解目标选区的段落、章节位置和附近讨论。\n- 批注锚点仍必须保持为目标选区本身，不能扩展到上下文里的其他句子。\n- 如果附近批注与目标选区无关，忽略它。`;
}

function selectionBaseContext(
  payload: AgentAnnotatePayload,
  agent: Agent,
  index: EpubBookIndex,
  location: SelectionLocation | null,
  textRange: ReadingContextTextRange,
  readingContext: ReadingContextBundle | undefined,
): BaseReadingContext {
  return {
    book: {
      articleId: index.articleId,
      title: payload.article.title,
      url: payload.article.url,
      sourceType: 'ebook',
      textLength: index.textLength,
      ebookIndex: index,
    },
    location: {
      chapterId: location?.chapter.id,
      segmentId: location?.segment.id,
      paragraphId: location?.paragraph?.id,
      textRange,
      readerProgress: readingContext?.readerProgress || payload.readerProgress,
    },
    agent: {
      agentId: agent.id,
      agentUsername: agent.username,
      agentNickname: agent.nickname,
      readingIntent: payload.readingIntent,
    },
    budget: {
      maxTokens: SELECTION_CONTEXT_TOKEN_BUDGET,
      blockTypeOrder: ['selection', 'local_window', 'chapter_memory', 'nearby_annotation'],
      reserveTokensByType: {
        local_window: 3600,
        chapter_memory: 800,
        nearby_annotation: 1200,
      },
    },
    evidencePolicy: {
      spoilerPolicy: readingContext?.spoilerPolicy || selectionAnnotationSpoilerPolicy,
    },
  };
}

function selectionLocation(index: EpubBookIndex, articleText: string, selection: TextAnchor) {
  return (
    locateEpubTextAnchor(index, articleText, selection, {
      paragraphWindowSize: SELECTION_PARAGRAPH_WINDOW_SIZE,
    }) ||
    locateEpubOffset(index, anchorOffset(articleText, selection), {
      paragraphWindowSize: SELECTION_PARAGRAPH_WINDOW_SIZE,
    })
  );
}

function selectionTextRange(
  articleText: string,
  selection: TextAnchor,
  location: SelectionLocation | null,
): ReadingContextTextRange {
  if (location && location.textEnd > location.textStart) {
    return { textStart: location.textStart, textEnd: location.textEnd };
  }

  const textStart = anchorOffset(articleText, selection);
  const textEnd = clampInteger(
    numberValue(selection.textEndInBook) ?? selection.end,
    textStart,
    articleText.length,
  );
  return { textStart, textEnd };
}

function localWindowBlocks(
  index: EpubBookIndex,
  articleText: string,
  location: SelectionLocation | null,
  selection: TextAnchor,
  readingContext: ReadingContextBundle | undefined,
): SourceLabeledContextBlock[] {
  const paragraphBlocks =
    location?.paragraphWindow.flatMap((paragraph) =>
      paragraphContextBlocks(index, articleText, paragraph, readingContext),
    ) || [];
  if (paragraphBlocks.length > 0) return paragraphBlocks;

  const fallbackText = [selection.prefix, selection.exact, selection.suffix]
    .map((text) => text.trim())
    .filter(Boolean)
    .join('\n');
  return fallbackText
    ? [
        {
          id: `${index.articleId}:selection-fallback-window`,
          text: fallbackText,
          source: sourceLabel('local_window', index.articleId, {
            chapterId: selection.chapterId,
            segmentId: selection.segmentId,
            paragraphId: selection.paragraphId,
            source: 'anchor-context',
          }),
        },
      ]
    : [];
}

function paragraphContextBlocks(
  index: EpubBookIndex,
  articleText: string,
  paragraph: EpubParagraphIndex,
  readingContext: ReadingContextBundle | undefined,
) {
  const ranges = readingContext
    ? intersectTextRanges(readingContext.textRanges, {
        textStart: paragraph.textStart,
        textEnd: paragraph.textEnd,
      })
    : [{ textStart: paragraph.textStart, textEnd: paragraph.textEnd }];

  return ranges.flatMap((range, indexInParagraph) => {
    const text = articleText.slice(range.textStart, range.textEnd).trim();
    return text
      ? [
          {
            id: `${paragraph.id}:${indexInParagraph + 1}`,
            text,
            source: sourceLabel('local_window', index.articleId, {
              chapterId: paragraph.chapterId,
              segmentId: paragraph.segmentId,
              paragraphId: paragraph.id,
            }),
          },
        ]
      : [];
  });
}

function chapterMemory(
  index: EpubBookIndex,
  location: SelectionLocation | null,
): ChapterMemory | undefined {
  const chapter = location?.chapter;
  if (!chapter) return undefined;
  const segmentCount = chapter.segmentIds.length;
  const chapterTitle = chapter.title.trim();
  const summary = [
    chapterTitle ? `当前章节标题：《${chapterTitle}》。` : `当前阅读单元 ID：${chapter.id}。`,
    `结构：${chapter.textLength} 字符，${segmentCount} 个 segment。`,
    chapter.previewStart ? `章节开头预览：${chapter.previewStart}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    chapterId: chapter.id,
    summary,
    source: sourceLabel('chapter_memory', index.articleId, {
      chapterId: chapter.id,
      source: 'chapter-fallback-preview',
    }),
  };
}

function nearbyAnnotationSummaries(
  annotations: Annotation[],
  index: EpubBookIndex,
  articleText: string,
  targetLocation: SelectionLocation | null,
  targetRange: ReadingContextTextRange,
  readingContext: ReadingContextBundle | undefined,
): AnnotationSummary[] {
  if (!targetLocation) return [];
  const targetParagraphIds = new Set(
    targetLocation.paragraphWindow.map((paragraph) => paragraph.id),
  );

  return annotations
    .flatMap((annotation) => {
      const location = locateEpubTextAnchor(index, articleText, annotation.anchor);
      if (!location || location.chapter.id !== targetLocation.chapter.id) return [];
      if (
        !rangeAllowed({ textStart: location.textStart, textEnd: location.textEnd }, readingContext)
      ) {
        return [];
      }

      const distance = rangeDistance(targetRange, {
        textStart: location.textStart,
        textEnd: location.textEnd,
      });
      const sameWindow = Boolean(
        location.paragraph && targetParagraphIds.has(location.paragraph.id),
      );
      if (!sameWindow && location.segment.id !== targetLocation.segment.id && distance > 3000) {
        return [];
      }

      return [
        {
          annotation,
          distance,
          sameWindow,
          location,
        },
      ];
    })
    .toSorted((left, right) => {
      if (left.sameWindow !== right.sameWindow) return left.sameWindow ? -1 : 1;
      return left.distance - right.distance;
    })
    .slice(0, NEARBY_ANNOTATION_LIMIT)
    .map(({ annotation, distance, location }) => ({
      annotationId: annotation.id,
      anchor: annotation.anchor,
      text: annotationSummaryText(annotation),
      source: sourceLabel('nearby_annotation', index.articleId, {
        chapterId: location.chapter.id,
        segmentId: location.segment.id,
        paragraphId: location.paragraph?.id,
        score: distance === 0 ? 1 : Number((1 / (1 + distance)).toFixed(4)),
        source: 'nearby-anchor',
      }),
    }));
}

function annotationSummaryText(annotation: Annotation) {
  const comments = annotation.comments
    .filter((comment) => comment.content.trim())
    .slice(0, 3)
    .map((comment) => `${commentAuthorLabel(comment)}：${clipText(comment.content, 180)}`);

  return [
    `批注原文：${clipText(annotation.anchor.exact, 240)}`,
    `批注作者：${annotationAuthorLabel(annotation)}`,
    ...comments.map((comment, index) => `评论 ${index + 1}：${comment}`),
  ].join('\n');
}

function annotationAuthorLabel(annotation: Annotation) {
  if (annotation.author === 'ai') {
    return annotation.agentNickname || annotation.agentUsername || 'AI';
  }
  return annotation.userNickname || annotation.userUsername || '读者';
}

function commentAuthorLabel(comment: Annotation['comments'][number]) {
  if (comment.author === 'ai') {
    return comment.agentNickname || comment.agentUsername || 'AI';
  }
  return comment.userNickname || comment.userUsername || '读者';
}

function sourceLabel(
  type: ContextSourceLabel['type'],
  articleId: string,
  source: Omit<ContextSourceLabel, 'type' | 'articleId'> = {},
): ContextSourceLabel {
  return {
    type,
    articleId,
    ...source,
  };
}

function rangeAllowed(
  range: ReadingContextTextRange,
  readingContext: ReadingContextBundle | undefined,
) {
  return !readingContext || intersectTextRanges(readingContext.textRanges, range).length > 0;
}

function intersectTextRanges(ranges: ReadingContextTextRange[], target: ReadingContextTextRange) {
  return ranges.flatMap((range) => {
    const textStart = Math.max(range.textStart, target.textStart);
    const textEnd = Math.min(range.textEnd, target.textEnd);
    return textEnd > textStart ? [{ textStart, textEnd }] : [];
  });
}

function rangeDistance(left: ReadingContextTextRange, right: ReadingContextTextRange) {
  if (left.textStart < right.textEnd && right.textStart < left.textEnd) return 0;
  if (left.textEnd <= right.textStart) return right.textStart - left.textEnd;
  return left.textStart - right.textEnd;
}

function anchorOffset(articleText: string, selection: TextAnchor) {
  return clampInteger(
    numberValue(selection.textStartInBook) ?? selection.start,
    0,
    articleText.length,
  );
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function clipText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`;
}
