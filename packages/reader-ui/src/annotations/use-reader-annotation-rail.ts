import React from 'react';
import { useStableCallback } from '../hooks/use-stable-callback';
import type { HighlightBox } from '@yomitomo/core';
import type { Annotation } from '@yomitomo/shared';
import { buildAnnotationRailItems, type AnnotationRailLayout } from './annotation-rail-layout';
import { useInterval } from '../hooks/use-interval';
import { useMountEffect } from '../hooks/use-mount-effect';

const FILTERED_NOTE_EXIT_MS = 190;

function stringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function stringSetsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const item of left) {
    if (!right.has(item)) return false;
  }
  return true;
}

type RailState = {
  exitingIds: Set<string>;
  ids: string[];
  noteHeights: Record<string, number>;
  sourceIds: string[];
  visibleIds: string[];
};

type RailEvent =
  | { type: 'exitFinished' }
  | { type: 'noteDetached'; annotationId: string }
  | { type: 'noteHeightsMeasured'; heights: Iterable<[string, number]> }
  | { type: 'railAnnotationsChanged'; sourceIds: string[]; visibleIds: string[] };

function railReducer(state: RailState, event: RailEvent): RailState {
  switch (event.type) {
    case 'exitFinished': {
      const visibleIdSet = new Set(state.visibleIds);
      const ids = state.sourceIds.filter((id) => visibleIdSet.has(id));
      if (stringArraysEqual(state.ids, ids) && state.exitingIds.size === 0) return state;
      return { ...state, exitingIds: new Set(), ids };
    }
    case 'noteDetached': {
      if (!(event.annotationId in state.noteHeights)) return state;
      const noteHeights = { ...state.noteHeights };
      delete noteHeights[event.annotationId];
      return { ...state, noteHeights };
    }
    case 'noteHeightsMeasured': {
      let noteHeights = state.noteHeights;
      for (const [annotationId, height] of event.heights) {
        if (state.noteHeights[annotationId] === height) continue;
        if (noteHeights === state.noteHeights) noteHeights = { ...state.noteHeights };
        noteHeights[annotationId] = height;
      }
      return noteHeights === state.noteHeights ? state : { ...state, noteHeights };
    }
    case 'railAnnotationsChanged': {
      const sourceIdSet = new Set(event.sourceIds);
      const visibleIdSet = new Set(event.visibleIds);
      const currentIds = state.ids.length > 0 ? state.ids : event.sourceIds;
      const exitingIds = currentIds.filter((id) => sourceIdSet.has(id) && !visibleIdSet.has(id));
      const renderedIds = new Set([...event.visibleIds, ...exitingIds]);
      const ids = event.sourceIds.filter((id) => renderedIds.has(id));
      const nextExitingIds = new Set(exitingIds);
      const unchanged =
        stringArraysEqual(state.ids, ids) && stringSetsEqual(state.exitingIds, nextExitingIds);
      return {
        ...state,
        exitingIds: unchanged ? state.exitingIds : nextExitingIds,
        ids: unchanged ? state.ids : ids,
        sourceIds: event.sourceIds,
        visibleIds: event.visibleIds,
      };
    }
  }
}

function initialRailState({
  sourceIds,
  visibleIds,
}: {
  sourceIds: string[];
  visibleIds: string[];
}) {
  return railReducer(
    { exitingIds: new Set(), ids: sourceIds, noteHeights: {}, sourceIds, visibleIds },
    { type: 'railAnnotationsChanged', sourceIds, visibleIds },
  );
}

export type UseReaderAnnotationRailOptions = {
  activeId: string | null;
  annotationRailLayout?: AnnotationRailLayout;
  annotations: Annotation[];
  boxes: HighlightBox[];
  filteredAnnotations: Annotation[];
  noteRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  onAnnotationLayoutChange?: () => void;
};

export type ReaderAnnotationRailState = {
  annotationRailItems: ReturnType<typeof buildAnnotationRailItems>;
  exitingAnnotationIds: Set<string>;
  /** Attach to an element that contains the rail; reports rail layout changes after each commit. */
  layoutChangeRef: (element: HTMLElement | null) => void;
  noteRefForAnnotation: (annotationId: string) => (element: HTMLElement | null) => void;
  visibleAnnotationIds: Set<string>;
  visibleAnnotations: Annotation[];
  visibleRailAnnotations: Annotation[];
};

