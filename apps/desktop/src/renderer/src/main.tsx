import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppSettings, ArticleRecord } from '@yomitomo/shared';

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
const loadReadingStatsModule = () => import('./app-reading-stats');
const loadReadingStatsPanel = () =>
  loadReadingStatsModule().then((module) => ({ default: module.ReadingStatsPanel }));
const loadOnboardingFlow = () =>
  import('./app-onboarding').then((module) => ({ default: module.OnboardingFlow }));
const loadAgentSettings = () =>
  import('./app-settings-agent-panel').then((module) => ({ default: module.AgentSettings }));
const loadDataManagementSettings = () =>
  import('./app-settings-panels').then((module) => ({ default: module.DataManagementSettings }));
const loadGeneralSettings = () =>
  import('./app-settings-panels').then((module) => ({ default: module.GeneralSettings }));
const loadProviderSettings = () =>
  import('./app-settings-provider-panel').then((module) => ({ default: module.ProviderSettings }));
const loadShortcutSettings = () =>
  import('./app-settings-panels').then((module) => ({ default: module.ShortcutSettings }));
const loadSettingsSectionShell = () =>
  import('./app-settings-panels').then((module) => ({ default: module.SettingsSectionShell }));
const loadUserProfileSettingsDialog = () =>
  import('./app-settings-profile-dialog').then((module) => ({
    default: module.UserProfileSettingsDialog,
  }));
const loadAboutSettings = () =>
  import('./app-log-viewer').then((module) => ({ default: module.AboutSettings }));

const ReadingLibrary = lazy(loadReadingLibrary);
const ReadingStatsPanel = lazy(loadReadingStatsPanel);
const OnboardingFlow = lazy(loadOnboardingFlow);
const AgentSettings = lazy(loadAgentSettings);
const DataManagementSettings = lazy(loadDataManagementSettings);
const GeneralSettings = lazy(loadGeneralSettings);
const ProviderSettings = lazy(loadProviderSettings);
const ShortcutSettings = lazy(loadShortcutSettings);
const SettingsSectionShell = lazy(loadSettingsSectionShell);
const UserProfileSettingsDialog = lazy(loadUserProfileSettingsDialog);
const AboutSettings = lazy(loadAboutSettings);

const idlePreloadModules = [
  loadAgentSettings,
  loadSettingsSectionShell,
  loadGeneralSettings,
  loadProviderSettings,
  loadShortcutSettings,
  loadDataManagementSettings,
  loadAboutSettings,
  loadUserProfileSettingsDialog,
];

function preloadIdleModules(articles: ArticleRecord[]) {
  void Promise.allSettled(idlePreloadModules.map((load) => load()));
  void loadReadingStatsModule()
    .then((module) => module.preloadReadingStatsFirstPaintData(articles))
    .catch(() => undefined);
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

type SettingKey = 'library' | 'stats' | 'settings' | 'agents';

function App() {
  const [activeSetting, setActiveSetting] = useState<SettingKey>('library');
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionKey>('collection');
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [libraryReaderOpen, setLibraryReaderOpen] = useState(false);
  const [pendingOpenArticleId, setPendingOpenArticleId] = useState<string | null>(null);
  const [onboardingForced, setOnboardingForced] = useState(false);
  const [onboardingFlowKey, setOnboardingFlowKey] = useState(0);
  const [statsNavigationStartedAt, setStatsNavigationStartedAt] = useState<number | undefined>();
  const windowShowRequestedRef = useRef(false);

  useEffect(() => {
    recordStartupTiming('app.mounted');
    requestMainWindow('app.mounted', { storeLoaded: false, storeLoadError: false });
  }, []);

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
    setActiveSetting('settings');
    setActiveSettingsSection('models');
  }

  function openStats() {
    const startedAt = performance.now();
    setStatsNavigationStartedAt(startedAt);
    recordStatsTiming('navigation_click', {
      articleCount: store.articles.length,
      rendererElapsedMs: elapsedMs(0),
    });
    setActiveSetting('stats');
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
        <SettingsNavButton
          active={activeSetting === 'agents'}
          label="助手"
          onClick={() => setActiveSetting('agents')}
        />
        <SettingsNavButton active={activeSetting === 'stats'} label="统计" onClick={openStats} />
        <SettingsNavButton
          active={activeSetting === 'settings'}
          label="设置"
          onClick={() => setActiveSetting('settings')}
        />
        <button
          aria-label="打开个人设置"
          className="app-nav-profile-button"
          data-tooltip="个人设置"
          type="button"
          onClick={() => setProfileDialogOpen(true)}
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
            <ReadingStatsPanel
              articles={store.articles}
              navigationStartedAt={statsNavigationStartedAt}
              onRefresh={refreshStore}
            />
          ) : null}
          {activeSetting === 'settings' ? (
            <SettingsSectionShell
              activeSection={activeSettingsSection}
              onSectionChange={setActiveSettingsSection}
            >
              {activeSettingsSection === 'collection' ? (
                <GeneralSettings
                  settingsDraft={settingsDraft}
                  canSave={canSaveGeneralSettings}
                  onSettingsChange={updateGeneralSettingsDraft}
                  onSave={saveGeneralSettingsDraft}
                  saveState={generalSaveState}
                />
              ) : null}
              {activeSettingsSection === 'models' ? (
                <ProviderSettings
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
                  routeSaveState={routeSaveState}
                  onRouteSave={saveProviderRoutes}
                  onSelect={selectProvider}
                  onTest={testProvider}
                />
              ) : null}
              {activeSettingsSection === 'shortcuts' ? (
                <ShortcutSettings
                  savedSettings={store.settings}
                  settingsDraft={settingsDraft}
                  canSave={canSaveShortcutSettings}
                  onSettingsChange={updateShortcutSettingsDraft}
                  onSave={saveShortcutSettingsDraft}
                  saveState={shortcutSaveState}
                />
              ) : null}
              {activeSettingsSection === 'data' ? (
                <DataManagementSettings settings={store.settings} onStoreUpdated={applyStore} />
              ) : null}
              {activeSettingsSection === 'about' ? (
                <AboutSettings onStartOnboarding={startOnboarding} />
              ) : null}
            </SettingsSectionShell>
          ) : null}
          {activeSetting === 'agents' ? (
            <AgentSettings
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
          <UserProfileSettingsDialog
            draft={userDraft}
            canSave={canSaveUser}
            onChange={updateUserDraft}
            onClose={() => setProfileDialogOpen(false)}
            onSave={async () => {
              if (await saveProfileDraft())
                window.setTimeout(() => setProfileDialogOpen(false), 700);
            }}
            saveState={profileSaveState}
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
