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
  onSaveArticle,
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
      const localWrite = localAnnotationWrite(
        previousAnnotations,
        sortedAnnotations,
        nextArticle.updatedAt,
      );
      if (localWrite?.kind === 'annotation-upsert' && onSaveArticleAnnotation) {
        await onSaveArticleAnnotation(
          currentArticle.id,
          localWrite.annotation,
          localWrite.updatedAt,
        );
      } else if (localWrite?.kind === 'comment-upsert' && onSaveArticleComment) {
        await onSaveArticleComment(
          currentArticle.id,
          localWrite.annotationId,
          localWrite.comment,
          localWrite.updatedAt,
        );
      } else if (localWrite?.kind === 'comment-delete' && onDeleteArticleComment) {
        await onDeleteArticleComment(
          currentArticle.id,
          localWrite.annotationId,
          localWrite.commentId,
        );
      } else if (localWrite?.kind === 'annotation-delete' && onDeleteArticleAnnotation) {
        await onDeleteArticleAnnotation(currentArticle.id, localWrite.annotationId);
      } else {
        await onSaveArticle(nextArticle);
      }
      onAnnotationsSaved?.({
        previousAnnotations,
        nextAnnotations: sortedAnnotations,
        previousArticle: currentArticle,
        nextArticle,
      });
    },
    [
      onAnnotationsSaved,
      onDeleteArticleAnnotation,
      onDeleteArticleComment,
      onSaveArticle,
      onSaveArticleAnnotation,
      onSaveArticleComment,
    ],
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

type LocalAnnotationWrite =
  | {
      kind: 'annotation-upsert';
      annotation: Annotation;
      updatedAt: string;
    }
  | {
      kind: 'annotation-delete';
      annotationId: string;
    }
  | {
      kind: 'comment-upsert';
      annotationId: string;
      comment: AnnotationComment;
      updatedAt: string;
    }
  | {
      kind: 'comment-delete';
      annotationId: string;
      commentId: string;
    };

function localAnnotationWrite(
  previousAnnotations: Annotation[],
  nextAnnotations: Annotation[],
  updatedAt: string,
): LocalAnnotationWrite | null {
  const previousById = new Map(
    previousAnnotations.map((annotation) => [annotation.id, annotation]),
  );
  const nextById = new Map(nextAnnotations.map((annotation) => [annotation.id, annotation]));
  const addedAnnotations = nextAnnotations.filter((annotation) => !previousById.has(annotation.id));
  const removedAnnotations = previousAnnotations.filter(
    (annotation) => !nextById.has(annotation.id),
  );
  const changedAnnotations = nextAnnotations.filter((annotation) => {
    const previous = previousById.get(annotation.id);
    return previous && annotationChanged(previous, annotation);
  });
  const changeCount =
    addedAnnotations.length + removedAnnotations.length + changedAnnotations.length;

  if (changeCount !== 1) return null;
  if (addedAnnotations.length === 1) {
    return { kind: 'annotation-upsert', annotation: addedAnnotations[0], updatedAt };
  }
  if (removedAnnotations.length === 1) {
    return { kind: 'annotation-delete', annotationId: removedAnnotations[0].id };
  }

  const nextAnnotation = changedAnnotations[0];
  const previousAnnotation = previousById.get(nextAnnotation.id);
  if (!previousAnnotation) return null;
  const commentWrite = localCommentWrite(previousAnnotation, nextAnnotation, updatedAt);
  return commentWrite || { kind: 'annotation-upsert', annotation: nextAnnotation, updatedAt };
}

function localCommentWrite(
  previousAnnotation: Annotation,
  nextAnnotation: Annotation,
  updatedAt: string,
): LocalAnnotationWrite | null {
  const previousWithoutComments = { ...previousAnnotation, comments: [], updatedAt: '' };
  const nextWithoutComments = { ...nextAnnotation, comments: [], updatedAt: '' };
  if (annotationChanged(previousWithoutComments, nextWithoutComments)) return null;

  const previousById = new Map(previousAnnotation.comments.map((comment) => [comment.id, comment]));
  const nextById = new Map(nextAnnotation.comments.map((comment) => [comment.id, comment]));
  const addedComments = nextAnnotation.comments.filter((comment) => !previousById.has(comment.id));
  const removedComments = previousAnnotation.comments.filter(
    (comment) => !nextById.has(comment.id),
  );
  const changedComments = nextAnnotation.comments.filter((comment) => {
    const previous = previousById.get(comment.id);
    return previous && commentChanged(previous, comment);
  });
  const changeCount = addedComments.length + removedComments.length + changedComments.length;

  if (changeCount !== 1) return null;
  if (addedComments.length === 1) {
    return {
      kind: 'comment-upsert',
      annotationId: nextAnnotation.id,
      comment: addedComments[0],
      updatedAt,
    };
  }
  if (changedComments.length === 1) {
    return {
      kind: 'comment-upsert',
      annotationId: nextAnnotation.id,
      comment: changedComments[0],
      updatedAt,
    };
  }
  if (removedComments.length === 1) {
    return {
      kind: 'comment-delete',
      annotationId: nextAnnotation.id,
      commentId: removedComments[0].id,
    };
  }
  return null;
}

function annotationChanged(previous: Annotation, next: Annotation) {
  return JSON.stringify(previous) !== JSON.stringify(next);
}

function commentChanged(previous: AnnotationComment, next: AnnotationComment) {
  return JSON.stringify(previous) !== JSON.stringify(next);
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
