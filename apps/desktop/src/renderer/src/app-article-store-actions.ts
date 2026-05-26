import { useCallback, useRef } from 'react';
import type {
  ArticleDeletePatch,
  ArticleReadingProgress,
  ArticleReadingProgressPatch,
  ArticleRecord,
  ArticleStorePatch,
  ArticleSummaryRecord,
  ArticleUpsertPatch,
  DesktopStore,
} from '@yomitomo/shared';

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
  const articleUpdateQueueRef = useRef(Promise.resolve());

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

  const saveArticle = useCallback(
    async (article: ArticleRecord) => {
      const desktop = window.yomitomoDesktop;
      if (!desktop) return;

      const patch = await desktop.saveArticle(article);
      const nextStore = applyArticleStorePatch(storeRef.current, patch);
      storeRef.current = nextStore;
      applyStore(nextStore);
    },
    [applyStore, storeRef],
  );

  const updateArticle = useCallback(
    async (articleId: string, update: (article: ArticleRecord) => ArticleRecord | null) => {
      const desktop = window.yomitomoDesktop;
      if (!desktop) return;

      const run = async () => {
        const article = await desktop.getArticle(articleId);
        if (!article) return;
        const nextArticle = update(article);
        if (!nextArticle) return;
        const patch = await desktop.saveArticle(nextArticle);
        const nextStore = applyArticleStorePatch(storeRef.current, patch);
        storeRef.current = nextStore;
        applyStore(nextStore);
      };
      const nextUpdate = articleUpdateQueueRef.current.then(run, run);
      articleUpdateQueueRef.current = nextUpdate.catch(() => undefined);
      await nextUpdate;
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
      const nextUpdate = articleUpdateQueueRef.current.then(run, run);
      articleUpdateQueueRef.current = nextUpdate.catch(() => undefined);
      await nextUpdate;
    },
    [applyStore, storeRef],
  );

  const importArticleUrl = useCallback(
    async (url: string) => {
      const result = await window.yomitomoDesktop.importArticleUrl(url);
      if (result.status === 'imported') {
        const nextStore = applyArticleStorePatch(storeRef.current, result.patch);
        storeRef.current = nextStore;
        applyStore(nextStore);
      }
      return result;
    },
    [applyStore, storeRef],
  );

  const importEbookFile = useCallback(
    async (file: File, onProgress?: ImportProgressCallback) => {
      onProgress?.(4);
      const data = await readFileArrayBuffer(
        file,
        (progress) => {
          onProgress?.(Math.min(76, Math.round(progress * 76)));
        },
        '读取 EPUB 文件失败',
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
        '读取 PDF 文件失败',
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
    readArticle,
    saveArticle,
    updateArticle,
    saveArticleReadingProgress,
    importArticleUrl,
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
