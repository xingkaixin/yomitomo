import { performance } from 'node:perf_hooks';
import type { EbookImportFileInput, PdfImportFileInput } from '../../ipc-contract';
import type { ArticleRecord } from '@yomitomo/shared';
import type { DesktopMainIpcContext } from './ipc';
import { handleDesktopIpc } from './ipc';

export function registerArticleIpc(context: DesktopMainIpcContext) {
  handleDesktopIpc('article:get', async (_event, id) => {
    const { readArticle } = await context.getStoreModule();
    return readArticle(id);
  });
  handleDesktopIpc('article:get-cover', async (_event, id) => {
    const { readArticleCover } = await context.getStoreModule();
    return readArticleCover(id);
  });
  handleDesktopIpc('article:get-site-icon', async (_event, id) => {
    const { ensureArticleSiteIcon } = await context.getStoreModule();
    return ensureArticleSiteIcon(id);
  });
  handleDesktopIpc('article:save', async (_event, input) => {
    const { saveArticle } = await context.getStoreModule();
    return saveArticle(input);
  });
  handleDesktopIpc('article:save-annotation', async (_event, input) => {
    const { saveArticleAnnotation } = await context.getStoreModule();
    return saveArticleAnnotation(input);
  });
  handleDesktopIpc('article:save-comment', async (_event, input) => {
    const { saveArticleComment } = await context.getStoreModule();
    return saveArticleComment(input);
  });
  handleDesktopIpc('article:delete-annotation', async (_event, input) => {
    const { deleteArticleAnnotation } = await context.getStoreModule();
    return deleteArticleAnnotation(input);
  });
  handleDesktopIpc('article:delete-comment', async (_event, input) => {
    const { deleteArticleComment } = await context.getStoreModule();
    return deleteArticleComment(input);
  });
  handleDesktopIpc('article:reading-progress', async (_event, input) => {
    const { saveArticleReadingProgress } = await context.getStoreModule();
    return saveArticleReadingProgress(input.articleId, input.progress);
  });
  handleDesktopIpc('article:reader-chat-state', async (_event, input) => {
    const { saveArticleReaderChatState } = await context.getStoreModule();
    return saveArticleReaderChatState(input.articleId, input.readerChatState);
  });
  handleDesktopIpc('article:import-url', async (_event, input) => {
    const { findArticleByIdentity, readArticle, readImportSettings, saveArticle } =
      await context.getStoreModule();
    const { canceledArticleSourceImport, importArticleSource } =
      await import('../articles/article-source-import');
    const { articleRecordFromUrl, isArticleImportCanceledError, isArticleImportChallengeRecord } =
      await import('../articles/article-import');
    const importInput = articleImportUrlInput(input);
    const record = await canceledArticleSourceImport(
      articleRecordFromUrl(importInput.url, {
        inlineImages: readImportSettings().saveArticleImages,
        requestId: importInput.requestId,
      }),
      isArticleImportCanceledError,
    );
    if (!record) return { status: 'canceled' };

    return importArticleSource({
      record,
      repository: { findArticleByIdentity, readArticle, saveArticle },
      isDuplicate: (article) => Boolean(article && !isArticleImportChallengeRecord(article)),
      mergeExistingArticle: (next, existing) => ({
        ...next,
        createdAt: existing.createdAt,
      }),
    });
  });
  handleDesktopIpc('article:import-url-cancel', async (_event, requestId) => {
    const { cancelArticleImport } = await import('../articles/article-import');
    return cancelArticleImport(requestId);
  });
  handleDesktopIpc('ebook:import-file', async (_event, input: EbookImportFileInput) => {
    const { findArticleByIdentity, readArticle, saveArticle } = await context.getStoreModule();
    const { importArticleSource } = await import('../articles/article-source-import');
    const { articleRecordFromEpubFile } = await import('../ebooks/ebook-import');
    const { deleteEbookSourceFile, saveEbookSourceFile } = await import('../ebooks/ebook-storage');
    const record = await articleRecordFromEpubFile(input, { performanceLogger: context.logInfo });
    return importArticleSource({
      record,
      repository: { findArticleByIdentity, readArticle, saveArticle },
      saveSourceFile: (articleId) => saveEbookSourceFile(articleId, input.data),
      cleanupSourceFile: deleteEbookSourceFile,
      logError: context.logError,
    });
  });
  handleDesktopIpc('ebook:read-file', async (_event, articleId) => {
    const { readEbookSourceFile } = await import('../ebooks/ebook-storage');
    const file = await readEbookSourceFile(articleId);
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  });
  handleDesktopIpc('pdf:import-file', async (_event, input: PdfImportFileInput) => {
    const { findArticleByIdentity, readArticle, saveArticle } = await context.getStoreModule();
    const { importArticleSource } = await import('../articles/article-source-import');
    const { articleRecordFromPdfFile } = await import('../pdf/pdf-import');
    const { deletePdfSourceFile, savePdfSourceFile } = await import('../pdf/pdf-storage');
    const { deletePdfThumbnail, savePdfThumbnail } = await import('../pdf/pdf-thumbnail-storage');
    const { article: record, thumbnail } = await articleRecordFromPdfFile(input);
    return importArticleSource({
      record,
      repository: { findArticleByIdentity, readArticle, saveArticle },
      saveSourceFile: (articleId) => savePdfSourceFile(articleId, input.data),
      saveThumbnail: thumbnail ? (articleId) => savePdfThumbnail(articleId, thumbnail) : undefined,
      cleanupSourceFile: deletePdfSourceFile,
      cleanupThumbnail: thumbnail ? deletePdfThumbnail : undefined,
      logError: context.logError,
    });
  });
  handleDesktopIpc('pdf:get-thumbnail', async (_event, articleId) => {
    const { readPdfThumbnailDataUrl, savePdfThumbnail } =
      await import('../pdf/pdf-thumbnail-storage');
    const cached = await readPdfThumbnailDataUrl(articleId);
    if (cached) return cached;

    // 存量 PDF 首次可见时懒生成：从源文件渲染一次并缓存，之后永久命中。
    const { readPdfSourceFile } = await import('../pdf/pdf-storage');
    const { renderPdfThumbnailFromBuffer } = await import('../pdf/pdf-import');
    const file = await readPdfSourceFile(articleId).catch(() => null);
    if (!file) return '';
    const data = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const thumbnail = await renderPdfThumbnailFromBuffer(data);
    if (!thumbnail) return '';
    await savePdfThumbnail(articleId, thumbnail);
    return `data:image/jpeg;base64,${thumbnail.toString('base64')}`;
  });
  handleDesktopIpc('pdf:read-file', async (_event, articleId) => {
    const startedAt = performance.now();
    const { readPdfSourceFile } = await import('../pdf/pdf-storage');
    const file = await readPdfSourceFile(articleId);
    const data = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    context.logInfo('performance.pdf.file_read_main', {
      articleId,
      byteLength: data.byteLength,
      durationMs: context.elapsedMs(startedAt),
    });
    return data;
  });
  handleDesktopIpc('article:delete', async (_event, id) => {
    const { deleteArticle, readArticle } = await context.getStoreModule();
    const article = await readArticle(id);
    const patch = await deleteArticle(id);
    await cleanupDeletedArticleSourceAssets({
      articleId: id,
      sourceType: article?.sourceType,
      logError: context.logError,
    });
    return patch;
  });
}

function articleImportUrlInput(input: string | { url: string; requestId?: string }) {
  return typeof input === 'string' ? { url: input, requestId: undefined } : input;
}

export async function cleanupDeletedArticleSourceAssets(input: {
  articleId: string;
  sourceType: ArticleRecord['sourceType'] | undefined;
  logError: DesktopMainIpcContext['logError'];
}) {
  try {
    if (input.sourceType === 'pdf') {
      const { deletePdfSourceFile } = await import('../pdf/pdf-storage');
      const { deletePdfThumbnail } = await import('../pdf/pdf-thumbnail-storage');
      await deletePdfSourceFile(input.articleId);
      await deletePdfThumbnail(input.articleId);
      return;
    }

    if (input.sourceType === 'ebook') {
      const { deleteEbookSourceFile } = await import('../ebooks/ebook-storage');
      await deleteEbookSourceFile(input.articleId);
    }
  } catch (error) {
    input.logError('article_source.cleanup_failed', error, {
      articleId: input.articleId,
      sourceType: input.sourceType,
    });
    throw new Error('ARTICLE_SOURCE_CLEANUP_FAILED', { cause: error });
  }
}
