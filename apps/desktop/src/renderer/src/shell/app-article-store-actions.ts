import { useCallback, useRef } from 'react';
import i18next from 'i18next';
import type {
  ArticleDeletePatch,
  ArticleReadingProgress,
  ArticleReadingProgressPatch,
  ArticleStorePatch,
  ArticleSummaryRecord,
  ArticleUpsertPatch,
  Annotation,
  Comment,
  DesktopStore,
  ReaderChatState,
} from '@yomitomo/shared';
import type { WindowAnimationSourceRect } from '../../../ipc-contract';

type DesktopStoreRef = { current: DesktopStore };
type ApplyStore = (nextStore: DesktopStore) => DesktopStore;
type ImportProgressCallback = (progress: number) => void;

type UseAppArticleStoreActionsInput = {
  storeRef: DesktopStoreRef;
  applyStore: ApplyStore;
};

export function useAppArticleStoreActions({
  storeRef,
  applyStore,
}: UseAppArticleStoreActionsInput) {
  const readingProgressSaveQueueRef = useRef(Promise.resolve());
  const deleteArticle = useCallback(
    async (articleId: string) => {
      const desktop = window.yomitomoDesktop;
      if (!desktop) return;

      const nextStore = applyArticleStorePatch(storeRef.current, {
        type: 'article-delete',
        articleId,
      });
      storeRef.current = nextStore;
      applyStore(nextStore);
      await desktop.deleteArticle(articleId);
    },
    [applyStore, storeRef],
  );

  const readArticle = useCallback(async (articleId: string) => {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return null;

    return desktop.getArticle(articleId);
  }, []);

  const mergeArticleAgentAnnotation = useCallback(
    async (articleId: string, annotation: Annotation) => {
      const desktop = window.yomitomoDesktop;
      if (!desktop) return null;

      const result = await desktop.mergeArticleAgentAnnotation({ articleId, annotation });
      if (!result) return null;
      const nextStore = applyArticleStorePatch(storeRef.current, result.patch);
      storeRef.current = nextStore;
      applyStore(nextStore);
      return result;
    },
    [applyStore, storeRef],
  );

  const deleteArticleAnnotation = useCallback(
    async (articleId: string, annotationId: string) => {
      const desktop = window.yomitomoDesktop;
      if (!desktop) return;

      const patch = await desktop.deleteArticleAnnotation(articleId, annotationId);
      if (!patch) return;
      const nextStore = applyArticleStorePatch(storeRef.current, patch);
      storeRef.current = nextStore;
      applyStore(nextStore);
    },
    [applyStore, storeRef],
  );

  const deleteArticleComment = useCallback(
    async (articleId: string, annotationId: string, commentId: string) => {
      const desktop = window.yomitomoDesktop;
      if (!desktop) return;

      const patch = await desktop.deleteArticleComment(articleId, annotationId, commentId);
      if (!patch) return;
      const nextStore = applyArticleStorePatch(storeRef.current, patch);
      storeRef.current = nextStore;
      applyStore(nextStore);
    },
    [applyStore, storeRef],
  );

  const saveArticleAnnotation = useCallback(
    async (articleId: string, annotation: Annotation, updatedAt?: string) => {
      const desktop = window.yomitomoDesktop;
      if (!desktop) return;

      const patch = await desktop.saveArticleAnnotation(articleId, annotation, updatedAt);
      if (!patch) return;
      const nextStore = applyArticleStorePatch(storeRef.current, patch);
      storeRef.current = nextStore;
      applyStore(nextStore);
    },
    [applyStore, storeRef],
  );

  const saveArticleComment = useCallback(
    async (articleId: string, annotationId: string, comment: Comment, updatedAt?: string) => {
      const desktop = window.yomitomoDesktop;
      if (!desktop) return;

      const patch = await desktop.saveArticleComment(articleId, annotationId, comment, updatedAt);
      if (!patch) return;
      const nextStore = applyArticleStorePatch(storeRef.current, patch);
      storeRef.current = nextStore;
      applyStore(nextStore);
    },
    [applyStore, storeRef],
  );

  const openArticleDiscussion = useCallback(
    async (articleId: string, annotationId: string, sourceRect?: WindowAnimationSourceRect) => {
      const desktop = window.yomitomoDesktop;
      if (!desktop) return;

      await desktop.openAnnotationDiscussion({
        articleId,
        annotationId,
        ...(sourceRect ? { sourceRect } : {}),
      });
    },
    [],
  );

  const closeArticleDiscussions = useCallback(async (articleId: string) => {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;

    await desktop.closeArticleAnnotationDiscussions(articleId);
  }, []);

  const saveArticleReadingProgress = useCallback(
    async (articleId: string, progress: ArticleReadingProgress) => {
      const desktop = window.yomitomoDesktop;
      if (!desktop) return;

      const run = async () => {
        const optimisticStore = applyArticleReadingProgressPatch(storeRef.current, {
          articleId,
          readingProgress: progress,
          updatedAt: progress.updatedAt,
        });
        storeRef.current = optimisticStore;
        applyStore(optimisticStore);
        const patch = await desktop.saveArticleReadingProgress(articleId, progress);
        const nextStore = applyArticleStorePatch(storeRef.current, {
          type: 'article-reading-progress',
          ...patch,
        });
        storeRef.current = nextStore;
        applyStore(nextStore);
      };
      const nextUpdate = readingProgressSaveQueueRef.current.then(run, run);
      readingProgressSaveQueueRef.current = nextUpdate.catch(() => undefined);
      await nextUpdate;
    },
    [applyStore, storeRef],
  );

  const saveArticleReaderChatState = useCallback(
    async (articleId: string, readerChatState?: ReaderChatState) => {
      const desktop = window.yomitomoDesktop;
      if (!desktop) return;

      return desktop.saveArticleReaderChatState(articleId, readerChatState);
    },
    [],
  );

  const importArticleUrl = useCallback(
    async (url: string, requestId?: string) => {
      const result = requestId
        ? await window.yomitomoDesktop.importArticleUrl(url, requestId)
        : await window.yomitomoDesktop.importArticleUrl(url);
      if (result.status === 'imported') {
        const nextStore = applyArticleStorePatch(storeRef.current, result.patch);
        storeRef.current = nextStore;
        applyStore(nextStore);
      }
      return result;
    },
    [applyStore, storeRef],
  );

  const cancelArticleUrlImport = useCallback((requestId: string) => {
    return window.yomitomoDesktop.cancelArticleUrlImport(requestId);
  }, []);

  const importEbookFile = useCallback(
    async (file: File, onProgress?: ImportProgressCallback) => {
      onProgress?.(4);
      const data = await readFileArrayBuffer(
        file,
        (progress) => {
          onProgress?.(Math.min(76, Math.round(progress * 76)));
        },
        i18next.t('library.import.ebook.readFailed'),
      );
      onProgress?.(82);
      const result = await window.yomitomoDesktop.importEbookFile({
        fileName: file.name,
        mimeType: file.type,
        data,
      });
      onProgress?.(100);
      if (result.status === 'imported') {
        const nextStore = applyArticleStorePatch(storeRef.current, result.patch);
        storeRef.current = nextStore;
        applyStore(nextStore);
      }
      return result;
    },
    [applyStore, storeRef],
  );

  const importPdfFile = useCallback(
    async (file: File, onProgress?: ImportProgressCallback) => {
      onProgress?.(4);
      const data = await readFileArrayBuffer(
        file,
        (progress) => {
          onProgress?.(Math.min(76, Math.round(progress * 76)));
        },
        i18next.t('library.import.pdf.readFailed'),
      );
      onProgress?.(82);
      const result = await window.yomitomoDesktop.importPdfFile({
        fileName: file.name,
        mimeType: file.type,
        data,
      });
      onProgress?.(100);
      if (result.status === 'imported') {
        const nextStore = applyArticleStorePatch(storeRef.current, result.patch);
        storeRef.current = nextStore;
        applyStore(nextStore);
      }
      return result;
    },
    [applyStore, storeRef],
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
    importEbookFile,
    importPdfFile,
  };
}

