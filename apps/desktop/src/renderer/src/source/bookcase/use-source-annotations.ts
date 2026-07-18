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
  annotationsRef.current = annotations;

  const applySavedAnnotations = useCallback(
    (nextAnnotations: Annotation[]) => {
      const previousAnnotations = annotationsRef.current;
      const previousArticle = { ...article, annotations: previousAnnotations };
      const nextArticle = articleWithAnnotations(previousArticle, nextAnnotations);
      annotationsRef.current = nextArticle.annotations;
      onArticleChange(nextArticle);
      return {
        previousAnnotations,
        nextAnnotations: nextArticle.annotations,
        previousArticle,
        nextArticle,
      };
    },
    [article, onArticleChange],
  );

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
      const nextAnnotations = annotationsRef.current.filter(
        (annotation) => annotation.id !== annotationId,
      );
      onBeforeDeleteAnnotation?.(annotationId);

      const change = applySavedAnnotations(nextAnnotations);
      await onDeleteArticleAnnotation(change.previousArticle.id, annotationId);
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

      const change = applySavedAnnotations(nextAnnotations);
      await onDeleteArticleComment(change.previousArticle.id, annotationId, commentId);
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
