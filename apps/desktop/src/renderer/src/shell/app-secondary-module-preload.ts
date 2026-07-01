import { useEffect, useState } from 'react';
import { elapsedMs, recordStartupTiming } from './app-utils';

type ReadingStatsModule = typeof import('../reading-stats/app-reading-stats');
type AgentSettingsModule = typeof import('../settings/app-settings-agent-panel');
type SettingsPanelsModule = typeof import('../settings/app-settings-panels');
type SettingsProviderModule = typeof import('../settings/app-settings-provider-panel');
type SettingsAboutModule = typeof import('./app-log-viewer');
type ProfileDialogModule = typeof import('../settings/app-settings-profile-dialog');

type PreloadStatus = 'not-started' | 'scheduled' | 'loading' | 'ready' | 'failed';
type PreloadKey =
  | 'agents'
  | 'stats'
  | 'settings-panels'
  | 'settings-provider'
  | 'settings-about'
  | 'profile-dialog';

type PreloadEntry<TModule> = {
  key: PreloadKey;
  status: PreloadStatus;
  module?: TModule;
  promise?: Promise<TModule>;
  markScheduled: () => void;
  load: () => Promise<TModule>;
};

const preloadListeners = new Set<() => void>();

export function subscribePreloadModules(listener: () => void) {
  preloadListeners.add(listener);
  return () => {
    preloadListeners.delete(listener);
  };
}

function notifyPreloadModules() {
  for (const listener of preloadListeners) listener();
}

function createPreloadEntry<TModule>(
  key: PreloadKey,
  importModule: () => Promise<TModule>,
): PreloadEntry<TModule> {
  const entry: PreloadEntry<TModule> = {
    key,
    status: 'not-started',
    markScheduled: () => {
      if (entry.status !== 'not-started') return;
      entry.status = 'scheduled';
      recordStartupTiming('secondary_modules.preload_module_scheduled', { key });
      notifyPreloadModules();
    },
    load: () => {
      if (entry.module) return Promise.resolve(entry.module);
      if (entry.promise) return entry.promise;

      const startedAt = performance.now();
      entry.status = 'loading';
      recordStartupTiming('secondary_modules.preload_module_start', { key });
      notifyPreloadModules();
      entry.promise = importModule()
        .then((module) => {
          entry.module = module;
          entry.status = 'ready';
          recordStartupTiming('secondary_modules.preload_module_success', {
            key,
            durationMs: elapsedMs(startedAt),
          });
          notifyPreloadModules();
          return module;
        })
        .catch((error: unknown) => {
          entry.status = 'failed';
          entry.promise = undefined;
          recordStartupTiming('secondary_modules.preload_module_failed', {
            key,
            durationMs: elapsedMs(startedAt),
            message: error instanceof Error ? error.message : String(error),
          });
          notifyPreloadModules();
          throw error;
        });
      return entry.promise;
    },
  };
  return entry;
}

export const preloadEntries = {
  agents: createPreloadEntry<AgentSettingsModule>(
    'agents',
    () => import('../settings/app-settings-agent-panel'),
  ),
  stats: createPreloadEntry<ReadingStatsModule>(
    'stats',
    () => import('../reading-stats/app-reading-stats'),
  ),
  settingsPanels: createPreloadEntry<SettingsPanelsModule>(
    'settings-panels',
    () => import('../settings/app-settings-panels'),
  ),
  settingsProvider: createPreloadEntry<SettingsProviderModule>(
    'settings-provider',
    () => import('../settings/app-settings-provider-panel'),
  ),
  settingsAbout: createPreloadEntry<SettingsAboutModule>(
    'settings-about',
    () => import('./app-log-viewer'),
  ),
  profileDialog: createPreloadEntry<ProfileDialogModule>(
    'profile-dialog',
    () => import('../settings/app-settings-profile-dialog'),
  ),
};

export function preloadedExport<TModule, TKey extends keyof TModule, TFallback>(
  entry: { module?: TModule },
  key: TKey,
  fallback: TFallback,
): TModule[TKey] | TFallback {
  return entry.module?.[key] ?? fallback;
}

export function preloadIdleModules() {
  recordStartupTiming('secondary_modules.preload_scheduled');
  const tasks = [
    () => preloadEntries.settingsPanels.load(),
    () => preloadEntries.settingsProvider.load(),
    () => preloadEntries.settingsAbout.load(),
    () => preloadEntries.profileDialog.load(),
    () => preloadEntries.agents.load(),
    () => preloadEntries.stats.load().then((module) => module.preloadReadingStatsDeferredModules()),
  ];
  scheduleIdlePreloadQueue(tasks);
}

type IdlePreloadHandle =
  | { kind: 'idle'; id: number }
  | { kind: 'timeout'; id: ReturnType<typeof globalThis.setTimeout> };

export function scheduleIdlePreload(callback: () => void): IdlePreloadHandle {
  if ('requestIdleCallback' in window) {
    return { kind: 'idle', id: window.requestIdleCallback(callback, { timeout: 3000 }) };
  }
  return { kind: 'timeout', id: globalThis.setTimeout(callback, 800) };
}

export function cancelIdlePreload(handle: IdlePreloadHandle) {
  if (handle.kind === 'idle') window.cancelIdleCallback(handle.id);
  else globalThis.clearTimeout(handle.id);
}

function scheduleIdlePreloadQueue(tasks: Array<() => Promise<unknown>>) {
  let taskIndex = 0;
  const runNextTask = () => {
    const task = tasks[taskIndex];
    taskIndex += 1;
    if (!task) {
      recordStartupTiming('secondary_modules.preload_complete');
      return;
    }
    void task()
      .catch(() => undefined)
      .finally(() => scheduleIdlePreload(runNextTask));
  };
  for (const entry of Object.values(preloadEntries)) entry.markScheduled();
  scheduleIdlePreload(runNextTask);
}

export function useSecondaryModulePreload() {
  const [, setPreloadVersion] = useState(0);
  useEffect(() => subscribePreloadModules(() => setPreloadVersion((version) => version + 1)), []);
}