export function applyArticleStorePatch(
  store: DesktopStore,
  patch: ArticleStorePatch,
): DesktopStore {
  switch (patch.type) {
    case 'article-upsert':
      return applyArticleUpsertPatch(store, patch);
    case 'article-reading-progress':
      return applyArticleReadingProgressPatch(store, patch);
    case 'article-delete':
      return applyArticleDeletePatch(store, patch);
  }
}

export function applyArticleReadingProgressPatch(
  store: DesktopStore,
  patch: ArticleReadingProgressPatch,
): DesktopStore {
  return {
    ...store,
    articles: store.articles.map((article) =>
      article.id === patch.articleId
        ? { ...article, readingProgress: patch.readingProgress, updatedAt: patch.updatedAt }
        : article,
    ),
  };
}

export function applyArticleUpsertPatch(
  store: DesktopStore,
  patch: ArticleUpsertPatch,
): DesktopStore {
  const existingIndex = store.articles.findIndex((article) => article.id === patch.article.id);
  if (existingIndex === -1) {
    return {
      ...store,
      articles: [patch.article, ...store.articles],
    };
  }

  return {
    ...store,
    articles: store.articles.map(
      (article, index): ArticleSummaryRecord => (index === existingIndex ? patch.article : article),
    ),
  };
}

export function applyArticleDeletePatch(
  store: DesktopStore,
  patch: ArticleDeletePatch,
): DesktopStore {
  return {
    ...store,
    articles: store.articles.filter((article) => article.id !== patch.articleId),
    collectionMembers: store.collectionMembers.filter(
      (member) => member.member.kind !== 'article' || member.member.id !== patch.articleId,
    ),
    pins: store.pins.filter(
      (pin) => pin.targetKind !== 'article' || pin.targetId !== patch.articleId,
    ),
  };
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
