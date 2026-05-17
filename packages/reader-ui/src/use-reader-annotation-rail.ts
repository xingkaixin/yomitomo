import React from 'react';
import type { HighlightBox } from '@yomitomo/core';
import type { Annotation } from '@yomitomo/shared';
import { buildAnnotationRailItems } from './reader-utils';

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
  const annotationIdsSnapshotRef = React.useRef({
    articleId,
    ids: new Set(annotations.map((annotation) => annotation.id)),
  });
  const noteResizeObserverRef = React.useRef<ResizeObserver | null>(null);
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
    () => buildAnnotationRailItems(railAnnotations, boxes, activeId, noteHeights),
    [activeId, boxes, noteHeights, railAnnotations],
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
      updateNoteHeight(annotationId, element.getBoundingClientRect().height);

      if (typeof ResizeObserver === 'undefined') return;
      if (!noteResizeObserverRef.current) {
        noteResizeObserverRef.current = new ResizeObserver((entries) => {
          setNoteHeights((current) => {
            let next = current;
            for (const entry of entries) {
              const id = entry.target.getAttribute('data-annotation-id');
              const height = Math.ceil(entry.contentRect.height);
              if (!id || height <= 0 || current[id] === height) continue;
              if (next === current) next = { ...current };
              next[id] = height;
            }
            return next;
          });
        });
      }
      noteResizeObserverRef.current.observe(element);
    },
    [noteRefs, updateNoteHeight],
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
    const annotationIds = annotations.map((annotation) => annotation.id);
    const annotationIdSet = new Set(annotationIds);
    const previous = annotationIdsSnapshotRef.current;

    const sameArticleAnnotationIds =
      previous.articleId === articleId &&
      previous.ids.size === annotationIdSet.size &&
      annotationIds.every((id) => previous.ids.has(id));
    if (sameArticleAnnotationIds) return;

    if (previous.articleId !== articleId) {
      annotationIdsSnapshotRef.current = { articleId, ids: annotationIdSet };
      setExpandedPrimaryCommentIds((current) => (current.size === 0 ? current : new Set()));
      return;
    }

    const addedIds = annotationIds.filter((id) => !previous.ids.has(id));
    annotationIdsSnapshotRef.current = { articleId, ids: annotationIdSet };

    setExpandedPrimaryCommentIds((current) => {
      let changed = false;
      const next = new Set<string>();

      for (const id of current) {
        if (annotationIdSet.has(id)) next.add(id);
        else changed = true;
      }

      for (const id of addedIds) {
        if (next.has(id)) continue;
        next.add(id);
        changed = true;
      }

      return changed ? next : current;
    });
  }, [annotations, articleId]);

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

  React.useEffect(() => () => noteResizeObserverRef.current?.disconnect(), []);

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
