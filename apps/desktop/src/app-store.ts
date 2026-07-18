import type { AppSettings, DesktopStore } from '@yomitomo/shared';
import { defaultUserProfile } from '@yomitomo/shared';
import type { AppLockStatus } from './ipc-contract';

const lockedRendererSettingKeys = [
  'appLockEnabled',
  'appLockLocked',
  'appLockLockOnStartup',
  'appLockShortcut',
  'onboardingCompletedAt',
  'soundEffectsEnabled',
  'soundEffectsVolume',
  'themeId',
  'uiLanguage',
] as const satisfies ReadonlyArray<keyof AppSettings>;

type LockedRendererSettingKey = (typeof lockedRendererSettingKeys)[number];

export const emptyDesktopStore: DesktopStore = {
  user: defaultUserProfile,
  settings: {},
  providers: [],
  agents: [],
  articles: [],
  collections: [],
  collectionMembers: [],
  pins: [],
};

export function isAppLockSettingsLocked(settings: AppSettings) {
  return Boolean(settings.appLockEnabled && settings.appLockLocked);
}

export function rendererStoreForAppLockState(store: DesktopStore): DesktopStore {
  if (!isAppLockSettingsLocked(store.settings)) return store;
  return lockedRendererStoreFromSettings(store.settings);
}

export function lockedRendererStoreFromSettings(settings: AppSettings): DesktopStore {
  const normalizedSettings: AppSettings = {
    ...settings,
    appLockEnabled: Boolean(settings.appLockEnabled),
    appLockLocked: isAppLockSettingsLocked(settings),
    appLockLockOnStartup: Boolean(settings.appLockLockOnStartup),
  };
  return emptyStoreWithSettings(projectLockedRendererSettings(normalizedSettings));
}

export function lockedRendererStoreFromStatus(status: AppLockStatus): DesktopStore {
  return emptyStoreWithSettings({
    appLockEnabled: status.enabled,
    appLockLocked: status.locked,
    appLockShortcut: status.shortcut,
  });
}

function emptyStoreWithSettings(settings: AppSettings): DesktopStore {
  return {
    ...emptyDesktopStore,
    settings,
  };
}

function projectLockedRendererSettings(
  settings: AppSettings,
): Pick<AppSettings, LockedRendererSettingKey> {
  return Object.fromEntries(lockedRendererSettingKeys.map((key) => [key, settings[key]])) as Pick<
    AppSettings,
    LockedRendererSettingKey
  >;
}
