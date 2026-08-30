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

  it('keeps download progress intact when a check is requested', async () => {
    const updater = await loadUpdater();
    updater.configureAppUpdater(vi.fn());
    emitUpdaterEvent('update-available', { version: '1.2.4' });
    const pendingDownload = createDeferred<void>();
    updaterMocks.autoUpdater.downloadUpdate.mockReturnValueOnce(pendingDownload.promise);
    updaterMocks.autoUpdater.checkForUpdates.mockImplementation(async () => {
      emitUpdaterEvent('checking-for-update');
      emitUpdaterEvent('update-available', { version: '1.2.5' });
    });
    const download = updater.downloadAppUpdate();
    emitUpdaterEvent('download-progress', {
      percent: 42,
      transferred: 42,
      total: 100,
      bytesPerSecond: 10,
    });
    const downloading = updater.getAppUpdateState();
    const checked = await updater.checkForAppUpdates('auto');
    emitUpdaterEvent('update-downloaded', { version: '1.2.4' });
    pendingDownload.resolve();

    await expect(download).resolves.toMatchObject({
      status: 'downloaded',
      availableVersion: '1.2.4',
    });
    expect(checked).toEqual(downloading);
    expect(updaterMocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('waits for an active check before coalescing download requests', async () => {
    const updater = await loadUpdater();
    updater.configureAppUpdater(vi.fn());
    const pendingCheck = createDeferred<void>();
    const pendingDownload = createDeferred<void>();
    updaterMocks.autoUpdater.checkForUpdates.mockReturnValueOnce(pendingCheck.promise);
    updaterMocks.autoUpdater.downloadUpdate.mockReturnValueOnce(pendingDownload.promise);
    const check = updater.checkForAppUpdates();
    emitUpdaterEvent('update-available', { version: '1.2.4' });

    const firstDownload = updater.downloadAppUpdate();
    const secondDownload = updater.downloadAppUpdate();
    const downloadsBeforeCheckCompleted = updaterMocks.autoUpdater.downloadUpdate.mock.calls.length;
    pendingCheck.resolve();
    await check;
    emitUpdaterEvent('update-downloaded', { version: '1.2.4' });
    pendingDownload.resolve();

    const downloaded = { status: 'downloaded', availableVersion: '1.2.4' };
    await expect(firstDownload).resolves.toMatchObject(downloaded);
    await expect(secondDownload).resolves.toMatchObject(downloaded);
    expect(downloadsBeforeCheckCompleted).toBe(0);
    expect(updaterMocks.autoUpdater.downloadUpdate).toHaveBeenCalledOnce();
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
      simulation: 'development',
      trigger: 'auto',
    });
  });

  it('simulates download progress and an application restart in dev', async () => {
    vi.useFakeTimers();
    setPlatform('linux');
    electronMocks.app.isPackaged = false;
    const updater = await loadUpdater();
    const notify = vi.fn();
    const beforeInstall = vi.fn(async () => undefined);
    const onInstallFailed = vi.fn(async () => undefined);
    updater.configureAppUpdater(notify, { beforeInstall, onInstallFailed });
    updater.simulateUpdateAvailable('manual');

    const download = updater.downloadAppUpdate();
    expect(updater.getAppUpdateState()).toMatchObject({
      status: 'downloading',
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
      simulation: 'development',
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(updater.getAppUpdateState()).toMatchObject({
      status: 'downloading',
      progress: {
        transferred: 10 * 1024 * 1024,
        total: 150 * 1024 * 1024,
        bytesPerSecond: 10 * 1024 * 1024,
      },
      simulation: 'development',
    });

    await vi.runAllTimersAsync();
    await expect(download).resolves.toMatchObject({
      status: 'downloaded',
      simulation: 'development',
    });
    expect(updaterMocks.autoUpdater.downloadUpdate).not.toHaveBeenCalled();

    await expect(updater.installAppUpdate()).resolves.toMatchObject({ status: 'idle' });
    expect(electronMocks.browserWindow.webContents.reload).toHaveBeenCalledOnce();
    expect(updaterMocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    expect(beforeInstall).not.toHaveBeenCalled();
    expect(onInstallFailed).not.toHaveBeenCalled();
  });

  it('installs only after an update has been downloaded', async () => {
    const updater = await loadUpdater();
    updater.configureAppUpdater(vi.fn());

    await expect(updater.installAppUpdate()).resolves.toEqual({
      status: 'error',
      currentVersion: '1.2.3-test',
      message: 'UPDATE_NOT_DOWNLOADED',
    });

    emitUpdaterEvent('update-downloaded', {
      releaseDate: '2026-06-18T00:00:00.000Z',
      releaseName: 'Yomitomo 1.2.4',
      version: '1.2.4',
    });

    await expect(updater.installAppUpdate()).resolves.toMatchObject({
      status: 'downloaded',
      availableVersion: '1.2.4',
    });
    expect(updaterMocks.autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
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

  it('waits for a pending suspension before recovering an update error, then permits retry', async () => {
    const updater = await loadUpdater();
    const stopped = createDeferred<void>();
    const events: string[] = [];
    const beforeInstall = vi.fn(async () => {
      await stopped.promise;
      events.push('processes-stopped');
    });
    const onInstallFailed = vi.fn(async () => {
      events.push('resumed');
    });
    updater.configureAppUpdater(vi.fn(), { beforeInstall, onInstallFailed });
    emitUpdaterEvent('update-downloaded', { version: '1.2.4' });

    const installation = updater.installAppUpdate();
    await Promise.resolve();
    emitUpdaterEvent('error', new Error('native staging failed'));
    emitUpdaterEvent('error', new Error('native staging failed'));
    await Promise.resolve();
    expect(events).toEqual([]);
    expect(onInstallFailed).not.toHaveBeenCalled();
    expect(updaterMocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled();

    stopped.resolve();
    await expect(installation).resolves.toMatchObject({
      status: 'error',
      message: 'native staging failed',
    });
    expect(events).toEqual(['processes-stopped', 'resumed']);
    expect(onInstallFailed).toHaveBeenCalledOnce();
    expect(updaterMocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled();

    emitUpdaterEvent('update-downloaded', { version: '1.2.4' });
    await updater.installAppUpdate();
    expect(beforeInstall).toHaveBeenCalledTimes(2);
    expect(updaterMocks.autoUpdater.quitAndInstall).toHaveBeenCalledOnce();
  });

  it('resumes without installing when the downloaded state becomes invalid during suspension', async () => {
    const updater = await loadUpdater();
    const stopped = createDeferred<void>();
    const onInstallFailed = vi.fn(async () => undefined);
    updater.configureAppUpdater(vi.fn(), {
      beforeInstall: () => stopped.promise,
      onInstallFailed,
    });
    emitUpdaterEvent('update-downloaded', { version: '1.2.4' });

    const installation = updater.installAppUpdate();
    emitUpdaterEvent('update-not-available', { version: '1.2.3' });
    stopped.resolve();

    await expect(installation).resolves.toMatchObject({ status: 'not-available' });
    expect(onInstallFailed).toHaveBeenCalledOnce();
    expect(updaterMocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it('does not hand off a recovering attempt when a later event restores downloaded state', async () => {
    const updater = await loadUpdater();
    const stopped = createDeferred<void>();
    const events: string[] = [];
    const onInstallFailed = vi.fn(async () => {
      events.push('resumed');
    });
    updater.configureAppUpdater(vi.fn(), {
      beforeInstall: () => stopped.promise,
      onInstallFailed,
    });
    updaterMocks.autoUpdater.quitAndInstall.mockImplementation(() => events.push('installed'));
    emitUpdaterEvent('update-downloaded', { version: '1.2.4' });

    const installation = updater.installAppUpdate();
    emitUpdaterEvent('error', new Error('staging failed'));
    emitUpdaterEvent('update-downloaded', { version: '1.2.4' });
    stopped.resolve();
    await installation;
    await vi.waitFor(() => expect(onInstallFailed).toHaveBeenCalledOnce());
    expect(events).toEqual(['resumed']);
    expect(updaterMocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
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

  it('resumes semantic work when native installation reports an error after handoff', async () => {
    const updater = await loadUpdater();
    const onInstallFailed = vi.fn(async () => undefined);
    updater.configureAppUpdater(vi.fn(), {
      beforeInstall: async () => undefined,
      onInstallFailed,
    });
    emitUpdaterEvent('update-downloaded', { version: '1.2.4' });
    await updater.installAppUpdate();

    emitUpdaterEvent('error', new Error('native restart failed'));
    await vi.waitFor(() => expect(onInstallFailed).toHaveBeenCalledOnce());

    expect(updater.getAppUpdateState()).toMatchObject({ status: 'error' });
    expect(updaterMocks.autoUpdater.quitAndInstall).toHaveBeenCalledOnce();
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
