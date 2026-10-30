import { useCallback, useReducer, type RefObject } from 'react';
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

type ActiveConnectionEvent = { type: 'connectionMeasured'; connection: ActiveConnection | null };

function activeConnectionReducer(
  current: ActiveConnection | null,
  event: ActiveConnectionEvent,
): ActiveConnection | null {
  const next = event.connection;
  if (current === next) return current;
  if (current && next && current.path === next.path && current.color === next.color) {
    return current;
  }
  return next;
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
  const [activeConnection, dispatch] = useReducer(activeConnectionReducer, null);

  const recalculateActiveConnection = useCallback(() => {
    dispatch({
      type: 'connectionMeasured',
      connection: measureActiveConnection({
        annotationAgents,
        annotations,
        boxes,
        canvasElement: canvasRef.current,
        noteElement: selectedAnnotationId ? noteRefs.current.get(selectedAnnotationId) : undefined,
        readerElement: readerRootRef.current,
        scrollElement: surfaceRef.current,
        selectedAnnotationId,
        userProfile,
      }),
    });
  }, [
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

  // Identity follows the connection inputs, so a ref callback built on it re-measures and re-subscribes after those commits.
  const trackActiveConnection = useCallback(() => {
    const scrollElement = surfaceRef.current;
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(recalculateActiveConnection);
    };

    recalculateActiveConnection();
    scrollElement?.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      scrollElement?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [recalculateActiveConnection, surfaceRef]);

  return { activeConnection, recalculateActiveConnection, trackActiveConnection };
}

function measureActiveConnection({
  annotationAgents,
  annotations,
  boxes,
  canvasElement,
  noteElement,
  readerElement,
  scrollElement,
  selectedAnnotationId,
  userProfile,
}: {
  annotationAgents: PublicAgent[];
  annotations: Annotation[];
  boxes: HighlightBox[];
  canvasElement: HTMLDivElement | null;
  noteElement: HTMLElement | undefined;
  readerElement: HTMLDivElement | null;
  scrollElement: HTMLElement | null;
  selectedAnnotationId: string | null;
  userProfile: UserProfile;
}): ActiveConnection | null {
  if (!selectedAnnotationId) return null;

  const annotation = annotations.find((item) => item.id === selectedAnnotationId);
  const activeBoxes = boxes.filter((box) => box.annotationId === selectedAnnotationId);
  if (
    !canvasElement ||
    !scrollElement ||
    !noteElement ||
    !annotation ||
    !readerElement ||
    activeBoxes.length === 0
  ) {
    return null;
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
  if (!box) return null;

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
  if (!highlightVisible || !noteVisible) return null;

  return {
    path: buildAnnotationConnectionPath(startX, startY, endX, endY),
    color: annotationColor(annotation, userProfile, annotationAgents),
  };
}
