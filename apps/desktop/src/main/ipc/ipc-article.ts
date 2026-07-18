import { performance } from 'node:perf_hooks';
import type { EbookImportFileInput, PdfImportFileInput } from '../../ipc-contract';
import type { ArticleRecord } from '@yomitomo/shared';
import {
  createArticleTranslationRuntime,
  type ArticleTranslationRuntimeContext,
} from '../articles/article-translation-runtime';
import type { DesktopMainIpcContext } from './ipc';
import { handleDesktopIpc } from './ipc';
import { sendDesktopIpcRendererEvent } from './ipc-events';

type ArticlePersistence = Pick<
  typeof import('../store/store-articles'),
  | 'deleteArticle'
  | 'deleteArticleAnnotation'
  | 'deleteArticleComment'
  | 'deleteCurrentArticleTranslation'
  | 'ensureArticleSiteIcon'
  | 'findArticleByIdentity'
  | 'listLibraryArticles'
  | 'mergeArticleAgentAnnotation'
  | 'readArticle'
  | 'readArticleCover'
  | 'readArticleStatsSummaries'
  | 'readCurrentArticleTranslation'
  | 'readImportSettings'
  | 'saveArticle'
  | 'saveArticleAnnotation'
  | 'saveArticleAnnotationDistillation'
  | 'saveArticleComment'
  | 'saveArticleReaderChatState'
  | 'saveArticleReadingProgress'
  | 'saveArticleTranslation'
>;
type ArticleTranslationPersistenceModules = Awaited<
  ReturnType<ArticleTranslationRuntimeContext['getPersistenceModules']>
>;

type ArticleIpcContext = Pick<
  DesktopMainIpcContext,
  'elapsedMs' | 'logError' | 'logInfo' | 'sendArticlePatched'
> &
  Pick<ArticleTranslationRuntimeContext, 'getAiModule'> & {
    getPersistenceModules: () => Promise<{
      providerRepository: ArticleTranslationPersistenceModules['providerRepository'];
      storeAgents: ArticleTranslationPersistenceModules['storeAgents'];
      storeArticles: ArticlePersistence;
    }>;
  };

