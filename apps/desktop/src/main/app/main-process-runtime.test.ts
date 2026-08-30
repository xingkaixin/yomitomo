import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setImmediate as nextTurn } from 'node:timers/promises';
import type { WeReadSettings, WeReadSyncResult } from '@yomitomo/shared';
import { startMainProcessRuntime } from './main-process-runtime';
import { readDatabaseLifecycle } from '../store/store-db';
import { createReadingMemoryControls } from '../reading-memory/reading-memory-controls';
import type { ReadingMemoryModelLifecycleState } from '../reading-memory/reading-memory-model-lifecycle';

const release = vi.hoisted(() => ({ readingMemoryEnabled: true }));
vi.mock('../../reading-memory-release', () => release);

beforeEach(() => {
  release.readingMemoryEnabled = true;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('main process runtime', () => {
  it('keeps unreleased projection, model work and usage collection inactive', async () => {
    release.readingMemoryEnabled = false;
    const dependencies = runtimeDependencies();
    const runtime = startMainProcessRuntime(dependencies.input);

    runtime.recordReadingMemoryUsage('feature_opened');
    runtime.requestReadingMemoryProjectionRebuild();
    runtime.onDatabaseRestored();

    expect(dependencies.startEvidenceProjectionWorker).not.toHaveBeenCalled();
    expect(dependencies.semanticReconcile).not.toHaveBeenCalled();
    expect(dependencies.telemetryRecordUsage).not.toHaveBeenCalled();
    expect(dependencies.projectionRequestRun).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  it('forwards only usage keys and immediately checks changed telemetry consent', async () => {
    const dependencies = runtimeDependencies();
    const runtime = startMainProcessRuntime(dependencies.input);

    runtime.recordReadingMemoryUsage('review_changed');
    runtime.checkTelemetrySettings();
    runtime.requestReadingMemoryProjectionRebuild();

    expect(dependencies.telemetryRecordUsage).toHaveBeenCalledExactlyOnceWith('review_changed');
    expect(dependencies.telemetryCheck).toHaveBeenCalledExactlyOnceWith('manual');
    expect(dependencies.projectionRequestRun).toHaveBeenCalledExactlyOnceWith('manual');
    await runtime.dispose();
    runtime.recordReadingMemoryUsage('source_jump');
    runtime.checkTelemetrySettings();
    runtime.requestReadingMemoryProjectionRebuild();
    expect(dependencies.telemetryRecordUsage).toHaveBeenCalledOnce();
    expect(dependencies.telemetryCheck).toHaveBeenCalledOnce();
    expect(dependencies.projectionRequestRun).toHaveBeenCalledOnce();
  });

  it('starts scheduled services and disposes every owned lifecycle', async () => {
    vi.useFakeTimers();
    const dependencies = runtimeDependencies();
    const runtime = startMainProcessRuntime(dependencies.input);

    await vi.advanceTimersByTimeAsync(10);

    expect(dependencies.refreshModelPrices).toHaveBeenCalledOnce();
    expect(dependencies.checkForAppUpdates).toHaveBeenCalledWith('auto');
    expect(dependencies.semanticReconcile).toHaveBeenCalledOnce();
    expect(dependencies.semanticReconcile).toHaveBeenCalledWith('startup');

    runtime.checkTelemetryFocus();
    expect(dependencies.telemetryCheck).toHaveBeenCalledWith('focus');
    expect(dependencies.startEvidenceProjectionWorker).toHaveBeenCalledOnce();

    await runtime.dispose();
    await vi.advanceTimersByTimeAsync(100);

    expect(dependencies.refreshModelPrices).toHaveBeenCalledOnce();
    expect(dependencies.checkForAppUpdates).toHaveBeenCalledOnce();
    expect(dependencies.projectionDispose).toHaveBeenCalledOnce();
    expect(dependencies.semanticDispose).toHaveBeenCalledOnce();
    expect(dependencies.telemetryDispose).toHaveBeenCalledOnce();
  });

  it('reconciles the semantic index in the background after startup and database restore', async () => {
    const reconciliation = deferred<void>();
    const dependencies = runtimeDependencies();
    dependencies.semanticReconcile.mockReturnValue(reconciliation.promise);
    const runtime = startMainProcessRuntime(dependencies.input);

    expect(dependencies.semanticReconcile).toHaveBeenNthCalledWith(1, 'startup');
    expect(runtime.onDatabaseRestored()).toBeUndefined();

    expect(dependencies.projectionRequestRun).toHaveBeenCalledWith('database_restored');
    expect(dependencies.semanticReconcile).toHaveBeenNthCalledWith(2, 'database-restored');
    await runtime.dispose();
    reconciliation.resolve();
  });

  it('waits for semantic processes to exit and shares repeated disposal', async () => {
    const stopped = deferred<void>();
    const dependencies = runtimeDependencies();
    dependencies.semanticDispose.mockReturnValue(stopped.promise);
    const runtime = startMainProcessRuntime(dependencies.input);
    let finished = false;

    const disposal = runtime.dispose();
    void disposal.then(() => {
      finished = true;
    });
    expect(runtime.dispose()).toBe(disposal);
    expect(runtime.resumeAfterAppUpdateFailure()).toBe(disposal);
    expect(runtime.suspendForAppUpdate()).toBe(disposal);
    runtime.onDatabaseRestored();
    await Promise.resolve();

    expect(finished).toBe(false);
    expect(dependencies.semanticDispose).toHaveBeenCalledOnce();
    expect(dependencies.semanticResume).not.toHaveBeenCalled();
    expect(dependencies.semanticSuspend).not.toHaveBeenCalled();
    expect(dependencies.semanticReconcile).toHaveBeenCalledTimes(1);
    expect(dependencies.projectionRequestRun).not.toHaveBeenCalled();

    stopped.resolve();
    await disposal;
    expect(finished).toBe(true);
  });

  it('suspends semantic work for installation and resumes without destroying the runtime', async () => {
    const stopped = deferred<void>();
    const dependencies = runtimeDependencies();
    dependencies.semanticSuspend.mockReturnValue(stopped.promise);
    const runtime = startMainProcessRuntime(dependencies.input);

    const preparation = runtime.suspendForAppUpdate();
    expect(preparation).toBe(stopped.promise);
    expect(dependencies.semanticDispose).not.toHaveBeenCalled();
    stopped.resolve();
    await preparation;
    await runtime.resumeAfterAppUpdateFailure();
    runtime.onDatabaseRestored();

    expect(dependencies.semanticResume).toHaveBeenCalledOnce();
    expect(dependencies.semanticReconcile).toHaveBeenLastCalledWith('database-restored');
    expect(dependencies.projectionDispose).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  it('keeps application-update suspension after an in-flight model removal finishes', async () => {
    const dependencies = runtimeDependencies();
    const { controls, removeModel } = runtimeReadingMemoryControls(dependencies);
    const removalStarted = deferred<void>();
    const releaseRemoval = deferred<void>();
    const events: string[] = [];
    dependencies.semanticSuspend.mockImplementation(async () => {
      events.push('suspend');
    });
    dependencies.semanticResume.mockImplementation(async () => {
      events.push('resume');
    });
    removeModel.mockImplementation(async () => {
      events.push('remove-start');
      removalStarted.resolve();
      await releaseRemoval.promise;
      events.push('remove-end');
      return missingModel;
    });
    const runtime = startMainProcessRuntime({
      ...dependencies.input,
      readingMemoryControls: controls,
    });
    const removal = controls.remove();
    await removalStarted.promise;
    const preparation = runtime.suspendForAppUpdate();
    try {
      await nextTurn();
      releaseRemoval.resolve();
      await Promise.all([removal, preparation]);
      expect(events).toEqual(['suspend', 'remove-start', 'remove-end', 'suspend']);
      expect(dependencies.semanticResume).not.toHaveBeenCalled();
      await runtime.resumeAfterAppUpdateFailure();
      expect(dependencies.semanticResume).toHaveBeenCalledOnce();
    } finally {
      releaseRemoval.resolve();
      await removal;
      await runtime.dispose();
    }
  });

  it('waits for in-flight controls before disposing semantic resources during shutdown', async () => {
    const dependencies = runtimeDependencies();
    const { controls, removeModel } = runtimeReadingMemoryControls(dependencies);
    const removalStarted = deferred<void>();
    const releaseRemoval = deferred<void>();
    const events: string[] = [];
    removeModel.mockImplementation(async () => {
      events.push('remove-start');
      removalStarted.resolve();
      await releaseRemoval.promise;
      events.push('remove-end');
      return missingModel;
    });
    dependencies.semanticDispose.mockImplementation(async () => {
      events.push('dispose');
    });
    const runtime = startMainProcessRuntime({
      ...dependencies.input,
      readingMemoryControls: controls,
    });
    const removal = controls.remove();
    await removalStarted.promise;
    let disposed = false;
    const disposal = runtime.dispose().then(() => {
      disposed = true;
    });
    try {
      await expect(controls.pause()).rejects.toThrow('Reading memory controls are stopped');
      await nextTurn();
      expect(disposed).toBe(false);
      expect(dependencies.semanticDispose).not.toHaveBeenCalled();
      releaseRemoval.resolve();
      await Promise.all([removal, disposal]);
      expect(events).toEqual(['remove-start', 'remove-end', 'dispose']);
      expect(dependencies.semanticResume).not.toHaveBeenCalled();
    } finally {
      releaseRemoval.resolve();
      await Promise.all([removal, disposal]);
    }
  });

  it('records an unexpected semantic reconciliation rejection', async () => {
    const dependencies = runtimeDependencies();
    const error = new Error('model directory failed');
    dependencies.semanticReconcile.mockRejectedValueOnce(error);
    const runtime = startMainProcessRuntime(dependencies.input);

    await Promise.resolve();

    expect(dependencies.input.logError).toHaveBeenCalledWith(
      'reading_memory.semantic_reconcile_request_failed',
      error,
      { reason: 'startup' },
    );
    await runtime.dispose();
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
    await runtime.dispose();
  });

  it('does not schedule WeRead sync after disposal during configuration', async () => {
    vi.useFakeTimers();
    const settings = deferred<WeReadSettings>();
    const dependencies = runtimeDependencies({ settingsPromise: settings.promise });
    const runtime = startMainProcessRuntime(dependencies.input);

    await runtime.dispose();
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
      await runtime.dispose();
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
  const telemetryRecordUsage = vi.fn();
  const projectionRequestRun = vi.fn();
  const projectionDispose = vi.fn();
  const semanticReconcile = vi.fn(async (): Promise<void> => undefined);
  const semanticDispose = vi.fn(async (): Promise<void> => undefined);
  const semanticSuspend = vi.fn(async (): Promise<void> => undefined);
  const semanticResume = vi.fn(async (): Promise<void> => undefined);
  const startEvidenceProjectionWorker = vi.fn(() => ({
    requestRun: projectionRequestRun,
    dispose: projectionDispose,
  }));

  return {
    refreshModelPrices,
    checkForAppUpdates,
    sendWeReadStateUpdated,
    syncWeRead,
    telemetryCheck,
    telemetryDispose,
    telemetryRecordUsage,
    projectionRequestRun,
    projectionDispose,
    startEvidenceProjectionWorker,
    semanticReconcile,
    semanticDispose,
    semanticSuspend,
    semanticResume,
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
        recordReadingMemoryUsage: telemetryRecordUsage,
      }),
      syncWeRead,
      startEvidenceProjectionWorker,
      readingMemoryControls: {
        reconcile: semanticReconcile,
        dispose: semanticDispose,
        suspendForAppUpdate: semanticSuspend,
        resumeAfterAppUpdateFailure: semanticResume,
      },
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

const missingModel: ReadingMemoryModelLifecycleState = {
  status: 'not-installed',
  internalId: 'reading-memory-test',
  downloadSizeBytes: 10,
  resumeBytes: 0,
};

function runtimeReadingMemoryControls(dependencies: ReturnType<typeof runtimeDependencies>) {
  const removeModel = vi.fn(async () => missingModel);
  const controls = createReadingMemoryControls({
    userDataPath: '/tmp/yomitomo-runtime-controls',
    modelLifecycle: {
      getState: () => missingModel,
      reconcile: vi.fn(async () => missingModel),
      download: vi.fn(async () => missingModel),
      cancelDownload: vi.fn(async () => missingModel),
      remove: removeModel,
      dispose: vi.fn(),
    },
    semanticIndex: {
      reconcile: dependencies.semanticReconcile,
      suspend: dependencies.semanticSuspend,
      resume: dependencies.semanticResume,
      dispose: dependencies.semanticDispose,
      pauseIndexing: vi.fn(async () => {}),
      resumeIndexing: vi.fn(),
      rebuild: vi.fn(async () => {}),
      search: vi.fn(),
      getStatus: async () => ({
        projection: {
          state: 'available',
          coverage: { projectedAssetCount: 0, eligibleAssetCount: 0 },
        },
        semantic: {
          state: 'not_installed',
          modelVersion: missingModel.internalId,
          queryModelVersion: null,
          coverage: { indexedEntryCount: 0, eligibleEntryCount: 0 },
          indexingPaused: false,
        },
      }),
    },
  });
  return { controls, removeModel };
}
