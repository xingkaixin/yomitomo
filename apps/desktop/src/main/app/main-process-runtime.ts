import { performance } from 'node:perf_hooks';
import type { WeReadState } from '../../ipc-contract';
import { modelPriceRefreshIntervalMs } from '../providers/model-pricing-repository';
import {
  createDesktopTelemetryControllerForEnvironment,
  type DesktopTelemetryController,
} from '../telemetry/desktop-telemetry';
import { syncWeReadLibrary } from '../weread/weread-sync';

const DEFAULT_APP_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const defaultTiming = {
  modelPriceStartupDelayMs: 5_000,
  modelPriceIntervalMs: modelPriceRefreshIntervalMs(),
  appUpdateStartupDelayMs: 8_000,
  appUpdateIntervalMs: appUpdateCheckIntervalMs(),
  weReadStartupDelayMs: 5_000,
  weReadIntervalMs: 30 * 60 * 1000,
};

type MainProcessRuntimeTiming = typeof defaultTiming;

type RuntimePersistenceModules = {
  storeModelPricing: Pick<typeof import('../store/store-model-pricing'), 'refreshModelPrices'>;
  weReadRepository: Pick<
    typeof import('../weread/weread-repository'),
    'readStoredWeReadApiKey' | 'readWeReadSettings' | 'saveWeReadLibrarySnapshot'
  >;
};

type MainProcessRuntimeDependencies = {
  getPersistenceModules: () => Promise<RuntimePersistenceModules>;
  getAppUpdaterModule: () => Promise<Pick<typeof import('./app-updater'), 'checkForAppUpdates'>>;
  getAppVersion: () => string;
  sendWeReadStateUpdated: (state: WeReadState) => void;
  elapsedMs: (startedAt: number) => number;
  logInfo: (event: string, data?: Record<string, unknown>) => void;
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => void;
  timing?: Partial<MainProcessRuntimeTiming>;
  createTelemetryController?: typeof createDesktopTelemetryControllerForEnvironment;
  syncWeRead?: typeof syncWeReadLibrary;
};

export type MainProcessRuntime = {
  configureWeReadAutoSync: (reason: string) => void;
  checkTelemetryFocus: () => void;
  dispose: () => void;
};

