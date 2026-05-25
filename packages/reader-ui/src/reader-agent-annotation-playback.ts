import type React from 'react';
import type { Annotation } from '@yomitomo/shared';
import { resolveTextAnchor } from '@yomitomo/shared';
import { annotationToPublicAgent as annotationToAgent } from '@yomitomo/core';
import { rangeFromOffsets, rangeHighlightBoxes, type HighlightBox } from '@yomitomo/core';
import type { VirtualCursorState } from './reader-types';
import { animateTheaterHighlight, sleep } from './reader-animation';
import type { VirtualReadingMode } from './reader-agent-virtual-reading';

type AgentAnnotationPlaybackOptions = {
  annotation: Annotation;
  articleRef: React.RefObject<HTMLElement | null>;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  annotationsRef: React.MutableRefObject<Annotation[]>;
  saveAnnotations: (annotations: Annotation[]) => void | Promise<void>;
  setActiveId: (annotationId: string) => void;
  setAgentTheaterBoxes: (boxes: HighlightBox[]) => void;
  getVirtualCursor: (agentId: string) => VirtualCursorState | undefined;
  getVirtualReadingMode: (agentId: string) => VirtualReadingMode | undefined;
  updateVirtualCursor: (agentId: string, cursor: VirtualCursorState | null) => void;
  finishVirtualReading: (agentId: string, suffix?: string) => void;
  readerLog: (event: string, data?: Record<string, unknown>) => void;
};

type PlaybackElements = {
  article: HTMLElement;
  canvas: HTMLDivElement;
  surface: HTMLDivElement;
};

type PlaybackRects = {
  firstRect: DOMRect;
  lastRect: DOMRect;
};

export type MergedAgentAnnotationResult = {
  activeId: string;
  annotations: Annotation[];
};

export function mergeAgentAnnotationAsThought(
  annotations: Annotation[],
  annotation: Annotation,
): MergedAgentAnnotationResult {
  const sameAnnotation = annotations.find((item) => item.id === annotation.id);
  if (sameAnnotation) {
    return { activeId: sameAnnotation.id, annotations };
  }

  const exactKey = annotationExactKey(annotation);
  const existing = exactKey
    ? annotations.find((item) => item.id !== annotation.id && annotationExactKey(item) === exactKey)
    : null;

  if (!existing) {
    return { activeId: annotation.id, annotations: [...annotations, annotation] };
  }

  const existingCommentIds = new Set(existing.comments.map((comment) => comment.id));
  const commentsToAppend: Annotation['comments'] = [];
  for (const comment of annotation.comments) {
    if (!comment.content.trim() || existingCommentIds.has(comment.id)) continue;
    commentsToAppend.push(Object.assign({}, comment, { replyTo: undefined }));
  }

  if (commentsToAppend.length === 0) {
    return { activeId: existing.id, annotations };
  }

  const nextAnnotations = annotations.map((item) =>
    item.id === existing.id
      ? {
          ...item,
          comments: [...item.comments, ...commentsToAppend],
          updatedAt:
            annotation.updatedAt || commentsToAppend.at(-1)?.createdAt || new Date().toISOString(),
        }
      : item,
  );

  return { activeId: existing.id, annotations: nextAnnotations };
}

export async function saveAgentAnnotationAsThought({
  annotation,
  annotationsRef,
  saveAnnotations,
}: Pick<
  AgentAnnotationPlaybackOptions,
  'annotation' | 'annotationsRef' | 'saveAnnotations'
>): Promise<string> {
  const result = mergeAgentAnnotationAsThought(annotationsRef.current, annotation);
  await saveAnnotations(result.annotations);
  return result.activeId;
}

