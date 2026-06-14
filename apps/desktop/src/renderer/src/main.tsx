import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppSettings, ArticleSummaryRecord } from '@yomitomo/shared';
import { normalizeUiLanguage } from '@yomitomo/shared';
import { readerBackgroundTone } from '@yomitomo/reader-ui/reader-settings';
import { useTranslation } from 'react-i18next';
import { Volume2 } from 'lucide-react';

import type { SettingsSectionKey } from './settings/app-settings-panels';
import { AvatarImage } from './shell/app-ui';
import { useAppAgentActions } from './shell/app-agent-actions';
import { useAppArticleStoreActions } from './shell/app-article-store-actions';
import { useDesktopStoreState } from './shell/app-desktop-store-state';
import { useSettingsDrafts } from './settings/app-settings-drafts';
import { SettingsNavButton } from './settings/app-settings-nav-button';
import { StoreLoadErrorScreen } from './shell/app-store-load-error';
import {
  normalizeDesktopReaderSettings,
  readDesktopReaderBackgroundsByTone,
  readDesktopReaderSettings,
  writeDesktopReaderSettings,
} from './settings/app-reader-settings';
import {
  applyAppTheme,
  readCachedThemeIdsByTone,
  readCachedThemeId,
  resolveAppThemeId,
  themeRegistry,
  writeCachedThemeId,
  type AppThemeId,
} from './theme/app-theme';
import { AnnotationDiscussionWindowApp } from './annotation-discussion/app-annotation-discussion-window';
import { AnnotationSedimentationWindowApp } from './annotation-discussion/app-annotation-sedimentation-window';
import { ThemeSelector } from './theme/app-theme-selector';
import { elementDialogSourceRect, type DialogSourceRect } from './shell/app-dialog-transition';
import { UpdateReleaseDialog } from './shell/app-update-dialog';
import { changeAppI18nLanguage, initializeAppI18n } from './i18n/app-i18n';
import { readCachedUiLanguage, writeCachedUiLanguage } from './i18n/app-language-cache';
import { playAppSoundEffect } from './sound/app-sound-effects';
import './styles.css';

const startupUiLanguage = readCachedUiLanguage();
initializeAppI18n(startupUiLanguage);
const startupThemeId = readCachedThemeId();
const startupThemeIdsByTone = readCachedThemeIdsByTone();
const startupReaderSettings = readDesktopReaderSettings();
const startupReaderBackgroundsByTone = readDesktopReaderBackgroundsByTone();
applyAppTheme(themeRegistry[startupThemeId]);

function compatibleReaderBackgroundForTheme(
  themeId: AppThemeId,
  backgroundColor: string,
  previousThemeId?: AppThemeId,
) {
  const tone = themeRegistry[themeId].meta.tone;
  if (readerBackgroundTone(backgroundColor) !== tone) return themeRegistry[themeId].reader.paper;
  if (
    previousThemeId &&
    previousThemeId !== themeId &&
    backgroundColor === themeRegistry[previousThemeId].reader.paper
  ) {
    return themeRegistry[themeId].reader.paper;
  }
  return backgroundColor;
}

const rendererModuleLoadedAt = performance.now();
const loadReadingLibrary = () =>
  import('./reading-library/app-reading-library').then((module) => ({
    default: module.ReadingLibrary,
  }));
const loadReadingStatsModule = () => preloadEntries.stats.load();
const loadReadingStatsPanel = () =>
  loadReadingStatsModule().then((module) => ({ default: module.ReadingStatsPanel }));
const loadOnboardingFlow = () =>
  import('./shell/app-onboarding').then((module) => ({ default: module.OnboardingFlow }));
const loadAgentSettings = () =>
  preloadEntries.agents.load().then((module) => ({ default: module.AgentSettings }));
const loadDataManagementSettings = () =>
  preloadEntries.settingsPanels
    .load()
    .then((module) => ({ default: module.DataManagementSettings }));
const loadAiTraceSettingsPanel = () =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.AiTraceSettingsPanel }));
const loadGeneralSettings = () =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.GeneralSettings }));
const loadProviderSettings = () =>
  preloadEntries.settingsProvider.load().then((module) => ({ default: module.ProviderSettings }));
