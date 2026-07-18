import type { Annotation, ArticleRecord, Comment } from '@yomitomo/shared';
import { sortAnnotations } from '@yomitomo/core';

export function articleWithAnnotations(article: ArticleRecord, annotations: Annotation[]) {
  return {
    ...article,
    annotations: sortAnnotations(annotations),
    updatedAt: new Date().toISOString(),
  };
}

export function annotationsWithSavedAnnotation(annotations: Annotation[], annotation: Annotation) {
  const existing = annotations.some((item) => item.id === annotation.id);
  if (!existing) return [...annotations, annotation];
  return annotations.map((item) => (item.id === annotation.id ? annotation : item));
}

export function annotationsWithSavedComment(
  annotations: Annotation[],
  annotationId: string,
  comment: Comment,
  updatedAt: string,
) {
  let foundAnnotation = false;
  const nextAnnotations = annotations.map((annotation) => {
    if (annotation.id !== annotationId) return annotation;
    foundAnnotation = true;
    const existingComment = annotation.comments.some((item) => item.id === comment.id);
    return {
      ...annotation,
      comments: existingComment
        ? annotation.comments.map((item) => (item.id === comment.id ? comment : item))
        : [...annotation.comments, comment],
      updatedAt,
    };
  });
  return foundAnnotation ? nextAnnotations : null;
}
