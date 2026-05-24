import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  type BrowserWindowConstructorOptions,
  type IpcMainInvokeEvent,
} from 'electron';
import type {
  Agent,
  AgentAnnotatePayload,
  AgentMessagePayload,
  AppSettings,
  ArticleRecord,
  Comment,
  DesktopStore,
  LlmProvider,
  WeReadOpenMethod,
  WeReadReadingStatsMode,
} from '@yomitomo/shared';
import { agentPersonalityName, makeId } from '@yomitomo/shared';
import { clearLogFile, getLogPath, logError, logInfo, pruneLogFile, readLogFile } from './logger';
import { configureDesktopAppStorage } from './app-environment';
import type { AppUpdateState } from '../app-update-types';
import type { DesktopStoreGetResult, DesktopStoreLoadErrorInfo } from '../app-store-errors';
import type {
  DesktopIpcInvokeArgs,
  DesktopIpcInvokeChannel,
  DesktopIpcInvokeResult,
  EbookImportFileInput,
  PdfImportFileInput,
} from '../ipc-contract';

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
    void openExternalUrl(url).catch(() => undefined);
    return { action: 'deny' };
  });
  browserWindow.webContents.on('will-navigate', (event, url) => {
    if (isSameAppNavigation(browserWindow.webContents.getURL(), url)) return;
    event.preventDefault();
    void openExternalUrl(url).catch(() => undefined);
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
  handleDesktopIpc('app:info', () => ({ desktopVersion: app.getVersion() }));
  ipcMain.on('app:renderer-ready', (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    if (browserWindow && !browserWindow.isDestroyed()) {
      recordStartupTiming('window.show');
      browserWindow.show();
    }
  });
  handleDesktopIpc('store:get', async (): Promise<DesktopStoreGetResult> => {
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
  handleDesktopIpc('data:paths', async () => {
    const { getDataManagementPaths } = await import('./data-management');
    return getDataManagementPaths();
  });
  handleDesktopIpc('data:open-path', async (_event, kind) => {
    const { openDataManagementPath } = await import('./data-management');
    return openDataManagementPath(kind);
  });
  handleDesktopIpc('data:database-backup', async () => {
    const { backupDatabaseWithDialog } = await import('./data-management');
    return backupDatabaseWithDialog(mainWindow);
  });
  handleDesktopIpc('data:database-restore', async () => {
    const { restoreDatabaseWithDialog } = await import('./data-management');
    const result = await restoreDatabaseWithDialog(mainWindow);
    if (!result.canceled) sendFullStoreUpdated(result.store);
    return result;
  });
  handleDesktopIpc('log:path', () => getLogPath());
  handleDesktopIpc('log:read', () => readLogFile());
  handleDesktopIpc('log:clear', () => clearLogFile());
  handleDesktopIpc('updates:get-status', async () => {
    const { getAppUpdateState } = await getAppUpdaterModule();
    return getAppUpdateState();
  });
  handleDesktopIpc('updates:check', async () => {
    const { checkForAppUpdates } = await getAppUpdaterModule();
    return checkForAppUpdates();
  });
  handleDesktopIpc('updates:download', async () => {
    const { downloadAppUpdate } = await getAppUpdaterModule();
    return downloadAppUpdate();
  });
  handleDesktopIpc('updates:install', async () => {
    const { installAppUpdate } = await getAppUpdaterModule();
    return installAppUpdate();
  });
  handleDesktopIpc('performance:timing', (_event, input) => recordPerformanceTiming(input));
  handleDesktopIpc('url:open', (_event, value) => openExternalUrl(value));
  handleDesktopIpc('article:get', async (_event, id) => {
    const { readArticle } = await getStoreModule();
    return readArticle(id);
  });
  handleDesktopIpc('article:get-cover', async (_event, id) => {
    const { readArticleCover } = await getStoreModule();
    return readArticleCover(id);
  });
  handleDesktopIpc('article:save', async (_event, input) => {
    const { saveArticle } = await getStoreModule();
    return saveArticle(input);
  });
  handleDesktopIpc('article:reading-progress', async (_event, input) => {
    const { saveArticleReadingProgress } = await getStoreModule();
    return saveArticleReadingProgress(input.articleId, input.progress);
  });
  handleDesktopIpc('article:import-url', async (_event, input) => {
    const { findArticleByIdentity, readArticle, readImportSettings, saveArticle } =
      await getStoreModule();
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
    const { findArticleByIdentity, readArticle, saveArticle } = await getStoreModule();
    const { articleRecordFromEpubFile } = await import('./ebook-import');
    const { saveEbookSourceFile } = await import('./ebook-storage');
    const record = await articleRecordFromEpubFile(input, { performanceLogger: logInfo });
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
    return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  });
  handleDesktopIpc('pdf:import-file', async (_event, input: PdfImportFileInput) => {
    const { findArticleByIdentity, readArticle, saveArticle } = await getStoreModule();
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
    const data = file.buffer.slice(
      file.byteOffset,
      file.byteOffset + file.byteLength,
    ) as ArrayBuffer;
    logInfo('performance.pdf.file_read_main', {
      articleId,
      byteLength: data.byteLength,
      durationMs: elapsedMs(startedAt),
    });
    return data;
  });
  handleDesktopIpc('weread:get-state', async () => {
    const { readWeReadState } = await getStoreModule();
    return readWeReadState();
  });
  handleDesktopIpc('weread:read-api-key', async () => {
    const { readStoredWeReadApiKey } = await getStoreModule();
    return readStoredWeReadApiKey();
  });
  handleDesktopIpc('weread:save-settings', async (_event, input) => {
    const { saveWeReadSettings } = await getStoreModule();
    return saveWeReadSettings(input);
  });
  handleDesktopIpc('weread:test', async (_event, apiKey) => {
    const store = await getStoreModule();
    const key = apiKey?.trim() || (await store.readStoredWeReadApiKey());
    if (!key) return { ok: false, message: '请先配置微信读书 API Key' };
    try {
      const { testWeReadConnection } = await import('./weread-client');
      const result = await testWeReadConnection(key);
      await store.saveWeReadTestResult(true, result.message);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : '微信读书连通失败';
      await store.saveWeReadTestResult(false, message);
      return { ok: false, message };
    }
  });
  handleDesktopIpc('weread:sync', async () => {
    const store = await getStoreModule();
    const apiKey = await store.readStoredWeReadApiKey();
    if (!apiKey) throw new Error('请先在设置里配置微信读书 API Key');
    const {
      fetchWeReadBookDetail,
      fetchWeReadNotebooks,
      hasValidWeReadBookDetailContent,
      mergeWeReadNotebookBook,
    } = await import('./weread-client');
    const books = await fetchWeReadNotebooks(apiKey);
    const details = [];
    for (const book of books) {
      const detail = mergeWeReadNotebookBook(
        await fetchWeReadBookDetail(apiKey, book.bookId),
        book,
      );
      if (hasValidWeReadBookDetailContent(detail)) details.push(detail);
    }
    return store.saveWeReadBookDetails(details);
  });
  handleDesktopIpc('weread:sync-book', async (_event, bookId) => {
    const store = await getStoreModule();
    const apiKey = await store.readStoredWeReadApiKey();
    if (!apiKey) throw new Error('请先在设置里配置微信读书 API Key');
    const { fetchWeReadBookDetail } = await import('./weread-client');
    const detail = await fetchWeReadBookDetail(apiKey, bookId);
    return store.saveWeReadBookDetail(detail);
  });
  handleDesktopIpc('weread:get-book', async (_event, bookId) => {
    const { readWeReadBookDetail } = await getStoreModule();
    return readWeReadBookDetail(bookId);
  });
  handleDesktopIpc('weread:open', async (_event, target) => {
    const { readWeReadSettings } = await getStoreModule();
    const settings = await readWeReadSettings();
    return openExternalUrl(buildWeReadOpenUrl(target, settings.openMethod));
  });
  handleDesktopIpc('weread:get-reading-stats', async () => {
    const { readWeReadReadingStatsState } = await getStoreModule();
    return readWeReadReadingStatsState();
  });
  handleDesktopIpc('weread:query-reading-stats', async (_event, input) => {
    const store = await getStoreModule();
    const apiKey = await store.readStoredWeReadApiKey();
    if (!apiKey) throw new Error('请先在设置里配置微信读书 API Key');
    const { fetchWeReadReadingStats } = await import('./weread-client');
    const sourceBaseTime =
      input.mode === 'overall' ? undefined : Math.floor((input.baseTime ?? Date.now()) / 1000);
    const periodStart = getWeReadStatsPeriodStart(input.mode, sourceBaseTime);
    const data = await fetchWeReadReadingStats(apiKey, input.mode, sourceBaseTime);
    return store.saveWeReadReadingStatsSnapshot({
      id: `${input.mode}:${periodStart}`,
      mode: input.mode,
      periodStart,
      sourceBaseTime,
      data,
      fetchedAt: new Date().toISOString(),
    });
  });
  handleDesktopIpc('user:save', async (_event, input) => {
    const { saveUser } = await getStoreModule();
    return saveUser(input);
  });
  handleDesktopIpc('settings:save', async (_event, input) => {
    const { saveSettings } = await getStoreModule();
    const store = await saveSettings(input);
    await pruneLogFile(store.settings.logRetentionDays);
    sendFullStoreUpdated(store);
    return store;
  });
  handleDesktopIpc('provider:save', async (_event, input) => {
    const { saveProvider } = await getStoreModule();
    const store = await saveProvider(input);
    return store;
  });
  handleDesktopIpc('provider:delete', async (_event, id) => {
    const { deleteProvider } = await getStoreModule();
    const store = await deleteProvider(id);
    return store;
  });
  handleDesktopIpc('provider:read-api-key', async (_event, providerId) => {
    if (!providerId) return '';
    const { readStoredProviderApiKey } = await getStoreModule();
    return readStoredProviderApiKey(providerId);
  });
  handleDesktopIpc('provider:test', async (_event, input) => {
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
  handleDesktopIpc('provider:list-models', async (_event, input) => {
    const { hydrateProviderInputApiKey } = await getStoreModule();
    const { listProviderModels } = await getAiModule();
    return listProviderModels(await hydrateProviderInputApiKey(input));
  });
  handleDesktopIpc('annotation:metadata', async (_event, payload) => {
    const { inferAnnotationMetadata } = await getAiModule();
    const { readStore } = await getStoreModule();
    const store = await readStore();
    const provider = await taskProvider(store.providers, store.settings, 'readingAssistant');
    return inferAnnotationMetadata(provider, payload);
  });
  handleDesktopIpc('agent:mention-route', async (_event, payload) => {
    const { planAgentMentionRoute } = await getAiModule();
    const { readStore } = await getStoreModule();
    const store = await readStore();
    const provider = await taskProvider(store.providers, store.settings, 'readingAssistant');
    return planAgentMentionRoute(provider, payload);
  });
  handleDesktopIpc('focus-co-reading:route', async (_event, payload) => {
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
  handleDesktopIpc('article:delete', async (_event, id) => {
    const { deleteArticle, readArticle } = await getStoreModule();
    const article = await readArticle(id);
    const patch = await deleteArticle(id);
    if (article?.sourceType === 'pdf') {
      const { deletePdfSourceFile } = await import('./pdf-storage');
      await deletePdfSourceFile(id);
    }
    return patch;
  });
  handleDesktopIpc('agent:comment', async (_event, payload) => {
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
  handleDesktopIpc('agent:review', async (_event, payload) => {
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
  handleDesktopIpc('agent:annotate', async (_event, payload) => {
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
  handleDesktopIpc('agent:save', async (_event, input) => {
    const { saveAgent } = await getStoreModule();
    const store = await saveAgent(input);
    return store;
  });
  handleDesktopIpc('agent:delete', async (_event, id) => {
    const { deleteAgent } = await getStoreModule();
    const store = await deleteAgent(id);
    return store;
  });
}

type DesktopIpcHandler<Channel extends DesktopIpcInvokeChannel> = (
  event: IpcMainInvokeEvent,
  ...args: DesktopIpcInvokeArgs<Channel>
) => DesktopIpcInvokeResult<Channel> | Promise<DesktopIpcInvokeResult<Channel>>;

function handleDesktopIpc<Channel extends DesktopIpcInvokeChannel>(
  channel: Channel,
  handler: DesktopIpcHandler<Channel>,
) {
  ipcMain.handle(channel, handler);
}

function sendFullStoreUpdated(store: DesktopStore) {
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
  if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'weread:') {
    throw new Error('仅支持打开 HTTP 链接');
  }
  await shell.openExternal(url.toString());
}

function buildWeReadOpenUrl(
  target: { bookId: string; chapterUid?: number; range?: string; userVid?: number },
  method: WeReadOpenMethod,
) {
  if (method === 'web') {
    const webBookId = buildWeReadWebBookId(target.bookId);
    const webReaderId =
      target.chapterUid !== undefined
        ? `${webBookId}k${buildWeReadWebBookId(String(target.chapterUid))}`
        : webBookId;
    const url = new URL(`https://weread.qq.com/web/reader/${encodeURIComponent(webReaderId)}`);
    return url.href;
  }

  if (target.chapterUid !== undefined && target.range) {
    const [rangeStart, rangeEnd] = target.range.split('-');
    const url = new URL('weread://bestbookmark');
    url.searchParams.set('bookId', target.bookId);
    url.searchParams.set('chapterUid', String(target.chapterUid));
    if (rangeStart) url.searchParams.set('rangeStart', rangeStart);
    if (rangeEnd) url.searchParams.set('rangeEnd', rangeEnd);
    if (target.userVid !== undefined) url.searchParams.set('userVid', String(target.userVid));
    return url.href;
  }

  const url = new URL('weread://reading');
  url.searchParams.set('bId', target.bookId);
  if (target.chapterUid !== undefined)
    url.searchParams.set('chapterUid', String(target.chapterUid));
  return url.href;
}

function getWeReadStatsPeriodStart(mode: WeReadReadingStatsMode, baseTime?: number) {
  if (mode === 'overall') return 0;
  const date = new Date((baseTime ?? Math.floor(Date.now() / 1000)) * 1000);
  date.setHours(0, 0, 0, 0);
  if (mode === 'weekly') {
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
  } else if (mode === 'monthly') {
    date.setDate(1);
  } else {
    date.setMonth(0, 1);
  }
  return Math.floor(date.getTime() / 1000);
}

function buildWeReadWebBookId(bookId: string) {
  const digest = md5(bookId);
  const [type, segments] = transformWeReadBookId(bookId);
  let result = `${digest.slice(0, 3)}${type}2${digest.slice(-2)}`;

  for (const [index, segment] of segments.entries()) {
    result += `${segment.length.toString(16).padStart(2, '0')}${segment}`;
    if (index < segments.length - 1) result += 'g';
  }

  if (result.length < 20) result += digest.slice(0, 20 - result.length);
  return `${result}${md5(result).slice(0, 3)}`;
}

function transformWeReadBookId(bookId: string): [string, string[]] {
  if (/^\d+$/.test(bookId)) {
    const segments: string[] = [];
    for (let index = 0; index < bookId.length; index += 9) {
      segments.push(Number(bookId.slice(index, index + 9)).toString(16));
    }
    return ['3', segments];
  }

  let hexId = '';
  for (const char of bookId) hexId += char.charCodeAt(0).toString(16);
  return ['4', [hexId]];
}

function md5(value: string) {
  return createHash('md5').update(value).digest('hex');
}

function isSameAppNavigation(currentValue: string, nextValue: string) {
  try {
    const current = new URL(currentValue);
    const next = new URL(nextValue);
    if (current.protocol === 'file:' || next.protocol === 'file:') {
      return current.protocol === next.protocol && current.pathname === next.pathname;
    }
    return current.origin === next.origin;
  } catch {
    return false;
  }
}
