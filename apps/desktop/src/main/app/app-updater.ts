import { app, BrowserWindow } from 'electron';
import electronUpdater, {
  type ProgressInfo,
  type UpdateDownloadedEvent,
  type UpdateInfo,
} from 'electron-updater';
import { errorMessageOrFallback } from '@yomitomo/shared';
import type { AppUpdateState, AppUpdateTrigger } from '../../app-update-types';
import { logError, logInfo } from './logger';

const { autoUpdater } = electronUpdater;
const DEVELOPMENT_DOWNLOAD_TOTAL = 150 * 1024 * 1024;
const DEVELOPMENT_DOWNLOAD_SPEED = 10 * 1024 * 1024;
const DEVELOPMENT_DOWNLOAD_TICK_MS = 1_000;

type AppUpdateInstallLifecycle = {
  beforeInstall: () => Promise<void>;
  onInstallFailed: () => Promise<void>;
};

let updateState: AppUpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
};
let notifyUpdateState: (state: AppUpdateState) => void = () => undefined;
let listenersRegistered = false;
let checkPromise: Promise<AppUpdateState> | null = null;
let downloadPromise: Promise<AppUpdateState> | null = null;
let installLifecycle: AppUpdateInstallLifecycle | undefined;
let installAttempt: {
  result: Promise<AppUpdateState>;
  recover: () => Promise<void>;
} | null = null;
// 记录本次检查来源，供 update-available 区分模态/常驻入口；事件回调拿不到 trigger 故用模块级状态承接。
let pendingTrigger: AppUpdateTrigger = 'manual';

export function configureAppUpdater(
  notify: (state: AppUpdateState) => void,
  lifecycle?: AppUpdateInstallLifecycle,
) {
  notifyUpdateState = notify;
  installLifecycle = lifecycle;
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
    setUpdateState(
      updateState.status === 'downloading'
        ? downloadErrorState(error.message || 'UPDATE_DOWNLOAD_FAILED')
        : {
            status: 'error',
            message: error.message || 'UPDATE_FAILED',
          },
    );
    void installAttempt?.recover();
  });
}

export function getAppUpdateState() {
  return supportedState() || updateState;
}

// 开发用：不走真实检查，直接注入一个「发现新版本」状态并广播，
// 触发更新前弹窗（A 场景）走与生产一致的 onUpdateStatus 链路。仅开发环境生效。
export function simulateUpdateAvailable(trigger: AppUpdateTrigger = 'manual') {
  if (app.isPackaged) return updateState;
  if (downloadPromise) return updateState;
  pendingTrigger = trigger;
  return setUpdateState({
    status: 'available',
    availableVersion: app.getVersion(),
    checkedAt: new Date().toISOString(),
    trigger,
    simulation: 'development',
  });
}

