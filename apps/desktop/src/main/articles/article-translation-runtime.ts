import { JSDOM } from 'jsdom';
import { extractWebArticleTranslationBlocks } from '@yomitomo/core';
import type {
  ArticleRecord,
  ArticleTranslation,
  ArticleTranslationDeleteRequest,
  ArticleTranslationRequest,
  ArticleTranslationSegment,
} from '@yomitomo/shared';
import { hashText } from '@yomitomo/shared';
import { taskProvider } from '../agents/agent-runtime-routing';
import type { DesktopAiModule } from '../ipc/ipc';
import {
  articleTranslationIdentityKey,
  resolveArticleTranslationIdentity,
  type ArticleTranslationIdentity,
} from './article-translation-identity';
import {
  createArticleTranslationSessions,
  type ArticleTranslationSessionSignal,
} from './article-translation-session';

type ArticlePersistence = Pick<
  typeof import('../store/store-articles'),
  | 'deleteCurrentArticleTranslation'
  | 'finalizeArticleTranslation'
  | 'initializeArticleTranslation'
  | 'readArticle'
  | 'readCurrentArticleTranslation'
  | 'updateArticleTranslationSegment'
>;
type ArticleTranslationBlock = ReturnType<typeof extractWebArticleTranslationBlocks>[number];
type ArticleTranslationSource = ReturnType<typeof articleTranslationSource>;
type TranslationProvider = Awaited<ReturnType<typeof taskProvider>>;

export type ArticleTranslationRuntimeContext = {
  getAiModule: () => Promise<
    Pick<DesktopAiModule, 'bilingualTranslationPromptVersion' | 'translateBilingualArticleBlocks'>
  >;
  getPersistenceModules: () => Promise<{
    providerRepository: Pick<
      typeof import('../providers/provider-repository'),
      'hydrateProviderApiKey'
    >;
    storeAgents: Pick<typeof import('../store/store-agents'), 'readAgentRuntimeContext'>;
    storeArticles: ArticlePersistence;
  }>;
};

const E2E_FAKE_TRANSLATION_PROVIDER_BASE_URL = 'https://e2e.invalid/yomitomo-ai';
const TRANSLATION_CONCURRENCY = 3;

export function createArticleTranslationRuntime(context: ArticleTranslationRuntimeContext) {
  const sessions = createArticleTranslationSessions();
  return {
    deleteCurrent: (input: ArticleTranslationDeleteRequest) =>
      deleteCurrentArticleTranslation(context, sessions, input),
    readCurrent: (input: ArticleTranslationRequest) =>
      readCurrentArticleTranslation(context, input),
    translate: (
      input: ArticleTranslationRequest,
      onUpdate: (translation: ArticleTranslation) => void,
    ) => translateArticle(context, sessions, input, onUpdate),
  };
}

type ArticleTranslationSessions = ReturnType<typeof createArticleTranslationSessions>;

async function readCurrentArticleTranslation(
  context: ArticleTranslationRuntimeContext,
  input: ArticleTranslationRequest,
) {
  const { storeAgents: agentRuntimePersistence, storeArticles: articlePersistence } =
    await context.getPersistenceModules();
  const aiModule = await context.getAiModule();
  const article = await articlePersistence.readArticle(input.articleId);
  if (!article) return null;
  const store = await agentRuntimePersistence.readAgentRuntimeContext();
  const identity = resolveArticleTranslationIdentity({
    article,
    requestedSourceId: input.sourceId,
    requestedTargetLanguage: input.targetLanguage,
    settings: store.settings,
    promptVersion: aiModule.bilingualTranslationPromptVersion,
  });
  return articlePersistence.readCurrentArticleTranslation(identity);
}

async function translateArticle(
  context: ArticleTranslationRuntimeContext,
  sessions: ArticleTranslationSessions,
  input: ArticleTranslationRequest,
  onUpdate: (translation: ArticleTranslation) => void,
): Promise<ArticleTranslation> {
  const { storeAgents: agentRuntimePersistence, storeArticles: articlePersistence } =
    await context.getPersistenceModules();
  const aiModule = await context.getAiModule();
  const article = await articlePersistence.readArticle(input.articleId);
  if (!article) throw new Error('ARTICLE_NOT_FOUND');
  const store = await agentRuntimePersistence.readAgentRuntimeContext();
  const identity = resolveArticleTranslationIdentity({
    article,
    requestedSourceId: input.sourceId,
    requestedTargetLanguage: input.targetLanguage,
    settings: store.settings,
    promptVersion: aiModule.bilingualTranslationPromptVersion,
  });
  const source = articleTranslationSource(article, input, identity.sourceId);

  return sessions.run(articleTranslationIdentityKey(identity), (signal) =>
    runTranslationSession({
      aiModule,
      articlePersistence,
      input,
      key: identity,
      onUpdate,
      settings: store.settings,
      signal,
      source,
      provider: () =>
        taskProvider(context, store.providers, store.settings, 'bilingualTranslation'),
    }),
  );
}

type TranslationSessionInput = {
  aiModule: Awaited<ReturnType<ArticleTranslationRuntimeContext['getAiModule']>>;
  articlePersistence: ArticlePersistence;
  input: ArticleTranslationRequest;
  key: ArticleTranslationIdentity;
  onUpdate: (translation: ArticleTranslation) => void;
  settings: ArticleTranslationSettings;
  signal: ArticleTranslationSessionSignal;
  source: ArticleTranslationSource;
  provider: () => Promise<TranslationProvider>;
};

