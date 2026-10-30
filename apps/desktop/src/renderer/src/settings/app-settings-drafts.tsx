import { createContext, useContext, type ReactNode } from 'react';
import i18next from 'i18next';
import { createStore, useStore, type StoreApi } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { ResolvedAppSettings, DesktopStore, LlmProvider } from '@yomitomo/shared';
import type { UserStorePatch } from '../../../ipc-contract';
import {
  normalizeSelectionActionShortcutDraft,
  selectionActionShortcutsConflict,
} from '@yomitomo/shared';
import { providerPresetDisplayName } from '../i18n/app-i18n-labels';

import {
  defaultUser,
  emptyProvider,
  providerDraftHasChanges,
  userAnnotationColors,
  userDraftHasChanges,
  type ProviderDraft,
  type ProviderTestState,
  type UserDraft,
} from './app-settings';
import {
  createDraftSaver,
  idleSaveStatus,
  type DraftSaver,
  type SaveableDraft,
  type SaveStatusState,
} from './settings-draft-saver';
import {
  mergeSavedSettingsDraftSection,
  settingsDraftSectionHasChanges,
  settingsDraftSectionPatch,
  type SettingsEditorSection,
} from './app-settings-change-detection';
import { getDesktopApi } from '../shell/app-desktop-api';
import {
  useDesktopStore,
  type DesktopStoreApi,
  type SettingsSyncSnapshot,
} from '../shell/app-desktop-store';
import { normalizeAppSettings } from '../../../settings/app-settings-normalization';

type DraftKey = 'profile' | 'general' | 'shortcuts' | 'routes' | 'provider';

type SettingsDraftActions = {
  createProvider: () => void;
  deleteProvider: (id: string) => Promise<void>;
  general: DraftSaver<ResolvedAppSettings, DesktopStore | null>;
  profile: DraftSaver<UserDraft, UserStorePatch | null>;
  provider: DraftSaver<ProviderDraft, LlmProvider | undefined>;
  resetFromSnapshot: (snapshot: SettingsSyncSnapshot) => void;
  routes: DraftSaver<ResolvedAppSettings, DesktopStore | null>;
  selectProvider: (provider: LlmProvider) => void;
  shortcuts: DraftSaver<ResolvedAppSettings, DesktopStore | null>;
  syncProviders: (providers: LlmProvider[], previousProviders: LlmProvider[]) => void;
  testProvider: (provider: ProviderDraft) => Promise<void>;
};

export type SettingsDraftState = {
  providerDraft: ProviderDraft;
  providerEditorActive: boolean;
  saves: Record<DraftKey, SaveStatusState>;
  selectedProviderId: string | null;
  settingsDraft: ResolvedAppSettings;
  testState: ProviderTestState;
  userDraft: UserDraft;
  actions: SettingsDraftActions;
};

export type SettingsDraftStoreApi = StoreApi<SettingsDraftState>;

const idleTestState: ProviderTestState = { status: 'idle' };

/**
 * Owns the editable copies of profile, settings, and provider forms for one window. The
 * desktop store's sync snapshot and provider list drive resets through actions.
 */