export function startMainProcessRuntime(
  dependencies: MainProcessRuntimeDependencies,
): MainProcessRuntime {
  const timing = { ...defaultTiming, ...dependencies.timing };
  const createTelemetryController =
    dependencies.createTelemetryController ?? createDesktopTelemetryControllerForEnvironment;
  const syncWeRead = dependencies.syncWeRead ?? syncWeReadLibrary;
  let disposed = false;
  let weReadConfigurationToken = 0;
  let weReadSyncRunning = false;
  let weReadStartupTimer: NodeJS.Timeout | null = null;
  let weReadIntervalTimer: NodeJS.Timeout | null = null;
  let telemetryController: DesktopTelemetryController | null = createTelemetryController({
    getAppVersion: dependencies.getAppVersion,
    logInfo: dependencies.logInfo,
    logError: dependencies.logError,
  });

  const refreshModelPrices = (reason: string) => {
    if (disposed) return;
    const startedAt = performance.now();
    void dependencies
      .getPersistenceModules()
      .then((modules) => modules.storeModelPricing.refreshModelPrices())
      .then((result) => {
        if (disposed) return;
        dependencies.logInfo('model_pricing.refresh', {
          reason,
          refreshed: result.refreshed,
          recordCount: result.recordCount,
          resultReason: result.reason,
          durationMs: dependencies.elapsedMs(startedAt),
        });
      })
      .catch((error) => {
        if (!disposed) dependencies.logError('model_pricing.refresh_failed', error, { reason });
      });
  };

  const checkForAppUpdates = (reason: string) => {
    if (disposed) return;
    void dependencies
      .getAppUpdaterModule()
      .then((module) => module.checkForAppUpdates('auto'))
      .then((state) => {
        if (!disposed) dependencies.logInfo('updater.auto_check', { reason, status: state.status });
      })
      .catch((error) => {
        if (!disposed) dependencies.logError('updater.auto_check_failed', error, { reason });
      });
  };

  const clearWeReadTimers = () => {
    if (weReadStartupTimer) clearTimeout(weReadStartupTimer);
    if (weReadIntervalTimer) clearInterval(weReadIntervalTimer);
    weReadStartupTimer = null;
    weReadIntervalTimer = null;
  };

  const runWeReadAutoSync = async (reason: string) => {
    if (disposed) return;
    if (weReadSyncRunning) {
      dependencies.logInfo('weread.auto_sync.skipped', {
        reason,
        skippedReason: 'in_flight',
      });
      return;
    }

    const startedAt = performance.now();
    weReadSyncRunning = true;
    try {
      const modules = await dependencies.getPersistenceModules();
      const settings = await modules.weReadRepository.readWeReadSettings();
      if (disposed) return;
      if (!settings.configured || settings.syncMode !== 'auto') {
        dependencies.logInfo('weread.auto_sync.skipped', {
          reason,
          configured: settings.configured,
          syncMode: settings.syncMode ?? 'manual',
          skippedReason: 'disabled',
        });
        return;
      }

      const result = await syncWeRead({
        persistence: modules.weReadRepository,
        reason: `auto:${reason}`,
        logInfo: dependencies.logInfo,
        logError: dependencies.logError,
        elapsedMs: dependencies.elapsedMs,
      });
      if (disposed) return;
      dependencies.sendWeReadStateUpdated(result);
      dependencies.logInfo('weread.auto_sync.complete', {
        reason,
        bookCount: result.books.length,
        durationMs: dependencies.elapsedMs(startedAt),
      });
    } catch (error) {
      if (!disposed) {
        dependencies.logError('weread.auto_sync.failed', error, {
          reason,
          durationMs: dependencies.elapsedMs(startedAt),
        });
      }
    } finally {
      weReadSyncRunning = false;
    }
  };

  const configureWeReadAutoSync = (reason: string) => {
    if (disposed) return;
    const token = ++weReadConfigurationToken;
    clearWeReadTimers();
    void dependencies
      .getPersistenceModules()
      .then(async (modules) => {
        const settings = await modules.weReadRepository.readWeReadSettings();
        if (disposed || token !== weReadConfigurationToken) return;
        if (!settings.configured || settings.syncMode !== 'auto') {
          dependencies.logInfo('weread.auto_sync.disabled', {
            reason,
            configured: settings.configured,
            syncMode: settings.syncMode ?? 'manual',
          });
          return;
        }

        weReadStartupTimer = setTimeout(
          () => void runWeReadAutoSync('startup'),
          timing.weReadStartupDelayMs,
        );
        weReadStartupTimer.unref?.();
        weReadIntervalTimer = setInterval(
          () => void runWeReadAutoSync('interval'),
          timing.weReadIntervalMs,
        );
        weReadIntervalTimer.unref?.();
        dependencies.logInfo('weread.auto_sync.scheduled', {
          reason,
          startupDelayMs: timing.weReadStartupDelayMs,
          intervalMs: timing.weReadIntervalMs,
        });
      })
      .catch((error) => {
        if (!disposed)
          dependencies.logError('weread.auto_sync.configure_failed', error, { reason });
      });
  };

  const disposeModelPriceRefresh = scheduleRecurringTask({
    startupDelayMs: timing.modelPriceStartupDelayMs,
    intervalMs: timing.modelPriceIntervalMs,
    run: refreshModelPrices,
  });
  const disposeAppUpdateCheck = scheduleRecurringTask({
    startupDelayMs: timing.appUpdateStartupDelayMs,
    intervalMs: timing.appUpdateIntervalMs,
    run: checkForAppUpdates,
  });
  configureWeReadAutoSync('startup');

  return {
    configureWeReadAutoSync,
    checkTelemetryFocus: () => {
      if (!disposed) telemetryController?.check('focus');
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      weReadConfigurationToken += 1;
      disposeModelPriceRefresh();
      disposeAppUpdateCheck();
      clearWeReadTimers();
      telemetryController?.dispose();
      telemetryController = null;
    },
  };
}

function scheduleRecurringTask(input: {
  startupDelayMs: number;
  intervalMs: number;
  run: (reason: 'startup' | 'interval') => void;
}) {
  const startupTimer = setTimeout(() => input.run('startup'), input.startupDelayMs);
  startupTimer.unref?.();
  const intervalTimer = setInterval(() => input.run('interval'), input.intervalMs);
  intervalTimer.unref?.();
  return () => {
    clearTimeout(startupTimer);
    clearInterval(intervalTimer);
  };
}

function appUpdateCheckIntervalMs() {
  const raw = Number(process.env.YOMITOMO_UPDATE_CHECK_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_APP_UPDATE_CHECK_INTERVAL_MS;
}
