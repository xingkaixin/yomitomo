import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import type { AnnotationDistillationCommittedEvent } from '../../../ipc-contract';

export type ReadingLibraryDistillationAnimation = {
  annotationId: string;
  transition: AnnotationDistillationCommittedEvent['transition'];
  phase: 'morph-out' | 'morph-in' | 'update';
  overlayDistillation?: {
    content: string;
    publishedAt?: string;
    updatedAt?: string;
  };
  token: number;
};

export function articleWithCommittedDistillation(
  article: ArticleRecord,
  event: AnnotationDistillationCommittedEvent,
  updatedAt = nextDistillationAnimationArticleUpdatedAt(
    article.updatedAt,
    event.distillation?.updatedAt,
  ),
): ArticleRecord {
  let changed = false;
  const annotations = article.annotations.map((annotation) => {
    if (annotation.id !== event.annotationId) return annotation;
    const distillation = event.distillation || annotation.distillation;
    if (!distillation) return annotation;
    changed = true;
    return {
      ...annotation,
      distillation: {
        ...distillation,
        status: committedDistillationStatus(event.transition),
      },
    };
  });
  if (!changed) return article;
  return {
    ...article,
    annotations,
    updatedAt,
  };
}

export function articleWithDistillationAnimationStart(
  article: ArticleRecord,
  event: AnnotationDistillationCommittedEvent,
  updatedAt = article.updatedAt,
): ArticleRecord {
  if (event.transition === 'update') return article;
  let changed = false;
  const annotations = article.annotations.map((annotation) => {
    if (annotation.id !== event.annotationId) return annotation;
    const distillation = event.distillation || annotation.distillation;
    if (!distillation) return annotation;
    changed = true;
    return {
      ...annotation,
      distillation: {
        ...distillation,
        status: animationStartDistillationStatus(event.transition),
      },
    };
  });
  if (!changed) return article;
  return {
    ...article,
    annotations,
    updatedAt,
  };
}

export function nextDistillationAnimationArticleUpdatedAt(
  currentUpdatedAt: string | number | undefined,
  distillationUpdatedAt: string | undefined,
  previousReservedUpdatedAt?: string | number,
) {
  const currentTime = timestampValue(currentUpdatedAt);
  const distillationTime = timestampValue(distillationUpdatedAt);
  const previousReservedTime = timestampValue(previousReservedUpdatedAt);
  return new Date(
    Math.max(Date.now(), currentTime + 1, distillationTime + 1, previousReservedTime + 1),
  ).toISOString();
}

export function articleDistillationStateChanged(
  previousArticle: ArticleRecord,
  nextArticle: ArticleRecord,
) {
  const previousAnnotations = new Map(
    previousArticle.annotations.map((annotation) => [annotation.id, annotation]),
  );
  const nextAnnotations = new Map(
    nextArticle.annotations.map((annotation) => [annotation.id, annotation]),
  );
  const annotationIds = new Set([...previousAnnotations.keys(), ...nextAnnotations.keys()]);
  for (const annotationId of annotationIds) {
    if (
      annotationDistillationSignature(previousAnnotations.get(annotationId)) !==
      annotationDistillationSignature(nextAnnotations.get(annotationId))
    ) {
      return true;
    }
  }
  return false;
}

export function distillationOverlayForAnimation(
  article: ArticleRecord | null,
  event: AnnotationDistillationCommittedEvent,
) {
  const annotation = article?.annotations.find((item) => item.id === event.annotationId);
  const distillation = event.distillation || annotation?.distillation;
  const content = distillation?.content.trim();
  if (!content) return undefined;
  return {
    content,
    publishedAt: distillation?.publishedAt,
    updatedAt: distillation?.updatedAt,
  };
}

function committedDistillationStatus(
  transition: AnnotationDistillationCommittedEvent['transition'],
): NonNullable<Annotation['distillation']>['status'] {
  return transition === 'unpublish' ? 'unpublished' : 'published';
}

function animationStartDistillationStatus(
  transition: AnnotationDistillationCommittedEvent['transition'],
): NonNullable<Annotation['distillation']>['status'] {
  return transition === 'unpublish' ? 'published' : 'unpublished';
}

function timestampValue(value: string | number | undefined) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function annotationDistillationSignature(annotation: Annotation | undefined) {
  const distillation = annotation?.distillation;
  if (!distillation) return '';
  return [
    distillation.status || '',
    distillation.content || '',
    distillation.publishedAt || '',
    distillation.updatedAt || '',
  ].join('\u001f');
}
