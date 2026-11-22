import { rm, writeFile } from 'node:fs/promises';
import { createModels } from '@earendil-works/pi-ai/models';
import { createRegistry, type HarnessSettings, type Report } from '@earendil-works/pi-durable';
import { eq } from 'drizzle-orm';
import type {
  ArticleReadingProgress,
  ArticleStorePatch,
  AssistantRunEvent,
  EpubBookIndex,
} from '@yomitomo/shared';
import { normalizeUiLanguage } from '@yomitomo/shared';
import { logError } from '../app/logger';
import {
  readArticleAnnotation,
  readArticleAnnotations,
} from '../articles/article-annotation-hydration';
import {
  agentNotFoundError,
  findCommentAgent,
  providerTaskForAgent,
  taskProvider,
  taskProviderRoute,
} from '../agents/agent-runtime-routing';
import * as schema from '../db/schema';
import { getValidChatGptAccessToken } from '../providers/chatgpt-oauth-repository';
import { searchReadingMemoryEntries } from '../reading-memory/reading-memory-store';
import { readAgentRuntimeContext } from '../store/store-agents';
import { afterDatabaseMaintenance, type StoreDatabase } from '../store/store-db';
import { createAssistantChannelRuntime } from './assistant-channel-runtime';
import {
  createAssistantChannelSources,
  createPinnedDatabaseRunner,
  type PinnedDatabaseRunner,
} from './assistant-channel-sources';
import { createDistillationReview } from './assistant-distillation-review';
import { assistantArticleTexts, sessionDirectory } from './assistant-session-lifecycle';
import { pendingMarkerPath, removeArticleFiles } from './assistant-session-files';
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

export function activeRunsIfLoaded(articleId: string) {
  return sessions ? sessions.runtime.activeRuns(articleId) : [];
}

export async function removeArticleSessionIfLoaded(directory: string, articleId: string) {
  if (sessions) return sessions.store.remove(articleId);
  await removeArticleFiles(directory, articleId);
}

export async function removeAllSessionsIfLoaded(directory: string) {
  if (sessions) return sessions.store.removeAll();
  await rm(directory, { recursive: true, force: true });
}

export async function disposeAssistantSessions() {
  const current = sessions;
  sessions = undefined;
  await current?.dispose();
}

function createAssistantSessions(host: AssistantSessionHost) {
  let disposed = false;
  const withPinnedDatabase = createPinnedDatabaseRunner(() => disposed);

  const models = createModels();
  const registry = createRegistry();
  const reading = createAssistantReadingExtension({
    articleText: (articleId) => assistantArticleTexts.load(articleId),
    searchMemory: (input) =>
      withPinnedDatabase(() =>
        searchReadingMemoryEntries({
          ...input,
          visibleRanges: input.visibleRanges,
          visibility: ['default'],
          fallbackToSubstring: true,
        }),
      ),
    annotations: (articleId) =>
      withPinnedDatabase((database) => readArticleAnnotations(database, articleId)),
    annotation: (articleId, annotationId) =>
      withPinnedDatabase((database) => readArticleAnnotation(database, articleId, annotationId)),
    agentName: (agentId) =>
      withPinnedDatabase((database) => {
        const row = database
          .select({ nickname: schema.agents.nickname, username: schema.agents.username })
          .from(schema.agents)
          .where(eq(schema.agents.id, agentId))
          .get();
        return row ? row.nickname || row.username : undefined;
      }),
  });
  registry.install(reading);
  const store = createAssistantSessionStore({
    directory: sessionDirectory(),
    harnessOptions: () => ({
      models,
      registry,
      settings: { ...settings, extensions: [reading] },
      // pi-durable attributes requests to pi by default, which would add headers for some providers.
      identity: { attribution: null },
      onReport: reportHarnessError,
    }),
    onOpen: (articleId, harness) => runtime.resume(articleId, harness),
    logError,
  });
  const channelSources = createAssistantChannelSources(host.publishArticlePatch, {
    withDatabase: withPinnedDatabase,
  });
  const withReplyDatabase: PinnedDatabaseRunner = (operation) =>
    afterDatabaseMaintenance(() => withPinnedDatabase(operation));
  const replySources = createAssistantChannelSources(host.publishArticlePatch, {
    withDatabase: withReplyDatabase,
  });
  const articleMeta = (articleId: string) =>
    withPinnedDatabase((database) => runtimeArticleMeta(database, articleId));
  const runtime = createAssistantChannelRuntime({
    store,
    models,
    articleText: (articleId) => assistantArticleTexts.load(articleId),
    resolveAgent: (agentId, allowDisabled) =>
      resolveAgent(withPinnedDatabase, agentId, allowDisabled),
    resolveAgentIdentity: (agentId) => resolveAgentIdentity(withReplyDatabase, agentId),
    resolveProviderApiKey: () => withPinnedDatabase(() => getValidChatGptAccessToken()),
    ...channelSources,
    publishReply: replySources.publishReply,
    findDiscussion: replySources.findDiscussion,
    articleMeta,
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
    articleMeta,
    registerProvider: runtime.registerProvider,
    findDiscussion: channelSources.findDiscussion,
  });
  registry.install(distillationReview.extension);

  async function dispose() {
    disposed = true;
    runtime.dispose();
    await store.dispose();
  }

  return { models, registry, store, runtime, distillationReview, dispose };
}

function runtimeArticleMeta(database: StoreDatabase, articleId: string) {
  const row = database
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

async function readChannelAgent(
  withPinnedDatabase: PinnedDatabaseRunner,
  agentId: string,
  allowDisabled: boolean,
) {
  const {
    agents,
    providers,
    settings: appSettings,
  } = await withPinnedDatabase(() => readAgentRuntimeContext());
  const agent = findCommentAgent(agents, agentId, '', allowDisabled);
  if (!agent) throw agentNotFoundError(agentId);
  return { agent, providers, appSettings, task: providerTaskForAgent(agent) };
}

async function resolveAgentIdentity(withPinnedDatabase: PinnedDatabaseRunner, agentId: string) {
  const { agent, providers, appSettings, task } = await readChannelAgent(
    withPinnedDatabase,
    agentId,
    true,
  );
  return {
    agent,
    provider: taskProviderRoute(providers, appSettings, task),
    uiLanguage: normalizeUiLanguage(appSettings.uiLanguage),
  };
}

async function resolveAgent(
  withPinnedDatabase: PinnedDatabaseRunner,
  agentId: string,
  allowDisabled: boolean,
) {
  const { agent, providers, appSettings, task } = await readChannelAgent(
    withPinnedDatabase,
    agentId,
    allowDisabled,
  );
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

function reportHarnessError(report: Report) {
  logError('assistant_session.report', report.error, { kind: report.kind });
}