export async function playAgentAnnotationPlayback({
  annotation,
  articleRef,
  canvasRef,
  surfaceRef,
  annotationsRef,
  saveAnnotations,
  setActiveId,
  setAgentTheaterBoxes,
  getVirtualCursor,
  getVirtualReadingMode,
  updateVirtualCursor,
  finishVirtualReading,
  readerLog,
}: AgentAnnotationPlaybackOptions) {
  const cursorAgent = annotationToAgent(annotation);
  const cursorId = annotationCursorId(annotation, cursorAgent?.id);
  const elements = playbackElements(articleRef, canvasRef, surfaceRef);
  if (!elements) {
    readerLog('agent.play.no_surface', { annotationId: annotation.id });
    await saveAgentAnnotationAsThought({ annotation, annotationsRef, saveAnnotations });
    return;
  }

  const range = playbackRange(elements.article, annotation, readerLog);
  if (!range) {
    await saveAgentAnnotationAsThought({ annotation, annotationsRef, saveAnnotations });
    return;
  }

  const rects = playbackRects(range);
  if (!rects) {
    readerLog('agent.play.range_empty', { annotationId: annotation.id });
    await saveAgentAnnotationAsThought({ annotation, annotationsRef, saveAnnotations });
    return;
  }

  const surfaceRect = elements.surface.getBoundingClientRect();
  if (!isRectVisibleInSurface(rects.firstRect, surfaceRect)) {
    await playOffscreenAnnotation({
      annotation,
      annotationsRef,
      cursorAgent,
      cursorId,
      firstRect: rects.firstRect,
      finishVirtualReading,
      getVirtualReadingMode,
      saveAnnotations,
      setActiveId,
      surfaceRect,
      updateVirtualCursor,
    });
    return;
  }

  await playVisibleAnnotation({
    annotation,
    annotationsRef,
    canvas: elements.canvas,
    cursorAgent,
    cursorId,
    firstRect: rects.firstRect,
    finishVirtualReading,
    getVirtualCursor,
    getVirtualReadingMode,
    lastRect: rects.lastRect,
    range,
    saveAnnotations,
    setActiveId,
    setAgentTheaterBoxes,
    updateVirtualCursor,
  });
}

function playbackElements(
  articleRef: React.RefObject<HTMLElement | null>,
  canvasRef: React.RefObject<HTMLDivElement | null>,
  surfaceRef: React.RefObject<HTMLDivElement | null>,
): PlaybackElements | null {
  const article = articleRef.current;
  const canvas = canvasRef.current;
  const surface = surfaceRef.current;
  return article && canvas && surface ? { article, canvas, surface } : null;
}

function playbackRange(
  article: HTMLElement,
  annotation: Annotation,
  readerLog: AgentAnnotationPlaybackOptions['readerLog'],
) {
  const position = resolveTextAnchor(article.textContent || '', annotation.anchor);
  if (!position) {
    readerLog('agent.play.anchor_unresolved', {
      annotationId: annotation.id,
      exact: annotation.anchor.exact.slice(0, 80),
    });
    return null;
  }

  const range = rangeFromOffsets(article, position.start, position.end);
  if (!range) readerLog('agent.play.range_missing', { annotationId: annotation.id });
  return range;
}

function playbackRects(range: Range): PlaybackRects | null {
  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width >= 2 && rect.height >= 2,
  );
  const firstRect = rects[0];
  const lastRect = rects[rects.length - 1];
  return firstRect && lastRect ? { firstRect, lastRect } : null;
}

function isRectVisibleInSurface(rect: DOMRect, surfaceRect: DOMRect) {
  return rect.bottom >= surfaceRect.top && rect.top <= surfaceRect.bottom;
}

function annotationExactKey(annotation: Annotation) {
  return annotation.anchor.exact.trim().replace(/\s+/g, ' ');
}

async function playOffscreenAnnotation({
  annotation,
  annotationsRef,
  cursorAgent,
  cursorId,
  firstRect,
  finishVirtualReading,
  getVirtualReadingMode,
  saveAnnotations,
  setActiveId,
  surfaceRect,
  updateVirtualCursor,
}: Pick<
  AgentAnnotationPlaybackOptions,
  | 'annotation'
  | 'annotationsRef'
  | 'finishVirtualReading'
  | 'getVirtualReadingMode'
  | 'saveAnnotations'
  | 'setActiveId'
  | 'updateVirtualCursor'
> & {
  cursorAgent: ReturnType<typeof annotationToAgent>;
  cursorId: string;
  firstRect: DOMRect;
  surfaceRect: DOMRect;
}) {
  const offscreen = firstRect.top < surfaceRect.top ? 'above' : 'below';
  updateVirtualCursor(cursorId, {
    id: cursorId,
    visible: true,
    x: surfaceRect.left + surfaceRect.width / 2,
    y: offscreen === 'above' ? surfaceRect.top + 18 : surfaceRect.bottom - 18,
    label: `${annotationAgentName(annotation)} 正在${offscreen === 'above' ? '上方' : '下方'}添加想法`,
    offscreen,
    agent: cursorAgent,
  });
  await sleep(700);
  const activeId = await saveAgentAnnotationAsThought({
    annotation,
    annotationsRef,
    saveAnnotations,
  });
  setActiveId(activeId);
  if (getVirtualReadingMode(cursorId) === 'target') finishVirtualReading(cursorId);
}

