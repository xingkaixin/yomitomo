import { createContext, useContext, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { ArticleSummaryRecord } from '@yomitomo/shared';
import type { AppMenuCommand } from '../../../app-menu-types';
import type { WeReadState } from '../../../ipc-contract';
import type { SettingsSectionKey } from '../settings/app-settings-panels';
import type { DesktopStoreApi } from './app-desktop-store';
import { getDesktopApi } from './app-desktop-api';
import { elementDialogSourceRect, type DialogSourceRect } from './app-dialog-transition';
import type { ReadingEvidenceSourceTarget } from './app-reading-types';
import { preloadEntries } from './app-secondary-module-preload';
import {
  recordStartupTiming,
  recordStatsTiming,
  rendererPerformanceElapsedMs,
} from './app-renderer-performance';
import {
  createLibraryQuerySessionState,
  libraryQuerySessionReducer,
  type LibraryQuerySessionEvent,
  type LibraryQuerySessionState,
} from '../reading-library/library-query-session';
import { syncWeReadLibraryState } from '../reading-library/use-weread-library-session';

export type AppSurfaceKey = 'agents' | 'reading-memory' | 'library' | 'settings' | 'stats';

export type LibraryImportDialogKind = 'article' | 'ebook' | 'pdf' | 'text';

export type LibraryView = {
  showHome: () => void;
  receiveWeReadState: (state: WeReadState) => void;
};

type AppNavigationState =
  | {
      importDialog: LibraryImportDialogKind | null;
      pendingOpenArticle: ReadingEvidenceSourceTarget | null;
      readerOpen: boolean;
      surface: 'library';
    }
  | {
      surface: Exclude<AppSurfaceKey, 'library'>;
    };

type AppNavigationEvent =
  | { type: 'article-opened' }
  | { type: 'import-dialog-closed' }
  | { type: 'import-dialog-opened'; kind: LibraryImportDialogKind }
  | { type: 'open-article'; target: ReadingEvidenceSourceTarget }
  | { type: 'open-surface'; surface: AppSurfaceKey }
  | { type: 'reset-transients' }
  | { type: 'set-reader-open'; open: boolean };

const initialNavigation: AppNavigationState = {
  importDialog: null,
  pendingOpenArticle: null,
  readerOpen: false,
  surface: 'library',
};

export function appNavigationReducer(
  state: AppNavigationState,
  event: AppNavigationEvent,
): AppNavigationState {
  switch (event.type) {
    case 'open-surface':
      if (event.surface === 'library') {
        return state.surface === 'library' ? state : initialNavigation;
      }
      return { surface: event.surface };
    case 'set-reader-open':
      if (state.surface !== 'library' || state.readerOpen === event.open) return state;
      return event.open
        ? { ...state, importDialog: null, readerOpen: true }
        : { ...state, readerOpen: false };
    case 'import-dialog-opened':
      return state.surface === 'library' ? { ...state, importDialog: event.kind } : state;
    case 'import-dialog-closed':
      return state.surface === 'library' && state.importDialog
        ? { ...state, importDialog: null }
        : state;
    case 'open-article':
      return {
        importDialog: null,
        pendingOpenArticle: event.target,
        readerOpen: false,
        surface: 'library',
      };
    case 'article-opened':
      return state.surface === 'library' ? { ...state, pendingOpenArticle: null } : state;
    case 'reset-transients':
      return state.surface === 'library' ? initialNavigation : state;
  }
}

const libraryImportMenuCommands: Partial<Record<AppMenuCommand, LibraryImportDialogKind>> = {
  'import-ebook': 'ebook',
  'import-pdf': 'pdf',
  'import-web': 'article',
};

export type AppSessionActions = {
  changeSettingsSection: (section: SettingsSectionKey) => void;
  closeLibraryImport: () => void;
  closeProfileDialog: () => void;
  completeOnboarding: () => void;
  dispatchLibraryQuery: (event: LibraryQuerySessionEvent) => void;
  openAgents: () => void;
  openEvidenceSource: (target: ReadingEvidenceSourceTarget) => void;
  openLibrary: () => void;
  openLibraryImport: (kind: LibraryImportDialogKind) => void;
  openProfileDialog: (sourceElement?: Element) => void;
  openReadingMemory: () => void;
  openSettings: () => void;
  openSettingsSection: (section: SettingsSectionKey) => void;
  openStats: () => Promise<void>;
  refreshStatsArticles: () => void;
  registerLibraryView: (view: LibraryView) => () => void;
  requestUpdateDialog: () => void;
  resetForLock: () => void;
  runMenuCommand: (command: AppMenuCommand) => void;
  setLibraryImportBusy: (busy: boolean) => void;
  setPendingArticleOpened: () => void;
  setReaderOpen: (open: boolean) => void;
  setThemeDialogOpen: (open: boolean) => void;
  startOnboarding: () => void;
  syncWeReadLibrary: () => Promise<void>;
};

export type AppSessionState = {
  libraryQuery: LibraryQuerySessionState;
  navigation: AppNavigationState;
  requestedSettingsSection: SettingsSectionKey;
  onboardingForced: boolean;
  onboardingFlowKey: number;
  statsArticles: ArticleSummaryRecord[] | null;
  statsNavigationStartedAt: number | undefined;
  profileDialogOpen: boolean;
  profileDialogSourceRect: DialogSourceRect | undefined;
  themeDialogOpen: boolean;
  updateDialogRequest: number;
  weReadLibrarySyncing: boolean;
  actions: AppSessionActions;
};

export type AppSessionStoreApi = StoreApi<AppSessionState>;

/**
 * Owns the desktop session: which surface is showing, how navigation and menu commands
 * route into it, and what a lock resets. The root view only picks a surface and renders.
 */
export function createAppSessionStore(desktopStore: DesktopStoreApi): AppSessionStoreApi {
  return createStore<AppSessionState>()((set, get) => {
    let libraryImportBusy = false;
    let libraryView: LibraryView | null = null;
    const navigate = (event: AppNavigationEvent) =>
      set((state) => ({ navigation: appNavigationReducer(state.navigation, event) }));
    const storeArticles = () => desktopStore.getState().store?.articles ?? [];
    const developerModeEnabled = () =>
      Boolean(desktopStore.getState().store?.settings.developerModeEnabled);

    async function refreshStatsArticles() {
      try {
        set({ statsArticles: await getDesktopApi().article.readStatsSummaries() });
      } catch {
        set({ statsArticles: storeArticles() });
      }
    }

    function openSettings() {
      recordStartupTiming('secondary_modules.navigation', {
        key: 'settings',
        settingsPanelsStatus: preloadEntries.settingsPanels.status,
        settingsProviderStatus: preloadEntries.settingsProvider.status,
        settingsAboutStatus: preloadEntries.settingsAbout.status,
      });
      navigate({ type: 'open-surface', surface: 'settings' });
    }

    function changeSettingsSection(section: SettingsSectionKey) {
      if (!developerModeEnabled() && section === 'aiTrace') {
        set({ requestedSettingsSection: 'about' });
        return;
      }
      recordStartupTiming('secondary_modules.settings_section_change', {
        section,
        settingsPanelsStatus: preloadEntries.settingsPanels.status,
        settingsProviderStatus: preloadEntries.settingsProvider.status,
        settingsAboutStatus: preloadEntries.settingsAbout.status,
      });
      set({ requestedSettingsSection: section });
    }

    function openSettingsSection(section: SettingsSectionKey) {
      openSettings();
      changeSettingsSection(section);
    }

    async function openStats() {
      set({ statsNavigationStartedAt: performance.now() });
      recordStatsTiming('navigation_click', {
        articleCount: get().statsArticles?.length ?? storeArticles().length,
        rendererElapsedMs: rendererPerformanceElapsedMs(0),
        preloadStatus: preloadEntries.stats.status,
      });
      navigate({ type: 'open-surface', surface: 'stats' });
      await refreshStatsArticles();
    }

    function openLibraryImport(kind: LibraryImportDialogKind) {
      if (libraryImportBusy) return;
      navigate({ type: 'import-dialog-opened', kind });
    }

    async function syncWeReadLibrary() {
      set({ weReadLibrarySyncing: true });
      const state = await syncWeReadLibraryState();
      set({ weReadLibrarySyncing: false });
      if (state) libraryView?.receiveWeReadState(state);
    }

    function runMenuCommand(command: AppMenuCommand) {
      if (command === 'open-settings') return openSettings();
      if (command === 'open-about') return openSettingsSection('about');
      if (command === 'backup-database') {
        void getDesktopApi()
          .data.backupDatabase()
          .catch(() => undefined);
        return;
      }
      if (command === 'restore-database') {
        void getDesktopApi()
          .data.restoreDatabase()
          .then((result) => {
            if (!result.canceled) desktopStore.getState().applyStore(result.store);
          })
          .catch(() => undefined);
        return;
      }
      if (command === 'check-updates') {
        void getDesktopApi()
          .updates.check()
          .catch(() => undefined);
        return;
      }
      const importKind = libraryImportMenuCommands[command];
      if (importKind) {
        navigate({ type: 'open-surface', surface: 'library' });
        libraryView?.showHome();
        openLibraryImport(importKind);
        return;
      }
      if (command === 'sync-weread') {
        navigate({ type: 'open-surface', surface: 'library' });
        void syncWeReadLibrary();
      }
    }

    return {
      libraryQuery: createLibraryQuerySessionState({
        activeCollectionId: null,
        pageSize: 12,
        searchQuery: '',
        selectedTypes: new Set(),
      }),
      navigation: initialNavigation,
      requestedSettingsSection: 'collection',
      onboardingForced: false,
      onboardingFlowKey: 0,
      statsArticles: null,
      statsNavigationStartedAt: undefined,
      profileDialogOpen: false,
      profileDialogSourceRect: undefined,
      themeDialogOpen: false,
      updateDialogRequest: 0,
      weReadLibrarySyncing: false,
      actions: {
        changeSettingsSection,
        closeLibraryImport: () => {
          if (!libraryImportBusy) navigate({ type: 'import-dialog-closed' });
        },
        closeProfileDialog: () => set({ profileDialogOpen: false }),
        completeOnboarding: () => set({ onboardingForced: false }),
        dispatchLibraryQuery: (event) =>
          set((state) => {
            const libraryQuery = libraryQuerySessionReducer(state.libraryQuery, event);
            return libraryQuery === state.libraryQuery ? state : { libraryQuery };
          }),
        openAgents: () => {
          recordStartupTiming('secondary_modules.navigation', {
            key: 'agents',
            status: preloadEntries.agents.status,
          });
          navigate({ type: 'open-surface', surface: 'agents' });
        },
        openEvidenceSource: (target) => navigate({ type: 'open-article', target }),
        openLibrary: () => navigate({ type: 'open-surface', surface: 'library' }),
        openLibraryImport,
        openProfileDialog: (sourceElement) => {
          recordStartupTiming('secondary_modules.navigation', {
            key: 'profile-dialog',
            status: preloadEntries.profileDialog.status,
          });
          set({
            profileDialogOpen: true,
            profileDialogSourceRect: sourceElement
              ? elementDialogSourceRect(sourceElement)
              : undefined,
          });
        },
        openReadingMemory: () => navigate({ type: 'open-surface', surface: 'reading-memory' }),
        openSettings,
        openSettingsSection,
        openStats,
        refreshStatsArticles: () => void refreshStatsArticles(),
        registerLibraryView: (view) => {
          libraryView = view;
          return () => {
            if (libraryView === view) libraryView = null;
          };
        },
        requestUpdateDialog: () => {
          openSettingsSection('about');
          set((state) => ({ updateDialogRequest: state.updateDialogRequest + 1 }));
        },
        resetForLock: () => {
          navigate({ type: 'reset-transients' });
          set({
            profileDialogOpen: false,
            profileDialogSourceRect: undefined,
            statsArticles: null,
            statsNavigationStartedAt: undefined,
            themeDialogOpen: false,
          });
        },
        runMenuCommand,
        setLibraryImportBusy: (busy) => {
          libraryImportBusy = busy;
        },
        setPendingArticleOpened: () => navigate({ type: 'article-opened' }),
        setReaderOpen: (open) => navigate({ type: 'set-reader-open', open }),
        setThemeDialogOpen: (themeDialogOpen) => set({ themeDialogOpen }),
        startOnboarding: () =>
          set((state) => ({
            onboardingForced: true,
            onboardingFlowKey: state.onboardingFlowKey + 1,
          })),
        syncWeReadLibrary,
      },
    };
  });
}

const AppSessionStoreContext = createContext<AppSessionStoreApi | null>(null);

export function AppSessionStoreProvider({
  store,
  children,
}: {
  store: AppSessionStoreApi;
  children: ReactNode;
}) {
  return <AppSessionStoreContext value={store}>{children}</AppSessionStoreContext>;
}

export function useAppSessionStoreApi() {
  const store = useContext(AppSessionStoreContext);
  if (!store) throw new Error('AppSessionStoreProvider is missing');
  return store;
}

export function useAppSession(input: {
  appLocked: boolean;
  developerModeEnabled: boolean;
  onboardingCompletedAt?: string;
}) {
  const sessionStore = useAppSessionStoreApi();
  const state = useStore(
    sessionStore,
    useShallow(
      ({ actions: _actions, libraryQuery: _libraryQuery, ...sessionState }: AppSessionState) =>
        sessionState,
    ),
  );
  const { navigation } = state;

  return {
    onboardingFlowKey: state.onboardingFlowKey,
    pendingOpenArticle: navigation.surface === 'library' ? navigation.pendingOpenArticle : null,
    profileDialogOpen: state.profileDialogOpen,
    profileDialogSourceRect: state.profileDialogSourceRect,
    readerOpen: navigation.surface === 'library' && navigation.readerOpen,
    settingsSection: visibleSettingsSection(
      state.requestedSettingsSection,
      input.developerModeEnabled,
    ),
    showOnboarding: !input.appLocked && (state.onboardingForced || !input.onboardingCompletedAt),
    statsArticles: state.statsArticles,
    statsNavigationStartedAt: state.statsNavigationStartedAt,
    surface: navigation.surface,
    themeDialogOpen: state.themeDialogOpen,
    updateDialogRequest: state.updateDialogRequest,
    actions: sessionStore.getState().actions,
  };
}

export function useLibrarySession() {
  const sessionStore = useAppSessionStoreApi();
  const state = useStore(
    sessionStore,
    useShallow(({ navigation, weReadLibrarySyncing }: AppSessionState) => ({
      importDialog: navigation.surface === 'library' ? navigation.importDialog : null,
      weReadSyncing: weReadLibrarySyncing,
    })),
  );
  return { ...state, actions: sessionStore.getState().actions };
}

function visibleSettingsSection(section: SettingsSectionKey, developerModeEnabled: boolean) {
  return !developerModeEnabled && section === 'aiTrace' ? 'about' : section;
}
