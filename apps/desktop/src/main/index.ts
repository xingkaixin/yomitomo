import { performance } from 'node:perf_hooks';
import { app, BrowserWindow, shell } from 'electron';
import type {
  ArticleStorePatch,
  CollectionStorePatch,
  DesktopStore,
  LibraryPinPatch,
} from '@yomitomo/shared';
import { getLogPath, logError, logInfo, pruneLogFile } from './app/logger';
import { configureDesktopAppStorage } from './app/app-environment';
import { installDevProcessLifecycle } from './app/dev-process-lifecycle';
import { installElectronSmokeProbe } from './app/electron-smoke-probe';
import type { AppUpdateState } from '../app-update-types';
import type { DesktopStoreLoadErrorInfo } from '../app-store-errors';
import { DatabaseTooNewError } from './db/errors';
import { registerAnnotationDiscussionWindowIpc } from './windows/annotation-discussion-window';
import { registerAnnotationSedimentationWindowIpc } from './windows/annotation-sedimentation-window';
import { registerAgentIpc } from './ipc/ipc-agent';
import { registerAppLockIpc } from './ipc/ipc-app-lock';
import { registerAppIpc } from './ipc/ipc-app';
import { registerArticleIpc } from './ipc/ipc-article';
import { configureDesktopIpcAppLockGuardContext } from './ipc/ipc';
import { registerLibraryCollectionIpc } from './ipc/ipc-library-collection';
import { registerProviderIpc } from './ipc/ipc-provider';
import { registerStoreDataIpc } from './ipc/ipc-store-data';
import { registerWeReadIpc } from './ipc/ipc-weread';
import { modelPriceRefreshIntervalMs } from './providers/model-pricing-repository';
import { syncWeReadLibrary } from './weread/weread-sync';
import { secureRendererWebPreferences } from './windows/renderer-window-security';
import { windowChromeOptions } from './windows/window-chrome';
import { mainPath } from './app/main-paths';

let mainWindow: BrowserWindow | null = null;
const appIconPath = mainPath('../../resources/icon.png');
let aiModulePromise: Promise<typeof import('@yomitomo/ai')> | null = null;
let aiLoggerConfigured = false;
let appUpdaterModulePromise: Promise<typeof import('./app/app-updater')> | null = null;
let persistenceModulePromise: Promise<typeof import('./store/desktop-persistence')> | null = null;
let modelPriceRefreshTimer: NodeJS.Timeout | null = null;
let weReadAutoSyncStartupTimer: NodeJS.Timeout | null = null;
let weReadAutoSyncIntervalTimer: NodeJS.Timeout | null = null;
let weReadAutoSyncConfigureToken = 0;
let weReadAutoSyncRunning = false;

const WEREAD_AUTO_SYNC_STARTUP_DELAY_MS = 5_000;
const WEREAD_AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;

