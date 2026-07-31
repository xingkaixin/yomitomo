import type { Annotation } from '@yomitomo/shared';
import { mergeAgentAnnotationAsThought } from '@yomitomo/core';

type AppendAgentAnnotationToArticleInput = {
  annotations: () => Annotation[];
  applyAnnotations: (annotations: Annotation[]) => void;
  annotation: Annotation;
  articleId: string;
  isCurrentArticle: (articleId: string) => boolean;
  mergeArticleAgentAnnotation?: (
    articleId: string,
    annotation: Annotation,
  ) => Promise<{ activeId: string } | null> | { activeId: string } | null;
  onOpenAnnotation: (annotationId: string | null) => void;
  isAnnotationVisible?: (annotationId: string, annotations: Annotation[]) => boolean;
};

export async function appendAgentAnnotationToArticle({
  annotations,
  applyAnnotations,
  annotation,
  articleId,
  isAnnotationVisible,
  isCurrentArticle,
  mergeArticleAgentAnnotation,
  onOpenAnnotation,
}: AppendAgentAnnotationToArticleInput) {
  const visible = (annotationId: string, currentAnnotations: Annotation[]) =>
    isAnnotationVisible?.(annotationId, currentAnnotations) ?? true;
  let activeId = annotation.id;

  if (isCurrentArticle(articleId)) {
    const result = mergeAgentAnnotationAsThought(annotations(), annotation);
    activeId = result.activeId;
    applyAnnotations(result.annotations);
    onOpenAnnotation(visible(result.activeId, result.annotations) ? result.activeId : null);
  }

  const persisted = await mergeArticleAgentAnnotation?.(articleId, annotation);
  if (persisted) activeId = persisted.activeId;
  if (persisted && isCurrentArticle(articleId)) {
    onOpenAnnotation(visible(persisted.activeId, annotations()) ? persisted.activeId : null);
  }

  return activeId;
}
