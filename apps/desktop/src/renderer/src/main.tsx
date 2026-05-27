import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppSettings, ArticleSummaryRecord } from '@yomitomo/shared';

import type { SettingsSectionKey } from './app-settings-panels';
import { AvatarImage } from './app-ui';
import { useAppAgentActions } from './app-agent-actions';
import { useAppArticleStoreActions } from './app-article-store-actions';
import { useDesktopStoreState } from './app-desktop-store-state';
import { useSettingsDrafts } from './app-settings-drafts';
import { SettingsNavButton } from './app-settings-nav-button';
import { StoreLoadErrorScreen } from './app-store-load-error';
import './styles.css';

const rendererModuleLoadedAt = performance.now();
const loadReadingLibrary = () =>
  import('./app-reading-library').then((module) => ({ default: module.ReadingLibrary }));
const loadReadingStatsModule = () => preloadEntries.stats.load();
const loadReadingStatsPanel = () =>
  loadReadingStatsModule().then((module) => ({ default: module.ReadingStatsPanel }));
const loadOnboardingFlow = () =>
  import('./app-onboarding').then((module) => ({ default: module.OnboardingFlow }));
const loadAgentSettings = () =>
  preloadEntries.agents.load().then((module) => ({ default: module.AgentSettings }));
const loadDataManagementSettings = () =>
  preloadEntries.settingsPanels
    .load()
    .then((module) => ({ default: module.DataManagementSettings }));
const loadGeneralSettings = () =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.GeneralSettings }));
const loadProviderSettings = () =>
  preloadEntries.settingsProvider.load().then((module) => ({ default: module.ProviderSettings }));
const loadShortcutSettings = () =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.ShortcutSettings }));
const loadWeReadSettingsPanel = () =>
  preloadEntries.settingsPanels.load().then((module) => ({ default: module.WeReadSettingsPanel }));
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
const GeneralSettings = lazy(loadGeneralSettings);
const ProviderSettings = lazy(loadProviderSettings);
const ShortcutSettings = lazy(loadShortcutSettings);
const WeReadSettingsPanel = lazy(loadWeReadSettingsPanel);
const SettingsSectionShell = lazy(loadSettingsSectionShell);
const UserProfileSettingsDialog = lazy(loadUserProfileSettingsDialog);
const AboutSettings = lazy(loadAboutSettings);