configureDesktopAppStorage();
installDevProcessLifecycle(logInfo);
recordStartupTiming('main.module_loaded', {
  pid: process.pid,
  parentPid: process.ppid,
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
  appUpdaterModulePromise ||= import('./app/app-updater');
  const module = await appUpdaterModulePromise;
  module.configureAppUpdater(sendUpdateStatusUpdated);
  return module;
}

function getPersistenceModule() {
  persistenceModulePromise ||= import('./store/desktop-persistence');
  return persistenceModulePromise;
}

function preloadStoreModule(reason: string) {
  if (persistenceModulePromise) return;
  const startedAt = performance.now();
  recordStartupTiming('store.module_preload_start', { reason });
  void getPersistenceModule()
    .then((module) => {
      recordStartupTiming('store.module_preload_success', {
        reason,
        durationMs: elapsedMs(startedAt),
      });
      const warmStartedAt = performance.now();
      const profile = module.storeSnapshotPersistence.warmStoreDatabaseWithProfile();
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

function scheduleModelPriceRefresh() {
  const refresh = (reason: string) => {
    const startedAt = performance.now();
    void getPersistenceModule()
      .then((module) => module.modelPricingPersistence.refreshModelPrices())
      .then((result) => {
        logInfo('model_pricing.refresh', {
          reason,
          refreshed: result.refreshed,
          recordCount: result.recordCount,
          resultReason: result.reason,
          durationMs: elapsedMs(startedAt),
        });
      })
      .catch((error) => {
        logError('model_pricing.refresh_failed', error, { reason });
      });
  };
  setTimeout(() => refresh('startup'), 5_000);
  modelPriceRefreshTimer ||= setInterval(() => refresh('interval'), modelPriceRefreshIntervalMs());
  modelPriceRefreshTimer.unref?.();
}

function configureWeReadAutoSync(reason: string) {
  const token = ++weReadAutoSyncConfigureToken;
  clearWeReadAutoSyncTimers();
  void getPersistenceModule()
    .then(async (module) => {
      const settings = await module.weReadPersistence.readWeReadSettings();
      if (token !== weReadAutoSyncConfigureToken) return;
      if (!settings.configured || settings.syncMode !== 'auto') {
        logInfo('weread.auto_sync.disabled', {
          reason,
          configured: settings.configured,
          syncMode: settings.syncMode ?? 'manual',
        });
        return;
      }

      weReadAutoSyncStartupTimer = setTimeout(
        () => void runWeReadAutoSync('startup'),
        WEREAD_AUTO_SYNC_STARTUP_DELAY_MS,
      );
      weReadAutoSyncStartupTimer.unref?.();
      weReadAutoSyncIntervalTimer = setInterval(
        () => void runWeReadAutoSync('interval'),
        WEREAD_AUTO_SYNC_INTERVAL_MS,
      );
      weReadAutoSyncIntervalTimer.unref?.();
      logInfo('weread.auto_sync.scheduled', {
        reason,
        startupDelayMs: WEREAD_AUTO_SYNC_STARTUP_DELAY_MS,
        intervalMs: WEREAD_AUTO_SYNC_INTERVAL_MS,
      });
    })
    .catch((error) => {
      logError('weread.auto_sync.configure_failed', error, { reason });
    });
}

function clearWeReadAutoSyncTimers() {
  if (weReadAutoSyncStartupTimer) {
    clearTimeout(weReadAutoSyncStartupTimer);
    weReadAutoSyncStartupTimer = null;
  }
  if (weReadAutoSyncIntervalTimer) {
    clearInterval(weReadAutoSyncIntervalTimer);
    weReadAutoSyncIntervalTimer = null;
  }
}

async function runWeReadAutoSync(reason: string) {
  if (weReadAutoSyncRunning) {
    logInfo('weread.auto_sync.skipped', { reason, skippedReason: 'in_flight' });
    return;
  }

  const startedAt = performance.now();
  weReadAutoSyncRunning = true;
  try {
    const module = await getPersistenceModule();
    const settings = await module.weReadPersistence.readWeReadSettings();
    if (!settings.configured || settings.syncMode !== 'auto') {
      logInfo('weread.auto_sync.skipped', {
        reason,
        configured: settings.configured,
        syncMode: settings.syncMode ?? 'manual',
        skippedReason: 'disabled',
      });
      return;
    }

    const result = await syncWeReadLibrary({
      persistence: module.weReadPersistence,
      reason: `auto:${reason}`,
      logInfo,
      logError,
      elapsedMs,
    });
    logInfo('weread.auto_sync.complete', {
      reason,
      bookCount: result.books.length,
      durationMs: elapsedMs(startedAt),
    });
  } catch (error) {
    logError('weread.auto_sync.failed', error, { reason, durationMs: elapsedMs(startedAt) });
  } finally {
    weReadAutoSyncRunning = false;
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

void app.whenReady().then(async () => {
  logInfo('app.ready', { logPath: getLogPath() });
  recordStartupTiming('app.ready');
  if (process.platform === 'darwin' && app.dock) app.dock.setIcon(appIconPath);
  registerIpc();
  scheduleModelPriceRefresh();
  configureWeReadAutoSync('startup');
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
  const context = {
    getMainWindow: () => mainWindow,
    getPersistenceModule,
    getAiModule,
    getAppUpdaterModule,
    getAppVersion: () => app.getVersion(),
    sendFullStoreUpdated,
    sendArticlePatched,
    sendCollectionPatched,
    sendLibraryPinPatched,
    recordStartupTiming,
    recordPerformanceTiming,
    scheduleLogPrune,
    configureWeReadAutoSync,
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
}

function sendFullStoreUpdated(store: DesktopStore) {
  sendToRenderer('store:updated', store);
}

function sendArticlePatched(patch: ArticleStorePatch) {
  sendToRenderer('article:patched', patch);
}

function sendCollectionPatched(patch: CollectionStorePatch) {
  sendToRenderer('collection:patched', patch);
}

function sendLibraryPinPatched(patch: LibraryPinPatch) {
  sendToRenderer('library-pin:patched', patch);
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

function sendToRenderer(channel: 'store:updated', payload: DesktopStore): void;
function sendToRenderer(channel: 'updates:status', payload: AppUpdateState): void;
function sendToRenderer(channel: 'article:patched', payload: ArticleStorePatch): void;
function sendToRenderer(channel: 'collection:patched', payload: CollectionStorePatch): void;
function sendToRenderer(channel: 'library-pin:patched', payload: LibraryPinPatch): void;
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

async function openExternalUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'weread:') {
    throw new Error('Only HTTP, HTTPS, and WeRead links are supported');
  }
  await shell.openExternal(url.toString());
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
