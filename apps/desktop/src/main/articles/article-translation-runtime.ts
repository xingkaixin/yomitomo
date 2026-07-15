import { JSDOM } from 'jsdom';
import { extractWebArticleTranslationBlocks } from '@yomitomo/core';
import type {
  ArticleRecord,
  ArticleTranslation,
  ArticleTranslationDeleteRequest,
  ArticleTranslationRequest,
} from '@yomitomo/shared';
import { hashText, makeId } from '@yomitomo/shared';
import { taskProvider } from '../agents/agent-runtime-routing';
import type { DesktopAiModule, DesktopPersistenceModule } from '../ipc/ipc';

type ArticlePersistence = DesktopPersistenceModule['articlePersistence'];
type ArticleTranslationBlock = ReturnType<typeof extractWebArticleTranslationBlocks>[number];

export type ArticleTranslationRuntimeContext = {
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

const ARTICLE_TRANSLATION_SOURCE_ID = 'article';
const E2E_FAKE_TRANSLATION_PROVIDER_BASE_URL = 'https://e2e.invalid/yomitomo-ai';
const TRANSLATION_CONCURRENCY = 3;

export function createArticleTranslationRuntime(context: ArticleTranslationRuntimeContext) {
  return {
    deleteCurrent: (input: ArticleTranslationDeleteRequest) =>
      deleteCurrentArticleTranslation(context, input),
    readCurrent: (input: ArticleTranslationRequest) =>
      readCurrentArticleTranslation(context, input),
    translate: (
      input: ArticleTranslationRequest,
      onUpdate: (translation: ArticleTranslation) => void,
    ) => translateArticle(context, input, onUpdate),
  };
}

async function readCurrentArticleTranslation(
  context: ArticleTranslationRuntimeContext,
  input: ArticleTranslationRequest,
) {
  const { agentRuntimePersistence, articlePersistence } = await context.getPersistenceModule();
  const aiModule = await context.getAiModule();
  const article = await articlePersistence.readArticle(input.articleId);
  if (!article) return null;
  const store = await agentRuntimePersistence.readAgentRuntimeContext();
  const targetLanguage = translationTargetLanguage(input.targetLanguage, store.settings);
  const sourceId = articleTranslationSourceId(article, input.sourceId);
  return articlePersistence.readCurrentArticleTranslation({
    articleId: article.id,
    sourceId,
    sourceContentHash: article.contentHash,
    targetLanguage,
    promptVersion: aiModule.bilingualTranslationPromptVersion,
  });
}

async function translateArticle(
  context: ArticleTranslationRuntimeContext,
  input: ArticleTranslationRequest,
  onUpdate: (translation: ArticleTranslation) => void,
): Promise<ArticleTranslation> {
  const { agentRuntimePersistence, articlePersistence } = await context.getPersistenceModule();
  const aiModule = await context.getAiModule();
  const article = await articlePersistence.readArticle(input.articleId);
  if (!article) throw new Error('ARTICLE_NOT_FOUND');
  const source = articleTranslationSource(article, input);

  const store = await agentRuntimePersistence.readAgentRuntimeContext();
  const targetLanguage = translationTargetLanguage(input.targetLanguage, store.settings);
  const current = await articlePersistence.readCurrentArticleTranslation({
    articleId: article.id,
    sourceId: source.sourceId,
    sourceContentHash: article.contentHash,
    targetLanguage,
    promptVersion: aiModule.bilingualTranslationPromptVersion,
  });
  if (!input.force && !input.sourceBlockIds?.length && current?.status === 'ready') return current;

  const blocks = source.blocks;
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
    sourceId: source.sourceId,
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
  onUpdate(initial);

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
  await runWithConcurrency(targetBlocks, TRANSLATION_CONCURRENCY, async (block) => {
    const updatedAt = new Date().toISOString();
    try {
      const translationBlock = {
        context: store.settings.bilingualTranslationAiContextAware
          ? translationBlockContext(block.order, blocks)
          : undefined,
        id: block.id,
        text: block.text,
      };
      const result =
        e2eFakeTranslationResult(provider, translationBlock) ||
        (await aiModule.translateBilingualArticleBlocks({
          provider,
          blocks: [translationBlock],
          targetLanguage,
          title: source.title,
          summary: source.summary,
        }));
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
    onUpdate(latest);
  });

  latest = await saveTranslationFinalStatus(articlePersistence, latest);
  onUpdate(latest);
  return latest;
}

async function deleteCurrentArticleTranslation(
  context: ArticleTranslationRuntimeContext,
  input: ArticleTranslationDeleteRequest,
) {
  const { agentRuntimePersistence, articlePersistence } = await context.getPersistenceModule();
  const aiModule = await context.getAiModule();
  const article = await articlePersistence.readArticle(input.articleId);
  if (!article) return null;
  const store = await agentRuntimePersistence.readAgentRuntimeContext();
  const sourceId = articleTranslationSourceId(article, input.sourceId);
  return articlePersistence.deleteCurrentArticleTranslation({
    articleId: article.id,
    sourceId,
    sourceContentHash: article.contentHash,
    targetLanguage: translationTargetLanguage(input.targetLanguage, store.settings),
    promptVersion: aiModule.bilingualTranslationPromptVersion,
  });
}

function articleTranslationSource(article: ArticleRecord, input: ArticleTranslationRequest) {
  const sourceId = articleTranslationSourceId(article, input.sourceId);
  if ((article.sourceType || 'web') === 'web') {
    return {
      blocks: extractArticleTranslationBlocks(article),
      sourceId,
      summary: article.excerpt,
      title: article.title,
    };
  }

  const chapter = ebookTranslationChapter(article, sourceId);
  return {
    blocks: ebookTranslationBlocks(input.sourceBlocks),
    sourceId,
    summary: article.ebook?.metadata.description || article.excerpt,
    title: [article.title, chapter?.title].filter(Boolean).join(' — '),
  };
}

function articleTranslationSourceId(article: ArticleRecord, requestedSourceId?: string) {
  if ((article.sourceType || 'web') === 'web') return ARTICLE_TRANSLATION_SOURCE_ID;
  if (article.sourceType !== 'ebook') throw new Error('ARTICLE_TRANSLATION_SOURCE_UNSUPPORTED');
  if (article.ebook?.metadata.format !== 'epub') throw new Error('EBOOK_TRANSLATION_EPUB_ONLY');

  const sourceId = requestedSourceId?.trim();
  if (!sourceId) throw new Error('EBOOK_TRANSLATION_CHAPTER_REQUIRED');
  if (!ebookTranslationChapter(article, sourceId)) {
    throw new Error('EBOOK_TRANSLATION_CHAPTER_NOT_FOUND');
  }
  return sourceId;
}

function ebookTranslationChapter(article: ArticleRecord, sourceId: string) {
  return (
    article.ebook?.index?.chapters.find((chapter) => chapter.id === sourceId) ||
    article.ebook?.chapters.find((chapter) => chapter.id === sourceId) ||
    null
  );
}

function ebookTranslationBlocks(
  sourceBlocks: ArticleTranslationRequest['sourceBlocks'],
): ArticleTranslationBlock[] {
  if (!sourceBlocks?.length) throw new Error('ARTICLE_TRANSLATION_NO_TEXT');

  const blockIds = new Set<string>();
  return sourceBlocks.map((sourceBlock, order) => {
    const id = sourceBlock.id.trim();
    const text = sourceBlock.text.replace(/\s+/g, ' ').trim();
    if (!id || !text) throw new Error('ARTICLE_TRANSLATION_INVALID_BLOCK');
    if (blockIds.has(id)) throw new Error('ARTICLE_TRANSLATION_DUPLICATE_BLOCK');
    blockIds.add(id);
    return {
      id,
      order,
      text,
      textHash: hashText(text),
    };
  });
}

function e2eFakeTranslationResult(
  provider: { baseUrl?: string },
  block: { id: string; text: string },
) {
  if (
    process.env.YOMITOMO_E2E !== '1' ||
    provider.baseUrl !== E2E_FAKE_TRANSLATION_PROVIDER_BASE_URL
  ) {
    return null;
  }
  return {
    translations: [{ id: block.id, translation: `RD-813 translation: ${block.text}` }],
    inputTokens: 0,
    outputTokens: 0,
  };
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

function translationBlockContext(order: number, blocks: ArticleTranslationBlock[]) {
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