const loadShortcutSettings = () =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.ShortcutSettings }));
const loadDataSourcesPanel = () =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.DataSourcesPanel }));
const loadSettingsSectionShell = () =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.SettingsSectionShell }));
const loadUserProfileSettingsDialog = () =>
  preloadEntries.profileDialog
    .load()
    .then((module) => ({ default: module.UserProfileSettingsDialog }));
const loadAboutSettings = () =>
  preloadEntries.settingsAbout.load().then((module) => ({ default: module.AboutSettings }));

const ReadingLibrary = lazy(loadReadingLibrary);
const ReadingStatsPanel = lazy(loadReadingStatsPanel);
const OnboardingFlow = lazy(loadOnboardingFlow);
const AgentSettings = lazy(loadAgentSettings);
const DataManagementSettings = lazy(loadDataManagementSettings);
const AiTraceSettingsPanel = lazy(loadAiTraceSettingsPanel);
const GeneralSettings = lazy(loadGeneralSettings);
const ProviderSettings = lazy(loadProviderSettings);
const ShortcutSettings = lazy(loadShortcutSettings);
const DataSourcesPanel = lazy(loadDataSourcesPanel);
const SettingsSectionShell = lazy(loadSettingsSectionShell);
const UserProfileSettingsDialog = lazy(loadUserProfileSettingsDialog);
const AboutSettings = lazy(loadAboutSettings);

type ReadingStatsModule = typeof import('./reading-stats/app-reading-stats');
type AgentSettingsModule = typeof import('./settings/app-settings-agent-panel');
type SettingsPanelsModule = typeof import('./settings/app-settings-panels');
type SettingsProviderModule = typeof import('./settings/app-settings-provider-panel');
type SettingsAboutModule = typeof import('./shell/app-log-viewer');
type ProfileDialogModule = typeof import('./settings/app-settings-profile-dialog');

type PreloadStatus = 'not-started' | 'scheduled' | 'loading' | 'ready' | 'failed';
type PreloadKey =
  | 'agents'
  | 'stats'
  | 'settings-panels'
  | 'settings-provider'
  | 'settings-about'
  | 'profile-dialog';

type PreloadEntry<TModule> = {
  key: PreloadKey;
  status: PreloadStatus;
  module?: TModule;
  promise?: Promise<TModule>;
  markScheduled: () => void;
  load: () => Promise<TModule>;
};

const preloadListeners = new Set<() => void>();

function subscribePreloadModules(listener: () => void) {
  preloadListeners.add(listener);
  return () => {
    preloadListeners.delete(listener);
  };
}

function notifyPreloadModules() {
  for (const listener of preloadListeners) listener();
}

function createPreloadEntry<TModule>(
  key: PreloadKey,
  importModule: () => Promise<TModule>,
): PreloadEntry<TModule> {
  const entry: PreloadEntry<TModule> = {
    key,
    status: 'not-started',
    markScheduled: () => {
      if (entry.status !== 'not-started') return;
      entry.status = 'scheduled';
      recordStartupTiming('secondary_modules.preload_module_scheduled', { key });
      notifyPreloadModules();
    },
    load: () => {
      if (entry.module) return Promise.resolve(entry.module);
      if (entry.promise) return entry.promise;

      const startedAt = performance.now();
      entry.status = 'loading';
      recordStartupTiming('secondary_modules.preload_module_start', { key });
      notifyPreloadModules();
      entry.promise = importModule()
        .then((module) => {
          entry.module = module;
          entry.status = 'ready';
          recordStartupTiming('secondary_modules.preload_module_success', {
            key,
            durationMs: elapsedMs(startedAt),
          });
          notifyPreloadModules();
          return module;
        })
        .catch((error: unknown) => {
          entry.status = 'failed';
          entry.promise = undefined;
          recordStartupTiming('secondary_modules.preload_module_failed', {
            key,
            durationMs: elapsedMs(startedAt),
            message: error instanceof Error ? error.message : String(error),
          });
          notifyPreloadModules();
          throw error;
        });
      return entry.promise;
    },
  };
  return entry;
}

const preloadEntries = {
  agents: createPreloadEntry<AgentSettingsModule>(
    'agents',
    () => import('./settings/app-settings-agent-panel'),
  ),
  stats: createPreloadEntry<ReadingStatsModule>(
    'stats',
    () => import('./reading-stats/app-reading-stats'),
  ),
  settingsPanels: createPreloadEntry<SettingsPanelsModule>(
    'settings-panels',
    () => import('./settings/app-settings-panels'),
  ),
  settingsProvider: createPreloadEntry<SettingsProviderModule>(
    'settings-provider',
    () => import('./settings/app-settings-provider-panel'),
  ),
  settingsAbout: createPreloadEntry<SettingsAboutModule>(
    'settings-about',
    () => import('./shell/app-log-viewer'),
  ),
  profileDialog: createPreloadEntry<ProfileDialogModule>(
    'profile-dialog',
    () => import('./settings/app-settings-profile-dialog'),
  ),
};

