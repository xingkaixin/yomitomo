import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type {
  Annotation,
  ArticleRecord,
  Comment as AnnotationComment,
  PublicAgent,
  UserProfile,
} from '@yomitomo/shared';
import {
  appendAnnotationComment,
  createUserComment,
  deleteAnnotationComment,
  findMentionedAgents,
  sortAnnotations,
} from '@yomitomo/core';
import {
  annotationsWithSavedAnnotation,
  annotationsWithSavedComment,
  articleWithAnnotations,
} from './app-source-bookcase-shared';

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
  onSaveArticleAnnotation?: (
    articleId: string,
    annotation: Annotation,
    updatedAt?: string,
  ) => Promise<void> | void;
  onSaveArticleComment?: (
    articleId: string,
    annotationId: string,
    comment: AnnotationComment,
    updatedAt?: string,
  ) => Promise<void> | void;
  onAnnotationsApplied?: (change: SourceAnnotationsChange) => void;
  onAnnotationsSaved?: (change: SourceAnnotationsChange) => void;
  userProfile: UserProfile;
  onDeleteArticleAnnotation?: (articleId: string, annotationId: string) => Promise<void> | void;
  onDeleteArticleComment?: (
    articleId: string,
    annotationId: string,
    commentId: string,
  ) => Promise<void> | void;
};

export function useSourceAnnotations({
  annotationAgents = [],
  annotations: articleAnnotations,
  article,
  ignoreStaleArticleUpdates = false,
  onBeforeDeleteAnnotation,
  onCommentSaved,
  onOpenAnnotation,
  onSaveArticleAnnotation,
  onSaveArticleComment,
  onAnnotationsApplied,
  onAnnotationsSaved,
  userProfile,
  onDeleteArticleAnnotation,
  onDeleteArticleComment,
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
    replaceAnnotations(articleAnnotations);
  }, [article, articleAnnotations, ignoreStaleArticleUpdates, replaceAnnotations]);

  const applySavedAnnotations = useCallback((nextAnnotations: Annotation[]) => {
    const currentArticle = latestArticleRef.current;
    if (!currentArticle) return null;

    const previousAnnotations = annotationsRef.current;
    const nextArticle = articleWithAnnotations(currentArticle, nextAnnotations);
    const sortedAnnotations = nextArticle.annotations;
    latestArticleRef.current = nextArticle;
    annotationsRef.current = sortedAnnotations;
    setAnnotations(sortedAnnotations);
    return {
      previousAnnotations,
      nextAnnotations: sortedAnnotations,
      previousArticle: currentArticle,
      nextArticle,
    };
  }, []);

  const saveAnnotation = useCallback(
    async (annotation: Annotation) => {
      if (!onSaveArticleAnnotation) return;
      const change = applySavedAnnotations(
        annotationsWithSavedAnnotation(annotationsRef.current, annotation),
      );
      if (!change) return;
      await onSaveArticleAnnotation(
        change.nextArticle.id,
        annotation,
        change.nextArticle.updatedAt,
      );
      onAnnotationsSaved?.(change);
    },
    [applySavedAnnotations, onAnnotationsSaved, onSaveArticleAnnotation],
  );

  const saveComment = useCallback(
    async (
      annotationId: string,
      comment: AnnotationComment,
      updatedAt = new Date().toISOString(),
    ) => {
      if (!onSaveArticleComment) return;
      const nextAnnotations = annotationsWithSavedComment(
        annotationsRef.current,
        annotationId,
        comment,
        updatedAt,
      );
      const change = nextAnnotations ? applySavedAnnotations(nextAnnotations) : null;
      if (!change) return;
      await onSaveArticleComment(
        change.nextArticle.id,
        annotationId,
        comment,
        change.nextArticle.updatedAt,
      );
      onAnnotationsSaved?.(change);
    },
    [applySavedAnnotations, onAnnotationsSaved, onSaveArticleComment],
  );

  const applyAnnotations = useCallback(
    (nextAnnotations: Annotation[], updatedAt = new Date().toISOString()) => {
      const currentArticle = latestArticleRef.current;
      if (!currentArticle) return null;

      const previousAnnotations = annotationsRef.current;
      const sortedAnnotations = sortAnnotations(nextAnnotations);
      const nextArticle = {
        ...currentArticle,
        annotations: sortedAnnotations,
        updatedAt,
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
    async (annotationId: string, content: string, replyTo?: string) => {
      const trimmed = content.trim();
      const currentArticle = latestArticleRef.current;
      if (!trimmed || !currentArticle) return;

      const comment = createUserComment(userProfile, trimmed, { replyTo });
      const nextAnnotations = appendAnnotationComment(
        currentArticle.annotations,
        annotationId,
        comment,
        comment.createdAt,
      );
      const nextAnnotation = nextAnnotations?.find((annotation) => annotation.id === annotationId);
      if (!nextAnnotations || !nextAnnotation) return;

      await saveComment(annotationId, comment);
      onOpenAnnotation?.(annotationId);

      const result = {
        annotation: nextAnnotation,
        comment,
        mentionedAgents: findMentionedAgents(trimmed, annotationAgents),
      };
      onCommentSaved?.(result);
    },
    [annotationAgents, onCommentSaved, onOpenAnnotation, saveComment, userProfile],
  );

  const deleteAnnotation = useCallback(
    async (annotationId: string) => {
      if (!onDeleteArticleAnnotation) return;
      const currentArticle = latestArticleRef.current;
      if (!currentArticle) return;
      const nextAnnotations = annotationsRef.current.filter(
        (annotation) => annotation.id !== annotationId,
      );
      onBeforeDeleteAnnotation?.(annotationId);

      const change = applySavedAnnotations(nextAnnotations);
      if (!change) return;
      await onDeleteArticleAnnotation(currentArticle.id, annotationId);
      onAnnotationsSaved?.(change);
    },
    [
      applySavedAnnotations,
      onAnnotationsSaved,
      onBeforeDeleteAnnotation,
      onDeleteArticleAnnotation,
    ],
  );

  const deleteComment = useCallback(
    async (annotationId: string, commentId: string) => {
      if (!onDeleteArticleComment) return;
      const nextAnnotations = deleteAnnotationComment(
        annotationsRef.current,
        annotationId,
        commentId,
      );
      if (!nextAnnotations) return;
      const currentArticle = latestArticleRef.current;
      if (!currentArticle) return;

      const change = applySavedAnnotations(nextAnnotations);
      if (!change) return;
      await onDeleteArticleComment(currentArticle.id, annotationId, commentId);
      onAnnotationsSaved?.(change);
      onOpenAnnotation?.(annotationId);
    },
    [applySavedAnnotations, onAnnotationsSaved, onDeleteArticleComment, onOpenAnnotation],
  );

  return {
    addComment,
    annotations,
    annotationsRef,
    applyAnnotations,
    deleteComment,
    deleteAnnotation,
    latestArticleRef,
    replaceAnnotations,
    saveAnnotation,
    saveComment,
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
    timestampValue(article.updatedAt) > timestampValue(currentArticle.updatedAt)
  );
}

function timestampValue(value: string | number | undefined) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}
