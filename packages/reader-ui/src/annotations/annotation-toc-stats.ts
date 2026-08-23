import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import {
  annotationColor,
  buildTocAnnotationStats as buildCoreTocAnnotationStats,
  type TocItem,
} from '@yomitomo/core';

export function buildTocAnnotationStats(
  tocItems: TocItem[],
  annotations: Annotation[],
  userProfile: UserProfile,
  agents: PublicAgent[],
) {
  return buildCoreTocAnnotationStats(tocItems, annotations, (annotation) =>
    annotationColor(annotation, userProfile, agents),
  );
}
