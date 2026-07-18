import { performance } from 'node:perf_hooks';
import type { DesktopStore } from '@yomitomo/shared';
import { isAppLockSettingsLocked } from '../../app-store';
import { logError, pruneLogFile } from './logger';
import type { StoreReadProfileEntry } from '../store/store-db';

type StartupStoreContext = {
  getPersistenceModules: () => Promise<{
    storeSettings: Pick<typeof import('../store/store-settings'), 'saveSettingsShell'>;
    storeSnapshot: Pick<typeof import('../store/store-snapshot'), 'readShellStoreWithProfile'>;
  }>;
  recordStartupTiming: (event: string, data?: Record<string, unknown>) => void;
  setSensitiveRendererEventsLocked: (locked: boolean) => void;
};

export type StartupStoreInitializationResult = { ok: true } | { ok: false; error: unknown };

export async function initializeStartupStore(
  context: StartupStoreContext,
): Promise<StartupStoreInitializationResult> {
  const startedAt = performance.now();
  context.recordStartupTiming('store.initialize_start');

  try {
    const importStartedAt = performance.now();
    const { storeSettings, storeSnapshot } = await context.getPersistenceModules();
    const importDurationMs = elapsedMs(importStartedAt);
    const readStartedAt = performance.now();
    const { store: loadedStore, profile } = await storeSnapshot.readShellStoreWithProfile();
    const store = await applyStartupAppLock(loadedStore, storeSettings, context);
    const readDurationMs = elapsedMs(readStartedAt);

    context.setSensitiveRendererEventsLocked(isAppLockSettingsLocked(store.settings));
    scheduleLogPrune(store.settings.logRetentionDays, context.recordStartupTiming);
    recordStoreReadyTiming(context, store, profile, {
      durationMs: elapsedMs(startedAt),
      importDurationMs,
      readDurationMs,
    });
    return { ok: true };
  } catch (error) {
    logError('store.initialize_failed', error);
    context.recordStartupTiming('store.initialize_error', { durationMs: elapsedMs(startedAt) });
    return { ok: false, error };
  }
}

async function applyStartupAppLock(
  store: DesktopStore,
  storeSettings: Pick<typeof import('../store/store-settings'), 'saveSettingsShell'>,
  context: Pick<StartupStoreContext, 'recordStartupTiming'>,
) {
  if (!shouldLockAppOnStartup(store.settings)) return store;

  const startedAt = performance.now();
  const lockedStore = await storeSettings.saveSettingsShell({ appLockLocked: true });
  context.recordStartupTiming('app_lock.startup_lock_applied', {
    durationMs: elapsedMs(startedAt),
  });
  return lockedStore;
}

function shouldLockAppOnStartup(settings: DesktopStore['settings']) {
  return Boolean(
    settings.appLockEnabled && settings.appLockLockOnStartup && !settings.appLockLocked,
  );
}

function scheduleLogPrune(
  retentionDays: number | undefined,
  recordStartupTiming: StartupStoreContext['recordStartupTiming'],
) {
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

function recordStoreReadyTiming(
  context: Pick<StartupStoreContext, 'recordStartupTiming'>,
  store: DesktopStore,
  profile: StoreReadProfileEntry[],
  timing: { durationMs: number; importDurationMs: number; readDurationMs: number },
) {
  context.recordStartupTiming('store.initialize_success', {
    ...timing,
    articleCount: store.articles.length,
    annotationCount: store.articles.reduce(
      (count, article) => count + (article.annotationCount ?? article.annotations.length),
      0,
    ),
    thoughtCount: store.articles.reduce((count, article) => {
      const thoughtCount =
        article.thoughtCount ??
        article.commentCount ??
        article.annotations.reduce(
          (annotationCount, annotation) =>
            annotationCount + annotation.comments.filter((comment) => !comment.replyTo).length,
          0,
        );
      return count + thoughtCount;
    }, 0),
  });
  context.recordStartupTiming('store.initialize_profile', { steps: profile });
}

function elapsedMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}
