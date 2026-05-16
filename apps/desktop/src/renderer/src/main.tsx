import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, BookOpen, Bot, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react';
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
import { selectDailyQuote } from './app-daily-quote';
import { AvatarImage } from './app-ui';
import { useAppAgentActions } from './app-agent-actions';
import { useAppArticleStoreActions } from './app-article-store-actions';
import { useDesktopStoreState } from './app-desktop-store-state';
import { useSettingsDrafts } from './app-settings-drafts';
import './styles.css';

type SettingKey = 'library' | 'stats' | 'settings' | 'agents';

function App() {
  const [activeSetting, setActiveSetting] = useState<SettingKey>('library');
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionKey>('collection');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [pendingOpenArticleId, setPendingOpenArticleId] = useState<string | null>(null);
  const [onboardingForced, setOnboardingForced] = useState(false);
  const [onboardingFlowKey, setOnboardingFlowKey] = useState(0);
  const [dailyQuote, setDailyQuote] = useState(() => selectDailyQuote([], { storage: null }));

  const { store, storeLoaded, storeSyncSnapshot, storeRef, refreshStore, applyStore } =
    useDesktopStoreState();
  const {
    deleteArticle,
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
    if (!storeLoaded) return;
    setDailyQuote(selectDailyQuote(store.articles, { agents: store.agents }));
  }, [store.agents, store.articles, storeLoaded]);

  useEffect(() => {
    if (!storeLoaded) return;
    window.yomitomoDesktop.showMainWindow();
  }, [storeLoaded]);

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

  return (
    <main className={sidebarCollapsed ? 'app-shell is-sidebar-collapsed' : 'app-shell'}>
      <header className="app-window-header">
        <button
          aria-label={sidebarCollapsed ? '展开导航栏' : '折叠导航栏'}
          className="sidebar-collapse-button"
          type="button"
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        <div className="app-header-copy">
          <h1>Yomitomo</h1>
          <p>伴读 · 你的 AI 阅读伙伴</p>
        </div>
      </header>

      <section className="app-layout">
        <aside className="settings-sidebar">
          <nav className="settings-nav">
            <SettingsNavButton
              active={activeSetting === 'library'}
              collapsed={sidebarCollapsed}
              icon={<BookOpen size={18} />}
              label="阅读库"
              onClick={() => setActiveSetting('library')}
            />
            <SettingsNavButton
              active={activeSetting === 'agents'}
              collapsed={sidebarCollapsed}
              icon={<Bot size={18} />}
              label="助手"
              onClick={() => setActiveSetting('agents')}
            />
            <SettingsNavButton
              active={activeSetting === 'stats'}
              collapsed={sidebarCollapsed}
              icon={<BarChart3 size={18} />}
              label="统计"
              onClick={() => setActiveSetting('stats')}
            />
            <SettingsNavButton
              active={activeSetting === 'settings'}
              collapsed={sidebarCollapsed}
              icon={<Settings size={18} />}
              label="设置"
              onClick={() => setActiveSetting('settings')}
            />
          </nav>

          <div className="sidebar-note">
            <div className="daily-quote-card">
              <div className="daily-quote-header">
                {dailyQuote.assistant ? (
                  <AvatarImage
                    value={dailyQuote.assistant.avatar}
                    className="daily-quote-avatar"
                    fallback={dailyQuote.assistant.name.slice(0, 1) || '助'}
                  />
                ) : null}
                <div className="daily-quote-title">
                  <strong>{dailyQuote.title}</strong>
                  {dailyQuote.meta ? <span>{dailyQuote.meta}</span> : null}
                </div>
              </div>
              <blockquote>“{dailyQuote.text}”</blockquote>
            </div>
          </div>

          <button
            aria-label="打开个人设置"
            className="sidebar-profile-button"
            type="button"
            onClick={() => setProfileDialogOpen(true)}
          >
            <AvatarImage
              value={store.user.avatar || ''}
              className="sidebar-profile-avatar"
              fallback={store.user.nickname?.slice(0, 1) || '我'}
            />
            <span>{store.user.nickname || '我'}</span>
          </button>
        </aside>

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
              onRefresh={refreshStore}
              onImportArticleUrl={importArticleUrl}
              onImportEbookFile={importEbookFile}
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
              {activeSettingsSection === 'data' ? <DataManagementSettings /> : null}
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
