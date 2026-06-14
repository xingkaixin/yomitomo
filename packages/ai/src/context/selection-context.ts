import type {
  Agent,
  AgentAnnotatePayload,
  AgentMessagePayload,
  Annotation,
  AnnotationSummary,
  BaseReadingContext,
  ChapterMemory,
  Comment,
  ContextSourceLabel,
  EpubBookIndex,
  EpubParagraphIndex,
  SelectionAnnotationContext,
  SelectionThreadContext,
  SourceLabeledContextBlock,
  ThreadMessageContext,
  TextAnchor,
} from '@yomitomo/shared';
import {
  locateEpubOffset,
  locateEpubTextAnchor,
  selectionAnnotationSpoilerPolicy,
  selectionThreadSpoilerPolicy,
  type ReadingContextBundle,
  type ReadingContextTextRange,
} from '@yomitomo/core';
import { packReadingContext } from './context-packing';
import { relatedPassagesFromReadingContext } from './related-passages';
import { memoryViewContextBlocks } from './reading-view-assembler';
import {
  annotationAuthorLabel,
  clampInteger,
  clippedThreadContextComments as clippedThreadContextCommentsByLimit,
  clipText,
  commentAuthorLabel,
  intersectTextRanges,
  numberValue,
  rangeAllowed,
  rangeDistance,
} from './selection-context-utils';

const SELECTION_PARAGRAPH_WINDOW_SIZE = 2;
const SELECTION_CONTEXT_TOKEN_BUDGET = 9000;
const THREAD_CONTEXT_TOKEN_BUDGET = 9000;
const NEARBY_ANNOTATION_LIMIT = 4;
const THREAD_CONTEXT_RECENT_LIMIT = 8;
const THREAD_MESSAGE_MAX_LENGTH = 700;

