import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import i18next from 'i18next';
import type { AppSettings, DesktopStore, LlmProvider } from '@yomitomo/shared';
import {
  normalizeUiLanguage,
  normalizeLibraryContentSources,
  normalizeSelectionActionShortcutDraft,
  normalizeSelectionActionShortcuts,
  normalizeSoundEffectsVolume,
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

type UseSettingsDraftsInput = {
  store: DesktopStore;
  storeSyncSnapshot: DesktopStore | null;
  applyStore: (nextStore: DesktopStore) => DesktopStore;
};

export function useSettingsDrafts({
  store,
  storeSyncSnapshot,
  applyStore,
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
    () =>
      normalizeUiLanguage(settingsDraft.uiLanguage) !==
        normalizeUiLanguage(store.settings.uiLanguage) ||
      (settingsDraft.soundEffectsEnabled ?? true) !==
        (store.settings.soundEffectsEnabled ?? true) ||
      normalizeSoundEffectsVolume(settingsDraft.soundEffectsVolume) !==
        normalizeSoundEffectsVolume(store.settings.soundEffectsVolume) ||
      (settingsDraft.bilingualTranslationTargetLanguage || 'zh-CN') !==
        (store.settings.bilingualTranslationTargetLanguage || 'zh-CN') ||
      (settingsDraft.bilingualTranslationStyle || 'dashedLine') !==
        (store.settings.bilingualTranslationStyle || 'dashedLine') ||
      Boolean(settingsDraft.bilingualTranslationAiContextAware) !==
        Boolean(store.settings.bilingualTranslationAiContextAware) ||
      Boolean(settingsDraft.saveArticleImages) !== Boolean(store.settings.saveArticleImages) ||
      Boolean(settingsDraft.appLockLockOnStartup) !==
        Boolean(store.settings.appLockLockOnStartup) ||
      libraryContentSourcesChanged(
        settingsDraft.libraryContentSources,
        store.settings.libraryContentSources,
      ),
    [
      settingsDraft.libraryContentSources,
      settingsDraft.bilingualTranslationAiContextAware,
      settingsDraft.bilingualTranslationStyle,
      settingsDraft.bilingualTranslationTargetLanguage,
      settingsDraft.appLockLockOnStartup,
      settingsDraft.saveArticleImages,
      settingsDraft.soundEffectsEnabled,
      settingsDraft.soundEffectsVolume,
      settingsDraft.uiLanguage,
      store.settings.libraryContentSources,
      store.settings.bilingualTranslationAiContextAware,
      store.settings.bilingualTranslationStyle,
      store.settings.bilingualTranslationTargetLanguage,
      store.settings.appLockLockOnStartup,
      store.settings.saveArticleImages,
      store.settings.soundEffectsEnabled,
      store.settings.soundEffectsVolume,
      store.settings.uiLanguage,
    ],
  );
  const draftSelectionActionShortcuts = useMemo(
    () => normalizeSelectionActionShortcutDraft(settingsDraft.selectionActionShortcuts),
    [settingsDraft.selectionActionShortcuts],
  );
  const savedSelectionActionShortcuts = useMemo(
    () => normalizeSelectionActionShortcuts(store.settings.selectionActionShortcuts),
    [store.settings.selectionActionShortcuts],
  );
  const shortcutSettingsHaveConflict = useMemo(
    () => selectionActionShortcutsConflict(draftSelectionActionShortcuts),
    [draftSelectionActionShortcuts],
  );
  const shortcutSettingsHaveChanges = useMemo(
    () =>
      (settingsDraft.messageSendShortcut || 'enter') !==
        (store.settings.messageSendShortcut || 'enter') ||
      draftSelectionActionShortcuts.copy !== savedSelectionActionShortcuts.copy ||
      draftSelectionActionShortcuts.annotate !== savedSelectionActionShortcuts.annotate ||
      draftSelectionActionShortcuts.ask !== savedSelectionActionShortcuts.ask,
    [
      draftSelectionActionShortcuts.annotate,
      draftSelectionActionShortcuts.ask,
      draftSelectionActionShortcuts.copy,
      savedSelectionActionShortcuts.annotate,
      savedSelectionActionShortcuts.ask,
      savedSelectionActionShortcuts.copy,
      settingsDraft.messageSendShortcut,
      store.settings.messageSendShortcut,
    ],
  );
  const providerRoutesHaveChanges = useMemo(
    () =>
      (settingsDraft.readingAssistantProviderId || '') !==
        (store.settings.readingAssistantProviderId || '') ||
      (settingsDraft.reviewAssistantProviderId || '') !==
        (store.settings.reviewAssistantProviderId || '') ||
      (settingsDraft.bilingualTranslationProviderId || '') !==
        (store.settings.bilingualTranslationProviderId || '') ||
      (settingsDraft.assistantExecutionMode || 'fast_response') !==
        (store.settings.assistantExecutionMode || 'fast_response'),
    [
      settingsDraft.assistantExecutionMode,
      settingsDraft.bilingualTranslationProviderId,
      settingsDraft.readingAssistantProviderId,
      settingsDraft.reviewAssistantProviderId,
      store.settings.assistantExecutionMode,
      store.settings.bilingualTranslationProviderId,
      store.settings.readingAssistantProviderId,
      store.settings.reviewAssistantProviderId,
    ],
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

  const saveUserDraft = useCallback(async (draft: UserDraft) => {
    if (!window.yomitomoDesktop) return null;
    return window.yomitomoDesktop.saveUser(draft);
  }, []);

  const applySavedUserStore = useCallback(
    (nextStore: DesktopStore | null) => {
      if (!nextStore) return false;
      applyStore(nextStore);
      setUserDraft(nextStore.user);
      return true;
    },
    [applyStore],
  );

  const saveSettingsDraft = useCallback(async (draft: AppSettings) => {
    if (!window.yomitomoDesktop) return null;
    return window.yomitomoDesktop.saveSettings(draft);
  }, []);

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
      if (!window.yomitomoDesktop) return false;
      const nextStore = await window.yomitomoDesktop.saveProvider(draft);
      const savedProvider = draft.id
        ? nextStore.providers.find((provider) => provider.id === draft.id)
        : nextStore.providers.at(-1);
      applyStore(nextStore);
      setTestState({ status: 'idle' });
      if (!savedProvider) return false;
      setSelectedProviderId(savedProvider.id);
      setProviderDraft(savedProvider);
      return true;
    },
    [applyStore],
  );

  const profile = useSaveableDraft<UserDraft, DesktopStore | null>({
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
      if (!window.yomitomoDesktop) return;
      const nextStore = await window.yomitomoDesktop.deleteProvider(id);
      applyStore(nextStore);
      setSettingsDraft(nextStore.settings);
      const nextProvider = nextStore.providers[0];
      if (nextProvider) selectProvider(nextProvider);
      if (!nextProvider) {
        setSelectedProviderId(null);
        resetProviderDraft(localizedEmptyProvider());
        setProviderEditorActive(false);
      }
    },
    [applyStore, resetProviderDraft, selectProvider],
  );

  const testProvider = useCallback(async (provider: ProviderDraft) => {
    if (!window.yomitomoDesktop) return;
    setTestState({ status: 'testing' });
    try {
      const result = await window.yomitomoDesktop.testProvider(provider);
      setTestState({ status: result.ok ? 'success' : 'error' });
    } catch {
      setTestState({ status: 'error' });
    }
  }, []);

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

function libraryContentSourcesChanged(left: unknown, right: unknown) {
  return (
    JSON.stringify(normalizeLibraryContentSources(left)) !==
    JSON.stringify(normalizeLibraryContentSources(right))
  );
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
