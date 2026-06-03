import { performance } from 'node:perf_hooks';
import type { EbookImportFileInput, PdfImportFileInput } from '../../ipc-contract';
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
  handleDesktopIpc('article:import-url', async (_event, input) => {
    const { findArticleByIdentity, readArticle, readImportSettings, saveArticle } =
      await context.getStoreModule();
    const { articleRecordFromUrl, isArticleImportCanceledError, isArticleImportChallengeRecord } =
      await import('../article-import');
    const importInput = articleImportUrlInput(input);
    const record = await articleRecordFromUrl(importInput.url, {
      inlineImages: readImportSettings().saveArticleImages,
      requestId: importInput.requestId,
    }).catch((error: unknown) => {
      if (isArticleImportCanceledError(error)) return null;
      throw error;
    });
    if (!record) return { status: 'canceled' };

    const existingArticle = findArticleByIdentity(record);
    const existingFullArticle = existingArticle ? await readArticle(existingArticle.id) : null;
    if (existingFullArticle && !isArticleImportChallengeRecord(existingFullArticle)) {
      return {
        status: 'duplicate',
        article: existingFullArticle,
      };
    }

    const article = {
      ...record,
      createdAt: existingFullArticle?.createdAt || record.createdAt,
    };
    const patch = await saveArticle(article);
    return { status: 'imported', article, patch };
  });
  handleDesktopIpc('article:import-url-cancel', async (_event, requestId) => {
    const { cancelArticleImport } = await import('../article-import');
    return cancelArticleImport(requestId);
  });
  handleDesktopIpc('ebook:import-file', async (_event, input: EbookImportFileInput) => {
    const { findArticleByIdentity, readArticle, saveArticle } = await context.getStoreModule();
    const { articleRecordFromEpubFile } = await import('../ebook-import');
    const { saveEbookSourceFile } = await import('../ebook-storage');
    const record = await articleRecordFromEpubFile(input, { performanceLogger: context.logInfo });
    const existingArticle = findArticleByIdentity(record);
    if (existingArticle) {
      const existingFullArticle = await readArticle(existingArticle.id);
      await saveEbookSourceFile(existingArticle.id, input.data);
      return {
        status: 'duplicate',
        article: existingFullArticle || record,
      };
    }

    await saveEbookSourceFile(record.id, input.data);
    const patch = await saveArticle(record);
    return { status: 'imported', article: record, patch };
  });
  handleDesktopIpc('ebook:read-file', async (_event, articleId) => {
    const { readEbookSourceFile } = await import('../ebook-storage');
    const file = await readEbookSourceFile(articleId);
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  });
  handleDesktopIpc('pdf:import-file', async (_event, input: PdfImportFileInput) => {
    const { findArticleByIdentity, readArticle, saveArticle } = await context.getStoreModule();
    const { articleRecordFromPdfFile } = await import('../pdf-import');
    const { savePdfSourceFile } = await import('../pdf-storage');
    const { savePdfThumbnail } = await import('../pdf-thumbnail-storage');
    const { article: record, thumbnail } = await articleRecordFromPdfFile(input);
    const existingArticle = findArticleByIdentity(record);
    if (existingArticle) {
      const existingFullArticle = await readArticle(existingArticle.id);
      await savePdfSourceFile(existingArticle.id, input.data);
      if (thumbnail) await savePdfThumbnail(existingArticle.id, thumbnail);
      return {
        status: 'duplicate',
        article: existingFullArticle || record,
      };
    }

    await savePdfSourceFile(record.id, input.data);
    if (thumbnail) await savePdfThumbnail(record.id, thumbnail);
    const patch = await saveArticle(record);
    return { status: 'imported', article: record, patch };
  });
  handleDesktopIpc('pdf:get-thumbnail', async (_event, articleId) => {
    const { readPdfThumbnailDataUrl, savePdfThumbnail } = await import('../pdf-thumbnail-storage');
    const cached = await readPdfThumbnailDataUrl(articleId);
    if (cached) return cached;

    // 存量 PDF 首次可见时懒生成：从源文件渲染一次并缓存，之后永久命中。
    const { readPdfSourceFile } = await import('../pdf-storage');
    const { renderPdfThumbnailFromBuffer } = await import('../pdf-import');
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
    const { readPdfSourceFile } = await import('../pdf-storage');
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
    if (article?.sourceType === 'pdf') {
      const { deletePdfSourceFile } = await import('../pdf-storage');
      const { deletePdfThumbnail } = await import('../pdf-thumbnail-storage');
      await deletePdfSourceFile(id);
      await deletePdfThumbnail(id);
    }
    return patch;
  });
}

function articleImportUrlInput(input: string | { url: string; requestId?: string }) {
  return typeof input === 'string' ? { url: input, requestId: undefined } : input;
}
