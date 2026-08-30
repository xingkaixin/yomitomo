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
import { installAppMenu } from './app/app-menu';
import { claimDesktopAppInstance } from './app/desktop-app-instance';
import {
  runPendingChromiumCacheCleanup,
  scheduleChromiumCacheInspection,
} from './app/chromium-cache-maintenance';
import { installDevProcessLifecycle } from './app/dev-process-lifecycle';
import { installElectronSmokeProbe } from './app/electron-smoke-probe';
import { initializeStartupStore, type StartupStoreInitializationResult } from './app/startup-store';
import { startMainProcessRuntime, type MainProcessRuntime } from './app/main-process-runtime';
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
import { registerAgentIpc } from './ipc/ipc-agent';
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
import { createReadingMemoryModelLifecycle } from './reading-memory/reading-memory-model-lifecycle';
import { createReadingMemorySemanticIndex } from './reading-memory/reading-memory-semantic-index';
import { createReadingMemoryControls } from './reading-memory/reading-memory-controls';
import {
  createReadingRelationsRuntime,
  type ReadingRelationsRuntime,
} from './reading-memory/reading-relations-runtime';
import {
  createReadingLibraryRuntime,
  type ReadingLibraryRuntime,
} from './reading-memory/reading-library-runtime';
import {
  createReadingReviewRuntime,
  type ReadingReviewRuntime,
} from './reading-memory/reading-review-runtime';
import { createReadingReviewQueue } from './reading-memory/reading-review-queue';
import { getSqliteExecutor, readDatabaseLifecycle, withDatabaseLease } from './store/store-db';
import { secureRendererWebPreferences } from './windows/renderer-window-security';
import { installRendererNavigationGuard } from './windows/renderer-navigation';
import { windowChromeOptions } from './windows/window-chrome';
import { mainPath } from './app/main-paths';
import type { AppMenuCommand } from '../app-menu-types';

let mainWindow: BrowserWindow | null = null;
const appIconPath = mainPath('../../resources/icon.png');
let aiModulePromise: Promise<typeof import('@yomitomo/ai')> | null = null;
let aiLoggerConfigured = false;
let appUpdaterModulePromise: Promise<typeof import('./app/app-updater')> | null = null;
let persistenceModulesPromise: Promise<DesktopPersistenceModules> | null = null;
let mainProcessRuntime: MainProcessRuntime | null = null;
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