type ReadingStatsModule = typeof import('./app-reading-stats');
type AgentSettingsModule = typeof import('./app-settings-agent-panel');
type SettingsPanelsModule = typeof import('./app-settings-panels');
type SettingsProviderModule = typeof import('./app-settings-provider-panel');
type SettingsAboutModule = typeof import('./app-log-viewer');
type ProfileDialogModule = typeof import('./app-settings-profile-dialog');

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
    () => import('./app-settings-agent-panel'),
  ),
  stats: createPreloadEntry<ReadingStatsModule>('stats', () => import('./app-reading-stats')),
  settingsPanels: createPreloadEntry<SettingsPanelsModule>(
    'settings-panels',
    () => import('./app-settings-panels'),
  ),
  settingsProvider: createPreloadEntry<SettingsProviderModule>(
    'settings-provider',
    () => import('./app-settings-provider-panel'),
  ),
  settingsAbout: createPreloadEntry<SettingsAboutModule>(
    'settings-about',
    () => import('./app-log-viewer'),
  ),
  profileDialog: createPreloadEntry<ProfileDialogModule>(
    'profile-dialog',
    () => import('./app-settings-profile-dialog'),
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
  const [activeSetting, setActiveSetting] = useState<SettingKey>('library');
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionKey>('collection');
  const [, setPreloadVersion] = useState(0);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
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
  const {
    deleteArticle,
    deleteArticleAnnotation,
    deleteArticleComment,
    readArticle,
    saveArticle,
    updateArticle,
    saveArticleReadingProgress,
    importArticleUrl,
    importEbookFile,
    importPdfFile,
  } = useAppArticleStoreActions({ storeRef, applyStore });
  const {
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

  async function saveOnboardingSettings(settings: AppSettings) {
    const nextStore = await window.yomitomoDesktop.saveSettings(settings);
    applyStore(nextStore);
    if (settings.onboardingCompletedAt) setOnboardingForced(false);
    return nextStore;
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

  function openProfileDialog() {
    recordStartupTiming('secondary_modules.navigation', {
      key: 'profile-dialog',
      status: preloadEntries.profileDialog.status,
    });
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

  const today = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date());
  const appShellClassName = [
    'app-shell',
    `is-${window.yomitomoDesktop.platform ?? 'unknown'}`,
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
  const ActiveWeReadSettingsPanel =
    settingsPanelsModule?.WeReadSettingsPanel ?? WeReadSettingsPanel;
  const ActiveDataManagementSettings =
    settingsPanelsModule?.DataManagementSettings ?? DataManagementSettings;
  const ActiveProviderSettings = settingsProviderModule?.ProviderSettings ?? ProviderSettings;
  const ActiveAboutSettings = settingsAboutModule?.AboutSettings ?? AboutSettings;
  const ActiveUserProfileSettingsDialog =
    profileDialogModule?.UserProfileSettingsDialog ?? UserProfileSettingsDialog;

  return (
    <main className={appShellClassName}>
      <header className="app-masthead">
        <div className="app-masthead-title">
          <h1>
            Yomitomo <em>伴读</em>
          </h1>
        </div>
        <time className="app-masthead-date" dateTime={new Date().toISOString()}>
          {today}
        </time>
      </header>

      <nav className="app-section-nav" aria-label="主导航">
        <SettingsNavButton
          active={activeSetting === 'library'}
          label="阅读库"
          onClick={() => setActiveSetting('library')}
        />
        <SettingsNavButton active={activeSetting === 'agents'} label="助手" onClick={openAgents} />
        <SettingsNavButton active={activeSetting === 'stats'} label="统计" onClick={openStats} />
        <SettingsNavButton
          active={activeSetting === 'settings'}
          label="设置"
          onClick={openSettings}
        />
        <button
          aria-label="打开个人设置"
          className="app-nav-profile-button"
          data-tooltip="个人设置"
          type="button"
          onClick={openProfileDialog}
        >
          <AvatarImage
            value={store.user.avatar || ''}
            className="app-nav-profile-avatar"
            fallback={store.user.nickname?.slice(0, 1) || '我'}
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
              selectionActionShortcuts={store.settings.selectionActionShortcuts}
              openArticleId={pendingOpenArticleId}
              userProfile={store.user}
              onDeleteArticle={deleteArticle}
              onDeleteArticleAnnotation={deleteArticleAnnotation}
              onDeleteArticleComment={deleteArticleComment}
              onArticleOpened={() => setPendingOpenArticleId(null)}
              onImportArticleUrl={importArticleUrl}
              onImportEbookFile={importEbookFile}
              onImportPdfFile={importPdfFile}
              onReadingModeChange={setLibraryReaderOpen}
              onReadArticle={readArticle}
              onSaveArticle={saveArticle}
              onSaveArticleReadingProgress={saveArticleReadingProgress}
              onUpdateArticle={updateArticle}
            />
          ) : null}
          {activeSetting === 'stats' ? (
            <ActiveReadingStatsPanel
              articles={store.articles}
              navigationStartedAt={statsNavigationStartedAt}
              onRefresh={refreshStore}
            />
          ) : null}
          {activeSetting === 'settings' ? (
            <ActiveSettingsSectionShell
              activeSection={activeSettingsSection}
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
                  selectedId={selectedProviderId}
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
              {activeSettingsSection === 'weread' ? <ActiveWeReadSettingsPanel /> : null}
              {activeSettingsSection === 'shortcuts' ? (
                <ActiveShortcutSettings
                  savedSettings={store.settings}
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
          />
        </Suspense>
      ) : null}
    </main>
  );
}

function StartupShell() {
  return (
    <main className={`app-shell is-${window.yomitomoDesktop.platform ?? 'unknown'}`}>
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
      <div className="app-masthead-title">
        <h1>
          Yomitomo <em>伴读</em>
        </h1>
      </div>
    </header>
  );
}

function StartupNav() {
  return (
    <nav className="app-section-nav" aria-label="主导航">
      <button className="settings-nav-item is-active" disabled type="button">
        <span>阅读库</span>
      </button>
      <button className="settings-nav-item" disabled type="button">
        <span>助手</span>
      </button>
      <button className="settings-nav-item" disabled type="button">
        <span>统计</span>
      </button>
      <button className="settings-nav-item" disabled type="button">
        <span>设置</span>
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
createRoot(document.getElementById('root')!).render(<App />);
recordStartupTiming('react.render_scheduled');

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
