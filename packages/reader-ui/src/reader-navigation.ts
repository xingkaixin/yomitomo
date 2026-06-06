import type { Annotation } from '@yomitomo/shared';

export type AnnotationNavigationTargets = {
  currentIndex?: number;
  previousId: string | null;
  nextId: string | null;
  totalCount?: number;
};

export function annotationNavigationForReferenceIndex(
  annotations: Annotation[],
  referenceIndex: number,
): AnnotationNavigationTargets {
  if (referenceIndex < 0 || referenceIndex >= annotations.length) {
    return {
      currentIndex: annotations.length > 0 ? 1 : 0,
      previousId: null,
      nextId: null,
      totalCount: annotations.length,
    };
  }

  return {
    currentIndex: referenceIndex + 1,
    previousId: annotations[referenceIndex - 1]?.id ?? null,
    nextId: annotations[referenceIndex + 1]?.id ?? null,
    totalCount: annotations.length,
  };
}

export function annotationNavigationForInsertionIndex(
  annotations: Annotation[],
  insertionIndex: number,
): AnnotationNavigationTargets {
  const boundedIndex = Math.max(0, Math.min(annotations.length, insertionIndex));
  return {
    currentIndex: annotations.length > 0 ? Math.min(annotations.length, boundedIndex + 1) : 0,
    previousId: annotations[boundedIndex - 1]?.id ?? null,
    nextId: annotations[boundedIndex]?.id ?? null,
    totalCount: annotations.length,
  };
}
