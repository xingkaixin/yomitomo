import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopStore } from '@yomitomo/shared';
import { initializeStartupStore } from './startup-store';
import { logError, pruneLogFile } from './logger';

vi.mock('./logger', () => ({
  logError: vi.fn(),
  pruneLogFile: vi.fn(async () => undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startup store initialization', () => {
  it('applies startup locking without process-global state', async () => {
    const first = startupContext(unlockedStartupStore());
    const second = startupContext(unlockedStartupStore());

    await expect(initializeStartupStore(first.context)).resolves.toEqual({ ok: true });
    await expect(initializeStartupStore(second.context)).resolves.toEqual({ ok: true });

    expect(first.saveSettingsShell).toHaveBeenCalledWith({ appLockLocked: true });
    expect(second.saveSettingsShell).toHaveBeenCalledWith({ appLockLocked: true });
    expect(first.setSensitiveRendererEventsLocked).toHaveBeenCalledWith(true);
    expect(second.setSensitiveRendererEventsLocked).toHaveBeenCalledWith(true);
  });

  it('schedules log pruning and records startup profiling after loading', async () => {
    const { context, recordStartupTiming } = startupContext(startupStore());

    await expect(initializeStartupStore(context)).resolves.toEqual({ ok: true });

    expect(pruneLogFile).toHaveBeenCalledWith(30);
    expect(recordStartupTiming).toHaveBeenCalledWith('store.initialize_success', {
      durationMs: expect.any(Number),
      importDurationMs: expect.any(Number),
      readDurationMs: expect.any(Number),
      articleCount: 0,
      annotationCount: 0,
      thoughtCount: 0,
    });
    expect(recordStartupTiming).toHaveBeenCalledWith('store.initialize_profile', {
      steps: [{ name: 'read_settings', durationMs: 1 }],
    });
  });

  it('logs store startup failures without preventing app readiness', async () => {
    const options = { readError: new Error('database unavailable') };
    const { context, setSensitiveRendererEventsLocked } = startupContext(startupStore(), options);

    await expect(initializeStartupStore(context)).resolves.toEqual({
      ok: false,
      error: options.readError,
    });

    expect(logError).toHaveBeenCalledWith('store.initialize_failed', expect.any(Error));
    expect(setSensitiveRendererEventsLocked).not.toHaveBeenCalled();
    expect(pruneLogFile).not.toHaveBeenCalled();
  });
});

function startupContext(store: DesktopStore, options: { readError?: Error } = {}) {
  const saveSettingsShell = vi.fn(async (settings: DesktopStore['settings']) => ({
    ...store,
    settings: { ...store.settings, ...settings },
  }));
  const recordStartupTiming = vi.fn();
  const setSensitiveRendererEventsLocked = vi.fn();
  return {
    context: {
      getPersistenceModules: async () => ({
        storeSettings: { saveSettingsShell },
        storeSnapshot: {
          readShellStoreWithProfile: vi.fn(async () => {
            if (options.readError) throw options.readError;
            return {
              store,
              profile: [{ name: 'read_settings', durationMs: 1 }],
            };
          }),
        },
      }),
      recordStartupTiming,
      setSensitiveRendererEventsLocked,
    },
    recordStartupTiming,
    saveSettingsShell,
    setSensitiveRendererEventsLocked,
  };
}

function unlockedStartupStore(): DesktopStore {
  return startupStore({
    appLockEnabled: true,
    appLockLocked: false,
    appLockLockOnStartup: true,
  });
}

function startupStore(settings: DesktopStore['settings'] = { logRetentionDays: 30 }): DesktopStore {
  return {
    agents: [],
    articles: [],
    collectionMembers: [],
    collections: [],
    pins: [],
    providers: [],
    settings,
    user: {
      id: 'user_1',
      nickname: 'User',
      username: 'user',
      avatar: '',
      annotationColor: '#000000',
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
  };
}
