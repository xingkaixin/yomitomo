import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import i18next from 'i18next';
import type { AppSettings, DesktopStore, LlmProvider } from '@yomitomo/shared';
import type { SettingsStorePatch, UserStorePatch } from '../../../ipc-contract';
import {
  normalizeUiLanguage,
  normalizeSelectionActionShortcutDraft,
  selectionActionShortcutsConflict,
} from '@yomitomo/shared';
import { changeAppI18nLanguage } from '../i18n/app-i18n';
import { providerPresetDisplayName } from '../i18n/app-i18n-labels';
import { writeCachedUiLanguage } from '../i18n/app-language-cache';

import {
  defaultUser,
  emptyProvider,
  providerDraftHasChanges,
  userDraftHasChanges,
  type ProviderDraft,
  type ProviderTestState,
  type UserDraft,
} from './app-settings';
import { useSaveableDraft } from './use-saveable-draft';
import { settingsDraftSectionHasChanges } from './app-settings-change-detection';
import { appSettingsActions, type AppSettingsActions } from './app-settings-actions';

type UseSettingsDraftsInput = {
  store: DesktopStore;
  storeSyncSnapshot: DesktopStore | null;
  applyStore: (nextStore: DesktopStore) => DesktopStore;
  applySettingsPatch: (patch: SettingsStorePatch) => DesktopStore;
  actions?: AppSettingsActions;
};

