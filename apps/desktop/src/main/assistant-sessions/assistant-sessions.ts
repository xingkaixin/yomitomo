import { rm, writeFile } from 'node:fs/promises';
import { createModels } from '@earendil-works/pi-ai/models';
import { createRegistry, type HarnessSettings } from '@earendil-works/pi-durable';
import { eq } from 'drizzle-orm';
import type {
  ArticleReadingProgress,
  ArticleStorePatch,
  AssistantRunEvent,
  EpubBookIndex,
} from '@yomitomo/shared';
import { normalizeUiLanguage } from '@yomitomo/shared';
import { logError } from '../app/logger';
import { readArticleAnnotations } from '../articles/article-annotation-hydration';
import {
  agentNotFoundError,
  findCommentAgent,
  providerTaskForAgent,
  taskProvider,
  taskProviderRoute,
} from '../agents/agent-runtime-routing';
import * as schema from '../db/schema';
import { searchReadingMemoryEntries } from '../reading-memory/reading-memory-store';
import { readAgentRuntimeContext } from '../store/store-agents';
import { getDatabase } from '../store/store-db';
import { createAssistantChannelRuntime } from './assistant-channel-runtime';
import { createAssistantChannelSources } from './assistant-channel-sources';
import { createDistillationReview } from './assistant-distillation-review';
import { assistantArticleTexts, sessionDirectory } from './assistant-session-lifecycle';
import { pendingMarkerPath } from './assistant-session-files';
import { createAssistantReadingExtension } from './assistant-reading-extension';
import { createAssistantSessionStore } from './assistant-session-store';

const E2E_FAKE_PROVIDER_BASE_URL = 'https://e2e.invalid/yomitomo-ai';

const settings: HarnessSettings = {
  stream: { timeoutMs: 120_000 },
  retry: { maxRetries: 2 },
  toolExecution: 'parallel',
};

export type AssistantSessionHost = {
  publishRun: (event: AssistantRunEvent) => void;
  publishArticlePatch: (patch: ArticleStorePatch) => void;
};

let sessions: ReturnType<typeof createAssistantSessions> | undefined;

export function assistantSessions(host: AssistantSessionHost) {
  sessions ??= createAssistantSessions(host);
  return sessions;
}

export async function disposeAssistantSessions() {
  const current = sessions;
  sessions = undefined;
  await current?.store.dispose();
}

function createAssistantSessions(host: AssistantSessionHost) {
  const models = createModels();
  const registry = createRegistry();
  const reading = createAssistantReadingExtension({
    articleText: (articleId) => assistantArticleTexts.load(articleId),
    searchMemory: (input) =>
      searchReadingMemoryEntries({
        ...input,
        visibility: ['default'],
        fallbackToSubstring: true,
      }),
    annotations: (articleId) => readArticleAnnotations(getDatabase(), articleId),
    agentName: (agentId) => {
      const row = getDatabase()
        .select({ nickname: schema.agents.nickname, username: schema.agents.username })
        .from(schema.agents)
        .where(eq(schema.agents.id, agentId))
        .get();
      return row ? row.nickname || row.username : undefined;
    },
  });
  registry.install(reading);
  const store = createAssistantSessionStore({
    directory: sessionDirectory(),
    harnessOptions: () => ({
      models,
      registry,
      settings: { ...settings, extensions: [reading] },
      onReport: reportHarnessError,
    }),
    onOpen: (articleId, harness) => runtime.resume(articleId, harness),
    logError,
  });
  const runtime = createAssistantChannelRuntime({
    store,
    models,
    articleText: (articleId) => assistantArticleTexts.load(articleId),
    resolveAgent,
    ...createAssistantChannelSources(host.publishArticlePatch),
    articleMeta: runtimeArticleMeta,
    publishRun: host.publishRun,
    markPending: async (articleId, pending) => {
      const path = pendingMarkerPath(sessionDirectory(), articleId);
      await (pending ? writeFile(path, '') : rm(path, { force: true }));
    },
    logError,
  });
  const distillationReview = createDistillationReview({
    store,
    articleText: (articleId) => assistantArticleTexts.load(articleId),
    articleMeta: runtimeArticleMeta,
    registerProvider: runtime.registerProvider,
  });
  registry.install(distillationReview.extension);
  return { models, registry, store, runtime, distillationReview };
}

function runtimeArticleMeta(articleId: string) {
  const row = getDatabase()
    .select({
      title: schema.articles.title,
      readingProgress: schema.articles.readingProgress,
      ebookIndex: schema.articleBodies.ebookIndex,
    })
    .from(schema.articles)
    .leftJoin(schema.articleBodies, eq(schema.articleBodies.articleId, schema.articles.id))
    .where(eq(schema.articles.id, articleId))
    .get();
  return row
    ? {
        title: row.title,
        ebookIndex: (row.ebookIndex as EpubBookIndex | null) ?? undefined,
        readingProgress: (row.readingProgress as ArticleReadingProgress | null) ?? undefined,
      }
    : undefined;
}

async function resolveAgent(agentId: string, allowDisabled: boolean) {
  const { agents, providers, settings: appSettings } = await readAgentRuntimeContext();
  const agent = findCommentAgent(agents, agentId, '', allowDisabled);
  if (!agent) throw agentNotFoundError(agentId);
  const task = providerTaskForAgent(agent);
  const route = taskProviderRoute(providers, appSettings, task);
  const fake = process.env.YOMITOMO_E2E === '1' && route?.baseUrl === E2E_FAKE_PROVIDER_BASE_URL;
  const provider =
    fake && route
      ? route
      : await taskProvider(
          {
            getPersistenceModules: async () => ({
              providerRepository: await import('../providers/provider-repository'),
            }),
          },
          providers,
          appSettings,
          task,
        );
  return { agent, provider, uiLanguage: normalizeUiLanguage(appSettings.uiLanguage), fake };
}

function reportHarnessError(error: unknown) {
  logError('assistant_session.report', error);
}
