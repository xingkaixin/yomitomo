import { useMemo, useRef, type RefObject } from 'react';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
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

export function useSourceAnnotations(options: UseSourceAnnotationsOptions) {
  const { annotations: articleAnnotations, article } = options;
  const articleId = article.id;
  const annotations = useMemo(() => sortAnnotations(articleAnnotations), [articleAnnotations]);
  const mountedRef = useRef(false);
  // Saves resolve before the owner re-renders, so later operations read the saved list from here.
  const savedAnnotationsRef = useRef<{ base: Annotation[]; next: Annotation[] } | null>(null);
  const readInput = useStableCallback(() => ({ annotations, options }));

  useMountEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  });

  const annotationsRef = useMemo<RefObject<Annotation[]>>(() => {
    function currentAnnotations() {
      const rendered = readInput().annotations;
      const saved = savedAnnotationsRef.current;
      return saved?.base === rendered ? saved.next : rendered;
    }
    return {
      get current() {
        return currentAnnotations();
      },
      set current(next) {
        savedAnnotationsRef.current = { base: readInput().annotations, next };
      },
    };
  }, []);

  const api = useMemo(() => {
    function currentArticle() {
      return mountedRef.current ? readInput().options.article : null;
    }

    function isCurrentArticle(id: string) {
      return currentArticle()?.id === id;
    }

    function applySavedAnnotations(
      update: (current: Annotation[]) => Annotation[] | null,
      updatedAt: string,
    ) {
      const latestArticle = currentArticle();
      if (!latestArticle || latestArticle.id !== articleId) return;
      const { onAnnotationsSaved, onArticleChange } = readInput().options;
      const previousAnnotations = annotationsRef.current;
      const nextAnnotations = update(previousAnnotations);
      if (!nextAnnotations) return;
      const previousArticle = { ...latestArticle, annotations: previousAnnotations };
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
    }

    async function saveAnnotation(annotation: Annotation) {
      const { onSaveArticleAnnotation } = readInput().options;
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
    }

    async function saveComment(
      annotationId: string,
      comment: AnnotationComment,
      updatedAt = new Date().toISOString(),
    ) {
      const { onSaveArticleComment } = readInput().options;
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
    }

    function applyAnnotations(nextAnnotations: Annotation[], updatedAt = new Date().toISOString()) {
      const latestArticle = currentArticle();
      if (!latestArticle || latestArticle.id !== articleId) return null;
      const { onAnnotationsApplied, onArticleChange } = readInput().options;
      const previousAnnotations = annotationsRef.current;
      const sortedAnnotations = sortAnnotations(nextAnnotations);
      const nextArticle = {
        ...latestArticle,
        annotations: sortedAnnotations,
        updatedAt,
      };
      annotationsRef.current = sortedAnnotations;
      onArticleChange(nextArticle);
      onAnnotationsApplied?.({
        previousAnnotations,
        nextAnnotations: sortedAnnotations,
        previousArticle: { ...latestArticle, annotations: previousAnnotations },
        nextArticle,
      });
      return nextArticle;
    }

    async function addComment(annotationId: string, content: string, replyTo?: string) {
      const trimmed = content.trim();
      if (!trimmed) return;

      const { annotationAgents = [], userProfile } = readInput().options;
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
      const { onCommentSaved, onOpenAnnotation } = readInput().options;
      onOpenAnnotation?.(annotationId);
      onCommentSaved?.({
        annotation: nextAnnotation,
        comment,
        mentionedAgents: findMentionedAgents(trimmed, annotationAgents),
      });
    }

    async function deleteAnnotation(annotationId: string) {
      const { onDeleteArticleAnnotation } = readInput().options;
      if (!onDeleteArticleAnnotation) return;
      const persistedUpdatedAt = await onDeleteArticleAnnotation(articleId, annotationId);
      if (!isCurrentArticle(articleId)) return;
      readInput().options.onBeforeDeleteAnnotation?.(annotationId);

      const updatedAt = persistedUpdatedAt || new Date().toISOString();
      applySavedAnnotations(
        (current) => current.filter((annotation) => annotation.id !== annotationId),
        updatedAt,
      );
    }

    async function deleteComment(annotationId: string, commentId: string) {
      const { onDeleteArticleComment } = readInput().options;
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
      if (change) readInput().options.onOpenAnnotation?.(annotationId);
    }

    return {
      addComment,
      applyAnnotations,
      deleteAnnotation,
      deleteComment,
      isCurrentArticle,
      saveAnnotation,
      saveComment,
    };
  }, [annotationsRef, articleId]);

  return {
    ...api,
    annotations,
    annotationsRef,
  };
}
