import { useCallback, useRef } from 'react';
import type {
  ArticleDeletePatch,
  ArticleReadingProgress,
  ArticleReadingProgressPatch,
  ArticleRecord,
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

      applyStore(applyArticleDeletePatch(storeRef.current, { articleId }));
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

      applyStore(await desktop.saveArticle(article));
    },
    [applyStore],
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
        applyStore(await desktop.saveArticle(nextArticle));
      };
      const nextUpdate = articleUpdateQueueRef.current.then(run, run);
      articleUpdateQueueRef.current = nextUpdate.catch(() => undefined);
      await nextUpdate;
    },
    [applyStore],
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
        applyStore(applyArticleReadingProgressPatch(storeRef.current, patch));
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
      applyStore(result.store);
      return result;
    },
    [applyStore],
  );

  const importEbookFile = useCallback(
    async (file: File, onProgress?: ImportProgressCallback) => {
      onProgress?.(4);
      const data = await readFileArrayBuffer(file, (progress) => {
        onProgress?.(Math.min(76, Math.round(progress * 76)));
      });
      onProgress?.(82);
      const result = await window.yomitomoDesktop.importEbookFile({
        fileName: file.name,
        mimeType: file.type,
        data,
      });
      onProgress?.(100);
      applyStore(result.store);
      return result;
    },
    [applyStore],
  );

  return {
    deleteArticle,
    readArticle,
    saveArticle,
    updateArticle,
    saveArticleReadingProgress,
    importArticleUrl,
    importEbookFile,
  };
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

export function applyArticleDeletePatch(
  store: DesktopStore,
  patch: ArticleDeletePatch,
): DesktopStore {
  return {
    ...store,
    articles: store.articles.filter((article) => article.id !== patch.articleId),
  };
}

function readFileArrayBuffer(file: File, onProgress: (progress: number) => void) {
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
      reject(new Error('读取 EPUB 文件失败'));
    });
    reader.addEventListener('error', () => reject(reader.error || new Error('读取 EPUB 文件失败')));
    reader.readAsArrayBuffer(file);
  });
}
