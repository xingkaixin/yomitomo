import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { app, BrowserWindow, shell, type IpcMainInvokeEvent } from 'electron';
import type {
  ArticleStorePatch,
  CollectionStorePatch,
  DesktopStore,
  LibraryPinPatch,
} from '@yomitomo/shared';
import { isRecord } from '@yomitomo/shared';
import { getLogPath, logError, logInfo } from './app/logger';
import { configureDesktopAppStorage } from './app/app-environment';
import { normalizeExternalUrlForOpen } from './app/external-url';
import { claimDesktopAppInstance } from './app/desktop-app-instance';
import { installDevProcessLifecycle } from './app/dev-process-lifecycle';
import { installElectronSmokeProbe } from './app/electron-smoke-probe';
import { initializeStartupStore, type StartupStoreInitializationResult } from './app/startup-store';
import type { MainProcessRuntime } from './app/main-process-runtime';
import { createBeforeQuitHandler } from './app/before-quit';
import type { AppUpdateState } from '../app-update-types';
import { isAppLockSettingsLocked, rendererStoreForAppLockState } from '../app-store';
import type { DesktopStoreLoadErrorInfo } from '../app-store-errors';
import type {
  DesktopIpcToRendererEventArgs,
  DesktopIpcToRendererEventChannel,
  WeReadState,
} from '../ipc-contract';
import { DatabaseTooNewError } from './db/errors';
import { registerAnnotationDiscussionWindowIpc } from './windows/annotation-discussion-window';
import { registerAnnotationSedimentationWindowIpc } from './windows/annotation-sedimentation-window';
import { closeAllAnnotationWindows } from './windows/annotation-window-lifecycle';
import { closeWeReadReader } from './windows/weread-reader-view';
import { registerAgentIpc } from './ipc/ipc-agent';
import { registerAssistantIpc } from './ipc/ipc-assistant';
import { registerAppLockIpc } from './ipc/ipc-app-lock';
import { registerAppIpc } from './ipc/ipc-app';
import { registerArticleIpc } from './ipc/ipc-article';
import {
  assertDesktopIpcRegistrationComplete,
  configureDesktopIpcAppLockGuardContext,
  type DesktopPersistenceModules,
} from './ipc/ipc';
import { sendDesktopIpcRendererEvent } from './ipc/ipc-events';
import { registerLibraryCollectionIpc } from './ipc/ipc-library-collection';
import { registerProviderIpc } from './ipc/ipc-provider';
import { registerReadingMemoryIpc } from './ipc/ipc-reading-memory';
import { registerStoreDataIpc } from './ipc/ipc-store-data';
import { registerWeReadIpc } from './ipc/ipc-weread';
import { createRendererStateEventDispatcher } from './ipc/renderer-state-event-dispatcher';
import { createRendererRoleRegistry } from './ipc/renderer-role-registry';
import { configureDesktopIpcRendererRoles } from './ipc/ipc-sender-guard';
import type { ReadingMemoryControls } from './reading-memory/reading-memory-controls';
import type { ReadingRelationsRuntime } from './reading-memory/reading-relations-runtime';
import type { ReadingLibraryRuntime } from './reading-memory/reading-library-runtime';
import type { ReadingReviewRuntime } from './reading-memory/reading-review-runtime';
import {
  closeDatabase,
  getSqliteExecutor,
  readDatabaseLifecycle,
  scheduleBackgroundSqliteMaintenance,
  withDatabaseLease,
} from './store/store-db';
import { secureRendererWebPreferences } from './windows/renderer-window-security';
import { openDiscussionTransitionOverlay } from './windows/discussion-window-transition';
import { installRendererNavigationGuard } from './windows/renderer-navigation';
import { windowChromeOptions } from './windows/window-chrome';
import { mainPath } from './app/main-paths';
import {
  configureAssistantSessions,
  disposeAssistantSessions,
  removeAllAssistantSessions,
  resumePendingAssistantRuns,
} from './assistant-sessions/assistant-session-lifecycle';
import type { AppMenuCommand } from '../app-menu-types';

