import React from 'react';
import type { HighlightBox } from '@yomitomo/core';
import type { Annotation } from '@yomitomo/shared';
import { buildAnnotationRailItems, type AnnotationRailLayout } from './annotation-rail-layout';

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
  const [railAnimation, setRailAnimation] = React.useState(() => ({
    ids: annotations.map((annotation) => annotation.id),
    exitingIds: new Set<string>(),
  }));
  const [noteHeights, setNoteHeights] = React.useState<Record<string, number>>({});
  const noteElementsRef = React.useRef(new Map<string, HTMLElement>());
  const noteRefCallbacksRef = React.useRef(
    new Map<string, (element: HTMLElement | null) => void>(),
  );
  const noteResizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const pendingNoteHeightsRef = React.useRef(new Map<string, number>());
  const noteHeightFrameRef = React.useRef(0);
  const registerNoteElementRef = React.useRef<
    (annotationId: string, element: HTMLElement | null) => void
  >(() => {});
  const notifyAnnotationLayoutChange = React.useEffectEvent(() => {
    onAnnotationLayoutChange?.();
  });

  const visibleAnnotations = filteredAnnotations;
  const visibleAnnotationIds = React.useMemo(
    () => new Set(visibleAnnotations.map((annotation) => annotation.id)),
    [visibleAnnotations],
  );
  const visibleRailAnnotations = React.useMemo(
    () => annotations.filter((annotation) => visibleAnnotationIds.has(annotation.id)),
    [annotations, visibleAnnotationIds],
  );
  const railAnnotationById = React.useMemo(
    () => new Map(annotations.map((annotation) => [annotation.id, annotation])),
    [annotations],
  );
  const railAnnotations = React.useMemo(
    () =>
      railAnimation.ids
        .map((id) => railAnnotationById.get(id))
        .filter((annotation): annotation is Annotation => Boolean(annotation)),
    [railAnimation.ids, railAnnotationById],
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

  const flushPendingNoteHeights = React.useCallback(() => {
    noteHeightFrameRef.current = 0;
    if (pendingNoteHeightsRef.current.size === 0) return;

    const measuredHeights = pendingNoteHeightsRef.current;
    pendingNoteHeightsRef.current = new Map();
    setNoteHeights((current) => {
      let next = current;
      for (const [annotationId, height] of measuredHeights) {
        if (current[annotationId] === height) continue;
        if (next === current) next = { ...current };
        next[annotationId] = height;
      }
      return next;
    });
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

  const updateNoteHeight = React.useCallback((annotationId: string, height: number) => {
    const nextHeight = Math.ceil(height);
    if (nextHeight <= 0) return;
    setNoteHeights((current) =>
      current[annotationId] === nextHeight ? current : { ...current, [annotationId]: nextHeight },
    );
  }, []);

  const registerNoteElement = React.useCallback(
    (annotationId: string, element: HTMLElement | null) => {
      const existing = noteElementsRef.current.get(annotationId);
      if (existing && existing !== element) noteResizeObserverRef.current?.unobserve(existing);

      if (!element) {
        if (existing) noteResizeObserverRef.current?.unobserve(existing);
        noteElementsRef.current.delete(annotationId);
        noteRefs.current.delete(annotationId);
        pendingNoteHeightsRef.current.delete(annotationId);
        setNoteHeights((current) => {
          if (!(annotationId in current)) return current;
          const next = { ...current };
          delete next[annotationId];
          return next;
        });
        return;
      }

      noteElementsRef.current.set(annotationId, element);
      noteRefs.current.set(annotationId, element);

      if (typeof ResizeObserver === 'undefined') {
        updateNoteHeight(annotationId, element.getBoundingClientRect().height);
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
    [noteRefs, queueNoteHeight, updateNoteHeight],
  );

  registerNoteElementRef.current = registerNoteElement;

  const noteRefForAnnotation = React.useCallback((annotationId: string) => {
    const existing = noteRefCallbacksRef.current.get(annotationId);
    if (existing) return existing;

    const callback = (element: HTMLElement | null) => {
      registerNoteElementRef.current(annotationId, element);
    };
    noteRefCallbacksRef.current.set(annotationId, callback);
    return callback;
  }, []);

  React.useEffect(() => {
    const sourceIds = annotations.map((annotation) => annotation.id);
    const sourceIdSet = new Set(sourceIds);
    const visibleIds = visibleRailAnnotations.map((annotation) => annotation.id);
    const visibleIdSet = new Set(visibleIds);

    setRailAnimation((current) => {
      const currentIds = current.ids.length > 0 ? current.ids : sourceIds;
      const exitingIds = currentIds.filter((id) => sourceIdSet.has(id) && !visibleIdSet.has(id));
      const renderedIds = new Set([...visibleIds, ...exitingIds]);
      const nextIds = sourceIds.filter((id) => renderedIds.has(id));
      const nextExitingIds = new Set(exitingIds);
      if (
        stringArraysEqual(current.ids, nextIds) &&
        stringSetsEqual(current.exitingIds, nextExitingIds)
      ) {
        return current;
      }
      return {
        ids: nextIds,
        exitingIds: nextExitingIds,
      };
    });

    const timeout = window.setTimeout(() => {
      setRailAnimation((current) => {
        const nextIds = sourceIds.filter((id) => visibleIdSet.has(id));
        if (stringArraysEqual(current.ids, nextIds) && current.exitingIds.size === 0) {
          return current;
        }
        return {
          ids: nextIds,
          exitingIds: new Set(),
        };
      });
    }, FILTERED_NOTE_EXIT_MS);

    return () => window.clearTimeout(timeout);
  }, [annotations, visibleRailAnnotations]);

  React.useEffect(() => {
    const visibleIds = new Set(railAnnotations.map((annotation) => annotation.id));
    for (const annotationId of noteRefCallbacksRef.current.keys()) {
      if (!visibleIds.has(annotationId)) noteRefCallbacksRef.current.delete(annotationId);
    }
    setNoteHeights((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([annotationId]) => visibleIds.has(annotationId)),
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [railAnnotations]);

  React.useEffect(
    () => () => {
      noteResizeObserverRef.current?.disconnect();
      if (noteHeightFrameRef.current) window.cancelAnimationFrame(noteHeightFrameRef.current);
    },
    [],
  );

  React.useLayoutEffect(() => {
    notifyAnnotationLayoutChange();
  }, [annotationRailItems, noteHeights]);

  return {
    annotationRailItems,
    exitingAnnotationIds: railAnimation.exitingIds,
    noteRefForAnnotation,
    visibleAnnotationIds,
    visibleAnnotations,
    visibleRailAnnotations,
  };
}