function preloadIdleModules(articles: ArticleSummaryRecord[]) {
  recordStartupTiming('secondary_modules.preload_scheduled');
  const tasks = [
    () => preloadEntries.settingsPanels.load(),
    () => preloadEntries.settingsProvider.load(),
    () => preloadEntries.settingsAbout.load(),
    () => preloadEntries.profileDialog.load(),
    () => preloadEntries.agents.load(),
    () =>
      preloadEntries.stats.load().then((module) => {
        module.preloadReadingStatsFirstPaintData(articles);
        return module.preloadReadingStatsDeferredModules();
      }),
  ];
  scheduleIdlePreloadQueue(tasks);
}

type IdlePreloadHandle =
  | { kind: 'idle'; id: number }
  | { kind: 'timeout'; id: ReturnType<typeof globalThis.setTimeout> };

function scheduleIdlePreload(callback: () => void): IdlePreloadHandle {
  if ('requestIdleCallback' in window) {
    return { kind: 'idle', id: window.requestIdleCallback(callback, { timeout: 3000 }) };
  }
  return { kind: 'timeout', id: globalThis.setTimeout(callback, 800) };
}

function cancelIdlePreload(handle: IdlePreloadHandle) {
  if (handle.kind === 'idle') window.cancelIdleCallback(handle.id);
  else globalThis.clearTimeout(handle.id);
}

function scheduleIdlePreloadQueue(tasks: Array<() => Promise<unknown>>) {
  let taskIndex = 0;
  const runNextTask = () => {
    const task = tasks[taskIndex];
    taskIndex += 1;
    if (!task) {
      recordStartupTiming('secondary_modules.preload_complete');
      return;
    }
    void task()
      .catch(() => undefined)
      .finally(() => scheduleIdlePreload(runNextTask));
  };
  for (const entry of Object.values(preloadEntries)) entry.markScheduled();
  scheduleIdlePreload(runNextTask);
}

type SettingKey = 'library' | 'stats' | 'settings' | 'agents';

