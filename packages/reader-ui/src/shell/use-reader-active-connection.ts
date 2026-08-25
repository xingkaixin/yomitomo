import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import { annotationColor, type HighlightBox } from '@yomitomo/core';
import { buildAnnotationConnectionPath } from '../reader-connection-path';
import type { ActiveConnection } from '../reader-types';

type UseReaderActiveConnectionInput = {
  annotationAgents: PublicAgent[];
  annotations: Annotation[];
  boxes: HighlightBox[];
  canvasRef: RefObject<HTMLDivElement | null>;
  noteRefs: RefObject<Map<string, HTMLElement>>;
  readerRootRef: RefObject<HTMLDivElement | null>;
  selectedAnnotationId: string | null;
  surfaceRef: RefObject<HTMLElement | null>;
  userProfile: UserProfile;
};

const noteConnectionTargetOffset = 34;

function connectionTargetForNote(noteElement: HTMLElement, readerRect: DOMRect) {
  const noteRect = noteElement.getBoundingClientRect();
  const side = noteElement.dataset.railSide === 'left' ? 'left' : 'right';
  return {
    side,
    x: (side === 'left' ? noteRect.right : noteRect.left) - readerRect.left,
    y: noteRect.top - readerRect.top + Math.min(noteConnectionTargetOffset, noteRect.height / 2),
  };
}

export function useReaderActiveConnection({
  annotationAgents,
  annotations,
  boxes,
  canvasRef,
  noteRefs,
  readerRootRef,
  selectedAnnotationId,
  surfaceRef,
  userProfile,
}: UseReaderActiveConnectionInput) {
  const [activeConnection, setActiveConnection] = useState<ActiveConnection | null>(null);

  const recalculateActiveConnection = useCallback(() => {
    const clearActiveConnection = () => {
      if (activeConnection !== null) setActiveConnection(null);
    };

    if (!selectedAnnotationId) {
      clearActiveConnection();
      return;
    }

    const canvasElement = canvasRef.current;
    const scrollElement = surfaceRef.current;
    const noteElement = noteRefs.current.get(selectedAnnotationId);
    const annotation = annotations.find((item) => item.id === selectedAnnotationId);
    const activeBoxes = boxes.filter((box) => box.annotationId === selectedAnnotationId);
    const readerElement = readerRootRef.current;
    if (
      !canvasElement ||
      !scrollElement ||
      !noteElement ||
      !annotation ||
      !readerElement ||
      activeBoxes.length === 0
    ) {
      clearActiveConnection();
      return;
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const readerRect = readerElement.getBoundingClientRect();
    const scrollRect = scrollElement.getBoundingClientRect();
    const noteRect = noteElement.getBoundingClientRect();
    const noteTarget = connectionTargetForNote(noteElement, readerRect);
    const noteY = noteTarget.y;
    const box = activeBoxes.toSorted((left, right) => {
      const leftY = canvasRect.top - readerRect.top + left.top + left.height / 2;
      const rightY = canvasRect.top - readerRect.top + right.top + right.height / 2;
      return Math.abs(leftY - noteY) - Math.abs(rightY - noteY);
    })[0];
    if (!box) {
      clearActiveConnection();
      return;
    }

    const startX =
      canvasRect.left -
      readerRect.left +
      (noteTarget.side === 'left' ? box.left - 6 : box.left + box.width + 6);
    const startY = canvasRect.top - readerRect.top + box.top + box.height / 2;
    const endX = noteTarget.x + (noteTarget.side === 'left' ? 8 : -8);
    const endY = noteY;
    const highlightViewportY = readerRect.top + startY;
    const highlightVisible =
      highlightViewportY >= scrollRect.top - 24 && highlightViewportY <= scrollRect.bottom + 24;
    const noteVisible =
      noteRect.bottom >= scrollRect.top + 24 && noteRect.top <= scrollRect.bottom - 24;
    if (!highlightVisible || !noteVisible) {
      clearActiveConnection();
      return;
    }

    const path = buildAnnotationConnectionPath(startX, startY, endX, endY);
    const color = annotationColor(annotation, userProfile, annotationAgents);
    setActiveConnection((current) =>
      current?.path === path && current.color === color ? current : { path, color },
    );
  }, [
    activeConnection,
    annotationAgents,
    annotations,
    boxes,
    canvasRef,
    noteRefs,
    readerRootRef,
    selectedAnnotationId,
    surfaceRef,
    userProfile,
  ]);

  useLayoutEffect(() => {
    recalculateActiveConnection();
  }, [annotations, boxes, recalculateActiveConnection]);

  useEffect(() => {
    const scrollElement = surfaceRef.current;
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(recalculateActiveConnection);
    };

    scrollElement?.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      scrollElement?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [recalculateActiveConnection, surfaceRef]);

  return { activeConnection, recalculateActiveConnection };
}
