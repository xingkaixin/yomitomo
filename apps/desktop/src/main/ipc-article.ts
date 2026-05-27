import { performance } from 'node:perf_hooks';
import type { EbookImportFileInput, PdfImportFileInput } from '../ipc-contract';
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
    const { articleRecordFromUrl, isArticleImportChallengeRecord } =
      await import('./article-import');
    const record = await articleRecordFromUrl(input, {
      inlineImages: readImportSettings().saveArticleImages,
    });
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
  handleDesktopIpc('ebook:import-file', async (_event, input: EbookImportFileInput) => {
    const { findArticleByIdentity, readArticle, saveArticle } = await context.getStoreModule();
    const { articleRecordFromEpubFile } = await import('./ebook-import');
    const { saveEbookSourceFile } = await import('./ebook-storage');
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
    const { readEbookSourceFile } = await import('./ebook-storage');
    const file = await readEbookSourceFile(articleId);
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  });
  handleDesktopIpc('pdf:import-file', async (_event, input: PdfImportFileInput) => {
    const { findArticleByIdentity, readArticle, saveArticle } = await context.getStoreModule();
    const { articleRecordFromPdfFile } = await import('./pdf-import');
    const { savePdfSourceFile } = await import('./pdf-storage');
    const record = await articleRecordFromPdfFile(input);
    const existingArticle = findArticleByIdentity(record);
    if (existingArticle) {
      const existingFullArticle = await readArticle(existingArticle.id);
      await savePdfSourceFile(existingArticle.id, input.data);
      return {
        status: 'duplicate',
        article: existingFullArticle || record,
      };
    }

    await savePdfSourceFile(record.id, input.data);
    const patch = await saveArticle(record);
    return { status: 'imported', article: record, patch };
  });
  handleDesktopIpc('pdf:read-file', async (_event, articleId) => {
    const startedAt = performance.now();
    const { readPdfSourceFile } = await import('./pdf-storage');
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
      const { deletePdfSourceFile } = await import('./pdf-storage');
      await deletePdfSourceFile(id);
    }
    return patch;
  });
}