type ReadingMemoryRuntimes = {
  controls: ReadingMemoryControls;
  relations: ReadingRelationsRuntime;
  library: ReadingLibraryRuntime;
  review: ReadingReviewRuntime;
};

let mainWindow: BrowserWindow | null = null;
const appIconPath = mainPath('../../resources/icon.png');
let aiModulePromise: Promise<typeof import('@yomitomo/ai')> | null = null;
let aiLoggerConfigured = false;
let appUpdaterModulePromise: Promise<typeof import('./app/app-updater')> | null = null;
let startupPersistenceModulesPromise: Promise<{
  storeSettings: typeof import('./store/store-settings');
  storeSnapshot: typeof import('./store/store-snapshot');
}> | null = null;
let storeCollectionsModulePromise: Promise<typeof import('./store/store-collections')> | null =
  null;
let persistenceModulesPromise: Promise<DesktopPersistenceModules> | null = null;
let mainProcessRuntime: MainProcessRuntime | null = null;
let backgroundRuntimeInitTimer: ReturnType<typeof setTimeout> | null = null;
let cancelBackgroundSqliteMaintenance: (() => void) | null = null;
let readingMemoryRuntimesPromise: Promise<ReadingMemoryRuntimes> | null = null;
let readingRelationsRuntime: ReadingRelationsRuntime | null = null;
let readingLibraryRuntime: ReadingLibraryRuntime | null = null;
let readingReviewRuntime: ReadingReviewRuntime | null = null;
let sensitiveRendererEventsLocked = false;
const rendererRoleRegistry = createRendererRoleRegistry();
const rendererStateEventDispatcher = createRendererStateEventDispatcher(rendererRoleRegistry);

configureDesktopIpcRendererRoles(rendererRoleRegistry);

const HOMEPAGE_URL = 'https://yomitomo.app';
const FEEDBACK_URL = 'https://github.com/xingkaixin/yomitomo/issues';

configureDesktopAppStorage();
const ownsDesktopAppInstance = claimDesktopAppInstance({
  requestLock: () => app.requestSingleInstanceLock(),
  quit: () => app.quit(),
  onSecondInstance: (listener) => app.on('second-instance', listener),
  getWindow: () => mainWindow,
});
if (ownsDesktopAppInstance) {
  installDevProcessLifecycle(logInfo);
  recordStartupTiming('main.module_loaded', {
    pid: process.pid,
    parentPid: process.ppid,
    platform: process.platform,
    packaged: app.isPackaged,
  });
}

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
  appUpdaterModulePromise ||= import('./app/app-updater');
  const module = await appUpdaterModulePromise;
  module.configureAppUpdater(sendUpdateStatusUpdated, {
    beforeInstall: async () => {
      await mainProcessRuntime?.suspendForAppUpdate();
    },
    onInstallFailed: async () => {
      await mainProcessRuntime?.resumeAfterAppUpdateFailure();
    },
  });
  return module;
}

function getStartupPersistenceModules() {
  startupPersistenceModulesPromise ||= Promise.all([
    import('./store/store-settings'),
    import('./store/store-snapshot'),
  ]).then(([storeSettings, storeSnapshot]) => ({ storeSettings, storeSnapshot }));
  return startupPersistenceModulesPromise;
}

function getStoreCollectionsModule() {
  storeCollectionsModulePromise ||= import('./store/store-collections');
  return storeCollectionsModulePromise;
}

function getPersistenceModules() {
  persistenceModulesPromise ||= Promise.all([
    getStartupPersistenceModules(),
    getStoreCollectionsModule(),
    import('./providers/chatgpt-oauth-repository'),
    import('./providers/provider-repository'),
    import('./store/store-agents'),
    import('./store/store-articles'),
    import('./store/store-assistant-executions'),
    import('./store/store-model-pricing'),
    import('./store/store-providers'),
    import('./weread/weread-repository'),
  ]).then(
    ([
      { storeSettings, storeSnapshot },
      storeCollections,
      chatGptOAuthRepository,
      providerRepository,
      storeAgents,
      storeArticles,
      storeAssistantExecutions,
      storeModelPricing,
      storeProviders,
      weReadRepository,
    ]) => ({
      chatGptOAuthRepository,
      providerRepository,
      storeAgents,
      storeArticles,
      storeAssistantExecutions,
      storeCollections,
      storeModelPricing,
      storeProviders,
      storeSettings,
      storeSnapshot,
      weReadRepository,
    }),
  );
  return persistenceModulesPromise;
}

