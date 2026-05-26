import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  onSaveArticle,
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

  const deleteAnnotation = useCallback(
    async (annotationId: string) => {
      const currentArticle = latestArticleRef.current;
      if (!currentArticle) return;
      const nextAnnotations = annotationsRef.current.filter(
        (annotation) => annotation.id !== annotationId,
      );
      onBeforeDeleteAnnotation?.(annotationId);
      if (!onDeleteArticleAnnotation) {
        await saveAnnotations(nextAnnotations);
        return;
      }

      const previousAnnotations = annotationsRef.current;
      const nextArticle = articleWithAnnotations(currentArticle, nextAnnotations);
      const sortedAnnotations = nextArticle.annotations;
      latestArticleRef.current = nextArticle;
      annotationsRef.current = sortedAnnotations;
      setAnnotations(sortedAnnotations);
      await onDeleteArticleAnnotation(currentArticle.id, annotationId);
      onAnnotationsSaved?.({
        previousAnnotations,
        nextAnnotations: sortedAnnotations,
        previousArticle: currentArticle,
        nextArticle,
      });
    },
    [onAnnotationsSaved, onBeforeDeleteAnnotation, onDeleteArticleAnnotation, saveAnnotations],
  );

  const deleteComment = useCallback(
    async (annotationId: string, commentId: string) => {
      const nextAnnotations = deleteAnnotationComment(
        annotationsRef.current,
        annotationId,
        commentId,
      );
      if (!nextAnnotations) return;
      const currentArticle = latestArticleRef.current;
      if (!currentArticle) return;
      if (!onDeleteArticleComment) {
        await saveAnnotations(nextAnnotations);
        onOpenAnnotation?.(annotationId);
        return;
      }

      const previousAnnotations = annotationsRef.current;
      const nextArticle = articleWithAnnotations(currentArticle, nextAnnotations);
      const sortedAnnotations = nextArticle.annotations;
      latestArticleRef.current = nextArticle;
      annotationsRef.current = sortedAnnotations;
      setAnnotations(sortedAnnotations);
      await onDeleteArticleComment(currentArticle.id, annotationId, commentId);
      onAnnotationsSaved?.({
        previousAnnotations,
        nextAnnotations: sortedAnnotations,
        previousArticle: currentArticle,
        nextArticle,
      });
      onOpenAnnotation?.(annotationId);
    },
    [onAnnotationsSaved, onDeleteArticleComment, onOpenAnnotation, saveAnnotations],
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
    saveAnnotations,
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
