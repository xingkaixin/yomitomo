import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AppSettings } from '@yomitomo/shared';

import { ReadingLibrary } from './app-reading-library';
import { ReadingStatsPanel } from './app-reading-stats';
import { OnboardingFlow } from './app-onboarding';
import {
  AgentSettings,
  DataManagementSettings,
  GeneralSettings,
  ProviderSettings,
  ShortcutSettings,
  SettingsSectionShell,
  SettingsNavButton,
  UserProfileSettingsDialog,
  type SettingsSectionKey,
} from './app-settings-panels';
import { AboutSettings } from './app-log-viewer';
import { AvatarImage } from './app-ui';
import { useAppAgentActions } from './app-agent-actions';
import { useAppArticleStoreActions } from './app-article-store-actions';
import { useDesktopStoreState } from './app-desktop-store-state';
import { useSettingsDrafts } from './app-settings-drafts';
import { StoreLoadErrorScreen } from './app-store-load-error';
import './styles.css';

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
    window.yomitomoDesktop.showMainWindow();
  }, [storeLoadError, storeLoaded]);

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

  if (storeLoadError) {
    return <StoreLoadErrorScreen error={storeLoadError} onRetry={refreshStore} />;
  }

  if (!storeLoaded) return null;

  if (showOnboarding) {
    return (
      <OnboardingFlow
        key={onboardingFlowKey}
        store={store}
        onSaveSettings={saveOnboardingSettings}
      />
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
        <SettingsNavButton
          active={activeSetting === 'stats'}
          label="统计"
          onClick={() => setActiveSetting('stats')}
        />
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
            onReadingModeChange={setLibraryReaderOpen}
            onReadArticle={readArticle}
            onSaveArticle={saveArticle}
            onSaveArticleReadingProgress={saveArticleReadingProgress}
            onUpdateArticle={updateArticle}
          />
        ) : null}
        {activeSetting === 'stats' ? (
          <ReadingStatsPanel articles={store.articles} onRefresh={refreshStore} />
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
            saveState={agentSaveState}
            onToggle={toggleAgent}
          />
        ) : null}
      </section>
      {profileDialogOpen ? (
        <UserProfileSettingsDialog
          draft={userDraft}
          canSave={canSaveUser}
          onChange={updateUserDraft}
          onClose={() => setProfileDialogOpen(false)}
          onSave={saveProfileDraft}
          saveState={profileSaveState}
        />
      ) : null}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