function getReadingMemoryRuntimes() {
  readingMemoryRuntimesPromise ||= Promise.all([
    import('./reading-memory/reading-memory-model-lifecycle'),
    import('./reading-memory/reading-memory-semantic-index'),
    import('./reading-memory/reading-memory-controls'),
    import('./reading-memory/reading-relations-runtime'),
    import('./reading-memory/reading-library-runtime'),
    import('./reading-memory/reading-review-runtime'),
    import('./reading-memory/reading-review-queue'),
  ]).then(
    ([
      { createReadingMemoryModelLifecycle },
      { createReadingMemorySemanticIndex },
      { createReadingMemoryControls },
      { createReadingRelationsRuntime },
      { createReadingLibraryRuntime },
      { createReadingReviewRuntime },
      { createReadingReviewQueue },
    ]) => {
      const userDataPath = app.getPath('userData');
      const modelLifecycle = createReadingMemoryModelLifecycle({
        userDataPath,
        logInfo,
        logError,
      });
      const semanticIndex = createReadingMemorySemanticIndex({
        modelLifecycle,
        withDatabase: (operation) =>
          withDatabaseLease(async () => {
            const executor = getSqliteExecutor();
            return operation(executor, readDatabaseLifecycle().generation);
          }),
        logInfo,
        logError,
      });
      const controls = createReadingMemoryControls({
        modelLifecycle,
        semanticIndex,
        userDataPath,
        onProjectionRebuild: () => mainProcessRuntime?.requestReadingMemoryProjectionRebuild(),
      });
      const relations = createReadingRelationsRuntime({
        semanticIndex,
        getAiModule,
        logInfo,
      });
      const library = createReadingLibraryRuntime({
        semanticIndex,
        getAiModule,
        logInfo,
      });
      const review = createReadingReviewRuntime({
        semanticIndex,
        readQueue: createReadingReviewQueue({ semanticIndex }),
        getAiModule,
        logInfo,
        onReviewInserted: (decision) =>
          mainProcessRuntime?.recordReadingMemoryUsage(`review_${decision}`),
      });
      readingRelationsRuntime = relations;
      readingLibraryRuntime = library;
      readingReviewRuntime = review;
      return { controls, relations, library, review };
    },
  );
  return readingMemoryRuntimesPromise;
}

async function runStartupChromiumCacheCleanup() {
  const markerPath = join(
    app.getPath('userData'),
    'maintenance',
    'chromium-cache-maintenance.json',
  );
  if (!existsSync(markerPath)) {
    recordStartupTiming('chromium_cache.cleanup_check_complete', {
      durationMs: 0,
      status: 'skipped',
    });
    return;
  }
  const startedAt = performance.now();
  recordStartupTiming('chromium_cache.cleanup_check_start');
  try {
    const { runPendingChromiumCacheCleanup } = await import('./app/chromium-cache-maintenance');
    const result = await runPendingChromiumCacheCleanup({
      logger: { info: logInfo, error: logError },
    });
    recordStartupTiming('chromium_cache.cleanup_check_complete', {
      durationMs: elapsedMs(startedAt),
      status: result.status,
    });
  } catch (error) {
    logError('chromium_cache.cleanup_check_failed', error, {
      durationMs: elapsedMs(startedAt),
    });
    recordStartupTiming('chromium_cache.cleanup_check_error', {
      durationMs: elapsedMs(startedAt),
    });
  }
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
    webPreferences: secureRendererWebPreferences(),
  });
  mainWindow = browserWindow;
  const unregisterRendererStateTarget = rendererStateEventDispatcher.registerTarget(
    'main',
    browserWindow.webContents,
  );
  recordStartupTiming('window.created');

  browserWindow.on('closed', () => {
    unregisterRendererStateTarget();
    if (mainWindow === browserWindow) mainWindow = null;
  });
  browserWindow.on('focus', () => mainProcessRuntime?.checkTelemetryFocus());
  browserWindow.webContents.once('dom-ready', () => {
    recordStartupTiming('renderer.dom_ready');
  });
  browserWindow.webContents.once('did-finish-load', () => {
    recordStartupTiming('renderer.did_finish_load');
  });
  installElectronSmokeProbe(browserWindow);
  installRendererNavigationGuard(browserWindow.webContents, openExternalUrl, (details) =>
    openDiscussionTransitionOverlay(browserWindow, details),
  );

  if (process.env.ELECTRON_RENDERER_URL) {
    recordStartupTiming('renderer.load_start', { mode: 'dev-server' });
    await browserWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    if (process.env.YOMITOMO_OPEN_DEVTOOLS === '1') {
      browserWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    recordStartupTiming('renderer.load_start', { mode: 'file' });
    await browserWindow.loadFile(mainPath('../renderer/index.html'));
  }
  recordStartupTiming('renderer.load_complete');
}

