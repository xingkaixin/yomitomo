import { useCallback, useMemo, useRef } from 'react';
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
} from './source-annotation-updates';

type SourceAnnotationsChange = {
  previousAnnotations: Annotation[];
  nextAnnotations: Annotation[];
  previousArticle: ArticleRecord;
  nextArticle: ArticleRecord;
};

type SourceAnnotationPersistenceResult = string | void;

type UseSourceAnnotationsOptions = {
  annotationAgents?: PublicAgent[];
  annotations: Annotation[];
  article: ArticleRecord;
  onArticleChange: (article: ArticleRecord) => void;
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
  ) => Promise<SourceAnnotationPersistenceResult> | SourceAnnotationPersistenceResult;
  onSaveArticleComment?: (
    articleId: string,
    annotationId: string,
    comment: AnnotationComment,
    updatedAt?: string,
  ) => Promise<SourceAnnotationPersistenceResult> | SourceAnnotationPersistenceResult;
  onAnnotationsApplied?: (change: SourceAnnotationsChange) => void;
  onAnnotationsSaved?: (change: SourceAnnotationsChange) => void;
  userProfile: UserProfile;
  onDeleteArticleAnnotation?: (
    articleId: string,
    annotationId: string,
  ) => Promise<SourceAnnotationPersistenceResult> | SourceAnnotationPersistenceResult;
  onDeleteArticleComment?: (
    articleId: string,
    annotationId: string,
    commentId: string,
  ) => Promise<SourceAnnotationPersistenceResult> | SourceAnnotationPersistenceResult;
};

export function useSourceAnnotations({
  annotationAgents = [],
  annotations: articleAnnotations,
  article,
  onArticleChange,
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
  const annotations = useMemo(() => sortAnnotations(articleAnnotations), [articleAnnotations]);
  const annotationsRef = useRef<Annotation[]>(annotations);
  const articleRef = useRef(article);
  annotationsRef.current = annotations;
  articleRef.current = article;

  const applySavedAnnotations = useCallback(
    (nextAnnotations: Annotation[], updatedAt: string) => {
      const previousAnnotations = annotationsRef.current;
      const previousArticle = { ...articleRef.current, annotations: previousAnnotations };
      const nextArticle = articleWithAnnotations(previousArticle, nextAnnotations, updatedAt);
      annotationsRef.current = nextArticle.annotations;
      onArticleChange(nextArticle);
      return {
        previousAnnotations,
        nextAnnotations: nextArticle.annotations,
        previousArticle,
        nextArticle,
      };
    },
    [onArticleChange],
  );

  const saveAnnotation = useCallback(
    async (annotation: Annotation) => {
      if (!onSaveArticleAnnotation) return;
      const requestedUpdatedAt = new Date().toISOString();
      const persistedUpdatedAt = await onSaveArticleAnnotation(
        articleRef.current.id,
        annotation,
        requestedUpdatedAt,
      );
      const updatedAt = persistedUpdatedAt || requestedUpdatedAt;
      const change = applySavedAnnotations(
        annotationsWithSavedAnnotation(annotationsRef.current, annotation),
        updatedAt,
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
      const pendingAnnotations = annotationsWithSavedComment(
        annotationsRef.current,
        annotationId,
        comment,
        updatedAt,
      );
      if (!pendingAnnotations) return;
      const persistedUpdatedAt = await onSaveArticleComment(
        articleRef.current.id,
        annotationId,
        comment,
        updatedAt,
      );
      const resolvedUpdatedAt = persistedUpdatedAt || updatedAt;
      const nextAnnotations = annotationsWithSavedComment(
        annotationsRef.current,
        annotationId,
        comment,
        resolvedUpdatedAt,
      );
      if (!nextAnnotations) return;
      const change = applySavedAnnotations(nextAnnotations, resolvedUpdatedAt);
      onAnnotationsSaved?.(change);
    },
    [applySavedAnnotations, onAnnotationsSaved, onSaveArticleComment],
  );

  const applyAnnotations = useCallback(
    (nextAnnotations: Annotation[], updatedAt = new Date().toISOString()) => {
      const previousAnnotations = annotationsRef.current;
      const sortedAnnotations = sortAnnotations(nextAnnotations);
      const nextArticle = {
        ...article,
        annotations: sortedAnnotations,
        updatedAt,
      };
      annotationsRef.current = sortedAnnotations;
      onArticleChange(nextArticle);
      onAnnotationsApplied?.({
        previousAnnotations,
        nextAnnotations: sortedAnnotations,
        previousArticle: { ...article, annotations: previousAnnotations },
        nextArticle,
      });
      return nextArticle;
    },
    [article, onAnnotationsApplied, onArticleChange],
  );

  const addComment = useCallback(
    async (annotationId: string, content: string, replyTo?: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      const comment = createUserComment(userProfile, trimmed, { replyTo });
      const nextAnnotations = appendAnnotationComment(
        annotationsRef.current,
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
      const persistedUpdatedAt = await onDeleteArticleAnnotation(
        articleRef.current.id,
        annotationId,
      );
      onBeforeDeleteAnnotation?.(annotationId);

      const updatedAt = persistedUpdatedAt || new Date().toISOString();
      const nextAnnotations = annotationsRef.current.filter(
        (annotation) => annotation.id !== annotationId,
      );
      const change = applySavedAnnotations(nextAnnotations, updatedAt);
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
      const pendingAnnotations = deleteAnnotationComment(
        annotationsRef.current,
        annotationId,
        commentId,
      );
      if (!pendingAnnotations) return;

      const persistedUpdatedAt = await onDeleteArticleComment(
        articleRef.current.id,
        annotationId,
        commentId,
      );
      const nextAnnotations = deleteAnnotationComment(
        annotationsRef.current,
        annotationId,
        commentId,
      );
      if (!nextAnnotations) return;
      const change = applySavedAnnotations(
        nextAnnotations,
        persistedUpdatedAt || new Date().toISOString(),
      );
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
    saveAnnotation,
    saveComment,
  };
}
