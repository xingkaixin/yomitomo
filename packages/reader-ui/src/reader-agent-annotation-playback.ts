import type React from 'react';
import type { Annotation } from '@yomitomo/shared';
import { resolveTextAnchor } from '@yomitomo/shared';
import { annotationToPublicAgent as annotationToAgent } from '@yomitomo/core';
import { rangeFromOffsets, rangeHighlightBoxes, type HighlightBox } from '@yomitomo/core';
import type { VirtualCursorState } from './reader-types';
import { animateTheaterHighlight, sleep } from './reader-utils';
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
  const article = articleRef.current;
  const canvas = canvasRef.current;
  const surface = surfaceRef.current;
  const cursorAgent = annotationToAgent(annotation);
  const cursorId =
    cursorAgent?.id || annotation.agentId || annotation.agentUsername || annotation.id;
  if (!article || !canvas || !surface) {
    readerLog('agent.play.no_surface', { annotationId: annotation.id });
    await saveAnnotations([...annotationsRef.current, annotation]);
    return;
  }

  const position = resolveTextAnchor(article.textContent || '', annotation.anchor);
  if (!position) {
    readerLog('agent.play.anchor_unresolved', {
      annotationId: annotation.id,
      exact: annotation.anchor.exact.slice(0, 80),
    });
    await saveAnnotations([...annotationsRef.current, annotation]);
    return;
  }

  const range = rangeFromOffsets(article, position.start, position.end);
  if (!range) {
    readerLog('agent.play.range_missing', { annotationId: annotation.id });
    await saveAnnotations([...annotationsRef.current, annotation]);
    return;
  }

  const rects = Array.from(range.getClientRects()).filter(
    (rect) => rect.width >= 2 && rect.height >= 2,
  );
  const firstRect = rects[0];
  const lastRect = rects[rects.length - 1];
  if (!firstRect || !lastRect) return;

  const surfaceRect = surface.getBoundingClientRect();
  const isVisible = firstRect.bottom >= surfaceRect.top && firstRect.top <= surfaceRect.bottom;
  if (!isVisible) {
    updateVirtualCursor(cursorId, {
      id: cursorId,
      visible: true,
      x: surfaceRect.left + surfaceRect.width / 2,
      y: firstRect.top < surfaceRect.top ? surfaceRect.top + 18 : surfaceRect.bottom - 18,
      label: `${annotation.agentNickname || annotation.agentUsername || '助手'} 正在${firstRect.top < surfaceRect.top ? '上方' : '下方'}批注`,
      offscreen: firstRect.top < surfaceRect.top ? 'above' : 'below',
      agent: cursorAgent,
    });
    await sleep(700);
    await saveAnnotations([...annotationsRef.current, annotation]);
    setActiveId(annotation.id);
    if (getVirtualReadingMode(cursorId) === 'target') {
      finishVirtualReading(cursorId);
    }
    return;
  }

  const cursor = getVirtualCursor(cursorId);
  if (getVirtualReadingMode(cursorId) === 'target' && cursor) {
    updateVirtualCursor(cursorId, {
      ...cursor,
      label: `${annotation.agentNickname || annotation.agentUsername || '助手'} 正在批注`,
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
      label: `${annotation.agentNickname || annotation.agentUsername || '助手'} 正在批注`,
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
        label: `${annotation.agentNickname || annotation.agentUsername || '助手'} 正在批注`,
        offscreen: null,
        agent: cursorAgent,
      });
    }
    setAgentTheaterBoxes(nextBoxes);
  });

  await saveAnnotations([...annotationsRef.current, annotation]);
  setActiveId(annotation.id);
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
    label: `${annotation.agentNickname || annotation.agentUsername || '助手'} ${currentMode ? '继续阅读' : '批注完成'}`,
    offscreen: null,
    agent: cursorAgent,
  });
  await sleep(360);
  if (!currentMode) finishVirtualReading(cursorId);
}