export function useReaderAnnotationRail({
  activeId,
  annotationRailLayout,
  annotations,
  boxes,
  filteredAnnotations,
  noteRefs,
  onAnnotationLayoutChange,
}: UseReaderAnnotationRailOptions): ReaderAnnotationRailState {
  const visibleAnnotations = filteredAnnotations;
  const visibleAnnotationIds = React.useMemo(
    () => new Set(visibleAnnotations.map((annotation) => annotation.id)),
    [visibleAnnotations],
  );
  const visibleRailAnnotations = React.useMemo(
    () => annotations.filter((annotation) => visibleAnnotationIds.has(annotation.id)),
    [annotations, visibleAnnotationIds],
  );
  const sourceIds = React.useMemo(
    () => annotations.map((annotation) => annotation.id),
    [annotations],
  );
  const visibleIds = React.useMemo(
    () => visibleRailAnnotations.map((annotation) => annotation.id),
    [visibleRailAnnotations],
  );
  const [rail, dispatch] = React.useReducer(
    railReducer,
    { sourceIds, visibleIds },
    initialRailState,
  );
  if (
    !stringArraysEqual(rail.sourceIds, sourceIds) ||
    !stringArraysEqual(rail.visibleIds, visibleIds)
  ) {
    dispatch({ type: 'railAnnotationsChanged', sourceIds, visibleIds });
  }
  const { exitingIds, ids: railIds, noteHeights } = rail;
  const noteElementsRef = React.useRef(new Map<string, HTMLElement>());
  const noteRefCallbacksRef = React.useRef(
    new Map<string, (element: HTMLElement | null) => void>(),
  );
  const noteResizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const pendingNoteHeightsRef = React.useRef(new Map<string, number>());
  const noteHeightFrameRef = React.useRef(0);
  const notifyAnnotationLayoutChange = useStableCallback(() => {
    onAnnotationLayoutChange?.();
  });

  const railAnnotationById = React.useMemo(
    () => new Map(annotations.map((annotation) => [annotation.id, annotation])),
    [annotations],
  );
  const railAnnotations = React.useMemo(
    () =>
      railIds
        .map((id) => railAnnotationById.get(id))
        .filter((annotation): annotation is Annotation => Boolean(annotation)),
    [railIds, railAnnotationById],
  );
  const documentAnnotationRailLayout = React.useMemo(() => {
    if (!annotationRailLayout) return undefined;
    const layout: AnnotationRailLayout = {
      articleCenterX: annotationRailLayout.articleCenterX,
      leftRailLeft: annotationRailLayout.leftRailLeft,
      mode: annotationRailLayout.mode,
      railWidth: annotationRailLayout.railWidth,
      rightRailLeft: annotationRailLayout.rightRailLeft,
    };
    if (annotationRailLayout.articleWidth !== undefined)
      layout.articleWidth = annotationRailLayout.articleWidth;
    return layout;
  }, [
    annotationRailLayout?.articleCenterX,
    annotationRailLayout?.articleWidth,
    annotationRailLayout?.leftRailLeft,
    annotationRailLayout?.mode,
    annotationRailLayout?.railWidth,
    annotationRailLayout?.rightRailLeft,
  ]);
  const annotationRailItems = React.useMemo(
    () =>
      buildAnnotationRailItems(
        railAnnotations,
        boxes,
        activeId,
        noteHeights,
        documentAnnotationRailLayout,
      ),
    [activeId, documentAnnotationRailLayout, boxes, noteHeights, railAnnotations],
  );

  useInterval(
    () => dispatch({ type: 'exitFinished' }),
    exitingIds.size > 0 ? FILTERED_NOTE_EXIT_MS : null,
  );

  useMountEffect(() => () => {
    noteResizeObserverRef.current?.disconnect();
    if (noteHeightFrameRef.current) window.cancelAnimationFrame(noteHeightFrameRef.current);
  });

  const flushPendingNoteHeights = React.useCallback(() => {
    noteHeightFrameRef.current = 0;
    if (pendingNoteHeightsRef.current.size === 0) return;

    const heights = pendingNoteHeightsRef.current;
    pendingNoteHeightsRef.current = new Map();
    dispatch({ type: 'noteHeightsMeasured', heights });
  }, []);

  const queueNoteHeight = React.useCallback(
    (annotationId: string, height: number) => {
      const nextHeight = Math.ceil(height);
      if (nextHeight <= 0) return;
      pendingNoteHeightsRef.current.set(annotationId, nextHeight);
      if (noteHeightFrameRef.current) return;
      noteHeightFrameRef.current = window.requestAnimationFrame(flushPendingNoteHeights);
    },
    [flushPendingNoteHeights],
  );

  const registerNoteElement = React.useCallback(
    (annotationId: string, element: HTMLElement | null) => {
      const existing = noteElementsRef.current.get(annotationId);
      if (existing && existing !== element) noteResizeObserverRef.current?.unobserve(existing);

      if (!element) {
        if (existing) noteResizeObserverRef.current?.unobserve(existing);
        noteElementsRef.current.delete(annotationId);
        noteRefCallbacksRef.current.delete(annotationId);
        noteRefs.current.delete(annotationId);
        pendingNoteHeightsRef.current.delete(annotationId);
        dispatch({ type: 'noteDetached', annotationId });
        return;
      }

      noteElementsRef.current.set(annotationId, element);
      noteRefs.current.set(annotationId, element);

      if (typeof ResizeObserver === 'undefined') {
        const height = Math.ceil(element.getBoundingClientRect().height);
        if (height > 0)
          dispatch({ type: 'noteHeightsMeasured', heights: [[annotationId, height]] });
        return;
      }
      if (!noteResizeObserverRef.current) {
        noteResizeObserverRef.current = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const id = entry.target.getAttribute('data-annotation-id');
            if (id) queueNoteHeight(id, entry.contentRect.height);
          }
        });
      }
      noteResizeObserverRef.current.observe(element);
    },
    [noteRefs, queueNoteHeight],
  );

  const noteRefForAnnotation = React.useCallback(
    (annotationId: string) => {
      const existing = noteRefCallbacksRef.current.get(annotationId);
      if (existing) return existing;

      const callback = (element: HTMLElement | null) => {
        registerNoteElement(annotationId, element);
      };
      noteRefCallbacksRef.current.set(annotationId, callback);
      return callback;
    },
    [registerNoteElement],
  );

  // Recreated when rail items or note heights change, so the layout is reported after that commit.
  const layoutChangeRef = React.useCallback(
    (element: HTMLElement | null) => {
      if (element) notifyAnnotationLayoutChange();
    },
    [annotationRailItems, noteHeights],
  );

  return {
    annotationRailItems,
    exitingAnnotationIds: exitingIds,
    layoutChangeRef,
    noteRefForAnnotation,
    visibleAnnotationIds,
    visibleAnnotations,
    visibleRailAnnotations,
  };
}