export function useSettingsDrafts({
  store,
  storeSyncSnapshot,
  applyStore,
  applySettingsPatch,
  actions = appSettingsActions,
}: UseSettingsDraftsInput) {
  const [userDraft, setUserDraft] = useState<UserDraft>(defaultUser);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>({});
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(() => localizedEmptyProvider());
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [providerEditorActive, setProviderEditorActive] = useState(false);
  const [testState, setTestState] = useState<ProviderTestState>({ status: 'idle' });
  const initialProviderSelectedRef = useRef(false);

  useEffect(() => {
    if (!storeSyncSnapshot) return;
    setUserDraft(storeSyncSnapshot.user);
    setSettingsDraft(storeSyncSnapshot.settings);
  }, [storeSyncSnapshot]);

  const userHasChanges = useMemo(
    () => userDraftHasChanges(userDraft, store.user),
    [store.user, userDraft],
  );
  const settingsHasChanges = useMemo(
    () => settingsDraftSectionHasChanges('general', settingsDraft, store.settings),
    [settingsDraft, store.settings],
  );
  const draftSelectionActionShortcuts = useMemo(
    () => normalizeSelectionActionShortcutDraft(settingsDraft.selectionActionShortcuts),
    [settingsDraft.selectionActionShortcuts],
  );
  const shortcutSettingsHaveConflict = useMemo(
    () => selectionActionShortcutsConflict(draftSelectionActionShortcuts),
    [draftSelectionActionShortcuts],
  );
  const shortcutSettingsHaveChanges = useMemo(
    () => settingsDraftSectionHasChanges('shortcuts', settingsDraft, store.settings),
    [settingsDraft, store.settings],
  );
  const providerRoutesHaveChanges = useMemo(
    () => settingsDraftSectionHasChanges('routes', settingsDraft, store.settings),
    [settingsDraft, store.settings],
  );
  const selectedProvider = useMemo(
    () => store.providers.find((provider) => provider.id === selectedProviderId) || null,
    [selectedProviderId, store.providers],
  );
  const providerHasChanges = useMemo(
    () => providerDraftHasChanges(providerDraft, selectedProvider),
    [providerDraft, selectedProvider],
  );

  const updateProviderDraftValue = useCallback((draft: ProviderDraft) => {
    setProviderDraft(draft);
    setTestState({ status: 'idle' });
  }, []);

  const saveUserDraft = useCallback(
    async (draft: UserDraft) => {
      return actions.saveUser(draft);
    },
    [actions],
  );

  const applySavedUserStore = useCallback(
    (patch: UserStorePatch | null) => {
      if (!patch) return false;
      const nextStore = applySettingsPatch(patch);
      setUserDraft(nextStore.user);
      return true;
    },
    [applySettingsPatch],
  );

  const saveSettingsDraft = useCallback(
    async (draft: AppSettings) => {
      return actions.saveSettings(draft);
    },
    [actions],
  );

  const applySavedSettingsStore = useCallback(
    (nextStore: DesktopStore | null) => {
      if (!nextStore) return false;
      syncUiLanguageCache(nextStore.settings);
      applyStore(nextStore);
      setSettingsDraft(nextStore.settings);
      return true;
    },
    [applyStore],
  );

  const saveProviderDraftValue = useCallback(
    async (draft: ProviderDraft) => {
      const patch = await actions.saveProvider(draft);
      const nextStore = applySettingsPatch(patch);
      const savedProvider = draft.id
        ? nextStore.providers.find((provider) => provider.id === draft.id)
        : nextStore.providers.at(-1);
      setTestState({ status: 'idle' });
      if (!savedProvider) return false;
      setSelectedProviderId(savedProvider.id);
      setProviderDraft(savedProvider);
      return true;
    },
    [actions, applySettingsPatch],
  );

  const profile = useSaveableDraft<UserDraft, UserStorePatch | null>({
    value: userDraft,
    canSave: () => userHasChanges,
    errorMessage: settingsSaveErrorMessage,
    onChange: setUserDraft,
    onSaved: applySavedUserStore,
    persist: saveUserDraft,
  });
  const general = useSaveableDraft<AppSettings, DesktopStore | null>({
    value: settingsDraft,
    canSave: () => settingsHasChanges,
    errorMessage: settingsSaveErrorMessage,
    onChange: setSettingsDraft,
    onSaved: applySavedSettingsStore,
    persist: saveSettingsDraft,
  });
  const shortcuts = useSaveableDraft<AppSettings, DesktopStore | null>({
    value: settingsDraft,
    canSave: () => shortcutSettingsHaveChanges && !shortcutSettingsHaveConflict,
    errorMessage: settingsSaveErrorMessage,
    onChange: setSettingsDraft,
    onSaved: applySavedSettingsStore,
    persist: saveSettingsDraft,
  });
  const routes = useSaveableDraft<AppSettings, DesktopStore | null>({
    value: settingsDraft,
    canSave: () => providerRoutesHaveChanges,
    errorMessage: settingsSaveErrorMessage,
    onChange: setSettingsDraft,
    onSaved: applySavedSettingsStore,
    persist: saveSettingsDraft,
  });
  const providerDraftController = useSaveableDraft<ProviderDraft, boolean>({
    value: providerDraft,
    canSave: () => providerEditorActive && (selectedProviderId ? providerHasChanges : true),
    errorMessage: settingsSaveErrorMessage,
    onChange: updateProviderDraftValue,
    onSaved: keepSavedProviderState,
    persist: saveProviderDraftValue,
  });
  const { reset: resetProviderDraft } = providerDraftController;

  useEffect(() => {
    if (store.providers.length > 0) return;
    initialProviderSelectedRef.current = false;
    setSelectedProviderId(null);
    resetProviderDraft(localizedEmptyProvider());
    setProviderEditorActive(false);
    setTestState({ status: 'idle' });
  }, [resetProviderDraft, store.providers.length]);

  const selectProvider = useCallback(
    (provider: LlmProvider) => {
      setSelectedProviderId(provider.id);
      resetProviderDraft(provider);
      setProviderEditorActive(true);
      setTestState({ status: 'idle' });
    },
    [resetProviderDraft],
  );

  const createProvider = useCallback(() => {
    setSelectedProviderId(null);
    resetProviderDraft(localizedEmptyProvider());
    setProviderEditorActive(true);
    setTestState({ status: 'idle' });
  }, [resetProviderDraft]);

  useEffect(() => {
    if (initialProviderSelectedRef.current) return;
    const firstProvider = store.providers[0];
    if (!firstProvider) return;
    initialProviderSelectedRef.current = true;
    selectProvider(firstProvider);
  }, [selectProvider, store.providers]);

  const deleteProvider = useCallback(
    async (id: string) => {
      const patch = await actions.deleteProvider(id);
      const nextStore = applySettingsPatch(patch);
      setSettingsDraft(nextStore.settings);
      const nextProvider = nextStore.providers[0];
      if (nextProvider) selectProvider(nextProvider);
      if (!nextProvider) {
        setSelectedProviderId(null);
        resetProviderDraft(localizedEmptyProvider());
        setProviderEditorActive(false);
      }
    },
    [actions, applySettingsPatch, resetProviderDraft, selectProvider],
  );

  const testProvider = useCallback(
    async (provider: ProviderDraft) => {
      setTestState({ status: 'testing' });
      try {
        const result = await actions.testProvider(provider);
        setTestState({ status: result.ok ? 'success' : 'error' });
      } catch {
        setTestState({ status: 'error' });
      }
    },
    [actions],
  );

  const provider = useMemo(
    () => ({
      ...providerDraftController,
      create: createProvider,
      deleteProvider,
      select: selectProvider,
      selectedProviderId,
      test: testProvider,
      testState,
    }),
    [
      createProvider,
      deleteProvider,
      providerDraftController,
      selectProvider,
      selectedProviderId,
      testProvider,
      testState,
    ],
  );

  return { profile, general, shortcuts, provider, routes };
}

function localizedEmptyProvider(): ProviderDraft {
  if (!emptyProvider.presetId) return emptyProvider;
  return {
    ...emptyProvider,
    name: providerPresetDisplayName(emptyProvider.presetId, emptyProvider.name || 'Provider'),
  };
}

function syncUiLanguageCache(settings: AppSettings) {
  const language = normalizeUiLanguage(settings.uiLanguage);
  writeCachedUiLanguage(language);
  changeAppI18nLanguage(language);
}

function keepSavedProviderState(saved: boolean) {
  return saved;
}

function settingsSaveErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return i18next.t('settings.models.saveFailedWithMessage', {
      message: error.message,
      defaultValue: 'Save failed: {{message}}',
    });
  }
  return i18next.t('settings.models.saveFailed', { defaultValue: 'Save failed. Try again.' });
}
