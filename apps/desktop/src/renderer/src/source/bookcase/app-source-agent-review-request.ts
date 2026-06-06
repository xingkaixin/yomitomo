import i18next from 'i18next';
import type { Annotation, ArticleRecord, Comment, PublicAgent } from '@yomitomo/shared';
import type { RefObject } from 'react';
import { appendAnnotationComment } from '@yomitomo/core';
import { promptArticle } from './app-source-bookcase-shared';

type RunSourceAgentReviewRequestInput = {
  agents: PublicAgent[];
  annotation: Annotation;
  desktop: Pick<typeof window.yomitomoDesktop, 'requestAgentReview'>;
  currentArticle: ArticleRecord;
  articleText: string;
  annotationsRef: RefObject<Annotation[]>;
  applyAnnotations: (annotations: Annotation[]) => ArticleRecord | null;
  saveAnnotations: (annotations: Annotation[]) => Promise<void>;
  setStatusMessage: (message: string) => void;
};

export async function runSourceAgentReviewRequest({
  agents,
  annotation,
  desktop,
  currentArticle,
  articleText,
  annotationsRef,
  applyAnnotations,
  saveAnnotations,
  setStatusMessage,
}: RunSourceAgentReviewRequestInput) {
  setStatusMessage(
    i18next.t('source.agentStatus.reviewing', {
      name: agents.map((agent) => agent.nickname).join(i18next.t('common.listSeparator')),
    }),
  );
  let latestAnnotations = annotationsRef.current;
  let changed = false;

  try {
    for (const agent of agents) {
      const comments = await desktop.requestAgentReview({
        agentId: agent.id,
        agentUsername: agent.username,
        article: promptArticle(currentArticle, articleText),
        annotation: latestAnnotation(latestAnnotations, annotation.id) || annotation,
      });
      const nextAnnotations = appendReviewComments(
        latestAnnotations,
        annotation.id,
        agent,
        comments,
      );
      if (nextAnnotations !== latestAnnotations) {
        latestAnnotations = nextAnnotations;
        changed = true;
        applyAnnotations(latestAnnotations);
      }
    }

    if (changed) await saveAnnotations(latestAnnotations);
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
  for (const comment of comments) {
    if (
      !comment.replyTo ||
      reviewerAlreadyCommented(nextAnnotations, annotationId, agent, comment)
    ) {
      continue;
    }
    nextAnnotations =
      appendAnnotationComment(nextAnnotations, annotationId, comment, comment.createdAt) ||
      nextAnnotations;
  }
  return nextAnnotations;
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
