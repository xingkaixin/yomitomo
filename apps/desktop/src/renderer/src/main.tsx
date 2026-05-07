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
  User,
} from 'lucide-react';
import type { Agent, AppSettings, DesktopStore, LlmProvider } from '@yomitomo/shared';
import {
  agentDraftHasChanges,
  agentPersonalities,
  defaultAgentSoul,
  defaultUser,
  emptyProvider,
  emptyStore,
  findAgentPersonalityId,
  providerDraftHasChanges,
  userDraftHasChanges,
  type AgentDraft,
  type ProviderDraft,
  type UserDraft,
} from './app-settings';
import { ReadingLibrary } from './app-reading-library';
import { ReadingStatsPanel } from './app-reading-stats';
import {
  AgentSettings,
  GeneralSettings,
  ProviderSettings,
  SettingsNavButton,
} from './app-settings-panels';
import { AboutSettings } from './app-log-viewer';
import type { SaveState } from './app-types';
import type { PairingConnectionStatus, PairingInfo } from '../../preload';
import './styles.css';

type SettingKey = 'library' | 'stats' | 'general' | 'providers' | 'agents' | 'about';
const emptyAgent: AgentDraft = { kind: 'annotation', enabled: false };

function App() {
  const [store, setStore] = useState<DesktopStore>(emptyStore);
  const [activeSetting, setActiveSetting] = useState<SettingKey>('library');
  const [userDraft, setUserDraft] = useState<UserDraft>(defaultUser);
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>({});
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(emptyProvider);
  const [agentDraft, setAgentDraft] = useState<AgentDraft>(emptyAgent);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [testState, setTestState] = useState('');
  const [agentSaveError, setAgentSaveError] = useState('');
  const [userSaveState, setUserSaveState] = useState<SaveState>('idle');
  const [providerSaveState, setProviderSaveState] = useState<SaveState>('idle');
  const [agentSaveState, setAgentSaveState] = useState<SaveState>('idle');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pairingInfo, setPairingInfo] = useState<PairingInfo | null>(null);
  const [pairingConnectionStatus, setPairingConnectionStatus] = useState<PairingConnectionStatus>({
    authenticatedSocketCount: 0,
  });

  useEffect(() => {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;

    refreshStore();
    refreshPairingInfo();
    refreshPairingConnectionStatus();
    const offPairingConnectionStatus = desktop.onPairingConnectionStatus(
      setPairingConnectionStatus,
    );
    const offStoreUpdated = desktop.onStoreUpdated((nextStore) => {
      setStore(nextStore);
      setUserDraft(nextStore.user);
      setSettingsDraft(nextStore.settings);
    });
    return () => {
      offPairingConnectionStatus();
      offStoreUpdated();
    };
  }, []);

  const providerOptions = useMemo(
    () =>
      store.providers.map((provider) => ({
        id: provider.id,
        label: provider.name,
        type: provider.type,
        modelName: provider.modelName,
        logo: provider.logo,
      })),
    [store.providers],
  );
  const userHasChanges = useMemo(
    () => userDraftHasChanges(userDraft, store.user),
    [store.user, userDraft],
  );
  const settingsHasChanges = useMemo(
    () =>
      (settingsDraft.defaultProviderId || '') !== (store.settings.defaultProviderId || '') ||
      Boolean(settingsDraft.saveArticleImages) !== Boolean(store.settings.saveArticleImages),
    [
      settingsDraft.defaultProviderId,
      settingsDraft.saveArticleImages,
      store.settings.defaultProviderId,
      store.settings.saveArticleImages,
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
  const selectedAgent = useMemo(
    () => store.agents.find((agent) => agent.id === selectedAgentId) || null,
    [selectedAgentId, store.agents],
  );
  const agentHasChanges = useMemo(
    () => agentDraftHasChanges(agentDraft, selectedAgent),
    [agentDraft, selectedAgent],
  );
  const canSaveAgent =
    providerOptions.length > 0 &&
    agentSaveState !== 'saving' &&
    Boolean(selectedAgentId) &&
    agentHasChanges;
  const canSaveProvider =
    providerSaveState !== 'saving' && (selectedProviderId ? providerHasChanges : true);
  const canSaveUser = userSaveState !== 'saving' && (userHasChanges || settingsHasChanges);

  async function refreshStore() {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;

    const nextStore = await desktop.getState();
    setStore(nextStore);
    setUserDraft(nextStore.user);
    setSettingsDraft(nextStore.settings);
    if (nextStore.providers[0]) selectProvider(nextStore.providers[0]);
    if (nextStore.agents[0]) selectAgent(nextStore.agents[0]);
  }

  async function refreshPairingInfo() {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;

    setPairingInfo(await desktop.getPairingInfo());
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

  function selectAgent(agent: Agent) {
    setSelectedAgentId(agent.id);
    setAgentDraft({
      ...agent,
      personalityId: findAgentPersonalityId(agent.soul),
    });
    setAgentSaveError('');
    setAgentSaveState('idle');
  }

  async function saveUserDraft() {
    if (!window.yomitomoDesktop || !canSaveUser) return;
    setUserSaveState('saving');
    try {
      let nextStore = await window.yomitomoDesktop.saveUser(userDraft);
      nextStore = await window.yomitomoDesktop.saveSettings(settingsDraft);
      setStore(nextStore);
      setUserDraft(nextStore.user);
      setSettingsDraft(nextStore.settings);
      setUserSaveState('saved');
      window.setTimeout(() => setUserSaveState('idle'), 1200);
    } catch {
      setUserSaveState('idle');
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

  async function deleteProvider(id: string) {
    if (!window.yomitomoDesktop) return;
    const nextStore = await window.yomitomoDesktop.deleteProvider(id);
    setStore(nextStore);
    setSettingsDraft(nextStore.settings);
    const nextProvider = nextStore.providers[0];
    if (nextProvider) selectProvider(nextProvider);
    if (!nextProvider) createProvider();
    if (!nextStore.agents.some((agent) => agent.id === selectedAgentId)) {
      const nextAgent = nextStore.agents[0];
      if (nextAgent) selectAgent(nextAgent);
      if (!nextAgent) setAgentDraft(emptyAgent);
    }
  }

  async function testProvider(id: string) {
    if (!window.yomitomoDesktop) return;
    setTestState('测试中...');
    const result = await window.yomitomoDesktop.testProvider(id);
    setTestState(result.ok ? `连通成功：${result.message}` : `连通失败：${result.message}`);
  }

  async function saveAgentDraft() {
    if (!window.yomitomoDesktop || !canSaveAgent) return;
    const personalityId =
      agentDraft.presetId ||
      agentDraft.personalityId ||
      findAgentPersonalityId(agentDraft.soul || defaultAgentSoul);
    const personality = agentPersonalities.find((item) => item.id === personalityId);
    const providerId = agentDraft.providerId || store.providers[0]?.id || '';
    setAgentSaveState('saving');
    try {
      const nextStore = await window.yomitomoDesktop.saveAgent({
        ...agentDraft,
        providerId,
        presetId: personality?.id || agentDraft.presetId,
        kind: personality?.kind || agentDraft.kind,
        nickname: personality?.name || agentDraft.nickname,
        username: personality?.id.replace(/-/g, '_') || agentDraft.username,
        soul: personality?.soul || agentDraft.soul,
        temperature: personality?.temperature ?? agentDraft.temperature,
      });
      const savedAgent = agentDraft.id
        ? nextStore.agents.find((agent) => agent.id === agentDraft.id)
        : nextStore.agents.at(-1);
      setStore(nextStore);
      setAgentSaveError('');
      if (savedAgent) {
        setSelectedAgentId(savedAgent.id);
        setAgentDraft({ ...savedAgent, personalityId: findAgentPersonalityId(savedAgent.soul) });
        setAgentSaveState('saved');
        window.setTimeout(() => setAgentSaveState('idle'), 1200);
      }
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
              icon={<User size={18} />}
              label="通用"
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
            <div className="sidebar-plant" />
            <div className="sidebar-paper">
              <span>持续阅读</span>
              <span>持续思考</span>
              <span>持续成长</span>
            </div>
          </div>

          <div className="sidebar-sync">
            <span />
            <div>
              <strong>已同步</strong>
              <p>刚刚</p>
            </div>
          </div>
        </aside>

        <section className="settings-content">
          {activeSetting === 'library' ? (
            <ReadingLibrary
              agents={store.agents}
              articles={store.articles}
              onDeleteArticle={deleteArticle}
              onRefresh={refreshStore}
            />
          ) : null}
          {activeSetting === 'stats' ? (
            <ReadingStatsPanel articles={store.articles} onRefresh={refreshStore} />
          ) : null}
          {activeSetting === 'general' ? (
            <GeneralSettings
              draft={userDraft}
              pairingConnectionStatus={pairingConnectionStatus}
              pairingInfo={pairingInfo}
              providers={providerOptions}
              settingsDraft={settingsDraft}
              canSave={canSaveUser}
              onChange={(draft) => {
                setUserDraft(draft);
                setUserSaveState('idle');
              }}
              onSettingsChange={(draft) => {
                setSettingsDraft(draft);
                setUserSaveState('idle');
              }}
              onSave={saveUserDraft}
              onRotatePairing={rotatePairingInfo}
              saveState={userSaveState}
            />
          ) : null}
          {activeSetting === 'providers' ? (
            <ProviderSettings
              draft={providerDraft}
              providers={store.providers}
              selectedId={selectedProviderId}
              testState={testState}
              canSave={canSaveProvider}
              onChange={(draft) => {
                setProviderDraft(draft);
                setProviderSaveState('idle');
              }}
              onCreate={createProvider}
              onDelete={deleteProvider}
              onSave={saveProviderDraft}
              saveState={providerSaveState}
              onSelect={selectProvider}
              onTest={testProvider}
            />
          ) : null}
          {activeSetting === 'agents' ? (
            <AgentSettings
              agents={store.agents}
              draft={agentDraft}
              error={agentSaveError}
              providers={providerOptions}
              selectedId={selectedAgentId}
              canSave={canSaveAgent}
              onChange={(draft) => {
                setAgentDraft(draft);
                setAgentSaveError('');
                setAgentSaveState('idle');
              }}
              onSave={saveAgentDraft}
              saveState={agentSaveState}
              onSelect={selectAgent}
            />
          ) : null}
          {activeSetting === 'about' ? <AboutSettings /> : null}
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