type SelectionLocation = NonNullable<ReturnType<typeof locateEpubTextAnchor>>;

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
    memoryViewBlocks: memoryViewContextBlocks(payload.readingMemoryView),
    nearbyAnnotations: nearbyAnnotationSummaries(
      payload.annotations || [],
      index,
      payload.article.text,
      location,
      textRange,
      readingContext,
    ),
    retrievedEvidence: relatedPassagesFromReadingContext(index, readingContext),
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
  )}\n\n上下文使用规则：\n- 你可以用 selection-first 上下文理解目标选区的段落、章节位置和附近讨论。\n- memory_view 是同篇文章内已有批注、讨论和共读记忆，只能作为理解读者/助手已有关注点的背景。\n- retrieved_evidence 是同章 lexical 召回，只能辅助理解目标选区，不能作为新锚点来源。\n- 批注锚点仍必须保持为目标选区本身，不能扩展到上下文里的其他句子。\n- 如果附近批注与目标选区无关，忽略它。`;
}

export function buildSelectionThreadContext(
  payload: AgentMessagePayload,
  readingContext?: ReadingContextBundle,
): SelectionThreadContext | null {
  const index = payload.article.ebookIndex;
  const selection = payload.annotation.anchor;
  if (!index || !selection.exact.trim()) return null;

  const location = selectionLocation(index, payload.article.text, selection);
  const textRange = selectionTextRange(payload.article.text, selection, location);

  return {
    ...threadBaseContext(payload, index, location, textRange, readingContext),
    task: 'selection_thread_reply',
    originalSelection: selection,
    localWindow: {
      anchor: selection,
      blocks: localWindowBlocks(index, payload.article.text, location, selection, readingContext),
    },
    thread: {
      annotationId: payload.annotation.id,
      messages: threadMessages(payload, index, location),
    },
    memoryViewBlocks: memoryViewContextBlocks(payload.readingMemoryView),
    retrievedEvidence: relatedPassagesFromReadingContext(index, readingContext),
  };
}

export function selectionThreadContextPrompt(context: SelectionThreadContext) {
  const packed = packReadingContext(context);
  if (packed.blocks.length === 0) return '';

  return `\n\nthread-first 上下文：\n${JSON.stringify(
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
  )}\n\n上下文使用规则：\n- 你正在回复同一条批注 thread，必须优先围绕 selection、local_window、thread 三类上下文判断。\n- selection 是原批注锚点；local_window 是它附近的原文依据；thread 是裁剪后的历史讨论和最新读者评论。\n- thread 中第一条 root 想法是这条批注讨论的原始想法；即使最新读者评论只是 @ 你，也要先理解并回应原始想法的作者和内容。\n- memory_view 是同篇文章内已有批注、讨论和共读记忆，只能作为相关背景，不能覆盖当前 thread。\n- retrieved_evidence 是同章 lexical 召回，用于补足章节内回指和相似术语。\n- 只有 thread 或 memory_view 明确提供证据时，才能声称自己或其他助手曾经批注、评论或表达过某个观点。\n- 回复必须能回到原文依据；不要把这次追问漂移成脱离原文的普通聊天。\n- 上下文里的原文、用户名和助手名保持原样引用；你的自然语言回复正文必须遵守回复语言设置。\n- 如果 thread 历史被裁剪，以当前提供的上下文为准，不要编造缺失讨论。`;
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
      blockTypeOrder: [
        'selection',
        'local_window',
        'memory_view',
        'retrieved_evidence',
        'chapter_memory',
        'nearby_annotation',
      ],
      reserveTokensByType: {
        local_window: 3600,
        memory_view: 1200,
        retrieved_evidence: 1200,
        chapter_memory: 800,
        nearby_annotation: 1200,
      },
    },
    evidencePolicy: {
      spoilerPolicy: readingContext?.spoilerPolicy || selectionAnnotationSpoilerPolicy,
    },
  };
}

function threadBaseContext(
  payload: AgentMessagePayload,
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
      agentId: payload.agentId,
      agentUsername: payload.agentUsername,
      readingIntent: payload.readingIntent,
    },
    budget: {
      maxTokens: THREAD_CONTEXT_TOKEN_BUDGET,
      blockTypeOrder: ['selection', 'local_window', 'thread', 'memory_view', 'retrieved_evidence'],
      reserveTokensByType: {
        local_window: 3600,
        thread: 2600,
        memory_view: 1200,
        retrieved_evidence: 1200,
      },
    },
    evidencePolicy: {
      spoilerPolicy:
        readingContext?.spoilerPolicy || payload.spoilerPolicy || selectionThreadSpoilerPolicy,
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

function threadMessages(
  payload: AgentMessagePayload,
  index: EpubBookIndex,
  location: SelectionLocation | null,
): ThreadMessageContext[] {
  const comments = threadContextComments(
    payload.annotation.comments,
    payload.userComment,
    payload.reviewTargetCommentId || payload.userComment.replyTo,
  );
  return comments.map((comment) => ({
    commentId: comment.id,
    author: comment.author,
    text: `${commentAuthorLabel(comment)}：${clipText(comment.content, THREAD_MESSAGE_MAX_LENGTH)}`,
    source: sourceLabel('thread', index.articleId, {
      chapterId: location?.chapter.id || payload.annotation.anchor.chapterId,
      segmentId: location?.segment.id || payload.annotation.anchor.segmentId,
      paragraphId: location?.paragraph?.id || payload.annotation.anchor.paragraphId,
      source: comment.id === payload.userComment.id ? 'latest-user-comment' : 'thread-comment',
    }),
  }));
}

function threadContextComments(
  comments: Comment[],
  userComment: Comment,
  rootCommentId: string | undefined,
) {
  const merged = comments.some((comment) => comment.id === userComment.id)
    ? comments
    : [...comments, userComment];
  if (!rootCommentId) return clippedThreadContextComments(merged);
  const root = merged.find((comment) => comment.id === rootCommentId);
  const resolvedRootId = root?.replyTo || root?.id || rootCommentId;
  const focused = merged.filter(
    (comment) =>
      comment.content.trim() &&
      (comment.id === resolvedRootId || comment.replyTo === resolvedRootId),
  );
  const nonEmpty =
    focused.length > 0 ? focused : merged.filter((comment) => comment.content.trim());
  return clippedThreadContextComments(nonEmpty);
}

function clippedThreadContextComments(comments: Comment[]) {
  return clippedThreadContextCommentsByLimit(comments, THREAD_CONTEXT_RECENT_LIMIT);
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

function anchorOffset(articleText: string, selection: TextAnchor) {
  return clampInteger(
    numberValue(selection.textStartInBook) ?? selection.start,
    0,
    articleText.length,
  );
}
