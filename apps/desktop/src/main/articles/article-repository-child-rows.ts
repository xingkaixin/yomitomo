import type {
  Annotation,
  AnnotationAuthorRef,
  AnnotationDistillationReviewMessage,
  AnnotationDistillationReviewSession,
  ArticleRecord,
  Comment,
} from '@yomitomo/shared';
import {
  commentAssetRevision,
  distillationAssetRevision,
  type StoredArticleAssetRevisions,
  type StoredCommentAsset,
  type StoredDistillationAsset,
} from './article-asset-revisions';

export function buildArticleChildRows(
  article: Pick<ArticleRecord, 'id' | 'annotations'>,
  previous?: StoredArticleAssetRevisions,
) {
  const annotationRows = article.annotations.map((annotation) =>
    annotationToRow(article.id, annotation, previous?.annotations.get(annotation.id)),
  );
  const commentRows = article.annotations.flatMap((annotation) =>
    commentRowsForAnnotation(annotation, previous?.comments),
  );
  return { annotationRows, commentRows };
}

export function annotationToRow(
  articleId: string,
  annotation: Annotation,
  previous?: StoredDistillationAsset,
) {
  const distillation = {
    distillationStatus: annotation.distillation?.status ?? null,
    distillationContent: annotation.distillation?.content ?? null,
  };
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
    ...distillation,
    distillationRevision: distillationAssetRevision(previous, distillation),
    distillationPublishedAt: annotation.distillation?.publishedAt ?? null,
    distillationUpdatedAt: annotation.distillation?.updatedAt ?? null,
    distillationReviewSessions:
      serializeAnnotationDistillationReviewSessions(annotation.distillation?.reviewSessions) ??
      null,
    createdAt: annotation.createdAt,
    updatedAt: annotation.updatedAt,
  };
}

export function commentRowsForAnnotation(
  annotation: Annotation,
  previous?: ReadonlyMap<string, StoredCommentAsset>,
) {
  return annotation.comments.map((comment) =>
    commentToRow(annotation.id, comment, previous?.get(comment.id)),
  );
}

export function commentToRow(
  annotationId: string,
  comment: Comment,
  previous?: StoredCommentAsset,
) {
  const row = {
    id: comment.id,
    annotationId,
    ...annotationAuthorToRow(comment.author),
    content: comment.content,
    createdAt: comment.createdAt,
    replyTo: comment.replyTo,
    readingIntent: comment.readingIntent,
    reviewLabel: comment.reviewLabel,
    assistantProgress: comment.assistantProgress,
    pending: comment.pending ?? null,
  };
  return { ...row, assetRevision: commentAssetRevision(previous, row) };
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
      agentId: author.agentId ?? null,
      agentUsername: author.username ?? null,
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
    userId: author.userId ?? null,
    userUsername: author.username ?? null,
    userNickname: author.nickname,
    userAvatar: null,
    userAnnotationColor: author.annotationColor,
  };
}
