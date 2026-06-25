import i18next from 'i18next';
import type { Annotation, ArticleRecord, Comment, PublicAgent, UiLanguage } from '@yomitomo/shared';
import type { RefObject } from 'react';
import { appendAnnotationComment } from '@yomitomo/core';
import { promptArticle } from './app-source-bookcase-shared';

type RunSourceAgentReviewRequestInput = {
  agents: PublicAgent[];
  annotation: Annotation;
  desktop: Pick<typeof window.yomitomoDesktop, 'requestAgentReview'>;
  currentArticle: ArticleRecord;
  articleText: string;
  uiLanguage?: UiLanguage;
  annotationsRef: RefObject<Annotation[]>;
  applyAnnotations: (annotations: Annotation[]) => ArticleRecord | null;
  saveComment: (annotationId: string, comment: Comment) => Promise<void>;
  setStatusMessage: (message: string) => void;
};

export async function runSourceAgentReviewRequest({
  agents,
  annotation,
  desktop,
  currentArticle,
  articleText,
  uiLanguage,
  annotationsRef,
  applyAnnotations,
  saveComment,
  setStatusMessage,
}: RunSourceAgentReviewRequestInput) {
  setStatusMessage(
    i18next.t('source.agentStatus.reviewing', {
      name: agents.map((agent) => agent.nickname).join(i18next.t('common.listSeparator')),
    }),
  );
  let latestAnnotations = annotationsRef.current;
  const commentsToSave: Comment[] = [];

  try {
    for (const agent of agents) {
      const comments = await desktop.requestAgentReview({
        agentId: agent.id,
        agentUsername: agent.username,
        uiLanguage,
        article: promptArticle(currentArticle, articleText),
        annotation: latestAnnotation(latestAnnotations, annotation.id) || annotation,
      });
      const result = appendReviewComments(latestAnnotations, annotation.id, agent, comments);
      if (result.annotations !== latestAnnotations) {
        latestAnnotations = result.annotations;
        commentsToSave.push(...result.comments);
        applyAnnotations(latestAnnotations);
      }
    }

    for (const comment of commentsToSave) {
      await saveComment(annotation.id, comment);
    }
  } finally {
    setStatusMessage('');
  }
}

function appendReviewComments(
  annotations: Annotation[],
  annotationId: string,
  agent: PublicAgent,
  comments: Comment[],
) {
  let nextAnnotations = annotations;
  const appendedComments: Comment[] = [];
  for (const comment of comments) {
    if (
      !comment.replyTo ||
      reviewerAlreadyCommented(nextAnnotations, annotationId, agent, comment)
    ) {
      continue;
    }
    const localizedComment = {
      ...comment,
      agentId: agent.id,
      agentUsername: agent.username,
      agentNickname: agent.nickname,
      agentAvatar: agent.avatar,
      agentAnnotationColor: agent.annotationColor,
    };
    const appendedAnnotations = appendAnnotationComment(
      nextAnnotations,
      annotationId,
      localizedComment,
      localizedComment.createdAt,
    );
    if (!appendedAnnotations) continue;
    nextAnnotations = appendedAnnotations;
    appendedComments.push(localizedComment);
  }
  return { annotations: nextAnnotations, comments: appendedComments };
}

function reviewerAlreadyCommented(
  annotations: Annotation[],
  annotationId: string,
  agent: PublicAgent,
  comment: Comment,
) {
  return annotations.some(
    (annotation) =>
      annotation.id === annotationId &&
      annotation.comments.some(
        (candidate) =>
          candidate.replyTo === comment.replyTo &&
          candidate.reviewLabel &&
          (candidate.agentId === agent.id || candidate.agentUsername === agent.username),
      ),
  );
}

function latestAnnotation(annotations: Annotation[], annotationId: string) {
  return annotations.find((annotation) => annotation.id === annotationId);
}
