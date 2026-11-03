import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettingsPatch, DesktopStore } from '@yomitomo/shared';
import { initializeStartupStore } from './startup-store';
import { normalizeAppSettings } from '../../settings/app-settings-normalization';

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

    expect(first.saveSettings).toHaveBeenCalledWith({ appLockLocked: true });
    expect(second.saveSettings).toHaveBeenCalledWith({ appLockLocked: true });
    expect(first.setSensitiveRendererEventsLocked).toHaveBeenCalledWith(true);
    expect(second.setSensitiveRendererEventsLocked).toHaveBeenCalledWith(true);
  });
});

function startupContext(store: DesktopStore) {
  const saveSettings = vi.fn(async (settings: AppSettingsPatch) => ({
    ...store,
    settings: normalizeAppSettings({ ...store.settings, ...settings }),
  }));
  const recordStartupTiming = vi.fn();
  const setSensitiveRendererEventsLocked = vi.fn();
  return {
    context: {
      getPersistenceModules: async () => ({
        storeSettings: { saveSettings },
        storeSnapshot: {
          readShellStoreWithProfile: vi.fn(async () => ({
            store,
            profile: [{ name: 'read_settings', durationMs: 1 }],
          })),
        },
      }),
      recordStartupTiming,
      setSensitiveRendererEventsLocked,
    },
    recordStartupTiming,
    saveSettings,
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

function startupStore(settings: AppSettingsPatch = { logRetentionDays: 30 }): DesktopStore {
  return {
    agents: [],
    articles: [],
    collectionMembers: [],
    collections: [],
    pins: [],
    providers: [],
    settings: normalizeAppSettings(settings),
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
