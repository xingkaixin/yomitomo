import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WeReadSettings, WeReadSyncResult } from '@yomitomo/shared';
import { startMainProcessRuntime } from './main-process-runtime';
import { readDatabaseLifecycle } from '../store/store-db';

afterEach(() => {
  vi.useRealTimers();
});

describe('main process runtime', () => {
  it('starts scheduled services and disposes every owned lifecycle', async () => {
    vi.useFakeTimers();
    const dependencies = runtimeDependencies();
    const runtime = startMainProcessRuntime(dependencies.input);

    await vi.advanceTimersByTimeAsync(10);

    expect(dependencies.refreshModelPrices).toHaveBeenCalledOnce();
    expect(dependencies.checkForAppUpdates).toHaveBeenCalledWith('auto');

    runtime.checkTelemetryFocus();
    expect(dependencies.telemetryCheck).toHaveBeenCalledWith('focus');

    runtime.dispose();
    await vi.advanceTimersByTimeAsync(100);

    expect(dependencies.refreshModelPrices).toHaveBeenCalledOnce();
    expect(dependencies.checkForAppUpdates).toHaveBeenCalledOnce();
    expect(dependencies.telemetryDispose).toHaveBeenCalledOnce();
  });

  it('schedules and reconfigures automatic WeRead sync', async () => {
    vi.useFakeTimers();
    const dependencies = runtimeDependencies({
      settings: { configured: true, openMethod: 'deeplink', syncMode: 'auto' },
    });
    const runtime = startMainProcessRuntime(dependencies.input);

    await vi.advanceTimersByTimeAsync(10);

    expect(dependencies.syncWeRead).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'auto:startup' }),
    );
    expect(dependencies.sendWeReadStateUpdated).toHaveBeenCalledOnce();

    runtime.configureWeReadAutoSync('settings-saved');
    await vi.advanceTimersByTimeAsync(10);

    expect(dependencies.syncWeRead).toHaveBeenLastCalledWith(
      expect.objectContaining({ reason: 'auto:startup' }),
    );
    expect(dependencies.syncWeRead).toHaveBeenCalledTimes(2);
    runtime.dispose();
  });

  it('does not schedule WeRead sync after disposal during configuration', async () => {
    vi.useFakeTimers();
    const settings = deferred<WeReadSettings>();
    const dependencies = runtimeDependencies({ settingsPromise: settings.promise });
    const runtime = startMainProcessRuntime(dependencies.input);

    runtime.dispose();
    settings.resolve({ configured: true, openMethod: 'deeplink', syncMode: 'auto' });
    await vi.advanceTimersByTimeAsync(100);

    expect(dependencies.syncWeRead).not.toHaveBeenCalled();
    expect(dependencies.sendWeReadStateUpdated).not.toHaveBeenCalled();
  });

  it('releases the database lease when automatic sync fails', async () => {
    vi.useFakeTimers();
    const dependencies = runtimeDependencies({
      settings: { configured: true, openMethod: 'deeplink', syncMode: 'auto' },
    });
    const error = new Error('sync failed');
    dependencies.syncWeRead.mockRejectedValue(error);
    const runtime = startMainProcessRuntime(dependencies.input);
    try {
      await vi.advanceTimersByTimeAsync(10);
      expect(dependencies.input.logError).toHaveBeenCalledWith(
        'weread.auto_sync.failed',
        error,
        expect.anything(),
      );
      expect(readDatabaseLifecycle().leases).toBe(0);
    } finally {
      runtime.dispose();
    }
  });
});

function runtimeDependencies(
  options: {
    settings?: WeReadSettings;
    settingsPromise?: Promise<WeReadSettings>;
  } = {},
) {
  const settings = options.settings ?? {
    configured: false,
    openMethod: 'deeplink',
    syncMode: 'manual',
  };
  const syncResult: WeReadSyncResult = { settings, books: [] };
  const refreshModelPrices = vi.fn(async () => ({
    refreshed: true,
    recordCount: 1,
    reason: 'updated' as const,
  }));
  const checkForAppUpdates = vi.fn(async () => ({
    status: 'not-available' as const,
    currentVersion: '0.14.0',
  }));
  const readWeReadSettings = vi.fn(() => options.settingsPromise ?? Promise.resolve(settings));
  const syncWeRead = vi.fn(async () => syncResult);
  const sendWeReadStateUpdated = vi.fn();
  const telemetryCheck = vi.fn();
  const telemetryDispose = vi.fn();

  return {
    refreshModelPrices,
    checkForAppUpdates,
    sendWeReadStateUpdated,
    syncWeRead,
    telemetryCheck,
    telemetryDispose,
    input: {
      getPersistenceModules: async () => ({
        storeModelPricing: { refreshModelPrices },
        weReadRepository: {
          readStoredWeReadApiKey: vi.fn(async () => 'api-key'),
          readWeReadSettings,
          saveWeReadLibrarySnapshot: vi.fn(async () => syncResult),
        },
      }),
      getAppUpdaterModule: async () => ({ checkForAppUpdates }),
      getAppVersion: () => '0.14.0',
      sendWeReadStateUpdated,
      elapsedMs: () => 1,
      logInfo: vi.fn(),
      logError: vi.fn(),
      timing: {
        modelPriceStartupDelayMs: 10,
        modelPriceIntervalMs: 20,
        appUpdateStartupDelayMs: 10,
        appUpdateIntervalMs: 20,
        weReadStartupDelayMs: 10,
        weReadIntervalMs: 20,
      },
      createTelemetryController: () => ({
        check: telemetryCheck,
        dispose: telemetryDispose,
      }),
      syncWeRead,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
