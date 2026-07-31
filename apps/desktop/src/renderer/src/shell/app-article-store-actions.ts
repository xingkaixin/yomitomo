import { useCallback } from 'react';
import i18next from 'i18next';
import type {
  ArticleReadingProgress,
  ArticleRecord,
  Annotation,
  Comment,
  ReaderChatState,
} from '@yomitomo/shared';
import {
  deleteAnnotationComment,
  mergeAgentAnnotationAsThought,
  sortAnnotations,
} from '@yomitomo/core';
import type { TextImportCommitInput, WindowAnimationSourceRect } from '../../../ipc-contract';
import { articleStorePatchCommit, type ArticleStore } from './app-article-store';
import { getDesktopApi } from './app-desktop-api';

type ImportProgressCallback = (progress: number) => void;

type UseAppArticleStoreActionsInput = {
  articleStore: ArticleStore;
};

export function useAppArticleStoreActions({ articleStore }: UseAppArticleStoreActionsInput) {
  const deleteArticle = useCallback(
    async (articleId: string) => {
      await articleStore.runMutation({
        optimistic: articleStorePatchCommit({ type: 'article-delete', articleId }),
        invoke: () => getDesktopApi().article.delete(articleId),
        reconcile: () => ({ patches: [] }),
      });
    },
    [articleStore],
  );

  const readArticle = useCallback(async (articleId: string) => {
    return getDesktopApi().article.get(articleId);
  }, []);

  const mergeArticleAgentAnnotation = useCallback(
    async (articleId: string, annotation: Annotation) => {
      return articleStore.runMutation({
        invoke: () =>
          getDesktopApi().article.mergeAgentAnnotation({
            articleId,
            annotation,
          }),
        reconcile: (result) => ({
          patches: result ? [result.patch] : [],
          current: result
            ? {
                type: 'update',
                articleId,
                update: (article) =>
                  articleWithAnnotations(
                    article,
                    mergeAgentAnnotationAsThought(article.annotations, annotation).annotations,
                    result.patch.article.updatedAt,
                  ),
              }
            : undefined,
        }),
      });
    },
    [articleStore],
  );

  const deleteArticleAnnotation = useCallback(
    async (articleId: string, annotationId: string) => {
      await articleStore.runMutation({
        invoke: () =>
          getDesktopApi().article.deleteAnnotation({
            articleId,
            annotationId,
          }),
        reconcile: (patch) => ({
          patches: patch ? [patch] : [],
          current: patch
            ? {
                type: 'update',
                articleId,
                update: (article) => ({
                  ...article,
                  annotations: article.annotations.filter(
                    (annotation) => annotation.id !== annotationId,
                  ),
                  updatedAt: patch.article.updatedAt,
                }),
              }
            : undefined,
        }),
      });
    },
    [articleStore],
  );

  const deleteArticleComment = useCallback(
    async (articleId: string, annotationId: string, commentId: string) => {
      await articleStore.runMutation({
        invoke: () =>
          getDesktopApi().article.deleteComment({
            articleId,
            annotationId,
            commentId,
          }),
        reconcile: (patch) => ({
          patches: patch ? [patch] : [],
          current: patch
            ? {
                type: 'update',
                articleId,
                update: (article) =>
                  articleWithAnnotations(
                    article,
                    annotationsWithoutDeletedComment(
                      article.annotations,
                      annotationId,
                      commentId,
                      patch.article.updatedAt,
                    ),
                    patch.article.updatedAt,
                  ),
              }
            : undefined,
        }),
      });
    },
    [articleStore],
  );

  const saveArticleAnnotation = useCallback(
    async (articleId: string, annotation: Annotation, updatedAt?: string) => {
      await articleStore.runMutation({
        invoke: () =>
          getDesktopApi().article.saveAnnotation({
            articleId,
            annotation,
            updatedAt,
          }),
        reconcile: (patch) => ({
          patches: patch ? [patch] : [],
          current: patch
            ? {
                type: 'update',
                articleId,
                update: (article) =>
                  articleWithAnnotations(
                    article,
                    annotationsWithSavedAnnotation(article.annotations, annotation),
                    patch.article.updatedAt,
                  ),
              }
            : undefined,
        }),
      });
    },
    [articleStore],
  );

  const saveArticleComment = useCallback(
    async (articleId: string, annotationId: string, comment: Comment, updatedAt?: string) => {
      await articleStore.runMutation({
        invoke: () =>
          getDesktopApi().article.saveComment({
            articleId,
            annotationId,
            comment,
            updatedAt,
          }),
        reconcile: (patch) => ({
          patches: patch ? [patch] : [],
          current: patch
            ? {
                type: 'update',
                articleId,
                update: (article) =>
                  articleWithAnnotations(
                    article,
                    annotationsWithSavedComment(article.annotations, annotationId, comment),
                    patch.article.updatedAt,
                  ),
              }
            : undefined,
        }),
      });
    },
    [articleStore],
  );

  const openArticleDiscussion = useCallback(
    async (articleId: string, annotationId: string, sourceRect?: WindowAnimationSourceRect) => {
      await getDesktopApi().annotations.discussion.open({
        articleId,
        annotationId,
        ...(sourceRect ? { sourceRect } : {}),
      });
    },
    [],
  );

  const closeArticleDiscussions = useCallback(async (articleId: string) => {
    await getDesktopApi().annotations.discussion.closeArticle({ articleId });
  }, []);

  const saveArticleReadingProgress = useCallback(
    async (articleId: string, progress: ArticleReadingProgress) => {
      await articleStore.runMutation({
        optimistic: {
          patches: [
            {
              type: 'article-reading-progress',
              articleId,
              readingProgress: progress,
              updatedAt: progress.updatedAt,
            },
          ],
          current: {
            type: 'update',
            articleId,
            update: (article) => ({
              ...article,
              readingProgress: progress,
              updatedAt: progress.updatedAt,
            }),
          },
        },
        invoke: () =>
          getDesktopApi().article.saveReadingProgress({
            articleId,
            progress,
          }),
        reconcile: (patch) => ({
          patches: [{ type: 'article-reading-progress', ...patch }],
          current: {
            type: 'update',
            articleId,
            update: (article) => ({
              ...article,
              readingProgress: patch.readingProgress,
              updatedAt: patch.updatedAt,
            }),
          },
        }),
        serialize: 'reading-progress',
      });
    },
    [articleStore],
  );

  const saveArticleReaderChatState = useCallback(
    async (articleId: string, readerChatState?: ReaderChatState) => {
      return articleStore.runMutation({
        optimistic: {
          patches: [],
          current: {
            type: 'update',
            articleId,
            update: (article) => ({
              ...article,
              readerChatState,
              updatedAt: readerChatState?.updatedAt || article.updatedAt,
            }),
          },
        },
        invoke: () => getDesktopApi().article.saveReaderChatState({ articleId, readerChatState }),
        reconcile: (patch) => ({
          patches: [],
          current: {
            type: 'update',
            articleId,
            update: (article) => ({
              ...article,
              readerChatState: patch.readerChatState,
              updatedAt: patch.updatedAt,
            }),
          },
        }),
      });
    },
    [articleStore],
  );

  const importArticleUrl = useCallback(
    async (url: string, requestId?: string) => {
      return articleStore.runMutation({
        invoke: () => getDesktopApi().article.importUrl({ url, requestId }),
        reconcile: (result) => ({
          patches: result.status === 'imported' ? [result.patch] : [],
        }),
      });
    },
    [articleStore],
  );

  const cancelArticleUrlImport = useCallback((requestId: string) => {
    return getDesktopApi().article.cancelUrlImport(requestId);
  }, []);

  const importEbookFile = useCallback(
    async (file: File, onProgress?: ImportProgressCallback) => {
      return articleStore.runMutation({
        invoke: async () => {
          onProgress?.(4);
          const data = await readFileArrayBuffer(
            file,
            (progress) => {
              onProgress?.(Math.min(76, Math.round(progress * 76)));
            },
            i18next.t('library.import.ebook.readFailed'),
          );
          onProgress?.(82);
          const result = await getDesktopApi().article.ebook.importFile({
            fileName: file.name,
            mimeType: file.type,
            data,
          });
          onProgress?.(100);
          return result;
        },
        reconcile: (result) => ({
          patches: result.status === 'imported' ? [result.patch] : [],
        }),
      });
    },
    [articleStore],
  );

  const commitTextImport = useCallback(
    async (input: TextImportCommitInput) => {
      return articleStore.runMutation({
        invoke: () => getDesktopApi().article.text.commitImport(input),
        reconcile: (result) => ({
          // main excludes the sender from article:patched, so this result is the
          // importing window's only source for its own new articles.
          patches: result.patches,
        }),
      });
    },
    [articleStore],
  );

  const importPdfFile = useCallback(
    async (file: File, onProgress?: ImportProgressCallback) => {
      return articleStore.runMutation({
        invoke: async () => {
          onProgress?.(4);
          const data = await readFileArrayBuffer(
            file,
            (progress) => {
              onProgress?.(Math.min(76, Math.round(progress * 76)));
            },
            i18next.t('library.import.pdf.readFailed'),
          );
          onProgress?.(82);
          const result = await getDesktopApi().article.pdf.importFile({
            fileName: file.name,
            mimeType: file.type,
            data,
          });
          onProgress?.(100);
          return result;
        },
        reconcile: (result) => ({
          patches: result.status === 'imported' ? [result.patch] : [],
        }),
      });
    },
    [articleStore],
  );

  return {
    deleteArticle,
    deleteArticleAnnotation,
    deleteArticleComment,
    closeArticleDiscussions,
    openArticleDiscussion,
    readArticle,
    mergeArticleAgentAnnotation,
    saveArticleAnnotation,
    saveArticleComment,
    saveArticleReadingProgress,
    saveArticleReaderChatState,
    importArticleUrl,
    cancelArticleUrlImport,
    commitTextImport,
    importEbookFile,
    importPdfFile,
  };
}

