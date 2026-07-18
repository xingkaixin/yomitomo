import type { Annotation } from '@yomitomo/shared';

export type MergedAgentAnnotationResult = {
  activeId: string;
  annotations: Annotation[];
};

export function mergeAgentAnnotationAsThought(
  annotations: Annotation[],
  annotation: Annotation,
): MergedAgentAnnotationResult {
  const sameAnnotation = annotations.find((item) => item.id === annotation.id);
  if (sameAnnotation) {
    return { activeId: sameAnnotation.id, annotations };
  }

  const exactKey = annotationExactKey(annotation);
  const existing = exactKey
    ? annotations.find((item) => item.id !== annotation.id && annotationExactKey(item) === exactKey)
    : null;

  if (!existing) {
    return { activeId: annotation.id, annotations: [...annotations, annotation] };
  }

  const existingCommentIds = new Set(existing.comments.map((comment) => comment.id));
  const commentsToAppend = annotation.comments
    .filter((comment) => comment.content.trim() && !existingCommentIds.has(comment.id))
    .map((comment) => Object.assign({}, comment, { replyTo: undefined }));

  if (commentsToAppend.length === 0) {
    return { activeId: existing.id, annotations };
  }

  return {
    activeId: existing.id,
    annotations: annotations.map((item) =>
      item.id === existing.id
        ? {
            ...item,
            comments: [...item.comments, ...commentsToAppend],
            updatedAt:
              annotation.updatedAt ||
              commentsToAppend.at(-1)?.createdAt ||
              new Date().toISOString(),
          }
        : item,
    ),
  };
}

function annotationExactKey(annotation: Annotation) {
  return annotation.anchor.exact.trim().replace(/\s+/g, ' ');
}
