import { useEffect, useRef, useState } from 'react';
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

export type AppSessionInput = {
  appLocked: boolean;
  applyStore: (store: DesktopStore) => void;
  articles: ArticleSummaryRecord[];
  developerModeEnabled: boolean;
  onboardingCompletedAt?: string;
  readStatsArticles: () => Promise<ArticleSummaryRecord[]>;
  storeLoaded: boolean;
  storeLoadFailed: boolean;
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
  const [surface, setSurface] = useState<AppSurfaceKey>('library');
  const [settingsSection, setSettingsSection] = useState<SettingsSectionKey>('collection');
  const [readerOpen, setReaderOpen] = useState(false);
  const [pendingOpenArticle, setPendingOpenArticle] = useState<ReadingLibraryOpenTarget | null>(
    null,
  );
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
    requestMainWindow('app.mounted', { storeLoaded: false, storeLoadError: false });
    // The window may only be requested once, so this intentionally ignores later store facts.
  }, []);

  useEffect(() => {
    if (!input.storeLoaded && !input.storeLoadFailed) return;
    recordStartupTiming('store.ready_for_ui', {
      storeLoaded: input.storeLoaded,
      storeLoadError: input.storeLoadFailed,
    });
  }, [input.storeLoadFailed, input.storeLoaded]);

  useEffect(() => {
    if (!input.storeLoaded || input.storeLoadFailed || showOnboarding) return;
    if (idlePreloadStartedRef.current) return;
    idlePreloadStartedRef.current = true;
    const idleId = scheduleIdlePreload(() => {
      recordStartupTiming('secondary_modules.preload_start');
      preloadIdleModules();
    });
    return () => cancelIdlePreload(idleId);
  }, [showOnboarding, input.storeLoadFailed, input.storeLoaded]);

  useEffect(() => {
    if (!input.appLocked) return;
    setReaderOpen(false);
    setPendingOpenArticle(null);
    setProfileDialogOpen(false);
    setProfileDialogSourceRect(undefined);
    setStatsArticles(null);
    setStatsNavigationStartedAt(undefined);
    setThemeDialogOpen(false);
  }, [input.appLocked]);

  useEffect(() => {
    if (surface !== 'library') setReaderOpen(false);
  }, [surface]);

  useEffect(() => {
    if (!input.developerModeEnabled && settingsSection === 'aiTrace') setSettingsSection('about');
  }, [input.developerModeEnabled, settingsSection]);

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
    setSurface('settings');
  }

  function changeSettingsSection(section: SettingsSectionKey) {
    if (!input.developerModeEnabled && section === 'aiTrace') {
      setSettingsSection('about');
      return;
    }
    recordStartupTiming('secondary_modules.settings_section_change', {
      section,
      settingsPanelsStatus: preloadEntries.settingsPanels.status,
      settingsProviderStatus: preloadEntries.settingsProvider.status,
      settingsAboutStatus: preloadEntries.settingsAbout.status,
    });
    setSettingsSection(section);
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
    setSurface('stats');
    void refreshStatsArticles();
  }

  function openAgents() {
    recordStartupTiming('secondary_modules.navigation', {
      key: 'agents',
      status: preloadEntries.agents.status,
    });
    setSurface('agents');
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
      setSurface('library');
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
    pendingOpenArticle,
    profileDialogOpen,
    profileDialogSourceRect,
    readerOpen,
    settingsSection,
    showOnboarding,
    statsArticles,
    statsNavigationStartedAt,
    surface,
    themeDialogOpen,
    updateDialogRequest,
    actions: {
      changeSettingsSection,
      closeProfileDialog: () => setProfileDialogOpen(false),
      completeOnboarding: () => setOnboardingForced(false),
      openAgents,
      openArticleFromDistillation: (target: ReadingLibraryOpenTarget) => {
        setPendingOpenArticle(target);
        setSurface('library');
      },
      openDistillations: () => setSurface('distillations'),
      openLibrary: () => setSurface('library'),
      openProfileDialog,
      openSettings,
      openSettingsSection,
      openStats,
      refreshStatsArticles: () => void refreshStatsArticles(),
      requestUpdateDialog: () => {
        openSettingsSection('about');
        setUpdateDialogRequest((request) => request + 1);
      },
      setPendingArticleOpened: () => setPendingOpenArticle(null),
      setReaderOpen,
      setThemeDialogOpen,
      startOnboarding: () => {
        setOnboardingForced(true);
        setOnboardingFlowKey((key) => key + 1);
      },
    },
  };
}
