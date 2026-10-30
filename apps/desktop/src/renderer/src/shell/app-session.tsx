import { createContext, useContext, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { ArticleSummaryRecord } from '@yomitomo/shared';
import type { AppMenuCommand, AppMenuCommandRequest } from '../../../app-menu-types';
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
import { useLibraryQueryState } from '../reading-library/use-library-query-state';

export type AppSurfaceKey = 'agents' | 'reading-memory' | 'library' | 'settings' | 'stats';

type AppNavigationState =
  | {
      pendingOpenArticle: ReadingEvidenceSourceTarget | null;
      readerOpen: boolean;
      surface: 'library';
    }
  | {
      surface: Exclude<AppSurfaceKey, 'library'>;
    };

type AppNavigationEvent =
  | { type: 'article-opened' }
  | { type: 'open-article'; target: ReadingEvidenceSourceTarget }
  | { type: 'open-surface'; surface: AppSurfaceKey }
  | { type: 'reset-transients' }
  | { type: 'set-reader-open'; open: boolean };

const initialNavigation: AppNavigationState = {
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
      return state.surface === 'library' && state.readerOpen !== event.open
        ? { ...state, readerOpen: event.open }
        : state;
    case 'open-article':
      return {
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

const libraryMenuCommands = new Set<AppMenuCommand>([
  'import-web',
  'import-ebook',
  'import-pdf',
  'sync-weread',
]);

export type AppSessionActions = {
  changeSettingsSection: (section: SettingsSectionKey) => void;
  closeProfileDialog: () => void;
  completeOnboarding: () => void;
  openAgents: () => void;
  openEvidenceSource: (target: ReadingEvidenceSourceTarget) => void;
  openLibrary: () => void;
  openProfileDialog: (sourceElement?: Element) => void;
  openReadingMemory: () => void;
  openSettings: () => void;
  openSettingsSection: (section: SettingsSectionKey) => void;
  openStats: () => Promise<void>;
  refreshStatsArticles: () => void;
  requestUpdateDialog: () => void;
  resetForLock: () => void;
  runMenuCommand: (command: AppMenuCommand) => void;
  setPendingArticleOpened: () => void;
  setReaderOpen: (open: boolean) => void;
  setThemeDialogOpen: (open: boolean) => void;
  startOnboarding: () => void;
};

export type AppSessionState = {
  navigation: AppNavigationState;
  requestedSettingsSection: SettingsSectionKey;
  menuRequest: AppMenuCommandRequest | null;
  onboardingForced: boolean;
  onboardingFlowKey: number;
  statsArticles: ArticleSummaryRecord[] | null;
  statsNavigationStartedAt: number | undefined;
  profileDialogOpen: boolean;
  profileDialogSourceRect: DialogSourceRect | undefined;
  themeDialogOpen: boolean;
  updateDialogRequest: number;
  actions: AppSessionActions;
};

export type AppSessionStoreApi = StoreApi<AppSessionState>;

/**
 * Owns the desktop session: which surface is showing, how navigation and menu commands
 * route into it, and what a lock resets. The root view only picks a surface and renders.
 */
export function createAppSessionStore(desktopStore: DesktopStoreApi): AppSessionStoreApi {
  return createStore<AppSessionState>()((set, get) => {
    let menuRequestId = 0;
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
      if (libraryMenuCommands.has(command)) {
        navigate({ type: 'open-surface', surface: 'library' });
        menuRequestId += 1;
        set({ menuRequest: { command, id: menuRequestId } });
      }
    }

    return {
      navigation: initialNavigation,
      requestedSettingsSection: 'collection',
      menuRequest: null,
      onboardingForced: false,
      onboardingFlowKey: 0,
      statsArticles: null,
      statsNavigationStartedAt: undefined,
      profileDialogOpen: false,
      profileDialogSourceRect: undefined,
      themeDialogOpen: false,
      updateDialogRequest: 0,
      actions: {
        changeSettingsSection,
        closeProfileDialog: () => set({ profileDialogOpen: false }),
        completeOnboarding: () => set({ onboardingForced: false }),
        openAgents: () => {
          recordStartupTiming('secondary_modules.navigation', {
            key: 'agents',
            status: preloadEntries.agents.status,
          });
          navigate({ type: 'open-surface', surface: 'agents' });
        },
        openEvidenceSource: (target) => navigate({ type: 'open-article', target }),
        openLibrary: () => navigate({ type: 'open-surface', surface: 'library' }),
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
        setPendingArticleOpened: () => navigate({ type: 'article-opened' }),
        setReaderOpen: (open) => navigate({ type: 'set-reader-open', open }),
        setThemeDialogOpen: (themeDialogOpen) => set({ themeDialogOpen }),
        startOnboarding: () =>
          set((state) => ({
            onboardingForced: true,
            onboardingFlowKey: state.onboardingFlowKey + 1,
          })),
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

function useAppSessionStoreApi() {
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
  const libraryQuery = useLibraryQueryState();
  const state = useStore(
    sessionStore,
    useShallow(({ actions: _actions, ...sessionState }: AppSessionState) => sessionState),
  );
  const { navigation } = state;

  return {
    libraryQuery,
    menuRequest: state.menuRequest,
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

function visibleSettingsSection(section: SettingsSectionKey, developerModeEnabled: boolean) {
  return !developerModeEnabled && section === 'aiTrace' ? 'about' : section;
}
