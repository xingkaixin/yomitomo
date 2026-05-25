import type { Annotation } from '@yomitomo/shared';

export type AnnotationNavigationTargets = {
  previousId: string | null;
  nextId: string | null;
};

export function annotationNavigationForReferenceIndex(
  annotations: Annotation[],
  referenceIndex: number,
): AnnotationNavigationTargets {
  if (referenceIndex < 0 || referenceIndex >= annotations.length) {
    return { previousId: null, nextId: null };
  }

  return {
    previousId: annotations[referenceIndex - 1]?.id ?? null,
    nextId: annotations[referenceIndex + 1]?.id ?? null,
  };
}

export function annotationNavigationForInsertionIndex(
  annotations: Annotation[],
  insertionIndex: number,
): AnnotationNavigationTargets {
  const boundedIndex = Math.max(0, Math.min(annotations.length, insertionIndex));
  return {
    previousId: annotations[boundedIndex - 1]?.id ?? null,
    nextId: annotations[boundedIndex]?.id ?? null,
  };
}