void app.whenReady().then(async () => {
  if (!ownsDesktopAppInstance) return;
  logInfo('app.ready', { logPath: getLogPath() });
  recordStartupTiming('app.ready');
  if (!app.isPackaged && process.platform === 'darwin' && app.dock) app.dock.setIcon(appIconPath);
  const startupStoreInitialization = initializeStartupStore({
    getPersistenceModules: getStartupPersistenceModules,
    recordStartupTiming,
    setSensitiveRendererEventsLocked,
  });
  registerReadingMemoryIpc({
    getRuntimes: getReadingMemoryRuntimes,
    recordUsage: (key) => mainProcessRuntime?.recordReadingMemoryUsage(key),
  });
  configureAssistantSessions({
    publishRun: (event) => {
      if (!sensitiveRendererEventsLocked)
        rendererStateEventDispatcher.dispatch(null, 'assistant:run', event);
    },
    publishArticlePatch: (patch) => {
      if (!sensitiveRendererEventsLocked)
        rendererStateEventDispatcher.dispatch(null, 'article:patched', patch);
    },
  });
  registerIpc(startupStoreInitialization);
  recordStartupTiming('ipc.registered');
  recordStartupTiming('updater.deferred');
  await runStartupChromiumCacheCleanup();
  const windowLoadPromise = createWindow();
  await Promise.all([windowLoadPromise, startupStoreInitialization]);
  void import('./app/app-menu').then(({ installAppMenu }) => {
    installAppMenu({
      appName: 'Yomitomo',
      isPackaged: app.isPackaged,
      locale: app.getLocale(),
      onCommand: handleAppMenuCommand,
      platform: process.platform,
      logInfo,
    });
  });
  // Defer background runtime & reading-memory module evaluation until after first paint so the
  // main process stays dedicated to store:get, window.show, and the initial library catalog query.
  backgroundRuntimeInitTimer = setTimeout(() => {
    backgroundRuntimeInitTimer = null;
    void Promise.all([
      import('./app/main-process-runtime'),
      getReadingMemoryRuntimes(),
      import('./app/chromium-cache-maintenance'),
    ])
      .then(
        ([
          { startMainProcessRuntime },
          readingMemoryRuntimes,
          { scheduleChromiumCacheInspection },
        ]) => {
          if (quitting) return;
          mainProcessRuntime = startMainProcessRuntime({
            getPersistenceModules: async () => {
              const [storeModelPricing, weReadRepository] = await Promise.all([
                import('./store/store-model-pricing'),
                import('./weread/weread-repository'),
              ]);
              return { storeModelPricing, weReadRepository };
            },
            getAppUpdaterModule,
            getAppVersion: () => app.getVersion(),
            sendWeReadStateUpdated,
            elapsedMs,
            logInfo,
            logError,
            readingMemoryControls: readingMemoryRuntimes.controls,
          });
          cancelBackgroundSqliteMaintenance?.();
          cancelBackgroundSqliteMaintenance = scheduleBackgroundSqliteMaintenance({
            logInfo,
            logError,
          });
          void resumePendingAssistantRuns().catch((error: unknown) =>
            logError('assistant_session.resume_failed', error),
          );
          scheduleChromiumCacheInspection({ logger: { info: logInfo, error: logError } });
        },
      )
      .catch((error: unknown) => {
        logError('main_runtime.deferred_start_failed', error);
      });
  }, 150);
});

