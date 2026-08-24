import { useEffect, useReducer, useRef, useState } from 'react';
import type { ArticleSummaryRecord, DesktopStore } from '@yomitomo/shared';
import type { AppMenuCommand, AppMenuCommandRequest } from '../../../app-menu-types';
import type { SettingsSectionKey } from '../settings/app-settings-panels';
import { getDesktopApi } from './app-desktop-api';
import { elementDialogSourceRect, type DialogSourceRect } from './app-dialog-transition';
import type { ReadingLibraryOpenTarget } from './app-reading-types';
import {
  cancelIdlePreload,
  preloadEntries,
  preloadIdleModules,
  scheduleIdlePreload,
} from './app-secondary-module-preload';
import { elapsedMs, recordStartupTiming, recordStatsTiming } from './app-utils';

export type AppSurfaceKey = 'agents' | 'distillations' | 'library' | 'settings' | 'stats';

type AppNavigationState =
  | {
      pendingOpenArticle: ReadingLibraryOpenTarget | null;
      readerOpen: boolean;
      surface: 'library';
    }
  | {
      surface: Exclude<AppSurfaceKey, 'library'>;
    };

type AppNavigationEvent =
  | { type: 'article-opened' }
  | { type: 'open-article'; target: ReadingLibraryOpenTarget }
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
      return state.surface === 'library' ? { ...state, readerOpen: event.open } : state;
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

export type AppSessionInput = {
  appLocked: boolean;
  applyStore: (store: DesktopStore) => void;
  articles: ArticleSummaryRecord[];
  developerModeEnabled: boolean;
  onboardingCompletedAt?: string;
  readStatsArticles: () => Promise<ArticleSummaryRecord[]>;
  storeStatus: 'error' | 'loading' | 'ready';
};

const libraryMenuCommands = new Set<AppMenuCommand>([
  'import-web',
  'import-ebook',
  'import-pdf',
  'sync-weread',
]);

/**
 * Owns the desktop session: which surface is showing, how navigation and menu commands
 * route into it, what a lock resets, when the window may appear, and how stats hydrate.
 * The root view only picks a surface and renders — it never reads preload status, window
 * timing or reset lists.
 */
