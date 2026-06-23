import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => ({
  app: {
    getVersion: vi.fn(() => '1.2.3-test'),
    isPackaged: true,
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

  it('maps not-available and error events to terminal states', async () => {
    const updater = await loadUpdater();
    const notify = vi.fn();

    updater.configureAppUpdater(notify);
    emitUpdaterEvent('update-not-available', {
      releaseDate: '2026-06-18T00:00:00.000Z',
      version: '1.2.3',
    });
    emitUpdaterEvent('error', new Error('network down'));

    expect(notify).toHaveBeenNthCalledWith(1, {
      status: 'not-available',
      currentVersion: '1.2.3-test',
      availableVersion: '1.2.3',
      releaseDate: '2026-06-18T00:00:00.000Z',
      checkedAt: expect.any(String),
    });
    expect(loggerMocks.logError).toHaveBeenCalledWith('updater.error', expect.any(Error));
    expect(updater.getAppUpdateState()).toEqual({
      status: 'error',
      currentVersion: '1.2.3-test',
      message: 'network down',
    });
  });

  it('coalesces concurrent update checks and clears the shared promise', async () => {
    const updater = await loadUpdater();
    const deferred = createDeferred<void>();
    updaterMocks.autoUpdater.checkForUpdates.mockReturnValueOnce(deferred.promise);
    updaterMocks.autoUpdater.checkForUpdates.mockResolvedValueOnce(undefined);

    const firstCheck = updater.checkForAppUpdates();
    const secondCheck = updater.checkForAppUpdates();

    expect(updaterMocks.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    deferred.resolve();
    await expect(Promise.all([firstCheck, secondCheck])).resolves.toEqual([
      { status: 'idle', currentVersion: '1.2.3-test' },
      { status: 'idle', currentVersion: '1.2.3-test' },
    ]);

    await updater.checkForAppUpdates();

    expect(updaterMocks.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it('turns check failures into error state', async () => {
    const updater = await loadUpdater();
    updaterMocks.autoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('feed unavailable'));

    await expect(updater.checkForAppUpdates()).resolves.toEqual({
      status: 'error',
      currentVersion: '1.2.3-test',
      message: 'feed unavailable',
    });

    expect(loggerMocks.logError).toHaveBeenCalledWith('updater.check-failed', expect.any(Error));
  });

  it('returns unsupported state without touching electron-updater on unsupported platforms', async () => {
    setPlatform('linux');
    const updater = await loadUpdater();

    await expect(updater.checkForAppUpdates()).resolves.toEqual({
      status: 'unsupported',
      currentVersion: '1.2.3-test',
      message: 'UPDATE_UNSUPPORTED_PLATFORM',
    });

    expect(updater.getAppUpdateState()).toEqual({
      status: 'unsupported',
      currentVersion: '1.2.3-test',
      message: 'UPDATE_UNSUPPORTED_PLATFORM',
    });
    expect(updaterMocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('downloads only from available state and keeps the downloaded result', async () => {
    const updater = await loadUpdater();
    const notify = vi.fn();
    updater.configureAppUpdater(notify);

    await expect(updater.downloadAppUpdate()).resolves.toEqual({
      status: 'error',
      currentVersion: '1.2.3-test',
      message: 'UPDATE_CHECK_REQUIRED',
    });

    emitUpdaterEvent('update-available', {
      releaseDate: '2026-06-18T00:00:00.000Z',
      releaseName: 'Yomitomo 1.2.4',
      version: '1.2.4',
    });
    updaterMocks.autoUpdater.downloadUpdate.mockImplementationOnce(async () => {
      emitUpdaterEvent('update-downloaded', {
        releaseDate: '2026-06-18T00:00:00.000Z',
        releaseName: 'Yomitomo 1.2.4',
        version: '1.2.4',
      });
    });

    await expect(updater.downloadAppUpdate()).resolves.toMatchObject({
      status: 'downloaded',
      currentVersion: '1.2.3-test',
      availableVersion: '1.2.4',
    });
    await updater.downloadAppUpdate();

    expect(updaterMocks.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'downloading',
        availableVersion: '1.2.4',
        progress: {
          bytesPerSecond: 0,
          percent: 0,
          total: 0,
          transferred: 0,
        },
      }),
    );
  });

  it('tags the available state with the originating check trigger', async () => {
    const updater = await loadUpdater();
    updater.configureAppUpdater(vi.fn());

    await updater.checkForAppUpdates('auto');
    emitUpdaterEvent('update-available', {
      releaseDate: '2026-06-18T00:00:00.000Z',
      releaseName: 'Yomitomo 1.2.4',
      version: '1.2.4',
    });
    expect(updater.getAppUpdateState()).toMatchObject({ status: 'available', trigger: 'auto' });

    await updater.checkForAppUpdates();
    emitUpdaterEvent('update-available', {
      releaseDate: '2026-06-18T00:00:00.000Z',
      releaseName: 'Yomitomo 1.2.4',
      version: '1.2.4',
    });
    expect(updater.getAppUpdateState()).toMatchObject({ status: 'available', trigger: 'manual' });
  });

  it('carries the trigger when simulating an available update in dev', async () => {
    electronMocks.app.isPackaged = false;
    const updater = await loadUpdater();
    updater.configureAppUpdater(vi.fn());

    expect(updater.simulateUpdateAvailable('auto')).toMatchObject({
      status: 'available',
      trigger: 'auto',
    });
  });

  it('installs only after an update has been downloaded', async () => {
    const updater = await loadUpdater();
    updater.configureAppUpdater(vi.fn());

    expect(updater.installAppUpdate()).toEqual({
      status: 'error',
      currentVersion: '1.2.3-test',
      message: 'UPDATE_NOT_DOWNLOADED',
    });

    emitUpdaterEvent('update-downloaded', {
      releaseDate: '2026-06-18T00:00:00.000Z',
      releaseName: 'Yomitomo 1.2.4',
      version: '1.2.4',
    });

    expect(updater.installAppUpdate()).toMatchObject({
      status: 'downloaded',
      availableVersion: '1.2.4',
    });
    expect(updaterMocks.autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });
});

async function loadUpdater() {
  return import('./app-updater');
}

function resetMocks() {
  electronMocks.app.getVersion.mockReturnValue('1.2.3-test');
  electronMocks.app.isPackaged = true;
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
