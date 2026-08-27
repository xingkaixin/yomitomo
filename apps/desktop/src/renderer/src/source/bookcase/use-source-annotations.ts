import { useCallback, useEffect, useMemo, useRef } from 'react';
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
  const articleId = article.id;
  const annotations = useMemo(() => sortAnnotations(articleAnnotations), [articleAnnotations]);
  const annotationsRef = useRef<Annotation[]>(annotations);
  const articleRef = useRef<ArticleRecord | null>(article);
  annotationsRef.current = annotations;
  articleRef.current = article;

  useEffect(() => {
    articleRef.current = article;
    return () => {
      articleRef.current = null;
    };
  }, [article]);

  const isCurrentArticle = useCallback((id: string) => articleRef.current?.id === id, []);

  const applySavedAnnotations = useCallback(
    (update: (current: Annotation[]) => Annotation[] | null, updatedAt: string) => {
      const currentArticle = articleRef.current;
      if (!currentArticle || currentArticle.id !== articleId) return;
      const previousAnnotations = annotationsRef.current;
      const nextAnnotations = update(previousAnnotations);
      if (!nextAnnotations) return;
      const previousArticle = { ...currentArticle, annotations: previousAnnotations };
      const nextArticle = articleWithAnnotations(previousArticle, nextAnnotations, updatedAt);
      annotationsRef.current = nextArticle.annotations;
      onArticleChange(nextArticle);
      const change = {
        previousAnnotations,
        nextAnnotations: nextArticle.annotations,
        previousArticle,
        nextArticle,
      };
      onAnnotationsSaved?.(change);
      return change;
    },
    [articleId, onAnnotationsSaved, onArticleChange],
  );

  const saveAnnotation = useCallback(
    async (annotation: Annotation) => {
      if (!onSaveArticleAnnotation) return;
      const requestedUpdatedAt = new Date().toISOString();
      const persistedUpdatedAt = await onSaveArticleAnnotation(
        articleId,
        annotation,
        requestedUpdatedAt,
      );
      const updatedAt = persistedUpdatedAt || requestedUpdatedAt;
      applySavedAnnotations(
        (current) => annotationsWithSavedAnnotation(current, annotation),
        updatedAt,
      );
    },
    [applySavedAnnotations, articleId, onSaveArticleAnnotation],
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
        articleId,
        annotationId,
        comment,
        updatedAt,
      );
      const resolvedUpdatedAt = persistedUpdatedAt || updatedAt;
      applySavedAnnotations(
        (current) => annotationsWithSavedComment(current, annotationId, comment, resolvedUpdatedAt),
        resolvedUpdatedAt,
      );
    },
    [applySavedAnnotations, articleId, onSaveArticleComment],
  );

  const applyAnnotations = useCallback(
    (nextAnnotations: Annotation[], updatedAt = new Date().toISOString()) => {
      if (!isCurrentArticle(articleId)) return null;
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
    [article, articleId, isCurrentArticle, onAnnotationsApplied, onArticleChange],
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
      if (!isCurrentArticle(articleId)) return;
      onOpenAnnotation?.(annotationId);

      const result = {
        annotation: nextAnnotation,
        comment,
        mentionedAgents: findMentionedAgents(trimmed, annotationAgents),
      };
      onCommentSaved?.(result);
    },
    [
      annotationAgents,
      articleId,
      isCurrentArticle,
      onCommentSaved,
      onOpenAnnotation,
      saveComment,
      userProfile,
    ],
  );

  const deleteAnnotation = useCallback(
    async (annotationId: string) => {
      if (!onDeleteArticleAnnotation) return;
      const persistedUpdatedAt = await onDeleteArticleAnnotation(articleId, annotationId);
      if (!isCurrentArticle(articleId)) return;
      onBeforeDeleteAnnotation?.(annotationId);

      const updatedAt = persistedUpdatedAt || new Date().toISOString();
      applySavedAnnotations(
        (current) => current.filter((annotation) => annotation.id !== annotationId),
        updatedAt,
      );
    },
    [
      applySavedAnnotations,
      articleId,
      isCurrentArticle,
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

      const persistedUpdatedAt = await onDeleteArticleComment(articleId, annotationId, commentId);
      const change = applySavedAnnotations(
        (current) => deleteAnnotationComment(current, annotationId, commentId),
        persistedUpdatedAt || new Date().toISOString(),
      );
      if (change) onOpenAnnotation?.(annotationId);
    },
    [applySavedAnnotations, articleId, onDeleteArticleComment, onOpenAnnotation],
  );

  return {
    addComment,
    annotations,
    annotationsRef,
    applyAnnotations,
    deleteComment,
    isCurrentArticle,
    deleteAnnotation,
    saveAnnotation,
    saveComment,
  };
}