export function useAppSession(input: AppSessionInput) {
  const [navigation, dispatchNavigation] = useReducer(appNavigationReducer, initialNavigation);
  const [requestedSettingsSection, setRequestedSettingsSection] =
    useState<SettingsSectionKey>('collection');
  const [menuRequest, setMenuRequest] = useState<AppMenuCommandRequest | null>(null);
  const [onboardingForced, setOnboardingForced] = useState(false);
  const [onboardingFlowKey, setOnboardingFlowKey] = useState(0);
  const [statsArticles, setStatsArticles] = useState<ArticleSummaryRecord[] | null>(null);
  const [statsNavigationStartedAt, setStatsNavigationStartedAt] = useState<number | undefined>();
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileDialogSourceRect, setProfileDialogSourceRect] = useState<DialogSourceRect>();
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [updateDialogRequest, setUpdateDialogRequest] = useState(0);
  const menuRequestIdRef = useRef(0);
  const windowShowRequestedRef = useRef(false);
  const idlePreloadStartedRef = useRef(false);

  const showOnboarding = !input.appLocked && (onboardingForced || !input.onboardingCompletedAt);

  function requestMainWindow(reason: string, data: Record<string, unknown>) {
    if (windowShowRequestedRef.current) return;
    windowShowRequestedRef.current = true;
    recordStartupTiming('window.show_requested', { reason, ...data });
    getDesktopApi().app.showMainWindow();
  }

  useEffect(() => {
    recordStartupTiming('app.mounted');
    requestMainWindow('app.mounted', {
      storeLoaded: input.storeStatus === 'ready',
      storeLoadError: input.storeStatus === 'error',
    });
    // The window may only be requested once, so this intentionally ignores later store facts.
  }, []);

  useEffect(() => {
    if (input.storeStatus === 'loading') return;
    recordStartupTiming('store.ready_for_ui', {
      storeLoaded: input.storeStatus === 'ready',
      storeLoadError: input.storeStatus === 'error',
    });
  }, [input.storeStatus]);

  useEffect(() => {
    if (input.storeStatus !== 'ready' || showOnboarding) return;
    if (idlePreloadStartedRef.current) return;
    idlePreloadStartedRef.current = true;
    const idleId = scheduleIdlePreload(() => {
      recordStartupTiming('secondary_modules.preload_start');
      preloadIdleModules();
    });
    return () => cancelIdlePreload(idleId);
  }, [showOnboarding, input.storeStatus]);

  useEffect(() => {
    if (!input.appLocked) return;
    dispatchNavigation({ type: 'reset-transients' });
    setProfileDialogOpen(false);
    setProfileDialogSourceRect(undefined);
    setStatsArticles(null);
    setStatsNavigationStartedAt(undefined);
    setThemeDialogOpen(false);
  }, [input.appLocked]);

  const settingsSection = visibleSettingsSection(
    requestedSettingsSection,
    input.developerModeEnabled,
  );

  async function refreshStatsArticles() {
    try {
      setStatsArticles(await input.readStatsArticles());
    } catch {
      setStatsArticles(input.articles);
    }
  }

  function openSettings() {
    recordStartupTiming('secondary_modules.navigation', {
      key: 'settings',
      settingsPanelsStatus: preloadEntries.settingsPanels.status,
      settingsProviderStatus: preloadEntries.settingsProvider.status,
      settingsAboutStatus: preloadEntries.settingsAbout.status,
    });
    dispatchNavigation({ type: 'open-surface', surface: 'settings' });
  }

  function changeSettingsSection(section: SettingsSectionKey) {
    if (!input.developerModeEnabled && section === 'aiTrace') {
      setRequestedSettingsSection('about');
      return;
    }
    recordStartupTiming('secondary_modules.settings_section_change', {
      section,
      settingsPanelsStatus: preloadEntries.settingsPanels.status,
      settingsProviderStatus: preloadEntries.settingsProvider.status,
      settingsAboutStatus: preloadEntries.settingsAbout.status,
    });
    setRequestedSettingsSection(section);
  }

  function openSettingsSection(section: SettingsSectionKey) {
    openSettings();
    changeSettingsSection(section);
  }

  function openStats() {
    setStatsNavigationStartedAt(performance.now());
    recordStatsTiming('navigation_click', {
      articleCount: statsArticles?.length ?? input.articles.length,
      rendererElapsedMs: elapsedMs(0),
      preloadStatus: preloadEntries.stats.status,
    });
    dispatchNavigation({ type: 'open-surface', surface: 'stats' });
    void refreshStatsArticles();
  }

  function openAgents() {
    recordStartupTiming('secondary_modules.navigation', {
      key: 'agents',
      status: preloadEntries.agents.status,
    });
    dispatchNavigation({ type: 'open-surface', surface: 'agents' });
  }

  function openProfileDialog(sourceElement?: Element) {
    recordStartupTiming('secondary_modules.navigation', {
      key: 'profile-dialog',
      status: preloadEntries.profileDialog.status,
    });
    setProfileDialogSourceRect(sourceElement ? elementDialogSourceRect(sourceElement) : undefined);
    setProfileDialogOpen(true);
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
          if (!result.canceled) input.applyStore(result.store);
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
      dispatchNavigation({ type: 'open-surface', surface: 'library' });
      setMenuRequest({ command, id: ++menuRequestIdRef.current });
    }
  }

  useEffect(() => {
    return getDesktopApi().app.onMenuCommand((command) => {
      if (input.appLocked) return;
      runMenuCommand(command);
    });
  }, [input.appLocked, input.applyStore]);

  return {
    menuRequest,
    onboardingFlowKey,
    pendingOpenArticle: navigation.surface === 'library' ? navigation.pendingOpenArticle : null,
    profileDialogOpen,
    profileDialogSourceRect,
    readerOpen: navigation.surface === 'library' && navigation.readerOpen,
    settingsSection,
    showOnboarding,
    statsArticles,
    statsNavigationStartedAt,
    surface: navigation.surface,
    themeDialogOpen,
    updateDialogRequest,
    actions: {
      changeSettingsSection,
      closeProfileDialog: () => setProfileDialogOpen(false),
      completeOnboarding: () => setOnboardingForced(false),
      openAgents,
      openArticleFromDistillation: (target: ReadingLibraryOpenTarget) => {
        dispatchNavigation({ type: 'open-article', target });
      },
      openDistillations: () =>
        dispatchNavigation({ type: 'open-surface', surface: 'distillations' }),
      openLibrary: () => dispatchNavigation({ type: 'open-surface', surface: 'library' }),
      openProfileDialog,
      openSettings,
      openSettingsSection,
      openStats,
      refreshStatsArticles: () => void refreshStatsArticles(),
      requestUpdateDialog: () => {
        openSettingsSection('about');
        setUpdateDialogRequest((request) => request + 1);
      },
      setPendingArticleOpened: () => dispatchNavigation({ type: 'article-opened' }),
      setReaderOpen: (open: boolean) => dispatchNavigation({ type: 'set-reader-open', open }),
      setThemeDialogOpen,
      startOnboarding: () => {
        setOnboardingForced(true);
        setOnboardingFlowKey((key) => key + 1);
      },
    },
  };
}

function visibleSettingsSection(section: SettingsSectionKey, developerModeEnabled: boolean) {
  return !developerModeEnabled && section === 'aiTrace' ? 'about' : section;
}