export function createSettingsDraftStore(desktopStore: DesktopStoreApi): SettingsDraftStoreApi {
  return createStore<SettingsDraftState>()((set, get) => {
    let providerEditor: symbol | undefined;
    let initialProviderSelected = false;
    const currentStore = () => desktopStore.getState().store;
    const setStatus = (key: DraftKey) => (status: SaveStatusState) =>
      set((state) => ({ saves: { ...state.saves, [key]: status } }));

    const profile = createDraftSaver<UserDraft, UserStorePatch | null>({
      errorMessage: settingsSaveErrorMessage,
      getValue: () => get().userDraft,
      hasChanges: () => {
        const store = currentStore();
        return Boolean(store && userDraftHasChanges(get().userDraft, store.user));
      },
      onSaved: (patch) => {
        if (!patch) return false;
        set({ userDraft: patch.user });
        return true;
      },
      persist: async (draft) => {
        const patch = await getDesktopApi().store.saveUser(draft);
        if (patch) desktopStore.getState().applySettingsPatch(patch);
        return patch;
      },
      setStatus: setStatus('profile'),
      setValue: (userDraft) => set({ userDraft }),
    });

    function settingsSectionSaver(
      section: SettingsEditorSection,
      key: DraftKey,
      canSave: (settings: ResolvedAppSettings) => boolean = () => true,
    ) {
      return createDraftSaver<ResolvedAppSettings, DesktopStore | null>({
        errorMessage: settingsSaveErrorMessage,
        getValue: () => get().settingsDraft,
        hasChanges: () => {
          const store = currentStore();
          const draft = get().settingsDraft;
          return Boolean(
            store &&
            settingsDraftSectionHasChanges(section, draft, store.settings) &&
            canSave(draft),
          );
        },
        onSaved: (nextStore) => {
          if (!nextStore) return false;
          set((state) => ({
            settingsDraft: mergeSavedSettingsDraftSection(
              section,
              state.settingsDraft,
              nextStore.settings,
            ),
          }));
          return true;
        },
        persist: async (draft) => {
          const nextStore = await getDesktopApi().store.saveSettings(
            settingsDraftSectionPatch(section, draft),
          );
          if (nextStore) desktopStore.getState().applyStore(nextStore);
          return nextStore;
        },
        setStatus: setStatus(key),
        setValue: (settingsDraft) => set({ settingsDraft }),
      });
    }

    const provider = createDraftSaver<ProviderDraft, LlmProvider | undefined>({
      errorMessage: settingsSaveErrorMessage,
      getValue: () => get().providerDraft,
      hasChanges: () => {
        const { providerDraft, providerEditorActive, selectedProviderId } = get();
        if (!providerEditorActive) return false;
        if (!selectedProviderId) return true;
        const selected = currentStore()?.providers.find(({ id }) => id === selectedProviderId);
        return providerDraftHasChanges(providerDraft, selected || null);
      },
      onSaved: (savedProvider) => {
        if (!savedProvider) return false;
        set({
          providerDraft: savedProvider,
          selectedProviderId: savedProvider.id,
          testState: idleTestState,
        });
        return true;
      },
      persist: async (draft) => {
        const editor = providerEditor;
        const patch = await getDesktopApi().provider.save(draft);
        const nextStore = desktopStore.getState().applySettingsPatch(patch);
        const savedProvider = draft.id
          ? nextStore.providers.find(({ id }) => id === draft.id)
          : nextStore.providers.at(-1);
        if (savedProvider && !draft.id && providerEditor === editor) {
          // Keep the newly assigned identity even when edits invalidate the saved draft.
          set((state) => ({
            providerDraft: { ...state.providerDraft, id: savedProvider.id },
            selectedProviderId: savedProvider.id,
          }));
        }
        return savedProvider;
      },
      setStatus: setStatus('provider'),
      setValue: (providerDraft) => set({ providerDraft, testState: idleTestState }),
    });

    function openProviderEditor(selectedProviderId: string | null, draft: ProviderDraft) {
      providerEditor = Symbol();
      set({ providerEditorActive: true, selectedProviderId });
      provider.update(draft);
    }

    function selectProvider(selected: LlmProvider) {
      openProviderEditor(selected.id, selected);
    }

    function closeProviderEditor() {
      providerEditor = undefined;
      set({ providerEditorActive: false, selectedProviderId: null });
      provider.update(localizedEmptyProvider());
    }

    const general = settingsSectionSaver('general', 'general');
    const shortcuts = settingsSectionSaver(
      'shortcuts',
      'shortcuts',
      (draft) =>
        !selectionActionShortcutsConflict(
          normalizeSelectionActionShortcutDraft(draft.selectionActionShortcuts),
        ),
    );
    const routes = settingsSectionSaver('routes', 'routes');

    return {
      providerDraft: localizedEmptyProvider(),
      providerEditorActive: false,
      saves: {
        general: idleSaveStatus,
        profile: idleSaveStatus,
        provider: idleSaveStatus,
        routes: idleSaveStatus,
        shortcuts: idleSaveStatus,
      },
      selectedProviderId: null,
      settingsDraft: normalizeAppSettings(undefined),
      testState: idleTestState,
      userDraft: defaultUser,
      actions: {
        createProvider: () => openProviderEditor(null, localizedEmptyProvider()),
        deleteProvider: async (id) => {
          const patch = await getDesktopApi().provider.delete(id);
          const nextStore = desktopStore.getState().applySettingsPatch(patch);
          set({ settingsDraft: nextStore.settings });
          const nextProvider = nextStore.providers[0];
          if (nextProvider) selectProvider(nextProvider);
          else closeProviderEditor();
        },
        general,
        profile,
        provider,
        resetFromSnapshot: (snapshot) => {
          profile.update(profileDraftFromUser(snapshot.user));
          general.update(snapshot.settings);
          shortcuts.update(snapshot.settings);
          routes.update(snapshot.settings);
        },
        routes,
        selectProvider,
        shortcuts,
        syncProviders: (providers, previousProviders) => {
          if (providers.length === 0) {
            if (previousProviders.length === 0) return;
            initialProviderSelected = false;
            closeProviderEditor();
            return;
          }
          if (initialProviderSelected || get().providerEditorActive) return;
          initialProviderSelected = true;
          selectProvider(providers[0]);
        },
        testProvider: async (draft) => {
          set({ testState: { status: 'testing' } });
          try {
            const result = await getDesktopApi().provider.test(draft);
            set({ testState: { status: result.ok ? 'success' : 'error' } });
          } catch {
            set({ testState: { status: 'error' } });
          }
        },
      },
    };
  });
}

