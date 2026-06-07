import type { RefObject } from 'react';
import i18next from 'i18next';
import type { Annotation, ArticleRecord, Comment, PublicAgent, UiLanguage } from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import {
  appendAnnotationComment,
  deleteAnnotationComment,
  updateAnnotationComment,
} from '@yomitomo/core';
import { promptArticle } from '../source/bookcase/app-source-bookcase-shared';
import { applyAssistantRuntimeProgress } from '../shell/app-assistant-runtime-progress';

export type RunSourceAgentThoughtLifecycle = {
  onComplete?: () => void;
  onError?: () => void;
  onProgress?: (progress: Parameters<typeof applyAssistantRuntimeProgress>[1]) => void;
};

type RunSourceAgentThoughtRequestInput = {
  agent: PublicAgent;
  annotation: Annotation;
  instruction: string;
  readingIntent?: Comment['readingIntent'];
  uiLanguage?: UiLanguage;
  desktop: Pick<typeof window.yomitomoDesktop, 'requestAgentCommentStream'>;
  currentArticle: ArticleRecord;
  articleText: string;
  annotationsRef: RefObject<Annotation[]>;
  applyAnnotations: (annotations: Annotation[]) => ArticleRecord | null;
  saveAnnotations: (annotations: Annotation[]) => Promise<void>;
  setStatusMessage: (message: string) => void;
  onThoughtStart: (commentId: string) => void;
  lifecycle?: RunSourceAgentThoughtLifecycle;
};

export async function runSourceAgentThoughtRequest({
  agent,
  annotation,
  instruction,
  readingIntent,
  uiLanguage,
  desktop,
  currentArticle,
  articleText,
  annotationsRef,
  applyAnnotations,
  saveAnnotations,
  setStatusMessage,
  onThoughtStart,
  lifecycle,
}: RunSourceAgentThoughtRequestInput) {
  setStatusMessage(i18next.t('discussion.addThought.agentAdding', { name: agent.nickname }));
  const createdAt = new Date().toISOString();
  const placeholderComment: Comment = {
    id: makeId('comment'),
    author: 'ai',
    content: '',
    createdAt,
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
    agentAnnotationColor: agent.annotationColor,
    readingIntent: readingIntent || annotation.readingIntent,
    pending: true,
  };
  onThoughtStart(placeholderComment.id);

  const pendingAnnotations = appendAnnotationComment(
    annotationsRef.current,
    annotation.id,
    placeholderComment,
    createdAt,
  );
  if (pendingAnnotations) applyAnnotations(pendingAnnotations);

  const instructionComment: Comment = {
    id: makeId('comment'),
    author: 'user',
    content: instruction,
    createdAt,
    readingIntent,
  };
  let pendingCommentId = placeholderComment.id;
  let pendingDelta = '';
  let pendingFrame = 0;
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
      (comment) => ({ ...comment, content: comment.content + delta }),
    );
    if (nextAnnotations) applyAnnotations(nextAnnotations);
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
        uiLanguage,
        responseMode: 'create_thought',
        readingIntent: readingIntent || annotation.readingIntent,
        instruction,
        article: promptArticle(currentArticle, articleText),
        annotation,
        userComment: instructionComment,
      },
      (event) => {
        if (event.type === 'start') {
          const nextAnnotations = updateAnnotationComment(
            annotationsRef.current,
            annotation.id,
            pendingCommentId,
            () =>
              localizedAgentComment(agent, {
                ...event.comment,
                id: pendingCommentId,
                replyTo: undefined,
                pending: true,
              }),
          );
          if (nextAnnotations) applyAnnotations(nextAnnotations);
          return;
        }
        if (event.type === 'progress') {
          lifecycle?.onProgress?.(event.progress);
          const nextAnnotations = updateAnnotationComment(
            annotationsRef.current,
            annotation.id,
            pendingCommentId,
            (comment) => ({
              ...comment,
              assistantProgress: applyAssistantRuntimeProgress(
                comment.assistantProgress,
                event.progress,
              ),
            }),
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
      ...localizedAgentComment(agent, finalComment),
      id: pendingCommentId,
      replyTo: undefined,
      content: finalComment.content || streamedContent,
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
      pendingCommentId,
      () => completedComment,
      completedComment.createdAt,
    );
    if (nextAnnotations) await saveAnnotations(nextAnnotations);
    lifecycle?.onComplete?.();
  } catch (error) {
    if (pendingFrame) {
      window.cancelAnimationFrame(pendingFrame);
      pendingFrame = 0;
    }
    const nextAnnotations = deleteAnnotationComment(
      annotationsRef.current,
      annotation.id,
      pendingCommentId,
    );
    if (nextAnnotations) applyAnnotations(nextAnnotations);
    lifecycle?.onError?.();
    throw error;
  } finally {
    if (pendingFrame) window.cancelAnimationFrame(pendingFrame);
    setStatusMessage('');
  }
}

function localizedAgentComment(agent: PublicAgent, comment: Comment): Comment {
  return {
    ...comment,
    agentId: agent.id,
    agentUsername: agent.username,
    agentNickname: agent.nickname,
    agentAvatar: agent.avatar,
    agentAnnotationColor: agent.annotationColor,
  };
}
