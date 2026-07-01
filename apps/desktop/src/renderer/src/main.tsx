import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppSettings, ArticleSummaryRecord } from '@yomitomo/shared';
import { normalizeUiLanguage } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import { LockKeyhole, PartyPopper, Volume2 } from 'lucide-react';

import type { SettingsSectionKey } from './settings/app-settings-panels';
import { AppLockGate } from './app-lock/app-lock-gate';
import { AvatarImage } from './shell/app-ui';
import { useAppAgentActions } from './shell/app-agent-actions';
import { useAppArticleStoreActions } from './shell/app-article-store-actions';
import { useDesktopStoreState } from './shell/app-desktop-store-state';
import {
  cancelIdlePreload,
  preloadEntries,
  preloadIdleModules,
  scheduleIdlePreload,
  useSecondaryModulePreload,
} from './shell/app-secondary-module-preload';
import {
  applySavedSettings,
  elapsedMs,
  recordStartupTiming,
  recordStatsTiming,
} from './shell/app-utils';
import { useSettingsDrafts } from './settings/app-settings-drafts';
import { SettingsNavButton } from './settings/app-settings-nav-button';
import { StoreLoadErrorScreen } from './shell/app-store-load-error';
import { AnnotationDiscussionWindowApp } from './annotation-discussion/app-annotation-discussion-window';
import { AnnotationSedimentationWindowApp } from './annotation-discussion/app-annotation-sedimentation-window';
import { ThemeSelector } from './theme/app-theme-selector';
import { useReaderThemeController } from './theme/use-reader-theme-controller';
import { elementDialogSourceRect, type DialogSourceRect } from './shell/app-dialog-transition';
import { UpdateReleaseDialog } from './shell/app-update-dialog';
import { useAppUpdateState } from './shell/use-app-update-state';
import { changeAppI18nLanguage, initializeAppI18n } from './i18n/app-i18n';
import { readCachedUiLanguage, writeCachedUiLanguage } from './i18n/app-language-cache';
import { playAppSoundEffect } from './sound/app-sound-effects';
import { AppToaster, useHeaderToastOffset } from './shell/app-toast';
import type { AppMenuCommand, AppMenuCommandRequest } from '../../app-menu-types';
import './styles.css';
import 'goey-toast/styles.css';

const startupUiLanguage = readCachedUiLanguage();
initializeAppI18n(startupUiLanguage);

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

type SettingKey = 'library' | 'stats' | 'settings' | 'agents';