export type ArticleActions = ReturnType<typeof useAppArticleStoreActions>;
export type ReaderArticleActions = Pick<
  ArticleActions,
  | 'deleteArticleAnnotation'
  | 'deleteArticleComment'
  | 'mergeArticleAgentAnnotation'
  | 'openArticleDiscussion'
  | 'saveArticleAnnotation'
  | 'saveArticleComment'
  | 'saveArticleReadingProgress'
  | 'saveArticleReaderChatState'
>;

function articleWithAnnotations(
  article: ArticleRecord,
  annotations: Annotation[],
  updatedAt: string,
) {
  return {
    ...article,
    annotations: sortAnnotations(annotations),
    updatedAt,
  };
}

function annotationsWithSavedAnnotation(annotations: Annotation[], saved: Annotation) {
  const existing = annotations.some((annotation) => annotation.id === saved.id);
  return existing ? annotations : [...annotations, saved];
}

function annotationsWithSavedComment(
  annotations: Annotation[],
  annotationId: string,
  saved: Comment,
) {
  return annotations.map((annotation) => {
    if (annotation.id !== annotationId) return annotation;
    const existing = annotation.comments.some((comment) => comment.id === saved.id);
    return existing ? annotation : { ...annotation, comments: [...annotation.comments, saved] };
  });
}

function annotationsWithoutDeletedComment(
  annotations: Annotation[],
  annotationId: string,
  commentId: string,
  updatedAt: string,
) {
  return (
    deleteAnnotationComment(annotations, annotationId, commentId, updatedAt) ||
    annotations.map((annotation) =>
      annotation.id === annotationId ? { ...annotation, updatedAt } : annotation,
    )
  );
}

function readFileArrayBuffer(
  file: File,
  onProgress: (progress: number) => void,
  errorMessage: string,
) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return;
      onProgress(event.loaded / event.total);
    });
    reader.addEventListener('load', () => {
      if (reader.result instanceof ArrayBuffer) {
        onProgress(1);
        resolve(reader.result);
        return;
      }
      reject(new Error(errorMessage));
    });
    reader.addEventListener('error', () => reject(reader.error || new Error(errorMessage)));
    reader.readAsArrayBuffer(file);
  });
}
