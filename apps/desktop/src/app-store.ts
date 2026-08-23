import type { AppSettingsPatch, DesktopStore, ResolvedAppSettings } from '@yomitomo/shared';
import { defaultUserProfile } from '@yomitomo/shared';
import type { AppLockStatus } from './ipc-contract';
import { normalizeAppSettings } from './settings/app-settings-normalization';

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
] as const satisfies ReadonlyArray<keyof ResolvedAppSettings>;

type LockedRendererSettingKey = (typeof lockedRendererSettingKeys)[number];

export const emptyDesktopStore: DesktopStore = {
  user: defaultUserProfile,
  settings: normalizeAppSettings(undefined),
  providers: [],
  agents: [],
  articles: [],
  collections: [],
  collectionMembers: [],
  pins: [],
};

export function isAppLockSettingsLocked(
  settings: Pick<ResolvedAppSettings, 'appLockEnabled' | 'appLockLocked'>,
) {
  return settings.appLockEnabled && settings.appLockLocked;
}

export function rendererStoreForAppLockState(store: DesktopStore): DesktopStore {
  if (!isAppLockSettingsLocked(store.settings)) return store;
  return lockedRendererStoreFromSettings(store.settings);
}

export function lockedRendererStoreFromSettings(settings: AppSettingsPatch): DesktopStore {
  const normalized = normalizeAppSettings(settings);
  const normalizedSettings: ResolvedAppSettings = {
    ...normalized,
    appLockEnabled: normalized.appLockEnabled,
    appLockLocked: isAppLockSettingsLocked(normalized),
    appLockLockOnStartup: normalized.appLockLockOnStartup,
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

function emptyStoreWithSettings(settings: AppSettingsPatch): DesktopStore {
  return {
    ...emptyDesktopStore,
    settings: normalizeAppSettings(settings),
  };
}

function projectLockedRendererSettings(
  settings: ResolvedAppSettings,
): Pick<ResolvedAppSettings, LockedRendererSettingKey> {
  return Object.fromEntries(lockedRendererSettingKeys.map((key) => [key, settings[key]])) as Pick<
    ResolvedAppSettings,
    LockedRendererSettingKey
  >;
}
