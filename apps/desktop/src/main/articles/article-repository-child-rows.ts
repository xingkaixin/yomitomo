import type {
  Annotation,
  AnnotationAuthorRef,
  AnnotationDistillationReviewMessage,
  AnnotationDistillationReviewSession,
  ArticleRecord,
  Comment,
} from '@yomitomo/shared';

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
    ...annotationAuthorToRow(annotation.author),
    annotationType: annotation.annotationType,
    readingIntent: annotation.readingIntent,
    moveType: annotation.moveType,
    whyHere: annotation.whyHere,
    evidenceUsed: annotation.evidenceUsed,
    confidence: annotation.confidence,
    shouldShow: annotation.shouldShow,
    color: annotation.color,
    distillationStatus: annotation.distillation?.status,
    distillationContent: annotation.distillation?.content,
    distillationPublishedAt: annotation.distillation?.publishedAt,
    distillationUpdatedAt: annotation.distillation?.updatedAt,
    distillationReviewSessions: serializeAnnotationDistillationReviewSessions(
      annotation.distillation?.reviewSessions,
    ),
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
    ...annotationAuthorToRow(comment.author),
    content: comment.content,
    createdAt: comment.createdAt,
    replyTo: comment.replyTo,
    readingIntent: comment.readingIntent,
    reviewLabel: comment.reviewLabel,
    assistantProgress: comment.assistantProgress,
    pending: comment.pending,
  };
}

export function serializeAnnotationDistillationReviewSessions(
  sessions: AnnotationDistillationReviewSession[] | undefined,
) {
  return sessions?.map((session) => ({
    ...session,
    messages: session.messages.map(serializeAnnotationDistillationReviewMessage),
  }));
}

function serializeAnnotationDistillationReviewMessage(
  message: AnnotationDistillationReviewMessage,
) {
  if (message.author.kind === 'user') return { ...message, author: 'user' as const };

  return {
    ...message,
    author: 'ai' as const,
    agentId: message.author.agentId,
    agentUsername: message.author.username,
    agentNickname: message.author.nickname,
    agentAvatar: message.author.avatar,
  };
}

function annotationAuthorToRow(author: AnnotationAuthorRef) {
  if (author.kind === 'agent') {
    return {
      author: 'ai',
      agentId: author.agentId,
      agentUsername: author.username,
      agentNickname: author.nickname,
      agentAvatar: null,
      agentAnnotationColor: author.annotationColor,
      userId: null,
      userUsername: null,
      userNickname: null,
      userAvatar: null,
      userAnnotationColor: null,
    };
  }
  return {
    author: 'user',
    agentId: null,
    agentUsername: null,
    agentNickname: null,
    agentAvatar: null,
    agentAnnotationColor: null,
    userId: author.userId,
    userUsername: author.username,
    userNickname: author.nickname,
    userAvatar: null,
    userAnnotationColor: author.annotationColor,
  };
}
