import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { HighlightBox } from '@yomitomo/core';
import { recordRendererPerformanceTiming } from '../../shell/app-renderer-performance';
import {
  annotationRailDebugBoxGroups,
  annotationRailDebugNumber,
  annotationRailDebugRect,
  annotationRailDebugStyleNumber,
  type AnnotationRailDebugBoxGroup,
  webAnnotationRailDebugEnabled,
  WEB_ANNOTATION_RAIL_DEBUG_INTERVAL_MS,
  WEB_ANNOTATION_RAIL_DEBUG_OVERSCAN,
  WEB_ANNOTATION_RAIL_DEBUG_SAMPLE_LIMIT,
} from './web-annotation-rail-debug';

type UseWebAnnotationRailDiagnosticsInput = {
  articleId: string;
  boxes: HighlightBox[];
  canvasRef: RefObject<HTMLDivElement | null>;
  railRef: RefObject<HTMLElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  selectedAnnotationId: string | null;
};

type AnnotationRailViewport = {
  bottom: number;
  height: number;
  top: number;
};

export function useWebAnnotationRailDiagnostics({
  articleId,
  boxes,
  canvasRef,
  railRef,
  scrollRef,
  selectedAnnotationId,
}: UseWebAnnotationRailDiagnosticsInput) {
  const lastLogAtRef = useRef(0);

  useLayoutEffect(() => {
    if (!webAnnotationRailDebugEnabled()) return;

    const scrollElement = scrollRef.current;
    const canvasElement = canvasRef.current;
    const railElement = railRef.current;
    if (!scrollElement || !canvasElement || !railElement) return;

    let frame = 0;
    const recordLayout = () => {
      frame = 0;
      const now = performance.now();
      if (now - lastLogAtRef.current < WEB_ANNOTATION_RAIL_DEBUG_INTERVAL_MS) return;
      lastLogAtRef.current = now;
      recordAnnotationRailLayout({
        articleId,
        boxes,
        canvasElement,
        railElement,
        scrollElement,
        selectedAnnotationId,
      });
    };
    const scheduleLayoutRecord = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(recordLayout);
    };
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleLayoutRecord);

    scheduleLayoutRecord();
    scrollElement.addEventListener('scroll', scheduleLayoutRecord, { passive: true });
    window.addEventListener('resize', scheduleLayoutRecord);
    resizeObserver?.observe(scrollElement);
    resizeObserver?.observe(canvasElement);
    resizeObserver?.observe(railElement);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      scrollElement.removeEventListener('scroll', scheduleLayoutRecord);
      window.removeEventListener('resize', scheduleLayoutRecord);
      resizeObserver?.disconnect();
    };
  }, [articleId, boxes, canvasRef, railRef, scrollRef, selectedAnnotationId]);
}

function recordAnnotationRailLayout({
  articleId,
  boxes,
  canvasElement,
  railElement,
  scrollElement,
  selectedAnnotationId,
}: {
  articleId: string;
  boxes: HighlightBox[];
  canvasElement: HTMLDivElement;
  railElement: HTMLElement;
  scrollElement: HTMLDivElement;
  selectedAnnotationId: string | null;
}) {
  const canvasRect = canvasElement.getBoundingClientRect();
  const scrollRect = scrollElement.getBoundingClientRect();
  const railRect = railElement.getBoundingClientRect();
  const viewport = annotationRailViewport(scrollElement, canvasElement);
  const boxGroups = annotationRailDebugBoxGroups(boxes);
  const noteElements = Array.from(
    railElement.querySelectorAll<HTMLElement>('.reader-note[data-annotation-id]'),
  );

  recordRendererPerformanceTiming('reader_annotation_rail_layout', {
    articleId,
    canvasOffsetTop: annotationRailDebugNumber(canvasElement.offsetTop),
    canvasRect: annotationRailDebugRect(canvasRect),
    noteCount: noteElements.length,
    railRect: annotationRailDebugRect(railRect),
    scroll: {
      clientHeight: annotationRailDebugNumber(scrollElement.clientHeight),
      scrollHeight: annotationRailDebugNumber(scrollElement.scrollHeight),
      scrollTop: annotationRailDebugNumber(scrollElement.scrollTop),
    },
    selectedAnnotationId,
    viewport: {
      bottom: annotationRailDebugNumber(viewport.bottom),
      height: annotationRailDebugNumber(viewport.height),
      top: annotationRailDebugNumber(viewport.top),
    },
    visibleAnchorCount: Array.from(boxGroups.values()).filter(
      (group) => group.top <= viewport.bottom && group.bottom >= viewport.top,
    ).length,
    notes: annotationRailDebugNotes(noteElements, boxGroups, canvasRect, scrollRect, viewport),
  });
}

function annotationRailViewport(
  scrollElement: HTMLDivElement,
  canvasElement: HTMLDivElement,
): AnnotationRailViewport {
  const top = Math.max(0, Math.round(scrollElement.scrollTop - canvasElement.offsetTop));
  const height = Math.max(0, Math.round(scrollElement.clientHeight));
  return { bottom: top + height, height, top };
}

function annotationRailDebugNotes(
  noteElements: HTMLElement[],
  boxGroups: Map<string, AnnotationRailDebugBoxGroup>,
  canvasRect: DOMRect,
  scrollRect: DOMRect,
  viewport: AnnotationRailViewport,
) {
  return noteElements
    .map((note) => {
      const annotationId = note.dataset.annotationId || '';
      const rect = note.getBoundingClientRect();
      const computed = window.getComputedStyle(note);
      const anchor = boxGroups.get(annotationId) ?? null;
      return {
        actualBottom: annotationRailDebugNumber(rect.bottom - canvasRect.top),
        actualTop: annotationRailDebugNumber(rect.top - canvasRect.top),
        actualViewportTop: annotationRailDebugNumber(rect.top - scrollRect.top),
        anchorBottom: annotationRailDebugNumber(anchor?.bottom),
        anchorNearViewport: anchor
          ? anchor.top <= viewport.bottom + WEB_ANNOTATION_RAIL_DEBUG_OVERSCAN &&
            anchor.bottom >= viewport.top - WEB_ANNOTATION_RAIL_DEBUG_OVERSCAN
          : null,
        anchorTop: annotationRailDebugNumber(anchor?.top),
        anchorVisible: anchor
          ? anchor.top <= viewport.bottom && anchor.bottom >= viewport.top
          : null,
        classes: note.className,
        id: annotationId,
        inlineTop: annotationRailDebugStyleNumber(note.style.top || computed.top),
        railSide: note.dataset.railSide ?? null,
        stackCount: note.dataset.stackCount ?? null,
        stackIndex: note.dataset.stackIndex ?? null,
        transform: computed.transform === 'none' ? 'none' : computed.transform,
      };
    })
    .toSorted((left, right) => (left.actualTop ?? 0) - (right.actualTop ?? 0))
    .slice(0, WEB_ANNOTATION_RAIL_DEBUG_SAMPLE_LIMIT);
}
