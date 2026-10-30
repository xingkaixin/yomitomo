import { normalizeUiLanguage, type DesktopStore } from '@yomitomo/shared';
import { isAppLockSettingsLocked } from '../../../app-store';
import { changeAppI18nLanguage } from '../i18n/app-i18n';
import { writeCachedUiLanguage } from '../i18n/app-language-cache';
import type { SettingsDraftStoreApi } from '../settings/app-settings-drafts';
import type { ReaderThemeStoreApi } from '../theme/use-reader-theme-controller';
import type { DesktopStoreApi } from './app-desktop-store';
import type { AppSessionStoreApi } from './app-session';
import { getDesktopApi, getOptionalDesktopApi } from './app-desktop-api';

export function bindDesktopStoreEvents(desktopStore: DesktopStoreApi) {
  const { receiveStore, receiveArticlePatch, receiveCollectionPatch, receiveLibraryPinPatch } =
    desktopStore.getState();
  const desktop = getOptionalDesktopApi();
  const unsubscribes = [
    getDesktopApi().store.onUpdated(receiveStore),
    desktop?.article?.onPatched?.(receiveArticlePatch),
    desktop?.library?.collections?.onPatched?.(receiveCollectionPatch),
    desktop?.library?.pins?.onPatched?.(receiveLibraryPinPatch),
  ];
  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe?.();
  };
}

export function bindMainWindowEvents(stores: {
  desktopStore: DesktopStoreApi;
  sessionStore: AppSessionStoreApi;
  themeStore: ReaderThemeStoreApi;
}) {
  const { desktopStore, sessionStore, themeStore } = stores;
  const unsubscribeMenuCommands = getDesktopApi().app.onMenuCommand((command) => {
    if (isStoreLocked(desktopStore.getState().store)) return;
    sessionStore.getState().actions.runMenuCommand(command);
  });
  const unsubscribeStore = desktopStore.subscribe((state, previousState) => {
    const store = state.store;
    const previousStore = previousState.store;
    if (store === previousStore || !store) return;
    if (isStoreLocked(store)) {
      if (!isStoreLocked(previousStore)) sessionStore.getState().actions.resetForLock();
      return;
    }
    if (store.settings !== previousStore?.settings) {
      themeStore.getState().syncFromSettings(store.settings);
    }
    const uiLanguage = normalizeUiLanguage(store.settings.uiLanguage);
    if (
      !previousStore ||
      isStoreLocked(previousStore) ||
      uiLanguage !== normalizeUiLanguage(previousStore.settings.uiLanguage)
    ) {
      writeCachedUiLanguage(uiLanguage);
      changeAppI18nLanguage(uiLanguage);
    }
  });
  return () => {
    unsubscribeStore();
    unsubscribeMenuCommands();
  };
}

export function bindSettingsDraftEvents(
  desktopStore: DesktopStoreApi,
  draftStore: SettingsDraftStoreApi,
) {
  return desktopStore.subscribe((state, previousState) => {
    const { resetFromSnapshot, syncProviders } = draftStore.getState().actions;
    if (
      state.settingsSyncSnapshot &&
      state.settingsSyncSnapshot !== previousState.settingsSyncSnapshot
    ) {
      resetFromSnapshot(state.settingsSyncSnapshot);
    }
    const providers = state.store?.providers ?? [];
    const previousProviders = previousState.store?.providers ?? [];
    if (providers !== previousProviders) syncProviders(providers, previousProviders);
  });
}

function isStoreLocked(store: DesktopStore | null | undefined) {
  return Boolean(store && isAppLockSettingsLocked(store.settings));
}
