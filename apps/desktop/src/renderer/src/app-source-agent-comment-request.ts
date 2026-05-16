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
  const flushDelta = () => {
    pendingFrame = 0;
    if (!pendingDelta || !pendingCommentId) return;
    const delta = pendingDelta;
    pendingDelta = '';
    const nextAnnotations = updateAnnotationComment(
      annotationsRef.current,
      annotation.id,
      pendingCommentId,
      (comment) => Object.assign({}, comment, { content: comment.content + delta }),
    );
    if (nextAnnotations) applyAnnotations(nextAnnotations);
  };
  const scheduleDeltaFlush = () => {
    if (pendingFrame) return;
    pendingFrame = window.requestAnimationFrame(flushDelta);
  };
  try {
    await desktop.requestAgentCommentStream(
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
          const nextAnnotations = appendAnnotationComment(
            annotationsRef.current,
            annotation.id,
            event.comment,
            event.comment.createdAt,
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
    const current = annotationsRef.current.find((item) => item.id === annotation.id);
    const agentComment = current?.comments.find(
      (comment) =>
        comment.author === 'ai' &&
        comment.agentId === agent.id &&
        comment.id === pendingCommentId &&
        comment.pending,
    );
    if (agentComment) {
      const nextAnnotations = updateAnnotationComment(
        annotationsRef.current,
        annotation.id,
        agentComment.id,
        (comment) => Object.assign({}, comment, { pending: false }),
      );
      if (nextAnnotations) await saveAnnotations(nextAnnotations);
    }
  } finally {
    if (pendingFrame) window.cancelAnimationFrame(pendingFrame);
    setStatusMessage('');
  }
}
