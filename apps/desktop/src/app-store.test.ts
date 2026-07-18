import { describe, expect, it } from 'vitest';
import {
  emptyDesktopStore,
  isAppLockSettingsLocked,
  lockedRendererStoreFromSettings,
  lockedRendererStoreFromStatus,
  rendererStoreForAppLockState,
} from './app-store';

describe('desktop store app lock projection', () => {
  it('returns unlocked stores without replacing their identity', () => {
    const store = {
      ...emptyDesktopStore,
      settings: { appLockEnabled: true, appLockLocked: false },
    };

    expect(rendererStoreForAppLockState(store)).toBe(store);
    expect(isAppLockSettingsLocked(store.settings)).toBe(false);
  });

  it('projects locked stores to the complete renderer settings whitelist', () => {
    const store = {
      ...emptyDesktopStore,
      user: { ...emptyDesktopStore.user, nickname: '敏感用户' },
      settings: {
        appLockEnabled: true,
        appLockLocked: true,
        appLockLockOnStartup: true,
        appLockShortcut: 'CommandOrControl+L',
        onboardingCompletedAt: '2026-07-18T00:00:00.000Z',
        soundEffectsEnabled: false,
        soundEffectsVolume: 0.25,
        themeId: 'ink-paper',
        uiLanguage: 'en' as const,
        defaultProviderId: 'provider_secret',
        telemetryEnabled: false,
      },
    };

    expect(rendererStoreForAppLockState(store)).toEqual({
      ...emptyDesktopStore,
      settings: {
        appLockEnabled: true,
        appLockLocked: true,
        appLockLockOnStartup: true,
        appLockShortcut: 'CommandOrControl+L',
        onboardingCompletedAt: '2026-07-18T00:00:00.000Z',
        soundEffectsEnabled: false,
        soundEffectsVolume: 0.25,
        themeId: 'ink-paper',
        uiLanguage: 'en',
      },
    });
  });

  it('normalizes lock booleans when projecting settings directly', () => {
    expect(
      lockedRendererStoreFromSettings({
        appLockEnabled: false,
        appLockLocked: true,
        appLockLockOnStartup: undefined,
      }).settings,
    ).toMatchObject({
      appLockEnabled: false,
      appLockLocked: false,
      appLockLockOnStartup: false,
    });
  });

  it('keeps the status fallback limited to fields returned by the status IPC', () => {
    expect(
      lockedRendererStoreFromStatus({
        configured: true,
        enabled: true,
        locked: true,
        shortcut: 'CommandOrControl+L',
      }),
    ).toEqual({
      ...emptyDesktopStore,
      settings: {
        appLockEnabled: true,
        appLockLocked: true,
        appLockShortcut: 'CommandOrControl+L',
      },
    });
  });
});
