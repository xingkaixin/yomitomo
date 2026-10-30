import { HugeiconsIcon } from '@hugeicons/react';
import { LockKeyIcon } from '@hugeicons/core-free-icons';
import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppSettingsPatch, DesktopStore } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';

import { AppLockGate } from './app-lock/app-lock-gate';
import { AvatarImage } from './shell/app-ui';
import { useAppAgentActions } from './shell/app-agent-actions';
import { useAppArticleStoreActions } from './shell/app-article-store-actions';
import { useAppCollectionStoreActions } from './shell/app-library-collection-store-actions';
import {
  bindDesktopStoreEvents,
  bindMainWindowEvents,
  bindSettingsDraftEvents,
} from './shell/app-desktop-event-bindings';
import {
  createDesktopStore,
  DesktopStoreProvider,
  useDesktopStore,
  useDesktopStoreApi,
} from './shell/app-desktop-store';
import { IdleModulePreload, useSecondaryModulePreload } from './shell/app-secondary-module-preload';
import { applySavedSettings } from './settings/app-settings-application';
import { recordStartupTiming } from './shell/app-renderer-performance';
import { AppSessionStoreProvider, createAppSessionStore, useAppSession } from './shell/app-session';
import {
  activeSurfaceComponents,
  ReadingMemory,
  OnboardingFlow,
  ReadingLibrary,
} from './shell/app-surface-modules';
import {
  AppMasthead,
  desktopPlatform,
  LibrarySkeleton,
  StartupShell,
} from './shell/app-shell-chrome';
import {
  createSettingsDraftStore,
  SettingsDraftStoreProvider,
  useSettingsDrafts,
} from './settings/app-settings-drafts';
import { SettingsNavButton } from './settings/app-settings-nav-button';
import { getDesktopApi } from './shell/app-desktop-api';
import { StoreLoadErrorScreen } from './shell/app-store-load-error';
import { ThemeSelector } from './theme/app-theme-selector';
import {
  createReaderThemeStore,
  ReaderThemeStoreProvider,
  useReaderThemeController,
} from './theme/use-reader-theme-controller';
import { UpdateReleaseDialog } from './shell/app-update-dialog';
import { AppUpdateNavButton } from './shell/app-update-nav-button';
import { useAppUpdateState } from './shell/use-app-update-state';
import { initializeAppI18n } from './i18n/app-i18n';
import { readCachedUiLanguage } from './i18n/app-language-cache';
import { AppToaster, useHeaderToastOffset } from './shell/app-toast';
import './styles.css';
import 'goey-toast/styles.css';

const startupUiLanguage = readCachedUiLanguage();
initializeAppI18n(startupUiLanguage);

const rendererModuleLoadedAt = performance.now();

function App() {
  const appUpdateState = useAppUpdateState();
  useSecondaryModulePreload();
  const { refreshStore } = useDesktopStoreApi().getState();
  const loadedStore = useDesktopStore((state) => state.store);
  const loadError = useDesktopStore((state) => state.loadError);
  const storeStatus = loadError ? 'error' : loadedStore ? 'ready' : 'loading';
  const readyStore = loadError ? null : loadedStore;
  const appLockEnabled = Boolean(readyStore?.settings.appLockEnabled);
  const appLocked = Boolean(appLockEnabled && readyStore?.settings.appLockLocked);
  const session = useAppSession({
    appLocked,
    developerModeEnabled: Boolean(readyStore?.settings.developerModeEnabled),
    onboardingCompletedAt: readyStore?.settings.onboardingCompletedAt,
  });
  const theme = useReaderThemeController();

  useMountEffect(() => {
    recordStartupTiming('app.mounted');
    recordStartupTiming('window.show_requested', {
      reason: 'app.mounted',
      storeLoaded: storeStatus === 'ready',
      storeLoadError: storeStatus === 'error',
    });
    getDesktopApi().app.showMainWindow();
  });

  if (loadError) return <StoreLoadErrorView error={loadError} onRetry={refreshStore} />;
  if (!readyStore) return <StartupShell />;

  return (
    <ReadyApp appUpdateState={appUpdateState} session={session} store={readyStore} theme={theme} />
  );
}

