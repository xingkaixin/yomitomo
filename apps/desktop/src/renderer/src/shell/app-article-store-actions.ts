import { useCallback } from 'react';
import i18next from 'i18next';
import type {
  ArticleReadingProgress,
  Annotation,
  Comment,
  ReaderChatState,
} from '@yomitomo/shared';
import type { TextImportCommitInput, WindowAnimationSourceRect } from '../../../ipc-contract';
import type { ArticleStore } from './app-article-store';
import { getDesktopApi } from './app-desktop-api';

type ImportProgressCallback = (progress: number) => void;

type UseAppArticleStoreActionsInput = {
  articleStore: ArticleStore;
};

export function useAppArticleStoreActions({ articleStore }: UseAppArticleStoreActionsInput) {
  const deleteArticle = useCallback(
    async (articleId: string) => {
      await articleStore.runMutation({
        optimistic: {
          patches: [{ type: 'article-delete', articleId }],
        },
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
        },
        invoke: () =>
          getDesktopApi().article.saveReadingProgress({
            articleId,
            progress,
          }),
        reconcile: (patch) => ({
          patches: [{ type: 'article-reading-progress', ...patch }],
        }),
        serialize: 'reading-progress',
      });
    },
    [articleStore],
  );

  const saveArticleReaderChatState = useCallback(
    async (articleId: string, readerChatState?: ReaderChatState) => {
      return articleStore.runMutation({
        invoke: () => getDesktopApi().article.saveReaderChatState({ articleId, readerChatState }),
        reconcile: () => ({ patches: [] }),
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
