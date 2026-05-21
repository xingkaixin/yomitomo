import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell, type BrowserWindowConstructorOptions } from 'electron';
import type {
  Agent,
  AgentAnnotatePayload,
  AgentMessagePayload,
  AgentReviewPayload,
  AgentMentionInstructionPayload,
  AnnotationMetadataPayload,
  AppSettings,
  ArticleRecord,
  ArticleReadingProgress,
  Comment,
  DesktopStore,
  FocusCoReadingRoutePayload,
  LlmProvider,
  UserProfile,
} from '@yomitomo/shared';
import { agentPersonalityName, makeId } from '@yomitomo/shared';
import type { DataManagementPathKind } from './data-management';
import { clearLogFile, getLogPath, logError, logInfo, pruneLogFile, readLogFile } from './logger';
import { configureDesktopAppStorage } from './app-environment';
import type { AppUpdateState } from '../app-update-types';
import type { DesktopStoreGetResult, DesktopStoreLoadErrorInfo } from '../app-store-errors';

let mainWindow: BrowserWindow | null = null;
const appIconPath = join(__dirname, '../../resources/icon.png');
let aiModulePromise: Promise<typeof import('@yomitomo/ai')> | null = null;
let aiLoggerConfigured = false;
let appUpdaterModulePromise: Promise<typeof import('./app-updater')> | null = null;
let storeModulePromise: Promise<typeof import('./store')> | null = null;

configureDesktopAppStorage();
recordStartupTiming('main.module_loaded', {
  pid: process.pid,
  platform: process.platform,
  packaged: app.isPackaged,
});

async function getAiModule() {
  aiModulePromise ||= import('@yomitomo/ai');
  const module = await aiModulePromise;
  if (!aiLoggerConfigured) {
    module.setAiLogger({ info: logInfo, error: logError });
    aiLoggerConfigured = true;
  }
  return module;
}

async function getAppUpdaterModule() {
  appUpdaterModulePromise ||= import('./app-updater');
  const module = await appUpdaterModulePromise;
  module.configureAppUpdater(sendUpdateStatusUpdated);
  return module;
}

function getStoreModule() {
  storeModulePromise ||= import('./store');
  return storeModulePromise;
}

function preloadStoreModule(reason: string) {
  if (storeModulePromise) return;
  const startedAt = performance.now();
  recordStartupTiming('store.module_preload_start', { reason });
  void getStoreModule()
    .then((module) => {
      recordStartupTiming('store.module_preload_success', {
        reason,
        durationMs: elapsedMs(startedAt),
      });
      const warmStartedAt = performance.now();
      const profile = module.warmStoreDatabaseWithProfile();
      recordStartupTiming('store.database_warm_success', {
        reason,
        durationMs: elapsedMs(warmStartedAt),
        steps: profile,
      });
    })
    .catch((error) => {
      logError('store.module_preload_failed', error);
      recordStartupTiming('store.module_preload_error', {
        reason,
        durationMs: elapsedMs(startedAt),
      });
    });
}

function scheduleLogPrune(retentionDays: number | undefined) {
  const startedAt = performance.now();
  recordStartupTiming('log.prune_start');
  void pruneLogFile(retentionDays)
    .then(() => {
      recordStartupTiming('log.prune_success', { durationMs: elapsedMs(startedAt) });
    })
    .catch((error) => {
      logError('log.prune_failed', error);
      recordStartupTiming('log.prune_error', { durationMs: elapsedMs(startedAt) });
    });
}

async function createWindow() {
  recordStartupTiming('window.create_start');
  const browserWindow = new BrowserWindow({
    ...windowChromeOptions(),
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 700,
    show: false,
    backgroundColor: '#ffffff',
    title: 'Yomitomo',
    icon: appIconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = browserWindow;
  recordStartupTiming('window.created');

  browserWindow.on('closed', () => {
    if (mainWindow === browserWindow) mainWindow = null;
  });
  browserWindow.webContents.once('dom-ready', () => {
    recordStartupTiming('renderer.dom_ready');
  });
  browserWindow.webContents.once('did-finish-load', () => {
    recordStartupTiming('renderer.did_finish_load');
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    recordStartupTiming('renderer.load_start', { mode: 'dev-server' });
    preloadStoreModule('renderer.load_start');
    await browserWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    if (process.env.YOMITOMO_OPEN_DEVTOOLS === '1') {
      browserWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    recordStartupTiming('renderer.load_start', { mode: 'file' });
    preloadStoreModule('renderer.load_start');
    await browserWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
  recordStartupTiming('renderer.load_complete');

  browserWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url);
    return { action: 'deny' };
  });
}

function windowChromeOptions(): BrowserWindowConstructorOptions {
  if (process.platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
    };
  }

  if (process.platform === 'win32') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#ffffff',
        symbolColor: '#151515',
        height: 36,
      },
    };
  }

  return {
    frame: false,
  };
}