function App() {
  const { t, i18n } = useTranslation();
  const [activeSetting, setActiveSetting] = useState<SettingKey>('library');
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionKey>('collection');
  const appUpdateState = useAppUpdateState();
  const updateReady =
    appUpdateState?.status === 'available' || appUpdateState?.status === 'downloaded';
  const [updateDialogRequest, setUpdateDialogRequest] = useState(0);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileDialogSourceRect, setProfileDialogSourceRect] = useState<DialogSourceRect>();
  const [libraryReaderOpen, setLibraryReaderOpen] = useState(false);
  const [pendingOpenArticleId, setPendingOpenArticleId] = useState<string | null>(null);
  const [libraryMenuRequest, setLibraryMenuRequest] = useState<AppMenuCommandRequest | null>(null);
  const [onboardingForced, setOnboardingForced] = useState(false);
  const [onboardingFlowKey, setOnboardingFlowKey] = useState(0);
  const [statsArticles, setStatsArticles] = useState<ArticleSummaryRecord[] | null>(null);
  const [statsNavigationStartedAt, setStatsNavigationStartedAt] = useState<number | undefined>();
  const menuRequestIdRef = useRef(0);
  const windowShowRequestedRef = useRef(false);
  const idlePreloadStartedRef = useRef(false);
  const toastTopOffset = useHeaderToastOffset(libraryReaderOpen);

  useEffect(() => {
    recordStartupTiming('app.mounted');
    requestMainWindow('app.mounted', { storeLoaded: false, storeLoadError: false });
  }, []);

  useSecondaryModulePreload();

  const {
    store,
    storeLoaded,
    storeLoadError,
    storeSyncSnapshot,
    storeRef,
    refreshStore,
    applyStore,
  } = useDesktopStoreState();
  const appLockEnabled = Boolean(store.settings.appLockEnabled);
  const appLocked = Boolean(appLockEnabled && store.settings.appLockLocked);
  const theme = useReaderThemeController({
    appLocked,
    applyStore,
    settings: store.settings,
    storeLoaded,
    storeLoadError,
  });

  useEffect(() => {
    if (!storeLoaded || storeLoadError || appLocked) return;
    const storedUiLanguage = normalizeUiLanguage(store.settings.uiLanguage);
    writeCachedUiLanguage(storedUiLanguage);
    changeAppI18nLanguage(storedUiLanguage);
  }, [appLocked, store.settings.uiLanguage, storeLoadError, storeLoaded]);

  const {
    deleteArticle,
    deleteArticleAnnotation,
    deleteArticleComment,
    closeArticleDiscussions,
    openArticleDiscussion,
    readArticle,
    saveArticle,
    saveArticleAnnotation,
    saveArticleComment,
    updateArticle,
    saveArticleReadingProgress,
    saveArticleReaderChatState,
    importArticleUrl,
    cancelArticleUrlImport,
    importEbookFile,
    importPdfFile,
  } = useAppArticleStoreActions({ storeRef, applyStore });
  const settingsDrafts = useSettingsDrafts({ store, storeSyncSnapshot, applyStore });
  const { agentSaveError, agentSaveState, toggleAgent } = useAppAgentActions({ applyStore });
  const showOnboarding = !appLocked && (onboardingForced || !store.settings.onboardingCompletedAt);

  useEffect(() => {
    if (!appLocked) return;
    setLibraryReaderOpen(false);
    setPendingOpenArticleId(null);
    setProfileDialogOpen(false);
    setProfileDialogSourceRect(undefined);
    setStatsArticles(null);
    setStatsNavigationStartedAt(undefined);
    setThemeDialogOpen(false);
  }, [appLocked]);

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
      preloadIdleModules();
    });
    return () => cancelIdlePreload(idleId);
  }, [showOnboarding, storeLoadError, storeLoaded]);

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
    applySavedSettings(nextStore, applyStore);
    if (settings.onboardingCompletedAt) setOnboardingForced(false);
    return nextStore;
  }

  async function saveLibrarySettings(settings: AppSettings) {
    const nextStore = await window.yomitomoDesktop.saveSettings(settings);
    applySavedSettings(nextStore, applyStore);
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

  function openDataSources() {
    openSettings();
    changeSettingsSection('dataSources');
  }

  useEffect(() => {
    const desktop = window.yomitomoDesktop as Partial<typeof window.yomitomoDesktop> | undefined;
    if (typeof desktop?.onAppMenuCommand !== 'function') return;
    return desktop.onAppMenuCommand((command) => {
      if (appLocked) return;
      handleAppMenuCommand(command);
    });
  }, [appLocked, applyStore]);

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
      articleCount: statsArticles?.length ?? store.articles.length,
      rendererElapsedMs: elapsedMs(0),
      preloadStatus: preloadEntries.stats.status,
    });
    setActiveSetting('stats');
    void refreshStatsArticles();
  }

  async function refreshStatsArticles() {
    const desktop = window.yomitomoDesktop;
    if (typeof desktop?.readArticleStatsSummaries !== 'function') {
      setStatsArticles(storeRef.current.articles);
      return;
    }
    try {
      const articles = await desktop.readArticleStatsSummaries();
      setStatsArticles(articles);
    } catch {
      setStatsArticles(storeRef.current.articles);
    }
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

  function handleAppMenuCommand(command: AppMenuCommand) {
    if (command === 'open-settings') {
      openSettings();
      return;
    }
    if (command === 'open-about') {
      openSettings();
      changeSettingsSection('about');
      return;
    }
    if (command === 'backup-database') {
      void window.yomitomoDesktop.backupDatabase().catch(() => undefined);
      return;
    }
    if (command === 'restore-database') {
      void window.yomitomoDesktop
        .restoreDatabase()
        .then((result) => {
          if (!result.canceled) applyStore(result.store);
        })
        .catch(() => undefined);
      return;
    }
    if (command === 'check-updates') {
      void window.yomitomoDesktop.checkForUpdates().catch(() => undefined);
      return;
    }
    if (isLibraryMenuCommand(command)) {
      setActiveSetting('library');
      setLibraryMenuRequest({ command, id: ++menuRequestIdRef.current });
    }
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
    <AppLockGate enabled={appLockEnabled} locked={appLocked} onStoreUpdated={applyStore}>
      {({ enabled: lockEnabled, locked: lockOverlayVisible, lockApp, shortcutLabel }) => (
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
            {updateReady ? (
              <button
                type="button"
                className="app-nav-update-button"
                aria-label={t('nav.updateAvailableTooltip')}
                data-tooltip={t('nav.updateAvailableTooltip')}
                onClick={() => {
                  openSettings();
                  changeSettingsSection('about');
                  setUpdateDialogRequest((n) => n + 1);
                }}
              >
                <PartyPopper aria-hidden="true" size={13} />
                {t('nav.updateAvailable')}
              </button>
            ) : null}
            {lockEnabled ? (
              <button
                aria-label={t('appLock.lockNow', { shortcut: shortcutLabel })}
                className="app-nav-lock-button"
                data-tooltip={t('appLock.lockNow', { shortcut: shortcutLabel })}
                type="button"
                onClick={() => void lockApp()}
              >
                <LockKeyhole aria-hidden="true" size={18} />
              </button>
            ) : null}
            <ThemeSelector
              activeThemeId={theme.activeThemeId}
              open={themeDialogOpen}
              readerBackgroundColor={theme.readerBackgroundColor}
              soundSettings={store.settings}
              readerBackgroundsByTone={theme.readerBackgroundsByTone}
              themeIdsByTone={theme.themeIdsByTone}
              onOpenChange={setThemeDialogOpen}
              onSelectReaderBackground={theme.selectReaderBackground}
              onSelectTheme={(themeId, backgroundColor) =>
                void theme.selectTheme(themeId, backgroundColor)
              }
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
                  collectionMembers={store.collectionMembers}
                  collections={store.collections}
                  messageSendShortcut={store.settings.messageSendShortcut}
                  pins={store.pins}
                  readerTheme={theme.readerTheme}
                  settings={store.settings}
                  selectionActionShortcuts={store.settings.selectionActionShortcuts}
                  menuRequest={libraryMenuRequest}
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
                  onSaveArticleAnnotation={saveArticleAnnotation}
                  onSaveArticleComment={saveArticleComment}
                  onSaveArticleReadingProgress={saveArticleReadingProgress}
                  onSaveArticleReaderChatState={saveArticleReaderChatState}
                  onSaveSettings={saveLibrarySettings}
                  onOpenDataSources={openDataSources}
                  onUpdateArticle={updateArticle}
                />
              ) : null}
              {activeSetting === 'stats' ? (
                <ActiveReadingStatsPanel
                  agents={store.agents}
                  articles={statsArticles || store.articles}
                  navigationStartedAt={statsNavigationStartedAt}
                  settings={store.settings}
                  onRefresh={() => void refreshStatsArticles()}
                />
              ) : null}
              {activeSetting === 'settings' ? (
                <ActiveSettingsSectionShell
                  activeSection={activeSettingsSection}
                  developerModeEnabled={Boolean(store.settings.developerModeEnabled)}
                  onSectionChange={changeSettingsSection}
                >
                  {activeSettingsSection === 'collection' ? (
                    <ActiveGeneralSettings draft={settingsDrafts.general} />
                  ) : null}
                  {activeSettingsSection === 'models' ? (
                    <ActiveProviderSettings
                      providerDraft={settingsDrafts.provider}
                      routesDraft={settingsDrafts.routes}
                      providers={store.providers}
                    />
                  ) : null}
                  {activeSettingsSection === 'dataSources' ? <ActiveDataSourcesPanel /> : null}
                  {activeSettingsSection === 'shortcuts' ? (
                    <ActiveShortcutSettings draft={settingsDrafts.shortcuts} />
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
                profileDraft={settingsDrafts.profile}
                onClose={() => setProfileDialogOpen(false)}
                onSaved={() => window.setTimeout(() => setProfileDialogOpen(false), 700)}
                sourceRect={profileDialogSourceRect}
              />
            </Suspense>
          ) : null}
          {!lockOverlayVisible ? (
            <UpdateReleaseDialog
              store={store}
              updateState={appUpdateState}
              openRequest={updateDialogRequest}
              onSaveSettings={async (settings) => {
                const nextStore = await window.yomitomoDesktop.saveSettings(settings);
                applySavedSettings(nextStore, applyStore);
                return nextStore;
              }}
            />
          ) : null}
          <AppToaster tone={theme.tone} topOffset={toastTopOffset} />
        </main>
      )}
    </AppLockGate>
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

function isLibraryMenuCommand(command: AppMenuCommand) {
  return (
    command === 'import-web' ||
    command === 'import-ebook' ||
    command === 'import-pdf' ||
    command === 'sync-weread'
  );
}
