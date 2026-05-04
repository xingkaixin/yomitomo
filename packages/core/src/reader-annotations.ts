import type { Annotation } from '@yomitomo/shared';
import type { TocItem } from './reader-dom';

export type TocAnnotationStats = {
  count: number;
  colors: string[];
};

export function buildTocAnnotationStats(
  tocItems: TocItem[],
  annotations: Annotation[],
  colorForAnnotation: (annotation: Annotation) => string = annotationStoredColor,
) {
  const stats = new Map<number, TocAnnotationStats>();

  for (const item of tocItems) {
    const sectionAnnotations = annotations.filter((annotation) => {
      const start = Number.isFinite(annotation.anchor.start) ? annotation.anchor.start : -1;
      return start >= item.start && start < item.end;
    });
    stats.set(item.index, {
      count: sectionAnnotations.length,
      colors: Array.from(new Set(sectionAnnotations.map(colorForAnnotation))),
    });
  }

  return stats;
}

export function annotationStoredColor(annotation: Annotation) {
  return (
    annotation.agentAnnotationColor ||
    annotation.userAnnotationColor ||
    annotation.color ||
    '#f4c95d'
  );
}