function getPersistenceModules() {
  persistenceModulesPromise ||= Promise.all([
    import('./providers/provider-repository'),
    import('./store/store-agents'),
    import('./store/store-articles'),
    import('./store/store-assistant-executions'),
    import('./store/store-collections'),
    import('./store/store-model-pricing'),
    import('./store/store-providers'),
    import('./store/store-settings'),
    import('./store/store-snapshot'),
    import('./weread/weread-repository'),
  ]).then(
    ([
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
    ]) => ({
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

function preloadStoreModule(reason: string) {
  if (persistenceModulesPromise) return;
  const startedAt = performance.now();
  recordStartupTiming('store.module_preload_start', { reason });
  void getPersistenceModules()
    .then((modules) => {
      recordStartupTiming('store.module_preload_success', {
        reason,
        durationMs: elapsedMs(startedAt),
      });
      const warmStartedAt = performance.now();
      const profile = modules.storeSnapshot.warmStoreDatabaseWithProfile();
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

async function runStartupChromiumCacheCleanup() {
  const startedAt = performance.now();
  recordStartupTiming('chromium_cache.cleanup_check_start');
  try {
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
    await browserWindow.loadFile(mainPath('../renderer/index.html'));
  }
  recordStartupTiming('renderer.load_complete');

  installRendererNavigationGuard(browserWindow.webContents, openExternalUrl);
}

void app.whenReady().then(async () => {
  if (!ownsDesktopAppInstance) return;
  logInfo('app.ready', { logPath: getLogPath() });
  recordStartupTiming('app.ready');
  if (!app.isPackaged && process.platform === 'darwin' && app.dock) app.dock.setIcon(appIconPath);
  installAppMenu({
    appName: 'Yomitomo',
    isPackaged: app.isPackaged,
    locale: app.getLocale(),
    onCommand: handleAppMenuCommand,
    platform: process.platform,
    logInfo,
  });
  const startupStoreInitialization = await initializeStartupStore({
    getPersistenceModules,
    recordStartupTiming,
    setSensitiveRendererEventsLocked,
  });
  const readingMemoryModelLifecycle = createReadingMemoryModelLifecycle({
    userDataPath: app.getPath('userData'),
    logInfo,
    logError,
  });
  const readingMemorySemanticIndex = createReadingMemorySemanticIndex({
    modelLifecycle: readingMemoryModelLifecycle,
    withDatabase: (operation) =>
      withDatabaseLease(async () => {
        const executor = getSqliteExecutor();
        return operation(executor, readDatabaseLifecycle().generation);
      }),
    logInfo,
    logError,
  });
  const readingMemoryControls = createReadingMemoryControls({
    modelLifecycle: readingMemoryModelLifecycle,
    semanticIndex: readingMemorySemanticIndex,
    userDataPath: app.getPath('userData'),
  });
  readingRelationsRuntime = createReadingRelationsRuntime({
    semanticIndex: readingMemorySemanticIndex,
    getAiModule,
    logInfo,
  });
  readingLibraryRuntime = createReadingLibraryRuntime({
    semanticIndex: readingMemorySemanticIndex,
    getAiModule,
    logInfo,
  });
  readingReviewRuntime = createReadingReviewRuntime({
    semanticIndex: readingMemorySemanticIndex,
    readQueue: createReadingReviewQueue({ semanticIndex: readingMemorySemanticIndex }),
    getAiModule,
    logInfo,
  });
  mainProcessRuntime = startMainProcessRuntime({
    getPersistenceModules,
    getAppUpdaterModule,
    getAppVersion: () => app.getVersion(),
    sendWeReadStateUpdated,
    elapsedMs,
    logInfo,
    logError,
    readingMemoryControls,
  });
  registerReadingMemoryIpc({
    relations: readingRelationsRuntime,
    library: readingLibraryRuntime,
    review: readingReviewRuntime,
    controls: readingMemoryControls,
  });
  registerIpc(startupStoreInitialization);
  recordStartupTiming('ipc.registered');
  recordStartupTiming('updater.deferred');
  await runStartupChromiumCacheCleanup();
  await createWindow();
  scheduleChromiumCacheInspection({ logger: { info: logInfo, error: logError } });
});

app.on('window-all-closed', () => {
  if (ownsDesktopAppInstance && process.platform !== 'darwin') app.quit();
});

const beforeQuit = createBeforeQuitHandler({
  dispose: async () => {
    readingRelationsRuntime?.cancelAll();
    readingRelationsRuntime = null;
    readingLibraryRuntime?.cancelAll();
    readingLibraryRuntime = null;
    readingReviewRuntime?.cancelAll();
    readingReviewRuntime = null;
    await mainProcessRuntime?.dispose();
    mainProcessRuntime = null;
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

function registerIpc(startupStoreInitialization: StartupStoreInitializationResult) {
  const context = {
    startupStoreInitialization,
    getMainWindow: () => mainWindow,
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
    onDatabaseRestored: () => {
      readingRelationsRuntime?.cancelAll();
      readingLibraryRuntime?.cancelAll();
      readingReviewRuntime?.cancelAll();
      mainProcessRuntime?.onDatabaseRestored();
    },
    storeLoadErrorInfo,
    elapsedMs,
    logInfo,
    logError,
    openExternalUrl,
  };

  configureDesktopIpcAppLockGuardContext(context);
  registerAppIpc(context);
  registerStoreDataIpc(context);
  registerArticleIpc(context);
  registerLibraryCollectionIpc(context);
  registerWeReadIpc(context);
  registerAppLockIpc(context);
  registerProviderIpc(context);
  registerAgentIpc(context);
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
