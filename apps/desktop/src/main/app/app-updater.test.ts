import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => ({
  app: {
    getVersion: vi.fn(() => '1.2.3-test'),
    isPackaged: true,
  },
  browserWindow: {
    webContents: { reload: vi.fn() },
  },
}));

const updaterMocks = vi.hoisted(() => {
  const listeners = new Map<string, (payload?: unknown) => void>();
  const autoUpdater = {
    allowPrerelease: true,
    autoDownload: true,
    autoInstallOnAppQuit: false,
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    forceDevUpdateConfig: false,
    logger: null as unknown,
    on: vi.fn((event: string, listener: (payload?: unknown) => void) => {
      listeners.set(event, listener);
      return autoUpdater;
    }),
    quitAndInstall: vi.fn(),
  };

  return { autoUpdater, listeners };
});

const loggerMocks = vi.hoisted(() => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock('electron', () => ({
  app: electronMocks.app,
  BrowserWindow: {
    getAllWindows: vi.fn(() => [electronMocks.browserWindow]),
    getFocusedWindow: vi.fn(() => electronMocks.browserWindow),
  },
}));

vi.mock('electron-updater', () => ({
  default: {
    autoUpdater: updaterMocks.autoUpdater,
  },
}));

vi.mock('./logger', () => ({
  logError: loggerMocks.logError,
  logInfo: loggerMocks.logInfo,
}));

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

beforeEach(() => {
  vi.resetModules();
  resetMocks();
  setPlatform('darwin');
  delete process.env.YOMITOMO_DEV_UPDATER;
});

afterEach(() => {
  vi.useRealTimers();
  if (originalPlatformDescriptor) {
    Object.defineProperty(process, 'platform', originalPlatformDescriptor);
  }
  delete process.env.YOMITOMO_DEV_UPDATER;
});

describe('app updater state machine', () => {
  it('configures the updater and maps update events to public state', async () => {
    const updater = await loadUpdater();
    const notify = vi.fn();

    updater.configureAppUpdater(notify);
    emitUpdaterEvent('checking-for-update');
    emitUpdaterEvent('update-available', {
      releaseDate: '2026-06-18T00:00:00.000Z',
      releaseName: 'Yomitomo 1.2.4',
      version: '1.2.4',
    });
    emitUpdaterEvent('download-progress', {
      bytesPerSecond: 1024,
      percent: 42,
      total: 100,
      transferred: 42,
    });
    emitUpdaterEvent('update-downloaded', {
      releaseDate: '2026-06-18T00:00:00.000Z',
      releaseName: 'Yomitomo 1.2.4',
      version: '1.2.4',
    });

    expect(updaterMocks.autoUpdater.autoDownload).toBe(false);
    expect(updaterMocks.autoUpdater.autoInstallOnAppQuit).toBe(true);
    expect(updaterMocks.autoUpdater.allowPrerelease).toBe(false);
    expect(updaterMocks.autoUpdater.forceDevUpdateConfig).toBe(false);
    expect(updaterMocks.autoUpdater.on).toHaveBeenCalledTimes(6);
    expect(notify).toHaveBeenLastCalledWith({
      status: 'downloaded',
      currentVersion: '1.2.3-test',
      availableVersion: '1.2.4',
      releaseName: 'Yomitomo 1.2.4',
      releaseDate: '2026-06-18T00:00:00.000Z',
      checkedAt: expect.any(String),
    });
    expect(updater.getAppUpdateState()).toMatchObject({
      status: 'downloaded',
      availableVersion: '1.2.4',
      releaseName: 'Yomitomo 1.2.4',
    });
  });

  it('keeps a downloaded update installable when manual and automatic checks are requested', async () => {
    const updater = await loadUpdater();
    const notify = vi.fn();
    updater.configureAppUpdater(notify);
    emitUpdaterEvent('update-downloaded', { version: '1.2.4' });
    const downloaded = updater.getAppUpdateState();
    updaterMocks.autoUpdater.checkForUpdates.mockRejectedValue(new Error('feed unavailable'));
    notify.mockClear();

    await expect(updater.checkForAppUpdates('auto')).resolves.toEqual(downloaded);
    await expect(updater.checkForAppUpdates('manual')).resolves.toEqual(downloaded);

    expect(updaterMocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    await expect(updater.installAppUpdate()).resolves.toEqual(downloaded);
    expect(updaterMocks.autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('keeps download context after a failure and allows retrying', async () => {
    const updater = await loadUpdater();
    updater.configureAppUpdater(vi.fn());
    emitUpdaterEvent('update-available', {
      releaseDate: '2026-06-18T00:00:00.000Z',
      releaseName: 'Yomitomo 1.2.4',
      version: '1.2.4',
    });
    updaterMocks.autoUpdater.downloadUpdate
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockImplementationOnce(async () => {
        emitUpdaterEvent('update-downloaded', {
          releaseDate: '2026-06-18T00:00:00.000Z',
          releaseName: 'Yomitomo 1.2.4',
          version: '1.2.4',
        });
      });

    await expect(updater.downloadAppUpdate()).resolves.toEqual({
      status: 'download-error',
      currentVersion: '1.2.3-test',
      availableVersion: '1.2.4',
      releaseName: 'Yomitomo 1.2.4',
      releaseDate: '2026-06-18T00:00:00.000Z',
      message: 'connection reset',
    });
    await expect(updater.downloadAppUpdate()).resolves.toMatchObject({
      status: 'downloaded',
      availableVersion: '1.2.4',
    });
    expect(updaterMocks.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(2);
  });

  it('waits for semantic processes to stop and coalesces install requests through handoff', async () => {
    const updater = await loadUpdater();
    const stopped = createDeferred<void>();
    const events: string[] = [];
    const beforeInstall = vi.fn(async () => {
      await stopped.promise;
      events.push('processes-stopped');
    });
    const onInstallFailed = vi.fn(async () => undefined);
    updater.configureAppUpdater(vi.fn(), { beforeInstall, onInstallFailed });
    emitUpdaterEvent('update-downloaded', { version: '1.2.4' });
    updaterMocks.autoUpdater.quitAndInstall.mockImplementation(() => {
      events.push('installer-started');
    });

    const first = updater.installAppUpdate();
    expect(updater.installAppUpdate()).toBe(first);
    await Promise.resolve();
    expect(beforeInstall).toHaveBeenCalledOnce();
    expect(updaterMocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled();

    stopped.resolve();
    await expect(first).resolves.toMatchObject({ status: 'downloaded' });
    expect(updater.installAppUpdate()).toBe(first);
    expect(events).toEqual(['processes-stopped', 'installer-started']);
    expect(updaterMocks.autoUpdater.quitAndInstall).toHaveBeenCalledOnce();
    expect(onInstallFailed).not.toHaveBeenCalled();
  });

  it.each(['suspend', 'install'] as const)('recovers when %s throws', async (failure) => {
    const updater = await loadUpdater();
    const error = new Error(`${failure} failed`);
    const beforeInstall = vi.fn(async () => {
      if (failure === 'suspend') throw error;
    });
    const onInstallFailed = vi.fn(async () => undefined);
    updater.configureAppUpdater(vi.fn(), { beforeInstall, onInstallFailed });
    emitUpdaterEvent('update-downloaded', { version: '1.2.4' });
    updaterMocks.autoUpdater.quitAndInstall.mockImplementation(() => {
      throw error;
    });

    await expect(updater.installAppUpdate()).resolves.toMatchObject({
      status: 'error',
      message: error.message,
    });
    expect(onInstallFailed).toHaveBeenCalledOnce();
    expect(loggerMocks.logError).toHaveBeenCalledWith('updater.install-failed', error);
  });
});

async function loadUpdater() {
  return import('./app-updater');
}

function resetMocks() {
  electronMocks.app.getVersion.mockReturnValue('1.2.3-test');
  electronMocks.app.isPackaged = true;
  electronMocks.browserWindow.webContents.reload.mockReset();
  updaterMocks.listeners.clear();
  updaterMocks.autoUpdater.allowPrerelease = true;
  updaterMocks.autoUpdater.autoDownload = true;
  updaterMocks.autoUpdater.autoInstallOnAppQuit = false;
  updaterMocks.autoUpdater.forceDevUpdateConfig = false;
  updaterMocks.autoUpdater.logger = null;
  updaterMocks.autoUpdater.on.mockClear();
  updaterMocks.autoUpdater.checkForUpdates.mockReset();
  updaterMocks.autoUpdater.checkForUpdates.mockResolvedValue(undefined);
  updaterMocks.autoUpdater.downloadUpdate.mockReset();
  updaterMocks.autoUpdater.downloadUpdate.mockResolvedValue(undefined);
  updaterMocks.autoUpdater.quitAndInstall.mockReset();
  loggerMocks.logError.mockReset();
  loggerMocks.logInfo.mockReset();
}

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  });
}

function emitUpdaterEvent(event: string, payload?: unknown) {
  const listener = updaterMocks.listeners.get(event);
  if (!listener) throw new Error(`${event} listener was not registered`);
  listener(payload);
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}
