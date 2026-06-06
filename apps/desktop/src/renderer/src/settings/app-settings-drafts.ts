import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, DesktopStore, LlmProvider } from '@yomitomo/shared';
import {
  normalizeLibraryContentSources,
  normalizeSelectionActionShortcutDraft,
  normalizeSelectionActionShortcuts,
  selectionActionShortcutsConflict,
} from '@yomitomo/shared';

import {
  defaultUser,
  emptyProvider,
  providerDraftHasChanges,
  userDraftHasChanges,
  type ProviderDraft,
  type UserDraft,
} from './app-settings';
import type { SaveState } from '../shell/app-types';

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
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(emptyProvider);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [providerEditorActive, setProviderEditorActive] = useState(false);
  const [testState, setTestState] = useState('');
  const [profileSaveState, setProfileSaveState] = useState<SaveState>('idle');
  const [generalSaveState, setGeneralSaveState] = useState<SaveState>('idle');
  const [shortcutSaveState, setShortcutSaveState] = useState<SaveState>('idle');
  const [providerSaveState, setProviderSaveState] = useState<SaveState>('idle');
  const [routeSaveState, setRouteSaveState] = useState<SaveState>('idle');
  const [profileSaveError, setProfileSaveError] = useState('');
  const [generalSaveError, setGeneralSaveError] = useState('');
  const [shortcutSaveError, setShortcutSaveError] = useState('');
  const [providerSaveError, setProviderSaveError] = useState('');
  const [routeSaveError, setRouteSaveError] = useState('');
  const initialProviderSelectedRef = useRef(false);

  const selectProvider = useCallback((provider: LlmProvider) => {
    setSelectedProviderId(provider.id);
    setProviderDraft(provider);
    setProviderEditorActive(true);
    setTestState('');
    setProviderSaveState('idle');
    setProviderSaveError('');
  }, []);

  const createProvider = useCallback(() => {
    setSelectedProviderId(null);
    setProviderDraft(emptyProvider);
    setProviderEditorActive(true);
    setTestState('');
    setProviderSaveState('idle');
    setProviderSaveError('');
  }, []);

  useEffect(() => {
    if (!storeSyncSnapshot) return;
    setUserDraft(storeSyncSnapshot.user);
    setSettingsDraft(storeSyncSnapshot.settings);
  }, [storeSyncSnapshot]);

  useEffect(() => {
    if (initialProviderSelectedRef.current) return;
    const firstProvider = store.providers[0];
    if (!firstProvider) return;
    initialProviderSelectedRef.current = true;
    selectProvider(firstProvider);
  }, [selectProvider, store.providers]);

  const userHasChanges = useMemo(
    () => userDraftHasChanges(userDraft, store.user),
    [store.user, userDraft],
  );
  const settingsHasChanges = useMemo(
    () =>
      Boolean(settingsDraft.saveArticleImages) !== Boolean(store.settings.saveArticleImages) ||
      libraryContentSourcesChanged(
        settingsDraft.libraryContentSources,
        store.settings.libraryContentSources,
      ),
    [
      settingsDraft.libraryContentSources,
      settingsDraft.saveArticleImages,
      store.settings.libraryContentSources,
      store.settings.saveArticleImages,
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
      (settingsDraft.assistantExecutionMode || 'fast_response') !==
        (store.settings.assistantExecutionMode || 'fast_response'),
    [
      settingsDraft.assistantExecutionMode,
      settingsDraft.readingAssistantProviderId,
      settingsDraft.reviewAssistantProviderId,
      store.settings.assistantExecutionMode,
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

  const canSaveProvider =
    providerEditorActive &&
    providerSaveState !== 'saving' &&
    (selectedProviderId ? providerHasChanges : true);
  const canSaveProviderRoutes = routeSaveState !== 'saving' && providerRoutesHaveChanges;
  const canSaveUser = profileSaveState !== 'saving' && userHasChanges;
  const canSaveGeneralSettings = generalSaveState !== 'saving' && settingsHasChanges;
  const canSaveShortcutSettings =
    shortcutSaveState !== 'saving' && shortcutSettingsHaveChanges && !shortcutSettingsHaveConflict;

  const updateUserDraft = useCallback((draft: UserDraft) => {
    setUserDraft(draft);
    setProfileSaveState('idle');
    setProfileSaveError('');
  }, []);

  const updateGeneralSettingsDraft = useCallback((draft: AppSettings) => {
    setSettingsDraft(draft);
    setGeneralSaveState('idle');
    setGeneralSaveError('');
  }, []);

  const updateShortcutSettingsDraft = useCallback((draft: AppSettings) => {
    setSettingsDraft(draft);
    setShortcutSaveState('idle');
    setShortcutSaveError('');
  }, []);

  const updateProviderDraft = useCallback((draft: ProviderDraft) => {
    setProviderDraft(draft);
    setTestState('');
    setProviderSaveState('idle');
    setProviderSaveError('');
  }, []);

  const updateProviderRoutesDraft = useCallback((draft: AppSettings) => {
    setSettingsDraft(draft);
    setRouteSaveState('idle');
    setRouteSaveError('');
  }, []);

  const saveProfileDraft = useCallback(async () => {
    if (!window.yomitomoDesktop || !userHasChanges) return false;
    setProfileSaveState('saving');
    try {
      const nextStore = await window.yomitomoDesktop.saveUser(userDraft);
      applyStore(nextStore);
      setUserDraft(nextStore.user);
      setProfileSaveState('saved');
      window.setTimeout(() => setProfileSaveState('idle'), 1200);
      return true;
    } catch (error) {
      setProfileSaveError(settingsSaveErrorMessage(error));
      setProfileSaveState('error');
      return false;
    }
  }, [applyStore, userDraft, userHasChanges]);

  const saveGeneralSettingsDraft = useCallback(
    async (draftOverride?: AppSettings) => {
      const draft = draftOverride || settingsDraft;
      if (!window.yomitomoDesktop || (!draftOverride && !settingsHasChanges)) return;
      setGeneralSaveState('saving');
      setGeneralSaveError('');
      try {
        const nextStore = await window.yomitomoDesktop.saveSettings(draft);
        applyStore(nextStore);
        setSettingsDraft(nextStore.settings);
        setGeneralSaveState('saved');
        window.setTimeout(() => setGeneralSaveState('idle'), 1200);
      } catch (error) {
        setGeneralSaveError(settingsSaveErrorMessage(error));
        setGeneralSaveState('error');
      }
    },
    [applyStore, settingsDraft, settingsHasChanges],
  );

  const saveShortcutSettingsDraft = useCallback(
    async (draftOverride?: AppSettings) => {
      const draft = draftOverride || settingsDraft;
      if (!window.yomitomoDesktop || (!draftOverride && !shortcutSettingsHaveChanges)) return;
      setShortcutSaveState('saving');
      setShortcutSaveError('');
      try {
        const nextStore = await window.yomitomoDesktop.saveSettings(draft);
        applyStore(nextStore);
        setSettingsDraft(nextStore.settings);
        setShortcutSaveState('saved');
        window.setTimeout(() => setShortcutSaveState('idle'), 1200);
      } catch (error) {
        setShortcutSaveError(settingsSaveErrorMessage(error));
        setShortcutSaveState('error');
      }
    },
    [applyStore, settingsDraft, shortcutSettingsHaveChanges],
  );

  const saveProviderDraft = useCallback(async () => {
    if (!window.yomitomoDesktop || !canSaveProvider) return false;
    setProviderSaveState('saving');
    try {
      const nextStore = await window.yomitomoDesktop.saveProvider(providerDraft);
      const savedProvider = providerDraft.id
        ? nextStore.providers.find((provider) => provider.id === providerDraft.id)
        : nextStore.providers.at(-1);
      applyStore(nextStore);
      setTestState('');
      if (savedProvider) {
        setSelectedProviderId(savedProvider.id);
        setProviderDraft(savedProvider);
        setProviderSaveState('saved');
        window.setTimeout(() => setProviderSaveState('idle'), 1200);
        return true;
      }
      setProviderSaveState('idle');
      return false;
    } catch (error) {
      setProviderSaveError(settingsSaveErrorMessage(error));
      setProviderSaveState('error');
      return false;
    }
  }, [applyStore, canSaveProvider, providerDraft]);

  const saveProviderRoutes = useCallback(
    async (draftOverride?: AppSettings) => {
      const draft = draftOverride || settingsDraft;
      if (!window.yomitomoDesktop || (!draftOverride && !canSaveProviderRoutes)) return;
      setRouteSaveState('saving');
      setRouteSaveError('');
      try {
        const nextStore = await window.yomitomoDesktop.saveSettings(draft);
        applyStore(nextStore);
        setSettingsDraft(nextStore.settings);
        setRouteSaveState('saved');
        window.setTimeout(() => setRouteSaveState('idle'), 1200);
      } catch (error) {
        setRouteSaveError(settingsSaveErrorMessage(error));
        setRouteSaveState('error');
      }
    },
    [applyStore, canSaveProviderRoutes, settingsDraft],
  );

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
        setProviderDraft(emptyProvider);
        setProviderEditorActive(false);
      }
    },
    [applyStore, selectProvider],
  );

  const testProvider = useCallback(async (provider: ProviderDraft) => {
    if (!window.yomitomoDesktop) return;
    setTestState('测试中...');
    const result = await window.yomitomoDesktop.testProvider(provider);
    setTestState(result.ok ? `连通成功：${result.message}` : `连通失败：${result.message}`);
  }, []);

  return {
    userDraft,
    settingsDraft,
    providerDraft,
    selectedProviderId,
    testState,
    profileSaveState,
    generalSaveState,
    shortcutSaveState,
    providerSaveState,
    routeSaveState,
    profileSaveError,
    generalSaveError,
    shortcutSaveError,
    providerSaveError,
    routeSaveError,
    canSaveUser,
    canSaveGeneralSettings,
    canSaveShortcutSettings,
    canSaveProvider,
    canSaveProviderRoutes,
    updateUserDraft,
    updateGeneralSettingsDraft,
    updateShortcutSettingsDraft,
    updateProviderDraft,
    updateProviderRoutesDraft,
    saveProfileDraft,
    saveGeneralSettingsDraft,
    saveShortcutSettingsDraft,
    selectProvider,
    createProvider,
    deleteProvider,
    saveProviderDraft,
    saveProviderRoutes,
    testProvider,
  };
}

function libraryContentSourcesChanged(left: unknown, right: unknown) {
  return (
    JSON.stringify(normalizeLibraryContentSources(left)) !==
    JSON.stringify(normalizeLibraryContentSources(right))
  );
}

function settingsSaveErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return `保存失败：${error.message}`;
  return '保存失败，请重试。';
}