app.whenReady().then(async () => {
  logInfo('app.ready', { logPath: getLogPath() });
  recordStartupTiming('app.ready');
  if (process.platform === 'darwin' && app.dock) app.dock.setIcon(appIconPath);
  registerIpc();
  recordStartupTiming('ipc.registered');
  recordStartupTiming('updater.deferred');
  await createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

function registerIpc() {
  ipcMain.handle('app:info', () => ({ desktopVersion: app.getVersion() }));
  ipcMain.on('app:renderer-ready', (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    if (browserWindow && !browserWindow.isDestroyed()) {
      recordStartupTiming('window.show');
      browserWindow.show();
    }
  });
  ipcMain.handle('store:get', async (): Promise<DesktopStoreGetResult> => {
    const startedAt = performance.now();
    recordStartupTiming('store.get_start');
    try {
      const importStartedAt = performance.now();
      const { readStoreWithProfile } = await getStoreModule();
      const importDurationMs = elapsedMs(importStartedAt);
      const readStartedAt = performance.now();
      const { store, profile } = await readStoreWithProfile();
      const readDurationMs = elapsedMs(readStartedAt);
      scheduleLogPrune(store.settings.logRetentionDays);
      recordStartupTiming('store.get_success', {
        durationMs: elapsedMs(startedAt),
        importDurationMs,
        readDurationMs,
        articleCount: store.articles.length,
        annotationCount: store.articles.reduce(
          (count, article) => count + (article.annotationCount ?? article.annotations.length),
          0,
        ),
        commentCount: store.articles.reduce((count, article) => {
          const commentCount =
            article.commentCount ??
            article.annotations.reduce(
              (annotationCount, annotation) =>
                annotationCount + annotation.comments.filter((comment) => !comment.replyTo).length,
              0,
            );
          return count + commentCount;
        }, 0),
      });
      recordStartupTiming('store.get_profile', { steps: profile });
      return { ok: true, store };
    } catch (error) {
      logError('store.get_failed', error);
      recordStartupTiming('store.get_error', { durationMs: elapsedMs(startedAt) });
      return { ok: false, error: await storeLoadErrorInfo(error) };
    }
  });
  ipcMain.handle('data:paths', async () => {
    const { getDataManagementPaths } = await import('./data-management');
    return getDataManagementPaths();
  });
  ipcMain.handle('data:open-path', async (_event, kind: DataManagementPathKind) => {
    const { openDataManagementPath } = await import('./data-management');
    return openDataManagementPath(kind);
  });
  ipcMain.handle('data:database-backup', async () => {
    const { backupDatabaseWithDialog } = await import('./data-management');
    return backupDatabaseWithDialog(mainWindow);
  });
  ipcMain.handle('data:database-restore', async () => {
    const { restoreDatabaseWithDialog } = await import('./data-management');
    const result = await restoreDatabaseWithDialog(mainWindow);
    if (!result.canceled) sendStoreUpdated(result.store);
    return result;
  });
  ipcMain.handle('log:path', () => getLogPath());
  ipcMain.handle('log:read', () => readLogFile());
  ipcMain.handle('log:clear', () => clearLogFile());
  ipcMain.handle('updates:get-status', async () => {
    const { getAppUpdateState } = await getAppUpdaterModule();
    return getAppUpdateState();
  });
  ipcMain.handle('updates:check', async () => {
    const { checkForAppUpdates } = await getAppUpdaterModule();
    return checkForAppUpdates();
  });
  ipcMain.handle('updates:download', async () => {
    const { downloadAppUpdate } = await getAppUpdaterModule();
    return downloadAppUpdate();
  });
  ipcMain.handle('updates:install', async () => {
    const { installAppUpdate } = await getAppUpdaterModule();
    return installAppUpdate();
  });
  ipcMain.handle('performance:timing', (_event, input: unknown) => recordPerformanceTiming(input));
  ipcMain.handle('url:open', (_event, value: string) => openExternalUrl(value));
  ipcMain.handle('article:get', async (_event, id: string) => {
    const { readArticle } = await getStoreModule();
    return readArticle(id);
  });
  ipcMain.handle('article:get-cover', async (_event, id: string) => {
    const { readArticleCover } = await getStoreModule();
    return readArticleCover(id);
  });
  ipcMain.handle('article:save', async (_event, input: ArticleRecord) => {
    const { saveArticle } = await getStoreModule();
    const store = await saveArticle(input);
    sendStoreUpdated(store);
    return store;
  });
  ipcMain.handle(
    'article:reading-progress',
    async (_event, input: { articleId: string; progress: ArticleReadingProgress }) => {
      const { saveArticleReadingProgress } = await getStoreModule();
      return saveArticleReadingProgress(input.articleId, input.progress);
    },
  );
  ipcMain.handle('article:import-url', async (_event, input: string) => {
    const { readArticle, readStore, saveArticle } = await getStoreModule();
    const { articleRecordFromUrl, isArticleImportChallengeRecord } =
      await import('./article-import');
    const previousStore = await readStore();
    const record = await articleRecordFromUrl(input, {
      inlineImages: Boolean(previousStore.settings.saveArticleImages),
    });
    const existingArticle = findArticleByIdentity(previousStore.articles, record);
    const existingFullArticle = existingArticle ? await readArticle(existingArticle.id) : null;
    if (existingFullArticle && !isArticleImportChallengeRecord(existingFullArticle)) {
      return {
        status: 'duplicate',
        article: existingFullArticle,
        store: previousStore,
      };
    }

    const store = await saveArticle({
      ...record,
      createdAt: existingFullArticle?.createdAt || record.createdAt,
    });
    const article = await readArticle(record.id);
    if (!article) throw new Error('文章保存失败');
    sendStoreUpdated(store);
    return { status: 'imported', article, store };
  });
  ipcMain.handle(
    'ebook:import-file',
    async (
      _event,
      input: {
        fileName: string;
        mimeType?: string;
        data: ArrayBuffer;
      },
    ) => {
      const { readArticle, readStore, saveArticle } = await getStoreModule();
      const { articleRecordFromEpubFile } = await import('./ebook-import');
      const { saveEbookSourceFile } = await import('./ebook-storage');
      const previousStore = await readStore();
      const record = await articleRecordFromEpubFile(input, { performanceLogger: logInfo });
      const existingArticle = findArticleByIdentity(previousStore.articles, record);
      if (existingArticle) {
        const existingFullArticle = await readArticle(existingArticle.id);
        await saveEbookSourceFile(existingArticle.id, input.data);
        return {
          status: 'duplicate',
          article: existingFullArticle || existingArticle,
          store: previousStore,
        };
      }

      await saveEbookSourceFile(record.id, input.data);
      const store = await saveArticle(record);
      const article = await readArticle(record.id);
      if (!article) throw new Error('电子书保存失败');
      sendStoreUpdated(store);
      return { status: 'imported', article, store };
    },
  );
  ipcMain.handle('ebook:read-file', async (_event, articleId: string) => {
    const { readEbookSourceFile } = await import('./ebook-storage');
    const file = await readEbookSourceFile(articleId);
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  });
  ipcMain.handle('user:save', async (_event, input: Partial<UserProfile>) => {
    const { saveUser } = await getStoreModule();
    return saveUser(input);
  });
  ipcMain.handle('settings:save', async (_event, input: AppSettings) => {
    const { saveSettings } = await getStoreModule();
    const store = await saveSettings(input);
    await pruneLogFile(store.settings.logRetentionDays);
    sendStoreUpdated(store);
    return store;
  });
  ipcMain.handle(
    'provider:save',
    async (_event, input: Partial<LlmProvider> & { removeApiKey?: boolean }) => {
      const { saveProvider } = await getStoreModule();
      const store = await saveProvider(input);
      return store;
    },
  );
  ipcMain.handle('provider:delete', async (_event, id: string) => {
    const { deleteProvider } = await getStoreModule();
    const store = await deleteProvider(id);
    return store;
  });
  ipcMain.handle('provider:read-api-key', async (_event, providerId: string) => {
    if (!providerId) return '';
    const { readStoredProviderApiKey } = await getStoreModule();
    return readStoredProviderApiKey(providerId);
  });
  ipcMain.handle('provider:test', async (_event, input: Partial<LlmProvider>) => {
    try {
      const { hydrateProviderInputApiKey } = await getStoreModule();
      const { testProvider } = await getAiModule();
      const provider = await hydrateProviderInputApiKey(input);
      const apiKey = provider.apiKey?.trim() || '';
      if (!apiKey) return { ok: false, message: '请先配置 API Key' };
      return testProvider({
        id: provider.id || 'provider_test',
        name: provider.name?.trim() || '临时供应商',
        type: provider.type || 'openai-chat',
        presetId: provider.presetId,
        logo: provider.logo,
        baseUrl: provider.baseUrl?.trim() || '',
        apiKey,
        hasApiKey: true,
        modelName: provider.modelName?.trim() || '',
        modelNames: provider.modelNames,
        modelInputMode: provider.modelInputMode,
        reasoningEffort: provider.reasoningEffort,
        createdAt: provider.createdAt || '',
        updatedAt: provider.updatedAt || '',
      });
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Provider 测试失败' };
    }
  });
  ipcMain.handle('provider:list-models', async (_event, input: Partial<LlmProvider>) => {
    const { hydrateProviderInputApiKey } = await getStoreModule();
    const { listProviderModels } = await getAiModule();
    return listProviderModels(await hydrateProviderInputApiKey(input));
  });
  ipcMain.handle('annotation:metadata', async (_event, payload: AnnotationMetadataPayload) => {
    const { inferAnnotationMetadata } = await getAiModule();
    const { readStore } = await getStoreModule();
    const store = await readStore();
    const provider = await taskProvider(store.providers, store.settings, 'readingAssistant');
    return inferAnnotationMetadata(provider, payload);
  });
  ipcMain.handle('agent:mention-route', async (_event, payload: AgentMentionInstructionPayload) => {
    const { planAgentMentionRoute } = await getAiModule();
    const { readStore } = await getStoreModule();
    const store = await readStore();
    const provider = await taskProvider(store.providers, store.settings, 'readingAssistant');
    return planAgentMentionRoute(provider, payload);
  });
  ipcMain.handle('focus-co-reading:route', async (_event, payload: FocusCoReadingRoutePayload) => {
    const { planFocusCoReadingRoute } = await getAiModule();
    const { readStore } = await getStoreModule();
    const store = await readStore();
    const provider = await taskProvider(store.providers, store.settings, 'readingAssistant');
    const selected = new Set(payload.selectedAgentIds);
    const agents = store.agents.filter(
      (agent) => agent.kind === 'annotation' && agent.enabled && selected.has(agent.id),
    );
    return planFocusCoReadingRoute(provider, payload, agents);
  });
  ipcMain.handle('article:delete', async (_event, id: string) => {
    const { deleteArticle } = await getStoreModule();
    return deleteArticle(id);
  });
  ipcMain.handle('agent:comment', async (_event, payload: AgentMessagePayload) => {
    const { runAgent } = await getAiModule();
    const { readStore } = await getStoreModule();
    const store = await readStore();
    const agent = findCommentAgent(store.agents, payload.agentId, payload.agentUsername);
    if (!agent) throw new Error(`找不到助手：@${payload.agentUsername}`);
    const provider = await taskProvider(
      store.providers,
      store.settings,
      providerTaskForAgent(agent),
    );
    const comment = await runAgent(provider, agent, {
      ...payload,
      agentRoster: publicCommentAgents(store.agents),
    });
    return {
      ...comment,
      id: makeId('comment'),
      replyTo:
        payload.reviewTargetCommentId || payload.userComment.replyTo || payload.userComment.id,
      readingIntent: payload.readingIntent || comment.readingIntent,
    } satisfies Comment;
  });
  ipcMain.handle('agent:review', async (_event, payload: AgentReviewPayload) => {
    const { runAgentReview } = await getAiModule();
    const { readStore } = await getStoreModule();
    const store = await readStore();
    const agent = findReviewAgent(store.agents, payload.agentId, payload.agentUsername);
    if (!agent) throw new Error(`找不到审阅助手：@${payload.agentUsername}`);
    const provider = await taskProvider(store.providers, store.settings, 'reviewAssistant');
    const comments = await runAgentReview(provider, agent, {
      ...payload,
      agentRoster: publicCommentAgents(store.agents),
    });
    for (const comment of comments) {
      comment.id = makeId('comment');
    }
    return comments;
  });
  ipcMain.on(
    'agent:comment:stream',
    async (
      event,
      input: {
        requestId: string;
        payload: AgentMessagePayload;
      },
    ) => {
      const channel = `agent:comment:stream:${input.requestId}`;
      try {
        const { runAgentStream } = await getAiModule();
        const { readStore } = await getStoreModule();
        const store = await readStore();
        const agent = findCommentAgent(
          store.agents,
          input.payload.agentId,
          input.payload.agentUsername,
        );
        if (!agent) throw new Error(`找不到助手：@${input.payload.agentUsername}`);
        const provider = await taskProvider(
          store.providers,
          store.settings,
          providerTaskForAgent(agent),
        );
        const comment: Comment = {
          id: makeId('comment'),
          author: 'ai',
          content: '',
          createdAt: new Date().toISOString(),
          agentId: agent.id,
          agentUsername: agent.username,
          agentNickname: agent.nickname,
          agentAvatar: agent.avatar,
          agentAnnotationColor: agent.annotationColor,
          replyTo:
            input.payload.reviewTargetCommentId ||
            input.payload.userComment.replyTo ||
            input.payload.userComment.id,
          readingIntent: input.payload.readingIntent,
          pending: true,
        };
        event.sender.send(channel, { type: 'start', comment });
        await runAgentStream(
          provider,
          agent,
          {
            ...input.payload,
            agentRoster: publicCommentAgents(store.agents),
            readingIntent: input.payload.readingIntent || comment.readingIntent,
          },
          (delta) => {
            comment.content += delta;
            event.sender.send(channel, { type: 'delta', delta });
          },
        );
        event.sender.send(channel, {
          type: 'done',
          comment: { ...comment, pending: false },
        });
      } catch (error) {
        event.sender.send(channel, {
          type: 'error',
          message: error instanceof Error ? error.message : '助手回复失败',
        });
      }
    },
  );
  ipcMain.handle('agent:annotate', async (_event, payload: AgentAnnotatePayload) => {
    const { runAgentAnnotateWithMemory } = await getAiModule();
    const { readStore } = await getStoreModule();
    const store = await readStore();
    const agent = findAnnotationAgent(store.agents, payload.agentId, payload.agentUsername);
    if (!agent) throw new Error(`找不到批注助手：@${payload.agentUsername}`);
    const provider = await taskProvider(store.providers, store.settings, 'readingAssistant');
    return runAgentAnnotateWithMemory(provider, agent, payload);
  });
  ipcMain.on(
    'agent:annotate:stream',
    async (
      event,
      input: {
        requestId: string;
        payload: AgentAnnotatePayload;
      },
    ) => {
      const channel = `agent:annotate:stream:${input.requestId}`;
      try {
        const { runAgentAnnotateStream } = await getAiModule();
        const { readStore } = await getStoreModule();
        const store = await readStore();
        const agent = findAnnotationAgent(
          store.agents,
          input.payload.agentId,
          input.payload.agentUsername,
        );
        if (!agent) throw new Error(`找不到批注助手：@${input.payload.agentUsername}`);
        const provider = await taskProvider(store.providers, store.settings, 'readingAssistant');
        const annotations: ArticleRecord['annotations'] = [];
        event.sender.send(channel, { type: 'start' });
        const result = await runAgentAnnotateStream(
          provider,
          agent,
          input.payload,
          (annotation) => {
            annotations.push(annotation);
            event.sender.send(channel, { type: 'item', annotation });
          },
        );
        event.sender.send(channel, {
          type: 'done',
          annotations,
          readingMemory: result.readingMemory,
        });
      } catch (error) {
        event.sender.send(channel, {
          type: 'error',
          message: error instanceof Error ? error.message : '助手添加想法失败',
        });
      }
    },
  );
  ipcMain.handle('agent:save', async (_event, input: Partial<Agent>) => {
    const { saveAgent } = await getStoreModule();
    const store = await saveAgent(input);
    return store;
  });
  ipcMain.handle('agent:delete', async (_event, id: string) => {
    const { deleteAgent } = await getStoreModule();
    const store = await deleteAgent(id);
    return store;
  });
}

function sendStoreUpdated(store: DesktopStore) {
  sendToRenderer('store:updated', store);
}

async function storeLoadErrorInfo(error: unknown): Promise<DesktopStoreLoadErrorInfo> {
  const { DatabaseTooNewError } = await import('./db/compatibility');
  if (error instanceof DatabaseTooNewError) {
    return {
      code: 'DATABASE_TOO_NEW',
      message:
        '这份本地数据库已经被更新版本的 Yomitomo 迁移过。请安装最新版继续使用，或从迁移前备份恢复数据后再打开当前版本。',
      detail: error.message,
      requiredReaderLevel: error.requiredReaderLevel,
      supportedReaderLevel: error.supportedReaderLevel,
      logPath: getLogPath(),
    };
  }

  return {
    code: 'DATABASE_UNAVAILABLE',
    message: '本地数据库加载失败。请查看日志确认原因，避免直接删除数据文件。',
    detail: error instanceof Error ? error.message : undefined,
    logPath: getLogPath(),
  };
}

function sendUpdateStatusUpdated(state: AppUpdateState) {
  sendToRenderer('updates:status', state);
}

function sendToRenderer(channel: 'store:updated', payload: DesktopStore): void;
function sendToRenderer(channel: 'updates:status', payload: AppUpdateState): void;
function sendToRenderer(channel: string, payload: unknown) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function recordPerformanceTiming(input: unknown) {
  if (!isRecord(input)) return;
  const event = typeof input.event === 'string' ? input.event : '';
  if (!/^[a-z0-9_.:-]+$/i.test(event)) return;
  logInfo(
    `performance.${event.replace(/^performance\./, '')}`,
    isRecord(input.data) ? input.data : {},
  );
}

function recordStartupTiming(event: string, data: Record<string, unknown> = {}) {
  logInfo(`performance.startup.${event}`, {
    elapsedMs: elapsedMs(0),
    ...data,
  });
}

function elapsedMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}

function findArticleByIdentity(
  articles: ArticleRecord[],
  identity: Pick<ArticleRecord, 'id' | 'url' | 'canonicalUrl'>,
) {
  return (
    articles.find((item) => item.id === identity.id) ||
    articles.find(
      (item) =>
        item.canonicalUrl === identity.canonicalUrl ||
        item.url === identity.url ||
        item.url === identity.canonicalUrl ||
        item.canonicalUrl === identity.url,
    ) ||
    null
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

type ProviderTask = 'readingAssistant' | 'reviewAssistant';

const providerTaskSettings: Record<ProviderTask, keyof AppSettings> = {
  readingAssistant: 'readingAssistantProviderId',
  reviewAssistant: 'reviewAssistantProviderId',
};

const providerTaskLabels: Record<ProviderTask, string> = {
  readingAssistant: '阅读理解助手',
  reviewAssistant: '深度审阅助手',
};

async function taskProvider(
  providers: LlmProvider[],
  settings: AppSettings,
  task: ProviderTask,
): Promise<LlmProvider> {
  const providerId = settings[providerTaskSettings[task]] || settings.defaultProviderId;
  const provider = providers.find((item) => item.id === providerId);
  if (!provider) throw new Error(`请先在任务路由选择${providerTaskLabels[task]}供应商`);
  const { hydrateProviderApiKey } = await getStoreModule();
  return hydrateProviderApiKey(provider);
}

function findAnnotationAgent(agents: Agent[], agentId: string | undefined, username: string) {
  return agents
    .filter((agent) => agent.kind === 'annotation' && agent.enabled)
    .find((agent) => agent.id === agentId || agent.username === username);
}

function findCommentAgent(agents: Agent[], agentId: string | undefined, username: string) {
  return agents
    .filter((agent) => agent.enabled)
    .find((agent) => agent.id === agentId || agent.username === username);
}

function findReviewAgent(agents: Agent[], agentId: string | undefined, username: string) {
  return agents
    .filter((agent) => agent.kind === 'review' && agent.enabled)
    .find((agent) => agent.id === agentId || agent.username === username);
}

function providerTaskForAgent(agent: Agent): ProviderTask {
  return agent.kind === 'review' ? 'reviewAssistant' : 'readingAssistant';
}

function publicCommentAgents(agents: Agent[]) {
  return agents
    .filter((agent) => agent.enabled)
    .map((agent) => ({
      id: agent.id,
      kind: agent.kind,
      enabled: agent.enabled,
      presetId: agent.presetId,
      nickname: agent.nickname,
      username: agent.username,
      avatar: agent.avatar,
      annotationColor: agent.annotationColor,
      annotationDensity: agent.annotationDensity,
      personalityName: agentPersonalityName(agent),
      temperature: agent.temperature,
    }));
}

async function openExternalUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('仅支持打开 HTTP 链接');
  }
  await shell.openExternal(url.toString());
}