function StoreLoadErrorView(props: Parameters<typeof StoreLoadErrorScreen>[0]) {
  useMountEffect(() => recordStoreReadyForUi(false));
  return <StoreLoadErrorScreen {...props} />;
}

function recordStoreReadyForUi(storeLoaded: boolean) {
  recordStartupTiming('store.ready_for_ui', { storeLoaded, storeLoadError: !storeLoaded });
}

function ReadyApp({
  appUpdateState,
  session,
  store,
  theme,
}: {
  appUpdateState: ReturnType<typeof useAppUpdateState>;
  session: ReturnType<typeof useAppSession>;
  store: DesktopStore;
  theme: ReturnType<typeof useReaderThemeController>;
}) {
  const { t } = useTranslation();
  const { getStore, applyStore, applySettingsPatch, articleStore } =
    useDesktopStoreApi().getState();
  const libraryCatalogRevision = useDesktopStore((state) => state.libraryCatalogRevision);
  const appLockEnabled = store.settings.appLockEnabled;
  const appLocked = appLockEnabled && store.settings.appLockLocked;
  const toastTopOffset = useHeaderToastOffset(session.readerOpen);

  useMountEffect(() => recordStoreReadyForUi(true));

  const articleActions = useAppArticleStoreActions({ articleStore });
  const {
    addCollectionMembers,
    createCollection,
    deleteCollection,
    removeCollectionMember,
    renameCollection,
    setLibraryPin,
  } = useAppCollectionStoreActions({ getStore, applyStore });
  const settingsDrafts = useSettingsDrafts();
  const { agentSaveError, agentSaveState, toggleAgent } = useAppAgentActions({
    applySettingsPatch,
  });

  async function saveSettings(settings: AppSettingsPatch) {
    const nextStore = await getDesktopApi().store.saveSettings(settings);
    applySavedSettings(nextStore, applyStore);
    return nextStore;
  }

  if (session.showOnboarding) {
    return (
      <Suspense fallback={null}>
        <OnboardingFlow
          key={session.onboardingFlowKey}
          onSaveSettings={saveSettings}
          onStartReading={(command) => {
            session.actions.completeOnboarding();
            if (command) session.actions.runMenuCommand(command);
            else session.actions.openLibrary();
          }}
        />
      </Suspense>
    );
  }

  const appShellClassName = [
    'app-shell',
    `is-${desktopPlatform()}`,
    session.readerOpen ? 'is-reader-open' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const surfaces = activeSurfaceComponents();

  return (
    <AppLockGate enabled={appLockEnabled} locked={appLocked} onStoreUpdated={applyStore}>
      {({ enabled: lockEnabled, locked: lockOverlayVisible, lockApp, shortcutLabel }) => (
        <main className={appShellClassName}>
          <IdleModulePreload />
          <AppMasthead settings={store.settings}>
            <nav className="app-section-nav" aria-label={t('nav.main')}>
              <div className="app-section-links">
                <SettingsNavButton
                  active={session.surface === 'library'}
                  label={t('nav.library')}
                  onClick={session.actions.openLibrary}
                />
                <SettingsNavButton
                  active={session.surface === 'reading-memory'}
                  label={t('nav.readingMemory')}
                  onClick={session.actions.openReadingMemory}
                />
                <SettingsNavButton
                  active={session.surface === 'agents'}
                  label={t('nav.agents')}
                  onClick={session.actions.openAgents}
                />
                <SettingsNavButton
                  active={session.surface === 'stats'}
                  label={t('nav.stats')}
                  onClick={session.actions.openStats}
                />
                <SettingsNavButton
                  active={session.surface === 'settings'}
                  label={t('nav.settings')}
                  onClick={session.actions.openSettings}
                />
              </div>
              <div className="app-section-actions">
                <AppUpdateNavButton
                  state={appUpdateState}
                  onClick={session.actions.requestUpdateDialog}
                />
                {lockEnabled ? (
                  <button
                    aria-label={t('appLock.lockNow', { shortcut: shortcutLabel })}
                    className="app-nav-lock-button"
                    data-tooltip={t('appLock.lockNow', { shortcut: shortcutLabel })}
                    type="button"
                    onClick={() => void lockApp()}
                  >
                    <HugeiconsIcon icon={LockKeyIcon} aria-hidden="true" size={18} />
                  </button>
                ) : null}
                <ThemeSelector
                  activeThemeId={theme.activeThemeId}
                  open={session.themeDialogOpen}
                  readerBackgroundColor={theme.readerBackgroundColor}
                  soundSettings={store.settings}
                  readerBackgroundsByTone={theme.readerBackgroundsByTone}
                  themeIdsByTone={theme.themeIdsByTone}
                  onOpenChange={session.actions.setThemeDialogOpen}
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
                  onClick={(event) => session.actions.openProfileDialog(event.currentTarget)}
                >
                  <AvatarImage
                    value={store.user.avatar || ''}
                    className="app-nav-profile-avatar"
                    fallback={store.user.nickname?.slice(0, 1) || t('common.me')}
                  />
                </button>
              </div>
            </nav>
          </AppMasthead>

          <section className="settings-content">
            <Suspense fallback={<LibrarySkeleton />}>
              {session.surface === 'library' ? (
                <ReadingLibrary
                  agents={store.agents}
                  articleActions={articleActions}
                  articleStore={articleStore}
                  articles={store.articles}
                  catalogRevision={libraryCatalogRevision}
                  collectionMembers={store.collectionMembers}
                  collections={store.collections}
                  messageSendShortcut={store.settings.messageSendShortcut}
                  libraryQuery={session.libraryQuery}
                  readerTheme={theme.readerTheme}
                  settings={store.settings}
                  selectionActionShortcuts={store.settings.selectionActionShortcuts}
                  menuRequest={session.menuRequest}
                  openArticleTarget={session.pendingOpenArticle}
                  userProfile={store.user}
                  onAddCollectionMembers={addCollectionMembers}
                  onCreateCollection={createCollection}
                  onDeleteCollection={deleteCollection}
                  onArticleOpened={session.actions.setPendingArticleOpened}
                  onReadingModeChange={session.actions.setReaderOpen}
                  onRemoveCollectionMember={removeCollectionMember}
                  onRenameCollection={renameCollection}
                  onSaveSettings={async (settings) => void (await saveSettings(settings))}
                  onSetLibraryPin={setLibraryPin}
                  onOpenDataSources={() => session.actions.openSettingsSection('dataSources')}
                />
              ) : null}
              {session.surface === 'reading-memory' ? (
                <ReadingMemory
                  collections={store.collections}
                  catalogRevision={libraryCatalogRevision}
                  onOpenEvidenceSource={session.actions.openEvidenceSource}
                />
              ) : null}
              {session.surface === 'stats' ? (
                <surfaces.ReadingStatsPanel
                  agents={store.agents}
                  articles={session.statsArticles || store.articles}
                  navigationStartedAt={session.statsNavigationStartedAt}
                  onRefresh={session.actions.refreshStatsArticles}
                />
              ) : null}
              {session.surface === 'settings' ? (
                <surfaces.SettingsSectionShell
                  activeSection={session.settingsSection}
                  developerModeEnabled={store.settings.developerModeEnabled}
                  onSectionChange={session.actions.changeSettingsSection}
                >
                  {session.settingsSection === 'collection' ? (
                    <surfaces.GeneralSettings draft={settingsDrafts.general} />
                  ) : null}
                  {session.settingsSection === 'models' ? (
                    <surfaces.ProviderSettings
                      providerDraft={settingsDrafts.provider}
                      routesDraft={settingsDrafts.routes}
                      providers={store.providers}
                    />
                  ) : null}
                  {session.settingsSection === 'dataSources' ? <surfaces.DataSourcesPanel /> : null}
                  {session.settingsSection === 'shortcuts' ? (
                    <surfaces.ShortcutSettings draft={settingsDrafts.shortcuts} />
                  ) : null}
                  {session.settingsSection === 'data' ? (
                    <surfaces.DataManagementSettings
                      settings={store.settings}
                      onStoreUpdated={applyStore}
                    />
                  ) : null}
                  {session.settingsSection === 'aiTrace' && store.settings.developerModeEnabled ? (
                    <surfaces.AiTraceSettingsPanel
                      agents={store.agents}
                      providers={store.providers}
                    />
                  ) : null}
                  {session.settingsSection === 'about' ? (
                    <surfaces.AboutSettings
                      settings={store.settings}
                      onStartOnboarding={session.actions.startOnboarding}
                      onStoreUpdated={applyStore}
                    />
                  ) : null}
                </surfaces.SettingsSectionShell>
              ) : null}
              {session.surface === 'agents' ? (
                <surfaces.AgentSettings
                  agents={store.agents}
                  error={agentSaveError}
                  providers={store.providers}
                  settings={store.settings}
                  saveState={agentSaveState}
                  onConfigureRoutes={() => session.actions.openSettingsSection('models')}
                  onToggle={toggleAgent}
                />
              ) : null}
            </Suspense>
          </section>
          {session.profileDialogOpen ? (
            <Suspense fallback={null}>
              <surfaces.UserProfileSettingsDialog
                profileDraft={settingsDrafts.profile}
                onClose={session.actions.closeProfileDialog}
                onSaved={() => window.setTimeout(session.actions.closeProfileDialog, 700)}
                sourceRect={session.profileDialogSourceRect}
              />
            </Suspense>
          ) : null}
          {!lockOverlayVisible ? (
            <UpdateReleaseDialog
              store={store}
              updateState={appUpdateState}
              openRequest={session.updateDialogRequest}
              onSaveSettings={saveSettings}
            />
          ) : null}
          <AppToaster tone={theme.tone} topOffset={toastTopOffset} />
        </main>
      )}
    </AppLockGate>
  );
}

recordStartupTiming('renderer.module_loaded', {
  preloadLoadedAt: getDesktopApi().startupTiming.preloadLoadedAt,
  rendererModuleLoadedAt,
});

// Annotation windows share this entry; the main window should not parse their apps.
const AnnotationDiscussionWindowApp = lazy(() =>
  import('./annotation-discussion/app-annotation-discussion-window').then((module) => ({
    default: module.AnnotationDiscussionWindowApp,
  })),
);
const AnnotationSedimentationWindowApp = lazy(() =>
  import('./annotation-discussion/app-annotation-sedimentation-window').then((module) => ({
    default: module.AnnotationSedimentationWindowApp,
  })),
);

function createMainWindow() {
  const desktopStore = createDesktopStore();
  const sessionStore = createAppSessionStore(desktopStore);
  const themeStore = createReaderThemeStore({ applyStore: desktopStore.getState().applyStore });
  const settingsDraftStore = createSettingsDraftStore(desktopStore);
  const unbindDesktopStoreEvents = bindDesktopStoreEvents(desktopStore);
  const unbindMainWindowEvents = bindMainWindowEvents({ desktopStore, sessionStore, themeStore });
  const unbindSettingsDraftEvents = bindSettingsDraftEvents(desktopStore, settingsDraftStore);
  void desktopStore.getState().refreshStore();
  import.meta.hot?.dispose(() => {
    unbindSettingsDraftEvents();
    unbindMainWindowEvents();
    unbindDesktopStoreEvents();
  });
  return (
    <DesktopStoreProvider store={desktopStore}>
      <AppSessionStoreProvider store={sessionStore}>
        <ReaderThemeStoreProvider store={themeStore}>
          <SettingsDraftStoreProvider store={settingsDraftStore}>
            <App />
          </SettingsDraftStoreProvider>
        </ReaderThemeStoreProvider>
      </AppSessionStoreProvider>
    </DesktopStoreProvider>
  );
}

const rendererWindowKind = new URLSearchParams(window.location.search).get('window');
const rootApp =
  rendererWindowKind === 'annotation-discussion' ? (
    <AnnotationDiscussionWindowApp />
  ) : rendererWindowKind === 'annotation-sedimentation' ? (
    <AnnotationSedimentationWindowApp />
  ) : (
    createMainWindow()
  );

createRoot(document.getElementById('root')!).render(<Suspense fallback={null}>{rootApp}</Suspense>);
recordStartupTiming('react.render_scheduled');
