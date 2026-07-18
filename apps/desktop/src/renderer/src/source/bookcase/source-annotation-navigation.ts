import type { Annotation } from '@yomitomo/shared';
import type { HighlightBox } from '@yomitomo/core';
import { annotationNavigationForReferenceIndex } from '@yomitomo/reader-ui/reader-navigation';

export function navigationForActiveAnnotation(annotations: Annotation[], activeId: string | null) {
  if (!activeId) return null;
  const activeIndex = annotations.findIndex((annotation) => annotation.id === activeId);
  return activeIndex >= 0 ? annotationNavigationForReferenceIndex(annotations, activeIndex) : null;
}

export function annotationViewportPositions(
  annotations: Annotation[],
  boxes: HighlightBox[],
  canvasOffsetTop: number,
) {
  const indexById = new Map(annotations.map((annotation, index) => [annotation.id, index]));
  const positions = new Map<
    string,
    { annotationId: string; index: number; top: number; bottom: number }
  >();

  for (const box of boxes) {
    const index = indexById.get(box.annotationId);
    if (index === undefined) continue;

    const top = canvasOffsetTop + box.top;
    const bottom = top + box.height;
    const current = positions.get(box.annotationId);
    positions.set(box.annotationId, {
      annotationId: box.annotationId,
      index,
      top: current ? Math.min(current.top, top) : top,
      bottom: current ? Math.max(current.bottom, bottom) : bottom,
    });
  }

  return Array.from(positions.values()).toSorted(
    (left, right) => left.top - right.top || left.index - right.index,
  );
}