const SettingsDraftStoreContext = createContext<SettingsDraftStoreApi | null>(null);

export function SettingsDraftStoreProvider({
  store,
  children,
}: {
  store: SettingsDraftStoreApi;
  children: ReactNode;
}) {
  return <SettingsDraftStoreContext value={store}>{children}</SettingsDraftStoreContext>;
}

export function useSettingsDrafts() {
  const draftStore = useContext(SettingsDraftStoreContext);
  if (!draftStore) throw new Error('SettingsDraftStoreProvider is missing');
  // canSave compares drafts with the desktop store, so store updates must rerender the form.
  useDesktopStore((state) => state.store);
  const state = useStore(
    draftStore,
    useShallow(({ actions: _actions, ...draftState }: SettingsDraftState) => draftState),
  );
  return settingsDraftsView({ ...state, actions: draftStore.getState().actions });
}

/** Builds the form-facing draft controllers; `canSave` reads the current desktop store. */
export function settingsDraftsView(state: SettingsDraftState) {
  const { actions, saves } = state;
  function draft<TValue, TResult>(
    saver: DraftSaver<TValue, TResult>,
    key: DraftKey,
    value: TValue,
  ): SaveableDraft<TValue, TResult> {
    return {
      canSave: saver.canSave(),
      reset: saver.update,
      save: saver.save,
      saveError: saves[key].saveError,
      saveState: saves[key].saveState,
      update: saver.update,
      value,
    };
  }

  return {
    general: draft(actions.general, 'general', state.settingsDraft),
    profile: draft(actions.profile, 'profile', state.userDraft),
    provider: {
      ...draft(actions.provider, 'provider', state.providerDraft),
      create: actions.createProvider,
      deleteProvider: actions.deleteProvider,
      select: actions.selectProvider,
      selectedProviderId: state.selectedProviderId,
      test: actions.testProvider,
      testState: state.testState,
    },
    routes: draft(actions.routes, 'routes', state.settingsDraft),
    shortcuts: draft(actions.shortcuts, 'shortcuts', state.settingsDraft),
  };
}

// The profile dialog only offers userAnnotationColors; a profile saved with an older color
// starts its draft on the first allowed one.
function profileDraftFromUser(user: UserDraft): UserDraft {
  if (!user.annotationColor || userAnnotationColors.includes(user.annotationColor)) return user;
  return { ...user, annotationColor: userAnnotationColors[0] };
}

function localizedEmptyProvider(): ProviderDraft {
  if (!emptyProvider.presetId) return emptyProvider;
  return {
    ...emptyProvider,
    name: providerPresetDisplayName(emptyProvider.presetId, emptyProvider.name || 'Provider'),
  };
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