function App() {
  const { t, i18n } = useTranslation();
  const [activeSetting, setActiveSetting] = useState<SettingKey>('library');
  const [activeThemeId, setActiveThemeId] = useState<AppThemeId>(startupThemeId);
  const [themeIdsByTone, setThemeIdsByTone] = useState(startupThemeIdsByTone);
  const [readerBackgroundColor, setReaderBackgroundColor] = useState(
    compatibleReaderBackgroundForTheme(startupThemeId, startupReaderSettings.backgroundColor),
  );
  const [readerBackgroundsByTone, setReaderBackgroundsByTone] = useState(
    startupReaderBackgroundsByTone,
  );
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionKey>('collection');
  const [, setPreloadVersion] = useState(0);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileDialogSourceRect, setProfileDialogSourceRect] = useState<DialogSourceRect>();
  const [libraryReaderOpen, setLibraryReaderOpen] = useState(false);
  const [pendingOpenArticleId, setPendingOpenArticleId] = useState<string | null>(null);
  const [onboardingForced, setOnboardingForced] = useState(false);
  const [onboardingFlowKey, setOnboardingFlowKey] = useState(0);
  const [statsNavigationStartedAt, setStatsNavigationStartedAt] = useState<number | undefined>();
  const windowShowRequestedRef = useRef(false);
  const idlePreloadStartedRef = useRef(false);

  useEffect(() => {
    recordStartupTiming('app.mounted');
    requestMainWindow('app.mounted', { storeLoaded: false, storeLoadError: false });
  }, []);

  useEffect(() => {
    applyAppTheme(themeRegistry[activeThemeId]);
  }, [activeThemeId]);

  useEffect(() => subscribePreloadModules(() => setPreloadVersion((version) => version + 1)), []);

  const {
    store,
    storeLoaded,
    storeLoadError,
    storeSyncSnapshot,
    storeRef,
    refreshStore,
    applyStore,
  } = useDesktopStoreState();

  useEffect(() => {
    if (!storeLoaded || storeLoadError) return;
    const storedUiLanguage = normalizeUiLanguage(store.settings.uiLanguage);
    writeCachedUiLanguage(storedUiLanguage);
    changeAppI18nLanguage(storedUiLanguage);
    const storedThemeId = resolveAppThemeId(store.settings.themeId);
    setActiveThemeId((currentThemeId) =>
      currentThemeId === storedThemeId ? currentThemeId : storedThemeId,
    );
    setThemeIdsByTone((currentThemeIds) => ({
      ...currentThemeIds,
      [themeRegistry[storedThemeId].meta.tone]: storedThemeId,
    }));
    const currentReaderSettings = readDesktopReaderSettings();
    const nextBackgroundColor = compatibleReaderBackgroundForTheme(
      storedThemeId,
      currentReaderSettings.backgroundColor,
    );
    if (nextBackgroundColor !== currentReaderSettings.backgroundColor) {
      const nextSettings = normalizeDesktopReaderSettings({
        ...currentReaderSettings,
        backgroundColor: nextBackgroundColor,
      });
      setReaderBackgroundColor(nextSettings.backgroundColor);
      setReaderBackgroundsByTone((currentBackgrounds) => ({
        ...currentBackgrounds,
        [readerBackgroundTone(nextSettings.backgroundColor)]: nextSettings.backgroundColor,
      }));
      writeDesktopReaderSettings(nextSettings);
    }
    writeCachedThemeId(storedThemeId);
  }, [store.settings.themeId, store.settings.uiLanguage, storeLoadError, storeLoaded]);

  const {
    deleteArticle,
    deleteArticleAnnotation,
    deleteArticleComment,
    closeArticleDiscussions,
    openArticleDiscussion,
    readArticle,
    saveArticle,
    updateArticle,
    saveArticleReadingProgress,
    saveArticleReaderChatState,
    importArticleUrl,
    cancelArticleUrlImport,
    importEbookFile,
    importPdfFile,
  } = useAppArticleStoreActions({ storeRef, applyStore });
  const {
    userDraft,
    settingsDraft,
    providerDraft,
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
  } = useSettingsDrafts({ store, storeSyncSnapshot, applyStore });
  const { agentSaveError, agentSaveState, toggleAgent } = useAppAgentActions({ applyStore });
  const showOnboarding = onboardingForced || !store.settings.onboardingCompletedAt;

  useEffect(() => {
    if (!storeLoaded && !storeLoadError) return;
    recordStartupTiming('store.ready_for_ui', {
      storeLoaded,
      storeLoadError: Boolean(storeLoadError),
    });
  }, [storeLoadError, storeLoaded]);

  useEffect(() => {
    if (!storeLoaded || storeLoadError || showOnboarding) return;
    if (idlePreloadStartedRef.current) return;
    idlePreloadStartedRef.current = true;
    const idleId = scheduleIdlePreload(() => {
      recordStartupTiming('secondary_modules.preload_start');
      preloadIdleModules(store.articles);
    });
    return () => cancelIdlePreload(idleId);
  }, [showOnboarding, store.articles, storeLoadError, storeLoaded]);

  useEffect(() => {
    if (activeSetting !== 'library') setLibraryReaderOpen(false);
  }, [activeSetting]);

  useEffect(() => {
    if (!store.settings.developerModeEnabled && activeSettingsSection === 'aiTrace') {
      setActiveSettingsSection('about');
    }
  }, [activeSettingsSection, store.settings.developerModeEnabled]);

  async function saveOnboardingSettings(settings: AppSettings) {
    const nextStore = await window.yomitomoDesktop.saveSettings(settings);
    const nextLanguage = normalizeUiLanguage(nextStore.settings.uiLanguage);
    writeCachedUiLanguage(nextLanguage);
    changeAppI18nLanguage(nextLanguage);
    applyStore(nextStore);
    if (settings.onboardingCompletedAt) setOnboardingForced(false);
    return nextStore;
  }

  async function selectTheme(themeId: AppThemeId, preferredReaderBackgroundColor?: string) {
    const themeTone = themeRegistry[themeId].meta.tone;
    setActiveThemeId(themeId);
    setThemeIdsByTone((currentThemeIds) => ({
      ...currentThemeIds,
      [themeTone]: themeId,
    }));
    writeCachedThemeId(themeId);
    const nextBackgroundColor = compatibleReaderBackgroundForTheme(
      themeId,
      preferredReaderBackgroundColor || readerBackgroundColor,
      activeThemeId,
    );
    if (nextBackgroundColor !== readerBackgroundColor) {
      const nextSettings = normalizeDesktopReaderSettings({
        ...readDesktopReaderSettings(),
        backgroundColor: nextBackgroundColor,
      });
      setReaderBackgroundColor(nextSettings.backgroundColor);
      setReaderBackgroundsByTone((currentBackgrounds) => ({
        ...currentBackgrounds,
        [readerBackgroundTone(nextSettings.backgroundColor)]: nextSettings.backgroundColor,
      }));
      writeDesktopReaderSettings(nextSettings);
    }
    try {
      const nextStore = await window.yomitomoDesktop.saveSettings({ themeId });
      applyStore(nextStore);
    } catch {
      // Keep the immediate visual choice; a later settings sync can reconcile persistence.
    }
  }

  function selectReaderBackground(backgroundColor: string) {
    const nextSettings = normalizeDesktopReaderSettings({
      ...readDesktopReaderSettings(),
      backgroundColor,
    });
    setReaderBackgroundColor(nextSettings.backgroundColor);
    setReaderBackgroundsByTone((currentBackgrounds) => ({
      ...currentBackgrounds,
      [readerBackgroundTone(nextSettings.backgroundColor)]: nextSettings.backgroundColor,
    }));
    writeDesktopReaderSettings(nextSettings);
  }

  async function saveLibrarySettings(settings: AppSettings) {
    const nextStore = await window.yomitomoDesktop.saveSettings(settings);
    const nextLanguage = normalizeUiLanguage(nextStore.settings.uiLanguage);
    writeCachedUiLanguage(nextLanguage);
    changeAppI18nLanguage(nextLanguage);
    applyStore(nextStore);
  }

  function startOnboarding() {
    setOnboardingForced(true);
    setOnboardingFlowKey((key) => key + 1);
  }

  function openModelRoutesSettings() {
    openSettings();
    changeSettingsSection('models');
  }

  function openAgents() {
    recordStartupTiming('secondary_modules.navigation', {
      key: 'agents',
      status: preloadEntries.agents.status,
    });
    setActiveSetting('agents');
  }

  function openSettings() {
    recordStartupTiming('secondary_modules.navigation', {
      key: 'settings',
      settingsPanelsStatus: preloadEntries.settingsPanels.status,
      settingsProviderStatus: preloadEntries.settingsProvider.status,
      settingsAboutStatus: preloadEntries.settingsAbout.status,
    });
    setActiveSetting('settings');
  }

  function openProfileDialog(sourceElement?: Element) {
    recordStartupTiming('secondary_modules.navigation', {
      key: 'profile-dialog',
      status: preloadEntries.profileDialog.status,
    });
    setProfileDialogSourceRect(sourceElement ? elementDialogSourceRect(sourceElement) : undefined);
    setProfileDialogOpen(true);
  }

  function openStats() {
    const startedAt = performance.now();
    setStatsNavigationStartedAt(startedAt);
    recordStatsTiming('navigation_click', {
      articleCount: store.articles.length,
      rendererElapsedMs: elapsedMs(0),
      preloadStatus: preloadEntries.stats.status,
    });
    setActiveSetting('stats');
  }

  function changeSettingsSection(section: SettingsSectionKey) {
    if (!store.settings.developerModeEnabled && section === 'aiTrace') {
      setActiveSettingsSection('about');
      return;
    }
    recordStartupTiming('secondary_modules.settings_section_change', {
      section,
      settingsPanelsStatus: preloadEntries.settingsPanels.status,
      settingsProviderStatus: preloadEntries.settingsProvider.status,
      settingsAboutStatus: preloadEntries.settingsAbout.status,
    });
    setActiveSettingsSection(section);
  }

  function requestMainWindow(reason: string, data: Record<string, unknown>) {
    if (windowShowRequestedRef.current) return;
    windowShowRequestedRef.current = true;
    recordStartupTiming('window.show_requested', { reason, ...data });
    window.yomitomoDesktop.showMainWindow();
  }

  if (storeLoadError) {
    return <StoreLoadErrorScreen error={storeLoadError} onRetry={refreshStore} />;
  }

  if (!storeLoaded) return <StartupShell />;

  if (showOnboarding) {
    return (
      <Suspense fallback={null}>
        <OnboardingFlow
          key={onboardingFlowKey}
          store={store}
          onSaveSettings={saveOnboardingSettings}
        />
      </Suspense>
    );
  }

  const today = new Intl.DateTimeFormat(i18n.language, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
  const appShellClassName = [
    'app-shell',
    `is-${desktopPlatform()}`,
    libraryReaderOpen ? 'is-reader-open' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const settingsPanelsModule = preloadEntries.settingsPanels.module;
  const settingsProviderModule = preloadEntries.settingsProvider.module;
  const settingsAboutModule = preloadEntries.settingsAbout.module;
  const agentsModule = preloadEntries.agents.module;
  const statsModule = preloadEntries.stats.module;
  const profileDialogModule = preloadEntries.profileDialog.module;
  const ActiveReadingStatsPanel = statsModule?.ReadingStatsPanel ?? ReadingStatsPanel;
  const ActiveAgentSettings = agentsModule?.AgentSettings ?? AgentSettings;
  const ActiveSettingsSectionShell =
    settingsPanelsModule?.SettingsSectionShell ?? SettingsSectionShell;
  const ActiveGeneralSettings = settingsPanelsModule?.GeneralSettings ?? GeneralSettings;
  const ActiveShortcutSettings = settingsPanelsModule?.ShortcutSettings ?? ShortcutSettings;
  const ActiveDataSourcesPanel = settingsPanelsModule?.DataSourcesPanel ?? DataSourcesPanel;
  const ActiveDataManagementSettings =
    settingsPanelsModule?.DataManagementSettings ?? DataManagementSettings;
  const ActiveAiTraceSettingsPanel =
    settingsPanelsModule?.AiTraceSettingsPanel ?? AiTraceSettingsPanel;
  const ActiveProviderSettings = settingsProviderModule?.ProviderSettings ?? ProviderSettings;
  const ActiveAboutSettings = settingsAboutModule?.AboutSettings ?? AboutSettings;
  const ActiveUserProfileSettingsDialog =
    profileDialogModule?.UserProfileSettingsDialog ?? UserProfileSettingsDialog;

  return (
    <main className={appShellClassName}>
      <header className="app-masthead">
        <BrandTitle settings={store.settings} />
        <time className="app-masthead-date" dateTime={new Date().toISOString()}>
          {today}
        </time>
      </header>

      <nav className="app-section-nav" aria-label={t('nav.main')}>
        <SettingsNavButton
          active={activeSetting === 'library'}
          label={t('nav.library')}
          onClick={() => setActiveSetting('library')}
        />
        <SettingsNavButton
          active={activeSetting === 'agents'}
          label={t('nav.agents')}
          onClick={openAgents}
        />
        <SettingsNavButton
          active={activeSetting === 'stats'}
          label={t('nav.stats')}
          onClick={openStats}
        />
        <SettingsNavButton
          active={activeSetting === 'settings'}
          label={t('nav.settings')}
          onClick={openSettings}
        />
        <ThemeSelector
          activeThemeId={activeThemeId}
          open={themeDialogOpen}
          readerBackgroundColor={readerBackgroundColor}
          soundSettings={store.settings}
          readerBackgroundsByTone={readerBackgroundsByTone}
          themeIdsByTone={themeIdsByTone}
          onOpenChange={setThemeDialogOpen}
          onSelectReaderBackground={selectReaderBackground}
          onSelectTheme={(themeId, backgroundColor) => void selectTheme(themeId, backgroundColor)}
        />
        <button
          aria-label={t('nav.profile')}
          className="app-nav-profile-button"
          data-tooltip={t('nav.profile')}
          type="button"
          onClick={(event) => openProfileDialog(event.currentTarget)}
        >
          <AvatarImage
            value={store.user.avatar || ''}
            className="app-nav-profile-avatar"
            fallback={store.user.nickname?.slice(0, 1) || t('common.me')}
          />
        </button>
      </nav>

      <section className="settings-content">
        <Suspense fallback={<LibrarySkeleton />}>
          {activeSetting === 'library' ? (
            <ReadingLibrary
              agents={store.agents}
              articles={store.articles}
              messageSendShortcut={store.settings.messageSendShortcut}
              readerTheme={themeRegistry[activeThemeId].reader}
              settings={store.settings}
              selectionActionShortcuts={store.settings.selectionActionShortcuts}
              openArticleId={pendingOpenArticleId}
              userProfile={store.user}
              onDeleteArticle={deleteArticle}
              onDeleteArticleAnnotation={deleteArticleAnnotation}
              onDeleteArticleComment={deleteArticleComment}
              onCloseArticleDiscussions={closeArticleDiscussions}
              onOpenArticleDiscussion={openArticleDiscussion}
              onArticleOpened={() => setPendingOpenArticleId(null)}
              onImportArticleUrl={importArticleUrl}
              onCancelArticleImport={cancelArticleUrlImport}
              onImportEbookFile={importEbookFile}
              onImportPdfFile={importPdfFile}
              onReadingModeChange={setLibraryReaderOpen}
              onReadArticle={readArticle}
              onSaveArticle={saveArticle}
              onSaveArticleReadingProgress={saveArticleReadingProgress}
              onSaveArticleReaderChatState={saveArticleReaderChatState}
              onSaveSettings={saveLibrarySettings}
              onUpdateArticle={updateArticle}
            />
          ) : null}
          {activeSetting === 'stats' ? (
            <ActiveReadingStatsPanel
              agents={store.agents}
              articles={store.articles}
              navigationStartedAt={statsNavigationStartedAt}
              settings={store.settings}
              onRefresh={refreshStore}
            />
          ) : null}
          {activeSetting === 'settings' ? (
            <ActiveSettingsSectionShell
              activeSection={activeSettingsSection}
              developerModeEnabled={Boolean(store.settings.developerModeEnabled)}
              onSectionChange={changeSettingsSection}
            >
              {activeSettingsSection === 'collection' ? (
                <ActiveGeneralSettings
                  settingsDraft={settingsDraft}
                  canSave={canSaveGeneralSettings}
                  onSettingsChange={updateGeneralSettingsDraft}
                  onSave={saveGeneralSettingsDraft}
                  saveState={generalSaveState}
                  saveError={generalSaveError}
                />
              ) : null}
              {activeSettingsSection === 'models' ? (
                <ActiveProviderSettings
                  draft={providerDraft}
                  settingsDraft={settingsDraft}
                  providers={store.providers}
                  testState={testState}
                  canSave={canSaveProvider}
                  canSaveRoutes={canSaveProviderRoutes}
                  onChange={updateProviderDraft}
                  onRouteChange={updateProviderRoutesDraft}
                  onCreate={createProvider}
                  onDelete={deleteProvider}
                  onSave={saveProviderDraft}
                  saveState={providerSaveState}
                  saveError={providerSaveError}
                  routeSaveState={routeSaveState}
                  routeSaveError={routeSaveError}
                  onRouteSave={saveProviderRoutes}
                  onSelect={selectProvider}
                  onTest={testProvider}
                />
              ) : null}
              {activeSettingsSection === 'dataSources' ? <ActiveDataSourcesPanel /> : null}
              {activeSettingsSection === 'shortcuts' ? (
                <ActiveShortcutSettings
                  settingsDraft={settingsDraft}
                  canSave={canSaveShortcutSettings}
                  onSettingsChange={updateShortcutSettingsDraft}
                  onSave={saveShortcutSettingsDraft}
                  saveState={shortcutSaveState}
                  saveError={shortcutSaveError}
                />
              ) : null}
              {activeSettingsSection === 'data' ? (
                <ActiveDataManagementSettings
                  settings={store.settings}
                  onStoreUpdated={applyStore}
                />
              ) : null}
              {activeSettingsSection === 'aiTrace' && store.settings.developerModeEnabled ? (
                <ActiveAiTraceSettingsPanel agents={store.agents} providers={store.providers} />
              ) : null}
              {activeSettingsSection === 'about' ? (
                <ActiveAboutSettings
                  settings={store.settings}
                  onStartOnboarding={startOnboarding}
                  onStoreUpdated={applyStore}
                />
              ) : null}
            </ActiveSettingsSectionShell>
          ) : null}
          {activeSetting === 'agents' ? (
            <ActiveAgentSettings
              agents={store.agents}
              error={agentSaveError}
              providers={store.providers}
              settings={store.settings}
              saveState={agentSaveState}
              onConfigureRoutes={openModelRoutesSettings}
              onToggle={toggleAgent}
            />
          ) : null}
        </Suspense>
      </section>
      {profileDialogOpen ? (
        <Suspense fallback={null}>
          <ActiveUserProfileSettingsDialog
            draft={userDraft}
            canSave={canSaveUser}
            onChange={updateUserDraft}
            onClose={() => setProfileDialogOpen(false)}
            onSave={async () => {
              if (await saveProfileDraft())
                window.setTimeout(() => setProfileDialogOpen(false), 700);
            }}
            saveState={profileSaveState}
            saveError={profileSaveError}
            sourceRect={profileDialogSourceRect}
          />
        </Suspense>
      ) : null}
      <UpdateReleaseDialog
        store={store}
        onSaveSettings={async (settings) => {
          const nextStore = await window.yomitomoDesktop.saveSettings(settings);
          const nextLanguage = normalizeUiLanguage(nextStore.settings.uiLanguage);
          writeCachedUiLanguage(nextLanguage);
          changeAppI18nLanguage(nextLanguage);
          applyStore(nextStore);
          return nextStore;
        }}
      />
    </main>
  );
}

function StartupShell() {
  return (
    <main className={`app-shell is-${desktopPlatform()}`}>
      <AppMasthead />
      <StartupNav />
      <section className="settings-content">
        <LibrarySkeleton />
      </section>
    </main>
  );
}

function AppMasthead() {
  return (
    <header className="app-masthead">
      <BrandTitle />
    </header>
  );
}

function BrandTitle({ settings }: { settings?: AppSettings }) {
  const { t } = useTranslation();
  const playPronunciation = () => {
    playAppSoundEffect('brand.pronunciation', settings || {});
  };
  return (
    <div className="app-masthead-title">
      <h1>Yomitomo</h1>
      <button
        aria-label={t('brandPronounce')}
        className="app-masthead-phonetic"
        type="button"
        onClick={playPronunciation}
      >
        /joːmitomo/
        <Volume2 aria-hidden="true" size={13} />
      </button>
    </div>
  );
}

function StartupNav() {
  const { t } = useTranslation();
  return (
    <nav className="app-section-nav" aria-label={t('nav.main')}>
      <button className="settings-nav-item is-active" disabled type="button">
        <span>{t('startup.library')}</span>
      </button>
      <button className="settings-nav-item" disabled type="button">
        <span>{t('startup.agents')}</span>
      </button>
      <button className="settings-nav-item" disabled type="button">
        <span>{t('startup.stats')}</span>
      </button>
      <button className="settings-nav-item" disabled type="button">
        <span>{t('startup.settings')}</span>
      </button>
    </nav>
  );
}

function LibrarySkeleton() {
  return (
    <div className="library-skeleton" aria-busy="true">
      <header className="library-skeleton-header">
        <span className="library-skeleton-title" />
        <span className="library-skeleton-action" />
      </header>
      <div className="library-skeleton-toolbar">
        <span />
        <span />
      </div>
      <div className="library-skeleton-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <span className="library-skeleton-card" key={index}>
            <i />
            <b />
            <em />
          </span>
        ))}
      </div>
    </div>
  );
}

