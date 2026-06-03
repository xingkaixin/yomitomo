import { app } from 'electron';
import electronUpdater, {
  type ProgressInfo,
  type UpdateDownloadedEvent,
  type UpdateInfo,
} from 'electron-updater';
import type { AppUpdateState } from '../../app-update-types';
import { logError, logInfo } from './logger';

const { autoUpdater } = electronUpdater;

let updateState: AppUpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
};
let notifyUpdateState: (state: AppUpdateState) => void = () => undefined;
let listenersRegistered = false;
let checkPromise: Promise<AppUpdateState> | null = null;
let downloadPromise: Promise<AppUpdateState> | null = null;

export function configureAppUpdater(notify: (state: AppUpdateState) => void) {
  notifyUpdateState = notify;
  if (listenersRegistered) return;
  listenersRegistered = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  if (process.env.YOMITOMO_DEV_UPDATER === '1') {
    // 开发期验证 A 场景：跳过打包校验，让 checkForUpdates 真正走本地假 feed。
    autoUpdater.forceDevUpdateConfig = true;
  }
  autoUpdater.logger = {
    info: (message?: unknown) => logInfo('updater.info', { message: logMessage(message) }),
    warn: (message?: unknown) => logInfo('updater.warn', { message: logMessage(message) }),
    error: (message?: unknown) => logError('updater.log-error', message),
  };

  autoUpdater.on('checking-for-update', () => {
    setUpdateState({ status: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    setUpdateState(updateAvailableState(info));
  });
  autoUpdater.on('update-not-available', (info) => {
    setUpdateState({
      status: 'not-available',
      availableVersion: info.version,
      releaseDate: info.releaseDate,
      checkedAt: new Date().toISOString(),
    });
  });
  autoUpdater.on('download-progress', (progress) => {
    setUpdateState(downloadProgressState(progress));
  });
  autoUpdater.on('update-downloaded', (event) => {
    setUpdateState(updateDownloadedState(event));
  });
  autoUpdater.on('error', (error) => {
    logError('updater.error', error);
    setUpdateState({
      status: 'error',
      message: error.message || '更新失败',
    });
  });
}

export function getAppUpdateState() {
  return supportedState() || updateState;
}

// 开发用：不走真实检查，直接注入一个「发现新版本」状态并广播，
// 触发更新前弹窗（A 场景）走与生产一致的 onUpdateStatus 链路。仅开发环境生效。
export function simulateUpdateAvailable() {
  if (app.isPackaged) return updateState;
  return setUpdateState({
    status: 'available',
    availableVersion: app.getVersion(),
    checkedAt: new Date().toISOString(),
  });
}

export async function checkForAppUpdates() {
  const unsupported = supportedState();
  if (unsupported) return setUpdateState(unsupported);
  if (checkPromise) return checkPromise;

  checkPromise = autoUpdater
    .checkForUpdates()
    .then(() => updateState)
    .catch((error: unknown) => {
      logError('updater.check-failed', error);
      return setUpdateState({
        status: 'error',
        message: errorMessage(error, '检查更新失败'),
      });
    })
    .finally(() => {
      checkPromise = null;
    });
  return checkPromise;
}

export async function downloadAppUpdate() {
  const unsupported = supportedState();
  if (unsupported) return setUpdateState(unsupported);
  if (downloadPromise) return downloadPromise;
  if (updateState.status === 'downloaded') return updateState;
  if (updateState.status !== 'available') {
    return setUpdateState({
      status: 'error',
      message: '请先检查更新',
    });
  }

  setUpdateState({
    status: 'downloading',
    availableVersion: updateState.availableVersion,
    releaseName: updateState.releaseName,
    releaseDate: updateState.releaseDate,
    progress: {
      percent: 0,
      transferred: 0,
      total: 0,
      bytesPerSecond: 0,
    },
  });

  downloadPromise = autoUpdater
    .downloadUpdate()
    .then(() => updateState)
    .catch((error: unknown) => {
      logError('updater.download-failed', error);
      return setUpdateState({
        status: 'error',
        availableVersion: updateState.availableVersion,
        message: errorMessage(error, '下载更新失败'),
      });
    })
    .finally(() => {
      downloadPromise = null;
    });
  return downloadPromise;
}

export function installAppUpdate() {
  const unsupported = supportedState();
  if (unsupported) return setUpdateState(unsupported);
  if (updateState.status !== 'downloaded') {
    return setUpdateState({
      status: 'error',
      availableVersion: updateState.availableVersion,
      message: '更新尚未下载完成',
    });
  }

  logInfo('updater.install', { version: updateState.availableVersion });
  autoUpdater.quitAndInstall(false, true);
  return updateState;
}

function supportedState(): AppUpdateState | null {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    return {
      status: 'unsupported',
      currentVersion: app.getVersion(),
      message: '当前系统暂不支持自动更新',
    };
  }

  if (!app.isPackaged && process.env.YOMITOMO_DEV_UPDATER !== '1') {
    return {
      status: 'unsupported',
      currentVersion: app.getVersion(),
    };
  }

  return null;
}

function setUpdateState(nextState: Omit<AppUpdateState, 'currentVersion'> | AppUpdateState) {
  updateState = {
    currentVersion: app.getVersion(),
    ...nextState,
  };
  notifyUpdateState(updateState);
  return updateState;
}

function updateAvailableState(info: UpdateInfo): AppUpdateState {
  return {
    status: 'available',
    currentVersion: app.getVersion(),
    availableVersion: info.version,
    releaseName: info.releaseName,
    releaseDate: info.releaseDate,
    checkedAt: new Date().toISOString(),
  };
}

function downloadProgressState(progress: ProgressInfo): AppUpdateState {
  return {
    status: 'downloading',
    currentVersion: app.getVersion(),
    availableVersion: updateState.availableVersion,
    releaseName: updateState.releaseName,
    releaseDate: updateState.releaseDate,
    progress: {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    },
  };
}

function updateDownloadedState(event: UpdateDownloadedEvent): AppUpdateState {
  return {
    status: 'downloaded',
    currentVersion: app.getVersion(),
    availableVersion: event.version,
    releaseName: event.releaseName,
    releaseDate: event.releaseDate,
    checkedAt: new Date().toISOString(),
  };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function logMessage(message: unknown) {
  if (typeof message === 'string') return message;
  if (message instanceof Error) return message.message;
  return String(message);
}
