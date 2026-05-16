import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  Annotation,
  ArticleRecord,
  Comment as AnnotationComment,
  PublicAgent,
  QuestionStatus,
  UserProfile,
} from '@yomitomo/shared';
import {
  appendAnnotationComment,
  createUserComment,
  findMentionedAgents,
  sortAnnotations,
} from '@yomitomo/core';
import { articleWithAnnotations } from './app-source-bookcase-shared';

type SourceAnnotationsChange = {
  previousAnnotations: Annotation[];
  nextAnnotations: Annotation[];
  previousArticle: ArticleRecord;
  nextArticle: ArticleRecord;
};

type UseSourceAnnotationsOptions = {
  annotationAgents?: PublicAgent[];
  annotations: Annotation[];
  article: ArticleRecord;
  ignoreStaleArticleUpdates?: boolean;
  onBeforeDeleteAnnotation?: (annotationId: string) => void;
  onCommentSaved?: (result: {
    annotation: Annotation;
    comment: AnnotationComment;
    mentionedAgents: PublicAgent[];
  }) => void;
  onOpenAnnotation?: (annotationId: string) => void;
  onSaveArticle: (article: ArticleRecord) => Promise<void> | void;
  onAnnotationsApplied?: (change: SourceAnnotationsChange) => void;
  onAnnotationsSaved?: (change: SourceAnnotationsChange) => void;
  userProfile: UserProfile;
};