recordStartupTiming('renderer.module_loaded', {
  preloadLoadedAt: window.yomitomoDesktop?.startupTiming?.preloadLoadedAt,
  rendererModuleLoadedAt,
});

const rendererWindowKind = new URLSearchParams(window.location.search).get('window');
const RootApp =
  rendererWindowKind === 'annotation-discussion'
    ? AnnotationDiscussionWindowApp
    : rendererWindowKind === 'annotation-sedimentation'
      ? AnnotationSedimentationWindowApp
      : App;

createRoot(document.getElementById('root')!).render(<RootApp />);
recordStartupTiming('react.render_scheduled');

function desktopPlatform() {
  return window.yomitomoDesktop?.platform ?? 'unknown';
}

function recordStartupTiming(event: string, data: Record<string, unknown> = {}) {
  const desktop = window.yomitomoDesktop;
  if (!desktop?.recordPerformanceTiming) return;
  void desktop
    .recordPerformanceTiming({
      event: `startup.${event}`,
      data: {
        rendererElapsedMs: elapsedMs(0),
        ...data,
      },
    })
    .catch(() => undefined);
}

function recordStatsTiming(event: string, data: Record<string, unknown>) {
  const desktop = window.yomitomoDesktop;
  if (!desktop?.recordPerformanceTiming) return;
  void desktop.recordPerformanceTiming({ event: `stats.${event}`, data }).catch(() => undefined);
}

function elapsedMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}
