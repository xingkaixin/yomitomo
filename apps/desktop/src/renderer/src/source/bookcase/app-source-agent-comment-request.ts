import type {
  AgentReadingIntent,
  Annotation,
  ArticleRecord,
  Comment as AnnotationComment,
  PublicAgent,
  UiLanguage,
} from '@yomitomo/shared';
import i18next from 'i18next';
import { makeId } from '@yomitomo/shared';
import type { RefObject } from 'react';
import { appendAnnotationComment, updateAnnotationComment } from '@yomitomo/core';
import { promptArticle } from './app-source-bookcase-shared';
import { applyAssistantRuntimeProgress } from '../../shell/app-assistant-runtime-progress';

type RunSourceAgentCommentRequestInput = {
  agent: PublicAgent;
  annotation: Annotation;
  userComment: AnnotationComment;
  instruction?: string;
  readingIntent?: AgentReadingIntent;
  reviewTargetCommentId?: string;
  uiLanguage?: UiLanguage;
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
  instruction,
  readingIntent,
  reviewTargetCommentId,
  uiLanguage,
  desktop,
  currentArticle,
  articleText,
  annotationsRef,
  applyAnnotations,
  saveAnnotations,
  setStatusMessage,
}: RunSourceAgentCommentRequestInput) {
  setStatusMessage(
    i18next.t(
      reviewTargetCommentId ? 'source.agentStatus.reviewing' : 'source.agentStatus.replying',
      { name: agent.nickname },
    ),
  );
  const replyTargetId = reviewTargetCommentId || userComment.replyTo || userComment.id;
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

    if (
      !pendingComment ||
      !hasAnnotationComment(annotationsRef.current, annotation.id, replyTargetId)
    ) {
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
    const placeholderComment: AnnotationComment = {
      id: makeId('comment'),
      author: 'ai',
      content: '',
      createdAt: new Date().toISOString(),
      replyTo: replyTargetId,
      agentId: agent.id,
      agentUsername: agent.username,
      agentNickname: agent.nickname,
      agentAvatar: agent.avatar,
      agentAnnotationColor: agent.annotationColor,
      readingIntent: readingIntent || annotation.readingIntent || userComment.readingIntent,
      pending: true,
    };
    pendingCommentId = placeholderComment.id;
    pendingComment = placeholderComment;
    const pendingAnnotations = appendAnnotationComment(
      annotationsRef.current,
      annotation.id,
      placeholderComment,
      placeholderComment.createdAt,
    );
    if (pendingAnnotations) applyAnnotations(pendingAnnotations);

    const finalComment = await desktop.requestAgentCommentStream(
      {
        agentId: agent.id,
        agentUsername: agent.username,
        uiLanguage,
        readingIntent: readingIntent || annotation.readingIntent || userComment.readingIntent,
        instruction,
        reviewTargetCommentId,
        article: promptArticle(currentArticle, articleText),
        annotation,
        userComment,
      },
      (event) => {
        if (event.type === 'start') {
          const placeholderId = pendingCommentId;
          pendingCommentId = event.comment.id || placeholderId;
          pendingComment = localizedAgentComment(agent, {
            ...event.comment,
            id: pendingCommentId,
            replyTo: replyTargetId,
          });
          const nextAnnotations = updateAnnotationComment(
            annotationsRef.current,
            annotation.id,
            placeholderId,
            () => pendingComment!,
            pendingComment.createdAt,
          );
          if (
            nextAnnotations &&
            hasAnnotationComment(nextAnnotations, annotation.id, pendingCommentId)
          ) {
            applyAnnotations(nextAnnotations);
          }
          return;
        }

        if (event.type === 'progress') {
          const placeholderId = pendingCommentId;
          if (!placeholderId) return;
          const nextAnnotations = updateAnnotationComment(
            annotationsRef.current,
            annotation.id,
            placeholderId,
            (comment) => {
              const nextComment = {
                ...comment,
                assistantProgress: applyAssistantRuntimeProgress(
                  comment.assistantProgress,
                  event.progress,
                ),
              };
              pendingComment = nextComment;
              return nextComment;
            },
          );
          if (
            nextAnnotations &&
            hasAnnotationComment(nextAnnotations, annotation.id, pendingCommentId)
          ) {
            applyAnnotations(nextAnnotations);
          }
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
      ...localizedAgentComment(agent, finalComment),
      id: finalComment.id || pendingCommentId,
      replyTo: replyTargetId,
      assistantProgress:
        finalComment.assistantProgress ||
        annotationsRef.current
          .find((item) => item.id === annotation.id)
          ?.comments.find((comment) => comment.id === pendingCommentId)?.assistantProgress,
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
    } else if (hasAnnotationComment(annotationsRef.current, annotation.id, replyTargetId)) {
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

function localizedAgentComment(agent: PublicAgent, comment: AnnotationComment): AnnotationComment {
  return {
    ...comment,
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
    agentAnnotationColor: agent.annotationColor,
  };
}

function hasAnnotationComment(annotations: Annotation[], annotationId: string, commentId: string) {
  return annotations.some(
    (annotation) =>
      annotation.id === annotationId &&
      annotation.comments.some((comment) => comment.id === commentId),
  );
}
