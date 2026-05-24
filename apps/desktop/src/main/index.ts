import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { app, BrowserWindow, shell, type BrowserWindowConstructorOptions } from 'electron';
import type { DesktopStore } from '@yomitomo/shared';
import { getLogPath, logError, logInfo, pruneLogFile } from './logger';
import { configureDesktopAppStorage } from './app-environment';
import type { AppUpdateState } from '../app-update-types';
import type { DesktopStoreLoadErrorInfo } from '../app-store-errors';
import { registerAgentIpc } from './ipc-agent';
import { registerAppIpc } from './ipc-app';
import { registerArticleIpc } from './ipc-article';
import { registerProviderIpc } from './ipc-provider';
import { registerStoreDataIpc } from './ipc-store-data';
import { registerWeReadIpc } from './ipc-weread';

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
  const context = {
    getMainWindow: () => mainWindow,
    getStoreModule,
    getAiModule,
    getAppUpdaterModule,
    getAppVersion: () => app.getVersion(),
    sendFullStoreUpdated,
    recordStartupTiming,
    recordPerformanceTiming,
    scheduleLogPrune,
    storeLoadErrorInfo,
    elapsedMs,
    logInfo,
    logError,
    openExternalUrl,
  };

  registerAppIpc(context);
  registerStoreDataIpc(context);
  registerArticleIpc(context);
  registerWeReadIpc(context);
  registerProviderIpc(context);
  registerAgentIpc(context);
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

async function openExternalUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.protocol !== 'weread:') {
    throw new Error('仅支持打开 HTTP 链接');
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
