import type {
  Annotation,
  ArticleRecord,
  Comment as AnnotationComment,
  PublicAgent,
} from '@yomitomo/shared';
import type { RefObject } from 'react';
import { appendAnnotationComment, updateAnnotationComment } from '@yomitomo/core';
import { promptArticle } from './app-source-bookcase-shared';

type RunSourceAgentCommentRequestInput = {
  agent: PublicAgent;
  annotation: Annotation;
  userComment: AnnotationComment;
  desktop: Pick<typeof window.yomitomoDesktop, 'requestAgentCommentStream'>;
  currentArticle: ArticleRecord;
  articleText: string;
  annotationsRef: RefObject<Annotation[]>;
  applyAnnotations: (annotations: Annotation[]) => ArticleRecord | null;
  saveAnnotations: (annotations: Annotation[]) => Promise<void>;
  setStatusMessage: (message: string) => void;
};

export async function runSourceAgentCommentRequest({
  agent,
  annotation,
  userComment,
  desktop,
  currentArticle,
  articleText,
  annotationsRef,
  applyAnnotations,
  saveAnnotations,
  setStatusMessage,
}: RunSourceAgentCommentRequestInput) {
  setStatusMessage(`${agent.nickname} 正在回复`);
  let pendingCommentId = '';
  let pendingDelta = '';
  let pendingFrame = 0;
  let pendingComment: AnnotationComment | null = null;
  let streamedContent = '';
  const flushDelta = () => {
    pendingFrame = 0;
    if (!pendingDelta || !pendingCommentId) return;
    const delta = pendingDelta;
    pendingDelta = '';
    streamedContent += delta;
    const nextAnnotations = updateAnnotationComment(
      annotationsRef.current,
      annotation.id,
      pendingCommentId,
      (comment) => Object.assign({}, comment, { content: comment.content + delta }),
    );
    if (nextAnnotations && hasAnnotationComment(nextAnnotations, annotation.id, pendingCommentId)) {
      applyAnnotations(nextAnnotations);
      return;
    }

    if (!pendingComment || !hasReplyTarget(annotationsRef.current, annotation.id, userComment)) {
      return;
    }
    const restoredAnnotations = appendAnnotationComment(
      annotationsRef.current,
      annotation.id,
      { ...pendingComment, content: streamedContent, pending: true },
      pendingComment.createdAt,
    );
    if (restoredAnnotations) applyAnnotations(restoredAnnotations);
  };
  const scheduleDeltaFlush = () => {
    if (pendingFrame) return;
    pendingFrame = window.requestAnimationFrame(flushDelta);
  };
  try {
    const finalComment = await desktop.requestAgentCommentStream(
      {
        agentId: agent.id,
        agentUsername: agent.username,
        readingIntent: annotation.readingIntent || userComment.readingIntent,
        article: promptArticle(currentArticle, articleText),
        annotation,
        userComment,
      },
      (event) => {
        if (event.type === 'start') {
          pendingCommentId = event.comment.id;
          pendingComment = {
            ...event.comment,
            replyTo: userComment.replyTo || userComment.id,
          };
          const nextAnnotations = appendAnnotationComment(
            annotationsRef.current,
            annotation.id,
            pendingComment,
            pendingComment.createdAt,
          );
          if (nextAnnotations) applyAnnotations(nextAnnotations);
          return;
        }

        pendingDelta += event.delta;
        scheduleDeltaFlush();
      },
    );
    if (pendingFrame) {
      window.cancelAnimationFrame(pendingFrame);
      flushDelta();
    }
    const completedComment = {
      ...finalComment,
      id: finalComment.id || pendingCommentId,
      replyTo: userComment.replyTo || userComment.id,
      pending: false,
    };
    const nextAnnotations = updateAnnotationComment(
      annotationsRef.current,
      annotation.id,
      completedComment.id,
      () => completedComment,
    );
    if (
      nextAnnotations &&
      hasAnnotationComment(nextAnnotations, annotation.id, completedComment.id)
    ) {
      await saveAnnotations(nextAnnotations);
    } else if (hasReplyTarget(annotationsRef.current, annotation.id, userComment)) {
      const restoredAnnotations = appendAnnotationComment(
        annotationsRef.current,
        annotation.id,
        completedComment,
        completedComment.createdAt,
      );
      if (restoredAnnotations) await saveAnnotations(restoredAnnotations);
    }
  } finally {
    if (pendingFrame) window.cancelAnimationFrame(pendingFrame);
    setStatusMessage('');
  }
}

function hasAnnotationComment(annotations: Annotation[], annotationId: string, commentId: string) {
  return annotations.some(
    (annotation) =>
      annotation.id === annotationId &&
      annotation.comments.some((comment) => comment.id === commentId),
  );
}

function hasReplyTarget(
  annotations: Annotation[],
  annotationId: string,
  userComment: AnnotationComment,
) {
  return hasAnnotationComment(annotations, annotationId, userComment.replyTo || userComment.id);
}
