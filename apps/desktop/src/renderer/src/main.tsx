import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  BookOpen,
  Bot,
  Info,
  KeyRound,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from 'lucide-react';
import type {
  Agent,
  AppSettings,
  ArticleRecord,
  DesktopStore,
  LlmProvider,
} from '@yomitomo/shared';
import {
  defaultUser,
  emptyProvider,
  emptyStore,
  providerDraftHasChanges,
  userDraftHasChanges,
  type ProviderDraft,
  type UserDraft,
} from './app-settings';
import { ReadingLibrary } from './app-reading-library';
import { ReadingStatsPanel } from './app-reading-stats';
import { ExtensionConnectionButton, ExtensionConnectionDialog } from './app-extension-connection';
import {
  AgentSettings,
  GeneralSettings,
  ProviderSettings,
  SettingsNavButton,
  UserProfileSettingsDialog,
} from './app-settings-panels';
import { AboutSettings } from './app-log-viewer';
import { selectDailyQuote } from './app-daily-quote';
import type { SaveState } from './app-types';
import { AvatarImage } from './app-ui';
import type { PairingConnectionStatus, PairingInfo } from '../../preload';
import './styles.css';

type SettingKey = 'library' | 'stats' | 'general' | 'providers' | 'agents' | 'about';

function App() {
  const [store, setStore] = useState<DesktopStore>(emptyStore);
  const [activeSetting, setActiveSetting] = useState<SettingKey>('library');
  const [userDraft, setUserDraft] = useState<UserDraft>(defaultUser);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>({});
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(emptyProvider);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [testState, setTestState] = useState('');
  const [agentSaveError, setAgentSaveError] = useState('');
  const [profileSaveState, setProfileSaveState] = useState<SaveState>('idle');
  const [generalSaveState, setGeneralSaveState] = useState<SaveState>('idle');
  const [providerSaveState, setProviderSaveState] = useState<SaveState>('idle');
  const [routeSaveState, setRouteSaveState] = useState<SaveState>('idle');
  const [agentSaveState, setAgentSaveState] = useState<SaveState>('idle');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [extensionConnectionDialogOpen, setExtensionConnectionDialogOpen] = useState(false);
  const [pairingInfo, setPairingInfo] = useState<PairingInfo | null>(null);
  const [pairingConnectionStatus, setPairingConnectionStatus] = useState<PairingConnectionStatus>({
    authenticatedSocketCount: 0,
  });
  const [storeLoaded, setStoreLoaded] = useState(false);
  const [dailyQuote, setDailyQuote] = useState(() => selectDailyQuote([], { storage: null }));

  useEffect(() => {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;

    refreshStore();
    refreshSavedPairingInfo();
    refreshPairingConnectionStatus();
    const offPairingConnectionStatus = desktop.onPairingConnectionStatus(
      setPairingConnectionStatus,
    );
    const offStoreUpdated = desktop.onStoreUpdated((nextStore) => {
      setStore(nextStore);
      setUserDraft(nextStore.user);
      setSettingsDraft(nextStore.settings);
      setStoreLoaded(true);
    });
    return () => {
      offPairingConnectionStatus();
      offStoreUpdated();
    };
  }, []);

  useEffect(() => {
    if (!storeLoaded) return;
    setDailyQuote(selectDailyQuote(store.articles, { agents: store.agents }));
  }, [store.agents, store.articles, storeLoaded]);

  const userHasChanges = useMemo(
    () => userDraftHasChanges(userDraft, store.user),
    [store.user, userDraft],
  );
  const settingsHasChanges = useMemo(
    () => Boolean(settingsDraft.saveArticleImages) !== Boolean(store.settings.saveArticleImages),
    [settingsDraft.saveArticleImages, store.settings.saveArticleImages],
  );
  const providerRoutesHaveChanges = useMemo(
    () =>
      (settingsDraft.readingAssistantProviderId || '') !==
        (store.settings.readingAssistantProviderId || '') ||
      (settingsDraft.reviewAssistantProviderId || '') !==
        (store.settings.reviewAssistantProviderId || '') ||
      (settingsDraft.readingNoteProviderId || '') !== (store.settings.readingNoteProviderId || ''),
    [
      settingsDraft.readingAssistantProviderId,
      settingsDraft.reviewAssistantProviderId,
      settingsDraft.readingNoteProviderId,
      store.settings.readingAssistantProviderId,
      store.settings.reviewAssistantProviderId,
      store.settings.readingNoteProviderId,
    ],
  );
  const selectedProvider = useMemo(
    () => store.providers.find((provider) => provider.id === selectedProviderId) || null,
    [selectedProviderId, store.providers],
  );
  const providerHasChanges = useMemo(
    () => providerDraftHasChanges(providerDraft, selectedProvider),
    [providerDraft, selectedProvider],
  );
  const canSaveProvider =
    providerSaveState !== 'saving' && (selectedProviderId ? providerHasChanges : true);
  const canSaveProviderRoutes = routeSaveState !== 'saving' && providerRoutesHaveChanges;
  const canSaveUser = profileSaveState !== 'saving' && userHasChanges;
  const canSaveGeneralSettings = generalSaveState !== 'saving' && settingsHasChanges;

  async function refreshStore() {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;

    const nextStore = await desktop.getState();
    setStore(nextStore);
    setUserDraft(nextStore.user);
    setSettingsDraft(nextStore.settings);
    setStoreLoaded(true);
    if (nextStore.providers[0]) selectProvider(nextStore.providers[0]);
  }

  async function refreshSavedPairingInfo() {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;

    setPairingInfo(await desktop.getSavedPairingInfo());
  }

  async function rotatePairingInfo() {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;

    setPairingInfo(await desktop.rotatePairingInfo());
    setPairingConnectionStatus({ authenticatedSocketCount: 0 });
  }

  async function refreshPairingConnectionStatus() {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;

    setPairingConnectionStatus(await desktop.getPairingConnectionStatus());
  }

  async function deleteArticle(articleId: string) {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;

    setStore(await desktop.deleteArticle(articleId));
  }

  async function saveArticle(article: ArticleRecord) {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;

    setStore(await desktop.saveArticle(article));
  }

  function selectProvider(provider: LlmProvider) {
    setSelectedProviderId(provider.id);
    setProviderDraft(provider);
    setTestState('');
    setProviderSaveState('idle');
  }

  function createProvider() {
    setSelectedProviderId(null);
    setProviderDraft(emptyProvider);
    setTestState('');
    setProviderSaveState('idle');
  }

  async function saveProfileDraft() {
    if (!window.yomitomoDesktop || !userHasChanges) return;
    setProfileSaveState('saving');
    try {
      const nextStore = await window.yomitomoDesktop.saveUser(userDraft);
      setStore(nextStore);
      setUserDraft(nextStore.user);
      setProfileSaveState('saved');
      window.setTimeout(() => setProfileSaveState('idle'), 1200);
    } catch {
      setProfileSaveState('idle');
    }
  }

  async function saveGeneralSettingsDraft() {
    if (!window.yomitomoDesktop || !settingsHasChanges) return;
    setGeneralSaveState('saving');
    try {
      const nextStore = await window.yomitomoDesktop.saveSettings(settingsDraft);
      setStore(nextStore);
      setSettingsDraft(nextStore.settings);
      setGeneralSaveState('saved');
      window.setTimeout(() => setGeneralSaveState('idle'), 1200);
    } catch {
      setGeneralSaveState('idle');
    }
  }

  async function saveProviderDraft() {
    if (!window.yomitomoDesktop || !canSaveProvider) return;
    setProviderSaveState('saving');
    try {
      const nextStore = await window.yomitomoDesktop.saveProvider(providerDraft);
      const savedProvider = providerDraft.id
        ? nextStore.providers.find((provider) => provider.id === providerDraft.id)
        : nextStore.providers.at(-1);
      setStore(nextStore);
      setTestState('');
      if (savedProvider) {
        setSelectedProviderId(savedProvider.id);
        setProviderDraft(savedProvider);
        setProviderSaveState('saved');
        window.setTimeout(() => setProviderSaveState('idle'), 1200);
      }
    } catch (error) {
      setTestState(error instanceof Error ? `保存失败：${error.message}` : '保存失败。');
      setProviderSaveState('idle');
    }
  }

  async function saveProviderRoutes() {
    if (!window.yomitomoDesktop || !canSaveProviderRoutes) return;
    setRouteSaveState('saving');
    try {
      const nextStore = await window.yomitomoDesktop.saveSettings(settingsDraft);
      setStore(nextStore);
      setSettingsDraft(nextStore.settings);
      setRouteSaveState('saved');
      window.setTimeout(() => setRouteSaveState('idle'), 1200);
    } catch {
      setRouteSaveState('idle');
    }
  }

  async function deleteProvider(id: string) {
    if (!window.yomitomoDesktop) return;
    const nextStore = await window.yomitomoDesktop.deleteProvider(id);
    setStore(nextStore);
    setSettingsDraft(nextStore.settings);
    const nextProvider = nextStore.providers[0];
    if (nextProvider) selectProvider(nextProvider);
    if (!nextProvider) createProvider();
  }

  async function testProvider(id: string) {
    if (!window.yomitomoDesktop) return;
    setTestState('测试中...');
    const result = await window.yomitomoDesktop.testProvider(id);
    setTestState(result.ok ? `连通成功：${result.message}` : `连通失败：${result.message}`);
  }

  async function toggleAgent(agent: Agent) {
    if (!window.yomitomoDesktop) return;
    setAgentSaveState('saving');
    try {
      const nextStore = await window.yomitomoDesktop.saveAgent({
        ...agent,
        enabled: !agent.enabled,
      });
      setStore(nextStore);
      setAgentSaveError('');
      setAgentSaveState('saved');
      window.setTimeout(() => setAgentSaveState('idle'), 800);
    } catch (error) {
      setAgentSaveError(error instanceof Error ? error.message : '保存失败。');
      setAgentSaveState('idle');
    }
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
        <button
          aria-label="打开个人设置"
          className="header-profile-button"
          type="button"
          onClick={() => setProfileDialogOpen(true)}
        >
          <AvatarImage
            value={store.user.avatar || ''}
            className="header-profile-avatar"
            fallback={store.user.nickname?.slice(0, 1) || '我'}
          />
          <span>{store.user.nickname || '我'}</span>
        </button>
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
              active={activeSetting === 'stats'}
              collapsed={sidebarCollapsed}
              icon={<BarChart3 size={18} />}
              label="统计"
              onClick={() => setActiveSetting('stats')}
            />
            <SettingsNavButton
              active={activeSetting === 'general'}
              collapsed={sidebarCollapsed}
              icon={<Settings size={18} />}
              label="设置"
              onClick={() => setActiveSetting('general')}
            />
            <SettingsNavButton
              active={activeSetting === 'providers'}
              collapsed={sidebarCollapsed}
              icon={<KeyRound size={18} />}
              label="供应商"
              onClick={() => setActiveSetting('providers')}
            />
            <SettingsNavButton
              active={activeSetting === 'agents'}
              collapsed={sidebarCollapsed}
              icon={<Bot size={18} />}
              label="助手"
              onClick={() => setActiveSetting('agents')}
            />
            <SettingsNavButton
              active={activeSetting === 'about'}
              collapsed={sidebarCollapsed}
              icon={<Info size={18} />}
              label="关于"
              onClick={() => setActiveSetting('about')}
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

          <ExtensionConnectionButton
            pairingConnectionStatus={pairingConnectionStatus}
            pairingInfo={pairingInfo}
            onClick={() => setExtensionConnectionDialogOpen(true)}
          />
        </aside>

        <section className="settings-content">
          {activeSetting === 'library' ? (
            <ReadingLibrary
              agents={store.agents}
              articles={store.articles}
              userProfile={store.user}
              onDeleteArticle={deleteArticle}
              onRefresh={refreshStore}
              onSaveArticle={saveArticle}
            />
          ) : null}
          {activeSetting === 'stats' ? (
            <ReadingStatsPanel articles={store.articles} onRefresh={refreshStore} />
          ) : null}
          {activeSetting === 'general' ? (
            <GeneralSettings
              settingsDraft={settingsDraft}
              canSave={canSaveGeneralSettings}
              onSettingsChange={(draft) => {
                setSettingsDraft(draft);
                setGeneralSaveState('idle');
              }}
              onSave={saveGeneralSettingsDraft}
              saveState={generalSaveState}
            />
          ) : null}
          {activeSetting === 'providers' ? (
            <ProviderSettings
              draft={providerDraft}
              settingsDraft={settingsDraft}
              providers={store.providers}
              selectedId={selectedProviderId}
              testState={testState}
              canSave={canSaveProvider}
              canSaveRoutes={canSaveProviderRoutes}
              onChange={(draft) => {
                setProviderDraft(draft);
                setProviderSaveState('idle');
              }}
              onRouteChange={(draft) => {
                setSettingsDraft(draft);
                setRouteSaveState('idle');
              }}
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
          {activeSetting === 'agents' ? (
            <AgentSettings
              agents={store.agents}
              error={agentSaveError}
              saveState={agentSaveState}
              onToggle={toggleAgent}
            />
          ) : null}
          {activeSetting === 'about' ? <AboutSettings /> : null}
        </section>
      </section>
      {profileDialogOpen ? (
        <UserProfileSettingsDialog
          draft={userDraft}
          canSave={canSaveUser}
          onChange={(draft) => {
            setUserDraft(draft);
            setProfileSaveState('idle');
          }}
          onClose={() => setProfileDialogOpen(false)}
          onSave={saveProfileDraft}
          saveState={profileSaveState}
        />
      ) : null}
      {extensionConnectionDialogOpen ? (
        <ExtensionConnectionDialog
          pairingConnectionStatus={pairingConnectionStatus}
          pairingInfo={pairingInfo}
          onClose={() => setExtensionConnectionDialogOpen(false)}
          onRotatePairing={rotatePairingInfo}
        />
      ) : null}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
