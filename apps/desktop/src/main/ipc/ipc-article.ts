import { performance } from 'node:perf_hooks';
import type { IpcMainInvokeEvent } from 'electron';
import { JSDOM } from 'jsdom';
import { extractWebArticleTranslationBlocks } from '@yomitomo/core';
import type { EbookImportFileInput, PdfImportFileInput } from '../../ipc-contract';
import type {
  ArticleRecord,
  ArticleTranslation,
  ArticleTranslationRequest,
} from '@yomitomo/shared';
import { makeId } from '@yomitomo/shared';
import { taskProvider } from '../agents/agent-runtime-routing';
import type { DesktopAiModule, DesktopMainIpcContext, DesktopPersistenceModule } from './ipc';
import { handleDesktopIpc } from './ipc';

type ArticlePersistence = DesktopPersistenceModule['articlePersistence'];

type ArticleIpcContext = Pick<
  DesktopMainIpcContext,
  'elapsedMs' | 'getMainWindow' | 'logError' | 'logInfo' | 'sendArticlePatched'
> & {
  getAiModule: () => Promise<
    Pick<DesktopAiModule, 'bilingualTranslationPromptVersion' | 'translateBilingualArticleBlocks'>
  >;
  getPersistenceModule: () => Promise<{
    agentRuntimePersistence: Pick<
      DesktopPersistenceModule['agentRuntimePersistence'],
      'readAgentRuntimeContext'
    >;
    articlePersistence: ArticlePersistence;
    providerPersistence: Pick<
      DesktopPersistenceModule['providerPersistence'],
      'hydrateProviderApiKey'
    >;
  }>;
};