async function runTranslationSession(
  session: TranslationSessionInput,
): Promise<ArticleTranslation> {
  const { articlePersistence, input, key, onUpdate, signal, source } = session;
  const current = await articlePersistence.readCurrentArticleTranslation(key);
  if (!input.force && !input.sourceBlockIds?.length && current?.status === 'ready') return current;

  const blocks = source.blocks;
  if (blocks.length === 0) throw new Error('ARTICLE_TRANSLATION_NO_TEXT');
  const selectedBlockIds = new Set(input.sourceBlockIds || []);
  const targetBlocks =
    selectedBlockIds.size > 0 ? blocks.filter((block) => selectedBlockIds.has(block.id)) : blocks;
  if (targetBlocks.length === 0) throw new Error('ARTICLE_TRANSLATION_NO_TEXT');

  const translatedBlockIds = new Set(
    (current?.segments || []).map((segment) => segment.sourceBlockId),
  );
  const provider = await session.provider();
  let latest = await articlePersistence.initializeArticleTranslation({
    ...key,
    providerId: provider.id,
    providerName: provider.name,
    modelName: provider.modelName,
    updatedAt: new Date().toISOString(),
    segments: blocks.map((block) => ({
      sourceBlockId: block.id,
      sourceText: block.text,
      sourceTextHash: block.textHash,
      order: block.order,
      retranslate:
        Boolean(input.force) || !translatedBlockIds.has(block.id) || selectedBlockIds.has(block.id),
    })),
  });
  onUpdate(latest);

  const segmentIndexByBlockId = new Map(
    latest.segments.map((segment, index) => [segment.sourceBlockId, index]),
  );
  await runWithConcurrency(targetBlocks, TRANSLATION_CONCURRENCY, async (block) => {
    if (signal.cancelled) return;
    const update = await translateTranslationBlock({ block, blocks, session, provider });
    if (signal.cancelled) return;
    const segment = await articlePersistence.updateArticleTranslationSegment({
      translationId: latest.id,
      sourceBlockId: block.id,
      ...update,
    });
    if (!segment) return;
    latest = replaceTranslationSegment(latest, segmentIndexByBlockId, segment);
    onUpdate(latest);
  });
  if (signal.cancelled) return latest;

  const finalized = await articlePersistence.finalizeArticleTranslation({
    translationId: latest.id,
    updatedAt: new Date().toISOString(),
  });
  if (finalized) latest = finalized;
  onUpdate(latest);
  return latest;
}

async function translateTranslationBlock(input: {
  block: ArticleTranslationBlock;
  blocks: ArticleTranslationBlock[];
  session: TranslationSessionInput;
  provider: TranslationProvider;
}): Promise<{
  status: 'ready' | 'failed';
  translatedText?: string;
  error?: string;
  updatedAt: string;
}> {
  const { block, blocks, provider, session } = input;
  const updatedAt = new Date().toISOString();
  try {
    const translationBlock = {
      context: session.settings.bilingualTranslationAiContextAware
        ? translationBlockContext(block.order, blocks)
        : undefined,
      id: block.id,
      text: block.text,
    };
    const result =
      e2eFakeTranslationResult(provider, translationBlock) ||
      (await session.aiModule.translateBilingualArticleBlocks({
        provider,
        blocks: [translationBlock],
        targetLanguage: session.key.targetLanguage,
        title: session.source.title,
        summary: session.source.summary,
      }));
    const translatedText = result.translations[0]?.translation.trim();
    return {
      status: translatedText ? 'ready' : 'failed',
      error: translatedText ? undefined : 'TRANSLATION_MISSING',
      translatedText,
      updatedAt,
    };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'TRANSLATION_FAILED',
      updatedAt,
    };
  }
}

function replaceTranslationSegment(
  translation: ArticleTranslation,
  indexByBlockId: Map<string, number>,
  segment: ArticleTranslationSegment,
): ArticleTranslation {
  const index = indexByBlockId.get(segment.sourceBlockId);
  if (index === undefined) return translation;
  const segments = translation.segments.slice();
  segments[index] = segment;
  return { ...translation, segments, updatedAt: segment.updatedAt };
}

async function deleteCurrentArticleTranslation(
  context: ArticleTranslationRuntimeContext,
  sessions: ArticleTranslationSessions,
  input: ArticleTranslationDeleteRequest,
) {
  const { storeAgents: agentRuntimePersistence, storeArticles: articlePersistence } =
    await context.getPersistenceModules();
  const aiModule = await context.getAiModule();
  const article = await articlePersistence.readArticle(input.articleId);
  if (!article) return null;
  const store = await agentRuntimePersistence.readAgentRuntimeContext();
  const identity = resolveArticleTranslationIdentity({
    article,
    requestedSourceId: input.sourceId,
    requestedTargetLanguage: input.targetLanguage,
    settings: store.settings,
    promptVersion: aiModule.bilingualTranslationPromptVersion,
  });

  const sessionKey = articleTranslationIdentityKey(identity);
  sessions.cancel(sessionKey);
  return sessions.run(sessionKey, () =>
    articlePersistence.deleteCurrentArticleTranslation(identity),
  );
}

function articleTranslationSource(
  article: ArticleRecord,
  input: ArticleTranslationRequest,
  sourceId: string,
) {
  if (article.sourceType === 'web') {
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

type ArticleTranslationSettings = {
  bilingualTranslationAiContextAware?: boolean;
  bilingualTranslationTargetLanguage?: string;
};

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
