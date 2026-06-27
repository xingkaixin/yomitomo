import type { AppSettings, DesktopStore } from '@yomitomo/shared';
import { defaultStore } from '../store/store-normalizers';

export function isAppLockSettingsLocked(settings: AppSettings) {
  return Boolean(settings.appLockEnabled && settings.appLockLocked);
}

export function rendererStoreForAppLockState(store: DesktopStore) {
  if (!isAppLockSettingsLocked(store.settings)) return store;
  return lockedRendererStoreFromSettings(store.settings);
}

export function lockedRendererStoreFromSettings(settings: AppSettings): DesktopStore {
  return {
    ...defaultStore,
    settings: {
      appLockEnabled: Boolean(settings.appLockEnabled),
      appLockLocked: Boolean(settings.appLockEnabled && settings.appLockLocked),
      appLockLockOnStartup: Boolean(settings.appLockLockOnStartup),
      appLockShortcut: settings.appLockShortcut,
      onboardingCompletedAt: settings.onboardingCompletedAt,
      soundEffectsEnabled: settings.soundEffectsEnabled,
      soundEffectsVolume: settings.soundEffectsVolume,
      themeId: settings.themeId,
      uiLanguage: settings.uiLanguage,
    },
  };
}
