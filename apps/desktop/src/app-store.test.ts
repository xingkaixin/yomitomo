import { describe, expect, it } from 'vitest';
import { emptyDesktopStore, rendererStoreForAppLockState } from './app-store';

describe('desktop store app lock projection', () => {
  it('projects locked stores to the complete renderer settings whitelist', () => {
    const store = {
      ...emptyDesktopStore,
      user: { ...emptyDesktopStore.user, nickname: '敏感用户' },
      settings: {
        ...emptyDesktopStore.settings,
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
        ...emptyDesktopStore.settings,
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
});
