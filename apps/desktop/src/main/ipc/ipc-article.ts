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

async function readCurrentArticleTranslation(
  context: DesktopMainIpcContext,
  input: ArticleTranslationRequest,
) {
  const storeModule = await context.getStoreModule();
  const aiModule = await context.getAiModule();
  const article = await storeModule.readArticle(input.articleId);
  if (!article) return null;
  const store = await storeModule.readStore();
  const targetLanguage = translationTargetLanguage(input.targetLanguage, store.settings);
  return storeModule.readCurrentArticleTranslation({
    articleId: article.id,
    sourceContentHash: article.contentHash,
    targetLanguage,
    promptVersion: aiModule.bilingualTranslationPromptVersion,
  });
}

async function translateArticle(
  context: DesktopMainIpcContext,
  event: IpcMainInvokeEvent,
  input: ArticleTranslationRequest,
): Promise<ArticleTranslation> {
  const storeModule = await context.getStoreModule();
  const aiModule = await context.getAiModule();
  const article = await storeModule.readArticle(input.articleId);
  if (!article) throw new Error('ARTICLE_NOT_FOUND');
  if ((article.sourceType || 'web') !== 'web') throw new Error('ARTICLE_TRANSLATION_WEB_ONLY');

  const store = await storeModule.readStore();
  const targetLanguage = translationTargetLanguage(input.targetLanguage, store.settings);
  const current = await storeModule.readCurrentArticleTranslation({
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
  const initial = await storeModule.saveArticleTranslation({
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
          storeModule,
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
          storeModule,
          updatedAt,
        }),
      );
    }
    sendArticleTranslationUpdated(event, latest);
  });

  latest = await saveTranslationFinalStatus(storeModule, latest);
  sendArticleTranslationUpdated(event, latest);
  return latest;
}

async function deleteCurrentArticleTranslation(
  context: DesktopMainIpcContext,
  input: ArticleTranslationRequest,
) {
  const storeModule = await context.getStoreModule();
  const aiModule = await context.getAiModule();
  const article = await storeModule.readArticle(input.articleId);
  if (!article) return null;
  const store = await storeModule.readStore();
  return storeModule.deleteCurrentArticleTranslation({
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
  storeModule: Awaited<ReturnType<DesktopMainIpcContext['getStoreModule']>>;
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
  return input.storeModule.saveArticleTranslation({
    ...input.base,
    error: undefined,
    segments,
    status: 'translating',
    updatedAt: input.updatedAt,
  });
}

async function saveTranslationFinalStatus(
  storeModule: Awaited<ReturnType<DesktopMainIpcContext['getStoreModule']>>,
  translation: ArticleTranslation,
) {
  const hasTranslating = translation.segments.some((segment) => segment.status === 'translating');
  const hasReady = translation.segments.some((segment) => segment.status === 'ready');
  const hasFailed = translation.segments.some((segment) => segment.status === 'failed');
  const status = hasTranslating ? 'translating' : hasFailed && !hasReady ? 'failed' : 'ready';
  return storeModule.saveArticleTranslation({
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