app.on('window-all-closed', () => {
  if (ownsDesktopAppInstance && process.platform !== 'darwin') app.quit();
});

let quitting = false;

const beforeQuit = createBeforeQuitHandler({
  dispose: async () => {
    quitting = true;
    if (backgroundRuntimeInitTimer) {
      clearTimeout(backgroundRuntimeInitTimer);
      backgroundRuntimeInitTimer = null;
    }
    cancelBackgroundSqliteMaintenance?.();
    cancelBackgroundSqliteMaintenance = null;
    readingRelationsRuntime?.cancelAll();
    readingRelationsRuntime = null;
    readingLibraryRuntime?.cancelAll();
    readingLibraryRuntime = null;
    readingReviewRuntime?.cancelAll();
    readingReviewRuntime = null;
    const runtime = mainProcessRuntime;
    mainProcessRuntime = null;
    const results = await Promise.allSettled([runtime?.dispose(), disposeAssistantSessions()]);
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failure) throw failure.reason;
  },
  finalize: () => {
    void persistenceModulesPromise?.then((modules) =>
      modules.chatGptOAuthRepository.cancelChatGptSignIn(),
    );
    closeDatabase();
  },
  quit: () => app.quit(),
  logError,
});

app.on('before-quit', (event) => {
  if (!ownsDesktopAppInstance) return;
  beforeQuit(event);
});