export function useSourceAnnotations({
  annotationAgents = [],
  annotations: articleAnnotations,
  article,
  ignoreStaleArticleUpdates = false,
  onBeforeDeleteAnnotation,
  onCommentSaved,
  onOpenAnnotation,
  onSaveArticle,
  onAnnotationsApplied,
  onAnnotationsSaved,
  userProfile,
}: UseSourceAnnotationsOptions) {
  const latestArticleRef = useRef<ArticleRecord | null>(article);
  const [annotations, setAnnotations] = useState<Annotation[]>(() =>
    sortAnnotations(articleAnnotations),
  );
  const annotationsRef = useRef<Annotation[]>(annotations);

  const replaceAnnotations = useCallback((nextAnnotations: Annotation[]) => {
    const sortedAnnotations = sortAnnotations(nextAnnotations);
    annotationsRef.current = sortedAnnotations;
    setAnnotations(sortedAnnotations);
  }, []);

  useLayoutEffect(() => {
    if (!acceptIncomingArticle(article, latestArticleRef.current, ignoreStaleArticleUpdates)) {
      return;
    }
    latestArticleRef.current = article;
  }, [article, ignoreStaleArticleUpdates]);

  useEffect(() => {
    if (!acceptIncomingArticle(article, latestArticleRef.current, ignoreStaleArticleUpdates)) {
      return;
    }
    replaceAnnotations(articleAnnotations);
  }, [article, articleAnnotations, ignoreStaleArticleUpdates, replaceAnnotations]);

  const saveAnnotations = useCallback(
    async (nextAnnotations: Annotation[]) => {
      const currentArticle = latestArticleRef.current;
      if (!currentArticle) return;

      const previousAnnotations = annotationsRef.current;
      const nextArticle = articleWithAnnotations(currentArticle, nextAnnotations);
      const sortedAnnotations = nextArticle.annotations;
      latestArticleRef.current = nextArticle;
      annotationsRef.current = sortedAnnotations;
      setAnnotations(sortedAnnotations);
      await onSaveArticle(nextArticle);
      onAnnotationsSaved?.({
        previousAnnotations,
        nextAnnotations: sortedAnnotations,
        previousArticle: currentArticle,
        nextArticle,
      });
    },
    [onAnnotationsSaved, onSaveArticle],
  );

  const applyAnnotations = useCallback(
    (nextAnnotations: Annotation[]) => {
      const currentArticle = latestArticleRef.current;
      if (!currentArticle) return null;

      const previousAnnotations = annotationsRef.current;
      const sortedAnnotations = sortAnnotations(nextAnnotations);
      const nextArticle = {
        ...currentArticle,
        annotations: sortedAnnotations,
        updatedAt: new Date().toISOString(),
      };
      latestArticleRef.current = nextArticle;
      annotationsRef.current = sortedAnnotations;
      setAnnotations(sortedAnnotations);
      onAnnotationsApplied?.({
        previousAnnotations,
        nextAnnotations: sortedAnnotations,
        previousArticle: currentArticle,
        nextArticle,
      });
      return nextArticle;
    },
    [onAnnotationsApplied],
  );

  const addComment = useCallback(
    async (annotationId: string, content: string) => {
      const trimmed = content.trim();
      const currentArticle = latestArticleRef.current;
      if (!trimmed || !currentArticle) return;

      const userComment = createUserComment(userProfile, trimmed);
      const isFollowUpQuestion = /[?？]/.test(trimmed);
      const comment: AnnotationComment = isFollowUpQuestion
        ? { ...userComment, questionStatus: 'open' }
        : userComment;
      const currentAnnotations = isFollowUpQuestion
        ? currentArticle.annotations
        : currentArticle.annotations.map((annotation) =>
            annotation.id !== annotationId
              ? annotation
              : Object.assign({}, annotation, {
                  questionStatus:
                    annotation.questionStatus === 'open' ||
                    (annotation.annotationType === 'question' && !annotation.questionStatus)
                      ? 'answered'
                      : annotation.questionStatus,
                  comments: annotation.comments.map((item) =>
                    item.questionStatus === 'open' ||
                    (!item.questionStatus && /[?？]/.test(item.content))
                      ? { ...item, questionStatus: 'answered' as const }
                      : item,
                  ),
                }),
          );
      const nextAnnotations = appendAnnotationComment(
        currentAnnotations,
        annotationId,
        comment,
        userComment.createdAt,
      );
      const nextAnnotation = nextAnnotations?.find((annotation) => annotation.id === annotationId);
      if (!nextAnnotations || !nextAnnotation) return;

      await saveAnnotations(nextAnnotations);
      onOpenAnnotation?.(annotationId);

      const result = {
        annotation: nextAnnotation,
        comment,
        mentionedAgents: findMentionedAgents(trimmed, annotationAgents),
      };
      onCommentSaved?.(result);
    },
    [annotationAgents, onCommentSaved, onOpenAnnotation, saveAnnotations, userProfile],
  );

  const setAnnotationQuestionStatus = useCallback(
    async (annotationId: string, status: QuestionStatus) => {
      const now = new Date().toISOString();
      const nextAnnotations = annotationsRef.current.map((annotation) =>
        annotation.id === annotationId
          ? { ...annotation, questionStatus: status, updatedAt: now }
          : annotation,
      );
      await saveAnnotations(nextAnnotations);
      onOpenAnnotation?.(annotationId);
    },
    [onOpenAnnotation, saveAnnotations],
  );

  const setCommentQuestionStatus = useCallback(
    async (annotationId: string, commentId: string, status: QuestionStatus) => {
      const now = new Date().toISOString();
      const nextAnnotations = annotationsRef.current.map((annotation) =>
        annotation.id === annotationId
          ? {
              ...annotation,
              updatedAt: now,
              comments: annotation.comments.map((comment) =>
                comment.id === commentId ? { ...comment, questionStatus: status } : comment,
              ),
            }
          : annotation,
      );
      await saveAnnotations(nextAnnotations);
      onOpenAnnotation?.(annotationId);
    },
    [onOpenAnnotation, saveAnnotations],
  );

  const deleteAnnotation = useCallback(
    async (annotationId: string) => {
      const nextAnnotations = annotationsRef.current.filter(
        (annotation) => annotation.id !== annotationId,
      );
      onBeforeDeleteAnnotation?.(annotationId);
      await saveAnnotations(nextAnnotations);
    },
    [onBeforeDeleteAnnotation, saveAnnotations],
  );

  return {
    addComment,
    annotations,
    annotationsRef,
    applyAnnotations,
    deleteAnnotation,
    latestArticleRef,
    replaceAnnotations,
    saveAnnotations,
    setAnnotationQuestionStatus,
    setCommentQuestionStatus,
  };
}

function acceptIncomingArticle(
  article: ArticleRecord,
  currentArticle: ArticleRecord | null,
  ignoreStaleArticleUpdates: boolean,
) {
  return (
    !ignoreStaleArticleUpdates ||
    currentArticle?.id !== article.id ||
    timestampValue(article.updatedAt) >= timestampValue(currentArticle.updatedAt)
  );
}

function timestampValue(value: string | number | undefined) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}
