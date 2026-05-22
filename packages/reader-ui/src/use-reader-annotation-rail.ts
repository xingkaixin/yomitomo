import React from 'react';
import type { HighlightBox } from '@yomitomo/core';
import type { Annotation } from '@yomitomo/shared';
import { buildAnnotationRailItems, type AnnotationRailLayout } from './reader-utils';

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
  articleId: string;
  boxes: HighlightBox[];
  commentsCloseKey: number;
  filteredAnnotations: Annotation[];
  noteRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  onAnnotationLayoutChange?: () => void;
};

export type ReaderAnnotationRailState = {
  annotationRailItems: ReturnType<typeof buildAnnotationRailItems>;
  exitingAnnotationIds: Set<string>;
  expandedPrimaryCommentIds: Set<string>;
  noteRefForAnnotation: (annotationId: string) => (element: HTMLElement | null) => void;
  setPrimaryCommentExpanded: (annotationId: string, expanded: boolean) => void;
  visibleAnnotationIds: Set<string>;
  visibleAnnotations: Annotation[];
  visibleRailAnnotations: Annotation[];
};

export function useReaderAnnotationRail({
  activeId,
  annotationRailLayout,
  annotations,
  articleId,
  boxes,
  commentsCloseKey,
  filteredAnnotations,
  noteRefs,
  onAnnotationLayoutChange,
}: UseReaderAnnotationRailOptions): ReaderAnnotationRailState {
  const [railAnimation, setRailAnimation] = React.useState(() => ({
    ids: annotations.map((annotation) => annotation.id),
    exitingIds: new Set<string>(),
  }));
  const [noteHeights, setNoteHeights] = React.useState<Record<string, number>>({});
  const [expandedPrimaryCommentIds, setExpandedPrimaryCommentIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const noteElementsRef = React.useRef(new Map<string, HTMLElement>());
  const noteRefCallbacksRef = React.useRef(
    new Map<string, (element: HTMLElement | null) => void>(),
  );
  const pendingAutoExpandAnnotationIdsRef = React.useRef(new Set<string>());
  const sourceAnnotationIdsSnapshotRef = React.useRef({
    articleId,
    ids: new Set(filteredAnnotations.map((annotation) => annotation.id)),
  });
  const noteResizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const pendingNoteHeightsRef = React.useRef(new Map<string, number>());
  const noteHeightFrameRef = React.useRef(0);
  const registerNoteElementRef = React.useRef<
    (annotationId: string, element: HTMLElement | null) => void
  >(() => {});

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
  const annotationRailItems = React.useMemo(
    () =>
      buildAnnotationRailItems(railAnnotations, boxes, activeId, noteHeights, annotationRailLayout),
    [activeId, annotationRailLayout, boxes, noteHeights, railAnnotations],
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

  const setPrimaryCommentExpanded = React.useCallback((annotationId: string, expanded: boolean) => {
    setExpandedPrimaryCommentIds((current) => {
      if (current.has(annotationId) === expanded) return current;
      const next = new Set(current);
      if (expanded) next.add(annotationId);
      else next.delete(annotationId);
      return next;
    });
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

  React.useLayoutEffect(() => {
    const sourceAnnotationIds = filteredAnnotations.map((annotation) => annotation.id);
    const sourceAnnotationIdSet = new Set(sourceAnnotationIds);
    const renderedAnnotationIdSet = new Set(annotations.map((annotation) => annotation.id));
    const previous = sourceAnnotationIdsSnapshotRef.current;

    const sameArticleSourceAnnotationIds =
      previous.articleId === articleId &&
      previous.ids.size === sourceAnnotationIdSet.size &&
      sourceAnnotationIds.every((id) => previous.ids.has(id));

    if (previous.articleId !== articleId) {
      pendingAutoExpandAnnotationIdsRef.current.clear();
      sourceAnnotationIdsSnapshotRef.current = { articleId, ids: sourceAnnotationIdSet };
      setExpandedPrimaryCommentIds((current) => (current.size === 0 ? current : new Set()));
      return;
    }

    const addedIds = sameArticleSourceAnnotationIds
      ? []
      : sourceAnnotationIds.filter((id) => !previous.ids.has(id));
    if (!sameArticleSourceAnnotationIds) {
      sourceAnnotationIdsSnapshotRef.current = { articleId, ids: sourceAnnotationIdSet };
      for (const id of addedIds) pendingAutoExpandAnnotationIdsRef.current.add(id);
    }

    for (const id of pendingAutoExpandAnnotationIdsRef.current) {
      if (!sourceAnnotationIdSet.has(id)) pendingAutoExpandAnnotationIdsRef.current.delete(id);
    }

    const autoExpandIds = Array.from(pendingAutoExpandAnnotationIdsRef.current).filter((id) =>
      renderedAnnotationIdSet.has(id),
    );
    for (const id of autoExpandIds) pendingAutoExpandAnnotationIdsRef.current.delete(id);

    setExpandedPrimaryCommentIds((current) => {
      let changed = false;
      const next = new Set<string>();

      for (const id of current) {
        if (renderedAnnotationIdSet.has(id)) next.add(id);
        else changed = true;
      }

      for (const id of autoExpandIds) {
        if (next.has(id)) continue;
        next.add(id);
        changed = true;
      }

      return changed ? next : current;
    });
  }, [annotations, articleId, filteredAnnotations]);

  React.useEffect(() => {
    setExpandedPrimaryCommentIds((current) => (current.size === 0 ? current : new Set()));
  }, [commentsCloseKey]);

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
    onAnnotationLayoutChange?.();
  }, [annotationRailItems, noteHeights, onAnnotationLayoutChange]);

  return {
    annotationRailItems,
    exitingAnnotationIds: railAnimation.exitingIds,
    expandedPrimaryCommentIds,
    noteRefForAnnotation,
    setPrimaryCommentExpanded,
    visibleAnnotationIds,
    visibleAnnotations,
    visibleRailAnnotations,
  };
}
