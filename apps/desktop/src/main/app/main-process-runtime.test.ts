import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeReadSettings, WeReadSyncResult } from '@yomitomo/shared';
import { startMainProcessRuntime } from './main-process-runtime';
import { readDatabaseLifecycle } from '../store/store-db';

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
  const readWeReadSettings = vi.fn(() => Promise.resolve(settings));
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
          readWeReadApiKeyRef: vi.fn(() => 'api-key-ref'),
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
        notifyEvidenceChanged: vi.fn(),
        dispose: semanticDispose,
        suspendForAppUpdate: semanticSuspend,
        resumeAfterAppUpdateFailure: semanticResume,
      },
    },
  };
}