app.on('activate', () => {
  if (ownsDesktopAppInstance && BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

function registerIpc(
  startupStoreInitialization:
    | StartupStoreInitializationResult
    | Promise<StartupStoreInitializationResult>,
) {
  const context = {
    startupStoreInitialization,
    getMainWindow: () => mainWindow,
    getStartupPersistenceModules,
    getPersistenceModules,
    getAiModule,
    getAppUpdaterModule,
    getAppVersion: () => app.getVersion(),
    sendFullStoreUpdated,
    sendArticlePatched,
    sendCollectionPatched,
    sendLibraryPinPatched,
    registerRendererStateEventTarget: rendererStateEventDispatcher.registerTarget,
    setSensitiveRendererEventsLocked,
    recordStartupTiming,
    recordPerformanceTiming,
    configureWeReadAutoSync: (reason: string) =>
      mainProcessRuntime?.configureWeReadAutoSync(reason),
    onSettingsSaved: () => mainProcessRuntime?.checkTelemetrySettings(),
    beforeDatabaseRestore: async () => {
      readingRelationsRuntime?.cancelAll();
      readingLibraryRuntime?.cancelAll();
      readingReviewRuntime?.cancelAll();
      await disposeAssistantSessions();
    },
    onDatabaseRestored: async () => {
      readingRelationsRuntime?.cancelAll();
      readingLibraryRuntime?.cancelAll();
      readingReviewRuntime?.cancelAll();
      mainProcessRuntime?.onDatabaseRestored();
      await removeAllAssistantSessions().catch((error: unknown) =>
        logError('assistant_session.restore_cleanup_failed', error),
      );
    },
    storeLoadErrorInfo,
    elapsedMs,
    logInfo,
    logError,
    openExternalUrl,
  };

  configureDesktopIpcAppLockGuardContext({
    getPersistenceModules: getStartupPersistenceModules,
    waitForStartupReady: () => Promise.resolve(startupStoreInitialization),
  });
  registerAppIpc(context);
  registerStoreDataIpc(context);
  registerArticleIpc(context);
  registerLibraryCollectionIpc({
    sendCollectionPatched,
    sendLibraryPinPatched,
    getPersistenceModules: async () => ({
      storeCollections: await getStoreCollectionsModule(),
    }),
  });
  registerWeReadIpc(context);
  registerAppLockIpc(context);
  registerProviderIpc(context);
  registerAgentIpc(context);
  registerAssistantIpc(context);
  registerAnnotationDiscussionWindowIpc(context);
  registerAnnotationSedimentationWindowIpc(context);
  assertDesktopIpcRegistrationComplete();
}

function sendFullStoreUpdated(event: IpcMainInvokeEvent, store: DesktopStore) {
  const rendererStore = rendererStoreForAppLockState(store);
  setSensitiveRendererEventsLocked(isAppLockSettingsLocked(rendererStore.settings));
  rendererStateEventDispatcher.dispatch(event.sender, 'store:updated', rendererStore);
}

function sendArticlePatched(event: IpcMainInvokeEvent, patch: ArticleStorePatch) {
  if (sensitiveRendererEventsLocked) return;
  rendererStateEventDispatcher.dispatch(event.sender, 'article:patched', patch);
}

function sendCollectionPatched(event: IpcMainInvokeEvent, patch: CollectionStorePatch) {
  if (sensitiveRendererEventsLocked) return;
  rendererStateEventDispatcher.dispatch(event.sender, 'collection:patched', patch);
}

function sendLibraryPinPatched(event: IpcMainInvokeEvent, patch: LibraryPinPatch) {
  if (sensitiveRendererEventsLocked) return;
  rendererStateEventDispatcher.dispatch(event.sender, 'library-pin:patched', patch);
}

function sendWeReadStateUpdated(state: WeReadState) {
  if (sensitiveRendererEventsLocked) return;
  sendToRenderer('weread:state-updated', state);
}

function setSensitiveRendererEventsLocked(locked: boolean) {
  sensitiveRendererEventsLocked = locked;
  if (locked) {
    readingRelationsRuntime?.cancelAll();
    readingLibraryRuntime?.cancelAll();
    readingReviewRuntime?.cancelAll();
    closeAllAnnotationWindows();
    closeWeReadReader();
  }
}

function handleAppMenuCommand(command: AppMenuCommand) {
  logInfo('app.menu.command', { command });
  if (command === 'open-help-docs') {
    void openMenuExternalUrl(menuResourceUrls().docs, command);
    return;
  }
  if (command === 'open-release-notes') {
    void openMenuExternalUrl(menuResourceUrls().releaseNotes, command);
    return;
  }
  if (command === 'report-issue') {
    void openMenuExternalUrl(FEEDBACK_URL, command);
    return;
  }
  sendAppMenuCommand(command);
}

async function openMenuExternalUrl(url: string, command: AppMenuCommand) {
  try {
    await openExternalUrl(url);
  } catch (error) {
    logError('app.menu.command_failed', error, { command });
  }
}

function menuResourceUrls() {
  const locale = app.getLocale().toLowerCase();
  const prefix = locale.startsWith('zh') ? '' : locale.startsWith('ja') ? '/ja' : '/en';
  return {
    docs: `${HOMEPAGE_URL}${prefix}/docs/`,
    releaseNotes: `${HOMEPAGE_URL}${prefix}/changelogs/`,
  };
}

function sendAppMenuCommand(command: AppMenuCommand) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    logInfo('app.menu.command_skipped', { command, reason: 'main_window_unavailable' });
    return;
  }
  sendDesktopIpcRendererEvent(mainWindow.webContents, 'app-menu:command', command);
}

async function storeLoadErrorInfo(error: unknown): Promise<DesktopStoreLoadErrorInfo> {
  if (error instanceof DatabaseTooNewError) {
    return {
      code: 'DATABASE_TOO_NEW',
      detail: error.message,
      requiredReaderLevel: error.requiredReaderLevel,
      supportedReaderLevel: error.supportedReaderLevel,
      logPath: getLogPath(),
    };
  }

  return {
    code: 'DATABASE_UNAVAILABLE',
    detail: error instanceof Error ? error.message : undefined,
    logPath: getLogPath(),
  };
}

function sendUpdateStatusUpdated(state: AppUpdateState) {
  sendToRenderer('updates:status', state);
}

function sendToRenderer<Channel extends DesktopIpcToRendererEventChannel>(
  channel: Channel,
  ...args: DesktopIpcToRendererEventArgs<Channel>
) {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  sendDesktopIpcRendererEvent(mainWindow.webContents, channel, ...args);
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

async function openExternalUrl(value: string) {
  await shell.openExternal(normalizeExternalUrlForOpen(value));
}