export function registerArticleIpc(context: ArticleIpcContext) {
  handleDesktopIpc('article:get', async (_event, id) => {
    const { articlePersistence } = await context.getPersistenceModule();
    return articlePersistence.readArticle(id);
  });
  handleDesktopIpc('article:get-cover', async (_event, id) => {
    const { articlePersistence } = await context.getPersistenceModule();
    return articlePersistence.readArticleCover(id);
  });
  handleDesktopIpc('article:get-site-icon', async (_event, id) => {
    const { articlePersistence } = await context.getPersistenceModule();
    return articlePersistence.ensureArticleSiteIcon(id);
  });
  handleDesktopIpc('article:list-library', async (_event, input) => {
    const { articlePersistence } = await context.getPersistenceModule();
    return articlePersistence.listLibraryArticles(input);
  });
  handleDesktopIpc('article:stats-summaries', async () => {
    const { articlePersistence } = await context.getPersistenceModule();
    return articlePersistence.readArticleStatsSummaries();
  });
  handleDesktopIpc('article:save', async (_event, input) => {
    const { articlePersistence } = await context.getPersistenceModule();
    const patch = await articlePersistence.saveArticle(input);
    if (shouldBroadcastArticleSavePatch(context, _event)) context.sendArticlePatched(patch);
    return patch;
  });
  handleDesktopIpc('article-translation:get-current', async (_event, input) => {
    return readCurrentArticleTranslation(context, input);
  });
  handleDesktopIpc('article-translation:translate', async (_event, input) => {
    return translateArticle(context, _event, input);
  });
  handleDesktopIpc('article-translation:delete-current', async (_event, input) => {
    return deleteCurrentArticleTranslation(context, input);
  });
  handleDesktopIpc('article:save-annotation', async (_event, input) => {
    const { articlePersistence } = await context.getPersistenceModule();
    const patch = await articlePersistence.saveArticleAnnotation(input);
    if (patch) context.sendArticlePatched(patch);
    return patch;
  });
  handleDesktopIpc('article:save-comment', async (_event, input) => {
    const { articlePersistence } = await context.getPersistenceModule();
    const patch = await articlePersistence.saveArticleComment(input);
    if (patch) context.sendArticlePatched(patch);
    return patch;
  });
  handleDesktopIpc('article:delete-annotation', async (_event, input) => {
    const { articlePersistence } = await context.getPersistenceModule();
    const patch = await articlePersistence.deleteArticleAnnotation(input);
    if (patch) context.sendArticlePatched(patch);
    return patch;
  });
  handleDesktopIpc('article:delete-comment', async (_event, input) => {
    const { articlePersistence } = await context.getPersistenceModule();
    const patch = await articlePersistence.deleteArticleComment(input);
    if (patch) context.sendArticlePatched(patch);
    return patch;
  });
  handleDesktopIpc('article:reading-progress', async (_event, input) => {
    const { articlePersistence } = await context.getPersistenceModule();
    return articlePersistence.saveArticleReadingProgress(input.articleId, input.progress);
  });
  handleDesktopIpc('article:reader-chat-state', async (_event, input) => {
    const { articlePersistence } = await context.getPersistenceModule();
    return articlePersistence.saveArticleReaderChatState(input.articleId, input.readerChatState);
  });
  handleDesktopIpc('article:import-url', async (_event, input) => {
    const { articlePersistence } = await context.getPersistenceModule();
    const { canceledArticleSourceImport, importArticleSource } =
      await import('../articles/article-source-import');
    const { articleRecordFromUrl, isArticleImportCanceledError, isArticleImportChallengeRecord } =
      await import('../articles/article-import');
    const importInput = articleImportUrlInput(input);
    const importSettings = articlePersistence.readImportSettings();
    const record = await canceledArticleSourceImport(
      articleRecordFromUrl(importInput.url, {
        allowLocalNetworkArticleImport: importSettings.allowLocalNetworkArticleImport,
        inlineImages: importSettings.saveArticleImages,
        requestId: importInput.requestId,
      }),
      isArticleImportCanceledError,
    );
    if (!record) return { status: 'canceled' };

    return importArticleSource({
      record,
      repository: articleImportRepository(articlePersistence),
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
    const { articlePersistence } = await context.getPersistenceModule();
    const { importArticleSource } = await import('../articles/article-source-import');
    const { articleRecordFromEbookFile } = await import('../ebooks/ebook-import');
    const { deleteEbookSourceFile, saveEbookSourceFile } = await import('../ebooks/ebook-storage');
    const record = await articleRecordFromEbookFile(input, { performanceLogger: context.logInfo });
    return importArticleSource({
      record,
      repository: articleImportRepository(articlePersistence),
      saveSourceFile: (articleId) =>
        saveEbookSourceFile(articleId, input.data, record.ebook?.metadata.format),
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
    const { articlePersistence } = await context.getPersistenceModule();
    const { importArticleSource } = await import('../articles/article-source-import');
    const { articleRecordFromPdfFile } = await import('../pdf/pdf-import');
    const { deletePdfSourceFile, savePdfSourceFile } = await import('../pdf/pdf-storage');
    const { deletePdfThumbnail, savePdfThumbnail } = await import('../pdf/pdf-thumbnail-storage');
    const { article: record, thumbnail } = await articleRecordFromPdfFile(input);
    return importArticleSource({
      record,
      repository: articleImportRepository(articlePersistence),
      saveSourceFile: (articleId) => savePdfSourceFile(articleId, input.data),
      saveThumbnail: thumbnail ? (articleId) => savePdfThumbnail(articleId, thumbnail) : undefined,
      cleanupSourceFile: deletePdfSourceFile,
      cleanupThumbnail: thumbnail ? deletePdfThumbnail : undefined,
      logError: context.logError,
    });
  });
  handleDesktopIpc('text:import-prepare', async (_event, input) => {
    const { prepareTextSourceItems } = await import('../articles/text-source-import');
    return prepareTextSourceItems(input);
  });
  handleDesktopIpc('text:import-commit', async (_event, input) => {
    const { articlePersistence } = await context.getPersistenceModule();
    const { commitTextSources } = await import('../articles/text-source-import');
    const result = await commitTextSources(input, articleImportRepository(articlePersistence));
    for (const patch of result.patches) context.sendArticlePatched(patch);
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
  handleDesktopIpc('article:delete', async (_event, id) => {
    const { articlePersistence } = await context.getPersistenceModule();
    const article = await articlePersistence.readArticle(id);
    const patch = await articlePersistence.deleteArticle(id);
    await cleanupDeletedArticleSourceAssets({
      articleId: id,
      sourceType: article?.sourceType,
      logError: context.logError,
    });
    return patch;
  });
}

function shouldBroadcastArticleSavePatch(context: ArticleIpcContext, event: IpcMainInvokeEvent) {
  const mainWindow = context.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return true;
  return event.sender.id !== mainWindow.webContents.id;
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

async function readCurrentArticleTranslation(
  context: ArticleIpcContext,
  input: ArticleTranslationRequest,
) {
  const { agentRuntimePersistence, articlePersistence } = await context.getPersistenceModule();
  const aiModule = await context.getAiModule();
  const article = await articlePersistence.readArticle(input.articleId);
  if (!article) return null;
  const store = await agentRuntimePersistence.readAgentRuntimeContext();
  const targetLanguage = translationTargetLanguage(input.targetLanguage, store.settings);
  return articlePersistence.readCurrentArticleTranslation({
    articleId: article.id,
    sourceContentHash: article.contentHash,
    targetLanguage,
    promptVersion: aiModule.bilingualTranslationPromptVersion,
  });
}

async function translateArticle(
  context: ArticleIpcContext,
  event: IpcMainInvokeEvent,
  input: ArticleTranslationRequest,
): Promise<ArticleTranslation> {
  const { agentRuntimePersistence, articlePersistence } = await context.getPersistenceModule();
  const aiModule = await context.getAiModule();
  const article = await articlePersistence.readArticle(input.articleId);
  if (!article) throw new Error('ARTICLE_NOT_FOUND');
  if ((article.sourceType || 'web') !== 'web') throw new Error('ARTICLE_TRANSLATION_WEB_ONLY');

  const store = await agentRuntimePersistence.readAgentRuntimeContext();
  const targetLanguage = translationTargetLanguage(input.targetLanguage, store.settings);
  const current = await articlePersistence.readCurrentArticleTranslation({
    articleId: article.id,
    sourceContentHash: article.contentHash,
    targetLanguage,
    promptVersion: aiModule.bilingualTranslationPromptVersion,
  });
  if (!input.force && !input.sourceBlockIds?.length && current?.status === 'ready') return current;

  const blocks = extractArticleTranslationBlocks(article);
  if (blocks.length === 0) throw new Error('ARTICLE_TRANSLATION_NO_TEXT');
  const selectedBlockIds = new Set(input.sourceBlockIds || []);
  const targetBlocks =
    selectedBlockIds.size > 0 ? blocks.filter((block) => selectedBlockIds.has(block.id)) : blocks;
  if (targetBlocks.length === 0) throw new Error('ARTICLE_TRANSLATION_NO_TEXT');

  const now = new Date().toISOString();
  const provider = await taskProvider(
    context,
    store.providers,
    store.settings,
    'bilingualTranslation',
  );
  const translationId = current?.id || makeId('article_translation');
  const currentSegmentsByBlockId = new Map(
    (current?.segments || []).map((segment) => [segment.sourceBlockId, segment]),
  );
  const initial = await articlePersistence.saveArticleTranslation({
    id: translationId,
    articleId: article.id,
    sourceContentHash: article.contentHash,
    targetLanguage,
    promptVersion: aiModule.bilingualTranslationPromptVersion,
    providerId: provider.id,
    providerName: provider.name,
    modelName: provider.modelName,
    status: 'translating',
    createdAt: current?.createdAt || now,
    updatedAt: now,
    segments: blocks.map((block) => {
      const currentSegment = currentSegmentsByBlockId.get(block.id);
      const shouldTranslate = input.force || !currentSegment || selectedBlockIds.has(block.id);
      if (!shouldTranslate && currentSegment) return currentSegment;
      return {
        id: currentSegment?.id || makeId('translation_segment'),
        translationId,
        sourceBlockId: block.id,
        sourceTextHash: block.textHash,
        sourceText: block.text,
        status: 'translating',
        order: block.order,
        createdAt: currentSegment?.createdAt || now,
        updatedAt: now,
      };
    }),
  });
  sendArticleTranslationUpdated(event, initial);

  let latest = initial;
  let saveQueue = Promise.resolve();
  const enqueueSave = <T>(operation: () => Promise<T>) => {
    const queued = saveQueue.then(operation, operation);
    saveQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  };
  await runWithConcurrency(targetBlocks, 3, async (block) => {
    const updatedAt = new Date().toISOString();
    try {
      const result = await aiModule.translateBilingualArticleBlocks({
        provider,
        blocks: [
          {
            context: store.settings.bilingualTranslationAiContextAware
              ? translationBlockContext(block.order, blocks)
              : undefined,
            id: block.id,
            text: block.text,
          },
        ],
        targetLanguage,
        title: article.title,
        summary: article.excerpt,
      });
      const translatedText = result.translations[0]?.translation.trim();
      latest = await enqueueSave(() =>
        saveTranslationSegmentStatus({
          base: latest,
          blockId: block.id,
          error: translatedText ? undefined : 'TRANSLATION_MISSING',
          status: translatedText ? 'ready' : 'failed',
          articlePersistence,
          translatedText,
          updatedAt,
        }),
      );
    } catch (error) {
      latest = await enqueueSave(() =>
        saveTranslationSegmentStatus({
          base: latest,
          blockId: block.id,
          error: error instanceof Error ? error.message : 'TRANSLATION_FAILED',
          status: 'failed',
          articlePersistence,
          updatedAt,
        }),
      );
    }
    sendArticleTranslationUpdated(event, latest);
  });

  latest = await saveTranslationFinalStatus(articlePersistence, latest);
  sendArticleTranslationUpdated(event, latest);
  return latest;
}

async function deleteCurrentArticleTranslation(
  context: ArticleIpcContext,
  input: ArticleTranslationRequest,
) {
  const { agentRuntimePersistence, articlePersistence } = await context.getPersistenceModule();
  const aiModule = await context.getAiModule();
  const article = await articlePersistence.readArticle(input.articleId);
  if (!article) return null;
  const store = await agentRuntimePersistence.readAgentRuntimeContext();
  return articlePersistence.deleteCurrentArticleTranslation({
    articleId: article.id,
    sourceContentHash: article.contentHash,
    targetLanguage: translationTargetLanguage(input.targetLanguage, store.settings),
    promptVersion: aiModule.bilingualTranslationPromptVersion,
  });
}

function translationTargetLanguage(
  requested: string | undefined,
  settings: ArticleTranslationSettings,
) {
  const value = requested?.trim() || settings.bilingualTranslationTargetLanguage?.trim() || 'zh-CN';
  return value === 'en' || value.toLowerCase() === 'english' ? 'English' : '简体中文';
}

type ArticleTranslationSettings = {
  bilingualTranslationAiContextAware?: boolean;
  bilingualTranslationTargetLanguage?: string;
};

async function saveTranslationSegmentStatus(input: {
  base: ArticleTranslation;
  blockId: string;
  error?: string;
  status: 'ready' | 'failed';
  articlePersistence: ArticlePersistence;
  translatedText?: string;
  updatedAt: string;
}) {
  const segments = input.base.segments.map((segment) =>
    segment.sourceBlockId === input.blockId
      ? Object.assign({}, segment, {
          error: input.error,
          status: input.status,
          translatedText: input.translatedText,
          updatedAt: input.updatedAt,
        })
      : segment,
  );
  return input.articlePersistence.saveArticleTranslation({
    ...input.base,
    error: undefined,
    segments,
    status: 'translating',
    updatedAt: input.updatedAt,
  });
}

async function saveTranslationFinalStatus(
  articlePersistence: ArticlePersistence,
  translation: ArticleTranslation,
) {
  const hasTranslating = translation.segments.some((segment) => segment.status === 'translating');
  const hasReady = translation.segments.some((segment) => segment.status === 'ready');
  const hasFailed = translation.segments.some((segment) => segment.status === 'failed');
  const status = hasTranslating ? 'translating' : hasFailed && !hasReady ? 'failed' : 'ready';
  return articlePersistence.saveArticleTranslation({
    ...translation,
    error: hasFailed ? 'TRANSLATION_INCOMPLETE' : undefined,
    status,
    updatedAt: new Date().toISOString(),
  });
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });
  await Promise.all(workers);
}

function sendArticleTranslationUpdated(event: IpcMainInvokeEvent, translation: ArticleTranslation) {
  event.sender.send('article-translation:updated', translation);
}

function translationBlockContext(
  order: number,
  blocks: ReturnType<typeof extractArticleTranslationBlocks>,
) {
  const contextBlocks = blocks
    .filter((block) => Math.abs(block.order - order) <= 2)
    .map((block) => block.text)
    .join('\n');
  return contextBlocks || undefined;
}

function extractArticleTranslationBlocks(article: ArticleRecord) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  return extractWebArticleTranslationBlocks(dom.window.document, article.contentHtml || '');
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