export function registerArticleIpc(context: ArticleIpcContext) {
  const translationRuntime = createArticleTranslationRuntime(context);
  handleDesktopIpc('article:get', async (_event, id) => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    return articlePersistence.readArticle(id);
  });
  handleDesktopIpc('article:get-cover', async (_event, id) => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    return articlePersistence.readArticleCover(id);
  });
  handleDesktopIpc('article:get-site-icon', async (_event, id) => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    return articlePersistence.ensureArticleSiteIcon(id);
  });
  handleDesktopIpc('article:list-library', async (_event, input) => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    return articlePersistence.listLibraryArticles(input);
  });
  handleDesktopIpc('article:stats-summaries', async () => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    return articlePersistence.readArticleStatsSummaries();
  });
  handleDesktopIpc('article-translation:get-current', async (_event, input) => {
    return translationRuntime.readCurrent(input);
  });
  handleDesktopIpc('article-translation:translate', async (_event, input) => {
    return translationRuntime.translate(input, (translation) => {
      sendDesktopIpcRendererEvent(_event.sender, 'article-translation:updated', translation);
    });
  });
  handleDesktopIpc('article-translation:delete-current', async (_event, input) => {
    return translationRuntime.deleteCurrent(input);
  });
  handleDesktopIpc('article:save-annotation', async (event, input) => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    const patch = await articlePersistence.saveArticleAnnotation(input);
    if (patch) context.sendArticlePatched(event, patch);
    return patch;
  });
  handleDesktopIpc('article:save-annotation-distillation', async (event, input) => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    const patch = await articlePersistence.saveArticleAnnotationDistillation(input);
    if (patch) context.sendArticlePatched(event, patch);
    return patch;
  });
  handleDesktopIpc('article:merge-agent-annotation', async (event, input) => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    const result = await articlePersistence.mergeArticleAgentAnnotation(input);
    if (result) context.sendArticlePatched(event, result.patch);
    return result;
  });
  handleDesktopIpc('article:save-comment', async (event, input) => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    const patch = await articlePersistence.saveArticleComment(input);
    if (patch) context.sendArticlePatched(event, patch);
    return patch;
  });
  handleDesktopIpc('article:delete-annotation', async (event, input) => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    const patch = await articlePersistence.deleteArticleAnnotation(input);
    if (patch) context.sendArticlePatched(event, patch);
    return patch;
  });
  handleDesktopIpc('article:delete-comment', async (event, input) => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    const patch = await articlePersistence.deleteArticleComment(input);
    if (patch) context.sendArticlePatched(event, patch);
    return patch;
  });
  handleDesktopIpc('article:reading-progress', async (event, input) => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    const patch = await articlePersistence.saveArticleReadingProgress(
      input.articleId,
      input.progress,
    );
    context.sendArticlePatched(event, { type: 'article-reading-progress', ...patch });
    return patch;
  });
  handleDesktopIpc('article:reader-chat-state', async (_event, input) => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    return articlePersistence.saveArticleReaderChatState(input.articleId, input.readerChatState);
  });
  handleDesktopIpc('article:import-url', async (event, input) => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    const { canceledArticleSourceImport, importArticleSource } =
      await import('../articles/article-source-import');
    const { articleRecordFromUrl, isArticleImportCanceledError, isArticleImportChallengeRecord } =
      await import('../articles/article-import');
    const importSettings = articlePersistence.readImportSettings();
    const record = await canceledArticleSourceImport(
      articleRecordFromUrl(input.url, {
        allowLocalNetworkArticleImport: importSettings.allowLocalNetworkArticleImport,
        inlineImages: importSettings.saveArticleImages,
        requestId: input.requestId,
      }),
      isArticleImportCanceledError,
    );
    if (!record) return { status: 'canceled' };

    const result = await importArticleSource({
      record,
      repository: articleImportRepository(articlePersistence),
      isDuplicate: (article) => Boolean(article && !isArticleImportChallengeRecord(article)),
      mergeExistingArticle: (next, existing) => ({
        ...next,
        createdAt: existing.createdAt,
      }),
    });
    if (result.status === 'imported') context.sendArticlePatched(event, result.patch);
    return result;
  });
  handleDesktopIpc('article:import-url-cancel', async (_event, requestId) => {
    const { cancelArticleImport } = await import('../articles/article-import');
    return cancelArticleImport(requestId);
  });
  handleDesktopIpc('ebook:import-file', async (event, input: EbookImportFileInput) => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    const { importArticleSource } = await import('../articles/article-source-import');
    const { articleRecordFromEbookFile } = await import('../ebooks/ebook-import');
    const { deleteEbookSourceFile, saveEbookSourceFile } = await import('../ebooks/ebook-storage');
    const record = await articleRecordFromEbookFile(input, { performanceLogger: context.logInfo });
    const result = await importArticleSource({
      record,
      repository: articleImportRepository(articlePersistence),
      saveSourceFile: (articleId) =>
        saveEbookSourceFile(articleId, input.data, record.ebook?.metadata.format),
      cleanupSourceFile: deleteEbookSourceFile,
      logError: context.logError,
    });
    if (result.status === 'imported') context.sendArticlePatched(event, result.patch);
    return result;
  });
  handleDesktopIpc('ebook:read-file', async (_event, articleId) => {
    const { readEbookSourceFile } = await import('../ebooks/ebook-storage');
    const file = await readEbookSourceFile(articleId);
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  });
  handleDesktopIpc('pdf:import-file', async (event, input: PdfImportFileInput) => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    const { importArticleSource } = await import('../articles/article-source-import');
    const { articleRecordFromPdfFile } = await import('../pdf/pdf-import');
    const { deletePdfSourceFile, savePdfSourceFile } = await import('../pdf/pdf-storage');
    const { deletePdfThumbnail, savePdfThumbnail } = await import('../pdf/pdf-thumbnail-storage');
    const { article: record, thumbnail } = await articleRecordFromPdfFile(input);
    const result = await importArticleSource({
      record,
      repository: articleImportRepository(articlePersistence),
      saveSourceFile: (articleId) => savePdfSourceFile(articleId, input.data),
      saveThumbnail: thumbnail ? (articleId) => savePdfThumbnail(articleId, thumbnail) : undefined,
      cleanupSourceFile: deletePdfSourceFile,
      cleanupThumbnail: thumbnail ? deletePdfThumbnail : undefined,
      logError: context.logError,
    });
    if (result.status === 'imported') context.sendArticlePatched(event, result.patch);
    return result;
  });
  handleDesktopIpc('text:import-prepare', async (_event, input) => {
    const { prepareTextSourceItems } = await import('../articles/text-source-import');
    return prepareTextSourceItems(input);
  });
  handleDesktopIpc('text:import-commit', async (event, input) => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    const { commitTextSources } = await import('../articles/text-source-import');
    const result = await commitTextSources(input, articleImportRepository(articlePersistence));
    for (const patch of result.patches) context.sendArticlePatched(event, patch);
    return result;
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
    const readDurationMs = context.elapsedMs(startedAt);
    const ipcBufferStartedAt = performance.now();
    const { copied, data } = pdfSourceArrayBufferForIpc(file);
    context.logInfo('performance.pdf.file_read_main', {
      articleId,
      byteLength: file.byteLength,
      ipcBufferCopied: copied,
      ipcBufferDurationMs: copied ? context.elapsedMs(ipcBufferStartedAt) : 0,
      ipcByteLength: data.byteLength,
      readByteLength: file.byteLength,
      readDurationMs,
      durationMs: context.elapsedMs(startedAt),
    });
    return data;
  });
  handleDesktopIpc('article:delete', async (event, id) => {
    const { storeArticles: articlePersistence } = await context.getPersistenceModules();
    const article = await articlePersistence.readArticle(id);
    const patch = await articlePersistence.deleteArticle(id);
    await cleanupDeletedArticleSourceAssets({
      articleId: id,
      sourceType: article?.sourceType,
      logError: context.logError,
    });
    context.sendArticlePatched(event, { type: 'article-delete', ...patch });
    return patch;
  });
}

export function pdfSourceArrayBufferForIpc(file: Buffer) {
  const sourceBuffer = file.buffer as ArrayBuffer;
  const usesWholeSourceBuffer =
    file.byteOffset === 0 && file.byteLength === sourceBuffer.byteLength;
  if (usesWholeSourceBuffer) return { copied: false, data: sourceBuffer };
  return {
    copied: true,
    data: sourceBuffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  };
}

function articleImportRepository(articlePersistence: ArticlePersistence) {
  return {
    findArticleByIdentity: articlePersistence.findArticleByIdentity,
    readArticle: articlePersistence.readArticle,
    saveArticle: articlePersistence.saveArticle,
  };
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
