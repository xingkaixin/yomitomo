import type { Annotation, ArticleRecord, Comment } from '@yomitomo/shared';

export function buildArticleChildRows(article: Pick<ArticleRecord, 'id' | 'annotations'>) {
  const annotationRows = article.annotations.map((annotation) =>
    annotationToRow(article.id, annotation),
  );
  const commentRows = article.annotations.flatMap(commentRowsForAnnotation);
  return { annotationRows, commentRows };
}

export function annotationToRow(articleId: string, annotation: Annotation) {
  return {
    id: annotation.id,
    articleId,
    anchor: annotation.anchor,
    author: annotation.author,
    annotationType: annotation.annotationType,
    readingIntent: annotation.readingIntent,
    moveType: annotation.moveType,
    whyHere: annotation.whyHere,
    evidenceUsed: annotation.evidenceUsed,
    confidence: annotation.confidence,
    shouldShow: annotation.shouldShow,
    color: annotation.color,
    agentId: annotation.agentId,
    agentUsername: annotation.agentUsername,
    agentNickname: annotation.agentNickname,
    agentAvatar: annotation.agentAvatar,
    agentAnnotationColor: annotation.agentAnnotationColor,
    userId: annotation.userId,
    userUsername: annotation.userUsername,
    userNickname: annotation.userNickname,
    userAvatar: annotation.userAvatar,
    userAnnotationColor: annotation.userAnnotationColor,
    distillationStatus: annotation.distillation?.status,
    distillationContent: annotation.distillation?.content,
    distillationPublishedAt: annotation.distillation?.publishedAt,
    distillationUpdatedAt: annotation.distillation?.updatedAt,
    distillationReviewSessions: annotation.distillation?.reviewSessions,
    createdAt: annotation.createdAt,
    updatedAt: annotation.updatedAt,
  };
}

export function commentRowsForAnnotation(annotation: Annotation) {
  return annotation.comments.map((comment) => commentToRow(annotation.id, comment));
}

export function commentToRow(annotationId: string, comment: Comment) {
  return {
    id: comment.id,
    annotationId,
    author: comment.author,
    content: comment.content,
    createdAt: comment.createdAt,
    replyTo: comment.replyTo,
    agentId: comment.agentId,
    agentUsername: comment.agentUsername,
    agentNickname: comment.agentNickname,
    agentAvatar: comment.agentAvatar,
    agentAnnotationColor: comment.agentAnnotationColor,
    readingIntent: comment.readingIntent,
    reviewLabel: comment.reviewLabel,
    assistantProgress: comment.assistantProgress,
    userId: comment.userId,
    userUsername: comment.userUsername,
    userNickname: comment.userNickname,
    userAvatar: comment.userAvatar,
    userAnnotationColor: comment.userAnnotationColor,
    pending: comment.pending,
  };
}