export async function checkForAppUpdates(trigger: AppUpdateTrigger = 'manual') {
  const unsupported = supportedState();
  if (unsupported) return setUpdateState(unsupported);
  if (downloadPromise || updateState.status === 'downloaded') return updateState;
  if (checkPromise) return checkPromise;

  pendingTrigger = trigger;
  checkPromise = autoUpdater
    .checkForUpdates()
    .then(() => updateState)
    .catch((error: unknown) => {
      logError('updater.check-failed', error);
      return setUpdateState({
        status: 'error',
        message: errorMessageOrFallback(error, 'UPDATE_CHECK_FAILED'),
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
  if (checkPromise) await checkPromise;
  if (downloadPromise) return downloadPromise;
  if (updateState.status === 'downloaded') return updateState;
  if (updateState.status !== 'available' && updateState.status !== 'download-error') {
    return setUpdateState({
      status: 'error',
      message: 'UPDATE_CHECK_REQUIRED',
    });
  }

  setUpdateState({
    status: 'downloading',
    availableVersion: updateState.availableVersion,
    releaseName: updateState.releaseName,
    releaseDate: updateState.releaseDate,
    ...simulationState(),
    progress: {
      percent: 0,
      transferred: 0,
      total: 0,
      bytesPerSecond: 0,
    },
  });

  const download =
    updateState.simulation === 'development' && !app.isPackaged
      ? simulateDevelopmentDownload()
      : autoUpdater.downloadUpdate();

  downloadPromise = download
    .then(() => updateState)
    .catch((error: unknown) => {
      logError('updater.download-failed', error);
      return setUpdateState(
        downloadErrorState(errorMessageOrFallback(error, 'UPDATE_DOWNLOAD_FAILED')),
      );
    })
    .finally(() => {
      downloadPromise = null;
    });
  return downloadPromise;
}

export function installAppUpdate(): Promise<AppUpdateState> {
  if (installAttempt) return installAttempt.result;
  const unsupported = supportedState();
  if (unsupported) return Promise.resolve(setUpdateState(unsupported));
  if (updateState.status !== 'downloaded') {
    return Promise.resolve(
      setUpdateState({
        status: 'error',
        availableVersion: updateState.availableVersion,
        message: 'UPDATE_NOT_DOWNLOADED',
      }),
    );
  }

  logInfo('updater.install', { version: updateState.availableVersion });
  if (updateState.simulation === 'development' && !app.isPackaged) {
    logInfo('updater.simulation.restart', { version: updateState.availableVersion });
    const nextState = setUpdateState({ status: 'idle' });
    const targetWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    targetWindow?.webContents.reload();
    return Promise.resolve(nextState);
  }
  installAttempt = startAppUpdateInstallation();
  return installAttempt.result;
}

function startAppUpdateInstallation() {
  const lifecycle = installLifecycle;
  const preparation = Promise.resolve().then(() => lifecycle?.beforeInstall());
  let recoveryPromise: Promise<void> | null = null;
  const recover = () => {
    if (recoveryPromise) return recoveryPromise;
    recoveryPromise = preparation
      .catch(() => undefined)
      .then(() => lifecycle?.onInstallFailed())
      .catch((error: unknown) => logError('updater.install-resume-failed', error))
      .finally(() => {
        installAttempt = null;
      });
    return recoveryPromise;
  };
  const result = (async () => {
    try {
      await preparation;
      if (updateState.status === 'downloaded' && !recoveryPromise) {
        // NSIS starts its installer before before-quit, so child processes must already be gone.
        autoUpdater.quitAndInstall(false, true);
        if (updateState.status === 'downloaded' && !recoveryPromise) return updateState;
      }
    } catch (error) {
      logError('updater.install-failed', error);
      setUpdateState({
        status: 'error',
        availableVersion: updateState.availableVersion,
        message: errorMessageOrFallback(error, 'UPDATE_INSTALL_FAILED'),
      });
    }
    await recover();
    return updateState;
  })();
  return { result, recover };
}

function supportedState(): AppUpdateState | null {
  if (!app.isPackaged && updateState.simulation === 'development') return null;

  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    return {
      status: 'unsupported',
      currentVersion: app.getVersion(),
      message: 'UPDATE_UNSUPPORTED_PLATFORM',
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
    trigger: pendingTrigger,
  };
}

function downloadProgressState(progress: ProgressInfo): AppUpdateState {
  return {
    status: 'downloading',
    currentVersion: app.getVersion(),
    availableVersion: updateState.availableVersion,
    releaseName: updateState.releaseName,
    releaseDate: updateState.releaseDate,
    ...simulationState(),
    progress: {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    },
  };
}

function downloadErrorState(message: string): AppUpdateState {
  return {
    status: 'download-error',
    currentVersion: app.getVersion(),
    availableVersion: updateState.availableVersion,
    releaseName: updateState.releaseName,
    releaseDate: updateState.releaseDate,
    message,
    ...simulationState(),
  };
}

function simulationState(): Partial<Pick<AppUpdateState, 'simulation'>> {
  return updateState.simulation ? { simulation: updateState.simulation } : {};
}

async function simulateDevelopmentDownload() {
  logInfo('updater.simulation.download-started', {
    total: DEVELOPMENT_DOWNLOAD_TOTAL,
    bytesPerSecond: DEVELOPMENT_DOWNLOAD_SPEED,
  });
  for (
    let transferred = DEVELOPMENT_DOWNLOAD_SPEED;
    transferred < DEVELOPMENT_DOWNLOAD_TOTAL;
    transferred += DEVELOPMENT_DOWNLOAD_SPEED
  ) {
    await delay(DEVELOPMENT_DOWNLOAD_TICK_MS);
    setUpdateState(
      downloadProgressState({
        percent: (transferred / DEVELOPMENT_DOWNLOAD_TOTAL) * 100,
        transferred,
        total: DEVELOPMENT_DOWNLOAD_TOTAL,
        bytesPerSecond: DEVELOPMENT_DOWNLOAD_SPEED,
        delta: DEVELOPMENT_DOWNLOAD_SPEED,
      }),
    );
  }
  await delay(DEVELOPMENT_DOWNLOAD_TICK_MS);
  logInfo('updater.simulation.download-completed', { total: DEVELOPMENT_DOWNLOAD_TOTAL });
  return setUpdateState({
    status: 'downloaded',
    availableVersion: updateState.availableVersion,
    releaseName: updateState.releaseName,
    releaseDate: updateState.releaseDate,
    checkedAt: new Date().toISOString(),
    simulation: 'development',
  });
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
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

function logMessage(message: unknown) {
  if (typeof message === 'string') return message;
  if (message instanceof Error) return message.message;
  return String(message);
}