async function playVisibleAnnotation({
  annotation,
  annotationsRef,
  canvas,
  cursorAgent,
  cursorId,
  firstRect,
  finishVirtualReading,
  getVirtualCursor,
  getVirtualReadingMode,
  lastRect,
  range,
  saveAnnotations,
  setActiveId,
  setAgentTheaterBoxes,
  updateVirtualCursor,
}: Pick<
  AgentAnnotationPlaybackOptions,
  | 'annotation'
  | 'annotationsRef'
  | 'finishVirtualReading'
  | 'getVirtualCursor'
  | 'getVirtualReadingMode'
  | 'saveAnnotations'
  | 'setActiveId'
  | 'setAgentTheaterBoxes'
  | 'updateVirtualCursor'
> & {
  canvas: HTMLDivElement;
  cursorAgent: ReturnType<typeof annotationToAgent>;
  cursorId: string;
  firstRect: DOMRect;
  lastRect: DOMRect;
  range: Range;
}) {
  const cursor = getVirtualCursor(cursorId);
  const label = `${annotationAgentName(annotation)} 正在添加想法`;
  if (getVirtualReadingMode(cursorId) === 'target' && cursor) {
    updateVirtualCursor(cursorId, {
      ...cursor,
      label,
      offscreen: null,
      agent: cursorAgent,
    });
    await sleep(160);
  } else {
    updateVirtualCursor(cursorId, {
      id: cursorId,
      visible: true,
      x: firstRect.left,
      y: firstRect.top + firstRect.height / 2,
      label,
      offscreen: null,
      agent: cursorAgent,
    });
    await sleep(420);
  }

  const theaterBoxes = rangeHighlightBoxes(
    range,
    canvas.getBoundingClientRect(),
    `theater_${annotation.id}`,
  ).map((box) => Object.assign({}, box, { annotationId: annotation.id, color: annotation.color }));
  await animateTheaterHighlight(theaterBoxes, annotation.anchor.exact.length, (nextBoxes) => {
    const cursorBox = nextBoxes[nextBoxes.length - 1];
    if (cursorBox) {
      const canvasRect = canvas.getBoundingClientRect();
      updateVirtualCursor(cursorId, {
        id: cursorId,
        visible: true,
        x: canvasRect.left + cursorBox.left + cursorBox.width,
        y: canvasRect.top + cursorBox.top + cursorBox.height / 2,
        label,
        offscreen: null,
        agent: cursorAgent,
      });
    }
    setAgentTheaterBoxes(nextBoxes);
  });

  const activeId = await saveAgentAnnotationAsThought({
    annotation,
    annotationsRef,
    saveAnnotations,
  });
  setActiveId(activeId);
  setAgentTheaterBoxes([]);
  const currentMode = getVirtualReadingMode(cursorId);
  if (currentMode === 'target') {
    finishVirtualReading(cursorId);
    return;
  }
  updateVirtualCursor(cursorId, {
    id: cursorId,
    visible: true,
    x: lastRect.right,
    y: lastRect.top + lastRect.height / 2,
    label: `${annotationAgentName(annotation)} ${currentMode ? '继续阅读' : '想法已添加'}`,
    offscreen: null,
    agent: cursorAgent,
  });
  await sleep(360);
  if (!currentMode) finishVirtualReading(cursorId);
}

function annotationCursorId(annotation: Annotation, agentId?: string) {
  return agentId || annotation.agentId || annotation.agentUsername || annotation.id;
}

function annotationAgentName(annotation: Annotation) {
  return annotation.agentNickname || annotation.agentUsername || '助手';
}
