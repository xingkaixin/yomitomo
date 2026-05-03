import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  BookOpen,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  ExternalLink,
  FileText,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  ListChecks,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Quote,
  RefreshCcw,
  Scale,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import type {
  Agent,
  AgentKind,
  Annotation,
  AppSettings,
  ArticleRecord,
  Comment as AnnotationComment,
  DesktopStore,
  LlmProvider,
  ProviderType,
  ReadingCardRecord,
  ReadingCardReviewRecord,
  ReadingCardReviewerResult,
  ReadingCardSection as PersistedReadingCardSection,
} from '@yomitomo/shared';
import { renderMarkdown } from '@yomitomo/shared';
import {
  annotationTypeLabel,
  buildReadingCard,
  buildReadingCardEvidenceUnits,
  buildReadingCardSections,
  buildReadingCardStats,
  computeReadingStats,
  sortAnnotations,
  sortArticles,
  type ReadingCardEvidenceUnit,
  type ReadingStatsPeriod,
} from '@yomitomo/core';
import {
  agentDraftHasChanges,
  agentKindLabel,
  agentKindOptions,
  agentPersonalities,
  agentPersonalityName,
  annotationAgentPersonalities,
  annotationColors,
  annotationDensityOptions,
  createEmptyAgent,
  customPersonality,
  customPersonalityId,
  defaultAgentSoul,
  defaultUser,
  emptyProvider,
  emptyStore,
  findAgentPersonalityId,
  isValidUsername,
  personalitiesForKind,
  providerDraftHasChanges,
  sanitizeUsernameInput,
  userDraftHasChanges,
  type AgentDraft,
  type ProviderDraft,
  type UserDraft,
} from './app-settings';
import {
  annotationAuthorProfile,
  articleExternalUrl,
  articlePlainText,
  commentAuthorProfile,
  formatDate,
  formatDateTime,
  formatLogData,
  isImageAvatar,
  isSvgAvatar,
  parseLogEntries,
  readFileAsDataUrl,
  svgToDataUrl,
  urlHost,
  type LogEntry,
} from './app-utils';
import avatar01Raw from './assets/avatars/lorelei-1777775032907.svg?raw';
import avatar02Raw from './assets/avatars/lorelei-1777775031622.svg?raw';
import avatar03Raw from './assets/avatars/lorelei-1777775029913.svg?raw';
import avatar04Raw from './assets/avatars/lorelei-1777775028333.svg?raw';
import avatar05Raw from './assets/avatars/lorelei-1777775026600.svg?raw';
import avatar06Raw from './assets/avatars/lorelei-1777775024807.svg?raw';
import avatar07Raw from './assets/avatars/lorelei-1777775022413.svg?raw';
import avatar08Raw from './assets/avatars/lorelei-1777775020299.svg?raw';
import avatar09Raw from './assets/avatars/lorelei-1777775017575.svg?raw';
import avatar10Raw from './assets/avatars/lorelei-1777775015590.svg?raw';
import avatar11Raw from './assets/avatars/lorelei-1777775014247.svg?raw';
import avatar12Raw from './assets/avatars/lorelei-1777775012500.svg?raw';
import avatar13Raw from './assets/avatars/lorelei-1777775010023.svg?raw';
import avatar14Raw from './assets/avatars/lorelei-1777775007436.svg?raw';
import avatar15Raw from './assets/avatars/lorelei-1777775004996.svg?raw';
import avatar16Raw from './assets/avatars/lorelei-1777775003025.svg?raw';
import avatar17Raw from './assets/avatars/lorelei-1777775001230.svg?raw';
import avatar18Raw from './assets/avatars/lorelei-1777774999602.svg?raw';
import avatar19Raw from './assets/avatars/lorelei-1777774980195.svg?raw';
import avatar20Raw from './assets/avatars/lorelei-1777774975114.svg?raw';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { Textarea } from './components/ui/textarea';
import './styles.css';

type SettingKey = 'library' | 'stats' | 'general' | 'providers' | 'agents' | 'about';
type LogLevelFilter = 'all' | 'info' | 'error';
type SaveState = 'idle' | 'saving' | 'saved';
type ProviderOption = { id: string; label: string; type: ProviderType; modelName: string };
const agentAvatars = [
  avatar01Raw,
  avatar02Raw,
  avatar03Raw,
  avatar04Raw,
  avatar05Raw,
  avatar06Raw,
  avatar07Raw,
  avatar08Raw,
  avatar09Raw,
  avatar10Raw,
  avatar11Raw,
  avatar12Raw,
  avatar13Raw,
  avatar14Raw,
  avatar15Raw,
  avatar16Raw,
  avatar17Raw,
  avatar18Raw,
  avatar19Raw,
  avatar20Raw,
].map((raw, index) => ({ id: `avatar-${index + 1}`, src: svgToDataUrl(raw) }));

const emptyAgent = createEmptyAgent(agentAvatars[0]?.src || '');

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

  useEffect(() => {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;

    refreshStore();
  }, []);

  const providerOptions = useMemo(
    () =>
      store.providers.map((provider) => ({
        id: provider.id,
        label: provider.name,
        type: provider.type,
        modelName: provider.modelName,
      })),
    [store.providers],
  );
  const userHasChanges = useMemo(
    () => userDraftHasChanges(userDraft, store.user),
    [store.user, userDraft],
  );
  const settingsHasChanges = useMemo(
    () => (settingsDraft.defaultProviderId || '') !== (store.settings.defaultProviderId || ''),
    [settingsDraft.defaultProviderId, store.settings.defaultProviderId],
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
    (selectedAgentId ? agentHasChanges : true);
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
    setAgentDraft({ ...agent, personalityId: findAgentPersonalityId(agent.soul) });
    setAgentSaveError('');
    setAgentSaveState('idle');
  }

  function createAgent() {
    setSelectedAgentId(null);
    setAgentDraft({
      ...emptyAgent,
      kind: 'annotation',
      personalityId: 'reading-partner',
      temperature: annotationAgentPersonalities[0]?.temperature ?? 0.35,
      providerId: store.providers[0]?.id || '',
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
      if (!nextAgent) createAgent();
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
      agentDraft.personalityId || findAgentPersonalityId(agentDraft.soul || defaultAgentSoul);
    const personality = agentPersonalities.find((item) => item.id === personalityId);
    if (personalityId === customPersonalityId && !agentDraft.soul?.trim()) {
      setAgentSaveError('自定义个性必须输入内容。');
      return;
    }
    if (!isValidUsername(agentDraft.username || '')) {
      setAgentSaveError('用户名仅支持英文、数字和下划线。');
      return;
    }
    const providerId = agentDraft.providerId || store.providers[0]?.id || '';
    setAgentSaveState('saving');
    try {
      const nextStore = await window.yomitomoDesktop.saveAgent({
        ...agentDraft,
        providerId,
        soul: personality?.soul || agentDraft.soul,
        temperature:
          personality?.temperature ?? agentDraft.temperature ?? customPersonality.temperature,
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

  async function deleteAgent(id: string) {
    if (!window.yomitomoDesktop) return;
    const nextStore = await window.yomitomoDesktop.deleteAgent(id);
    setStore(nextStore);
    const nextAgent = nextStore.agents[0];
    if (nextAgent) selectAgent(nextAgent);
    if (!nextAgent) createAgent();
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
              onRefresh={refreshStore}
            />
          ) : null}
          {activeSetting === 'stats' ? (
            <ReadingStatsPanel articles={store.articles} onRefresh={refreshStore} />
          ) : null}
          {activeSetting === 'general' ? (
            <GeneralSettings
              draft={userDraft}
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
              onCreate={createAgent}
              onDelete={deleteAgent}
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

function SettingsNavButton({
  active,
  collapsed,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  collapsed: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? 'settings-nav-item is-active' : 'settings-nav-item'}
      type="button"
      title={collapsed ? label : undefined}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function GeneralSettings({
  draft,
  providers,
  settingsDraft,
  canSave,
  onChange,
  onSettingsChange,
  onSave,
  saveState,
}: {
  draft: UserDraft;
  providers: ProviderOption[];
  settingsDraft: AppSettings;
  canSave: boolean;
  onChange: (draft: UserDraft) => void;
  onSettingsChange: (draft: AppSettings) => void;
  onSave: () => void;
  saveState: SaveState;
}) {
  const saveLabel = saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : '保存';

  return (
    <div className="settings-panel">
      <PanelHeader
        icon={<User size={20} />}
        title="通用"
        description="配置用户头像、昵称和用户名，后续批注会使用这组身份信息。"
        action={
          <Button
            className={
              saveState === 'saved'
                ? 'action-button save-action is-saved'
                : 'action-button save-action'
            }
            disabled={!canSave}
            type="button"
            onClick={onSave}
          >
            {saveState === 'saved' ? <Check size={16} /> : <Save size={16} />}
            {saveLabel}
          </Button>
        }
      />
      <div className="settings-form-grid max-w-3xl">
        <div className="col-span-2 flex items-center gap-4">
          <AvatarImage value={draft.avatar || ''} className="size-20" fallback="我" />
          <ProfileAvatarEditor onChange={(avatar) => onChange({ ...draft, avatar })} />
        </div>
        <Field description="批注和评论中展示的名称。" label="昵称">
          <Input
            value={draft.nickname || ''}
            onChange={(event) => onChange({ ...draft, nickname: event.target.value })}
          />
        </Field>
        <Field description="用于 @ 提及，仅支持英文、数字和下划线。" label="用户名">
          <Input
            value={draft.username || ''}
            onChange={(event) =>
              onChange({ ...draft, username: sanitizeUsernameInput(event.target.value) })
            }
          />
        </Field>
        <Field className="col-span-2" label="批注颜色">
          <ColorPicker
            value={draft.annotationColor || annotationColors[0]}
            onChange={(annotationColor) => onChange({ ...draft, annotationColor })}
          />
        </Field>
        <Field
          className="col-span-2"
          description="读后卡片等默认 AI 任务会使用这个供应商。"
          label="默认供应商"
        >
          <Select
            disabled={providers.length === 0}
            value={settingsDraft.defaultProviderId || ''}
            onValueChange={(defaultProviderId) =>
              onSettingsChange({ ...settingsDraft, defaultProviderId })
            }
          >
            <SelectTrigger className="theme-select-trigger provider-select-trigger">
              <SelectValue placeholder={providers.length > 0 ? '选择默认供应商' : '先添加供应商'} />
            </SelectTrigger>
            <SelectContent className="theme-select-content provider-select-content">
              {providers.map((provider) => (
                <SelectItem className="provider-select-item" key={provider.id} value={provider.id}>
                  <span className="provider-select-item-mark" />
                  <span className="provider-select-item-copy">
                    <strong>{provider.label}</strong>
                    <span>
                      {provider.type} · {provider.modelName}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}

function ReadingStatsPanel({
  articles,
  onRefresh,
}: {
  articles: ArticleRecord[];
  onRefresh: () => void;
}) {
  const stats = useMemo(() => computeReadingStats(articles), [articles]);

  return (
    <div className="settings-panel">
      <PanelHeader
        icon={<BarChart3 size={20} />}
        title="统计"
        description="基于本地阅读记录生成今日、本周和累计阅读概况。"
        action={
          <Button type="button" variant="secondary" onClick={onRefresh}>
            <RefreshCcw size={16} />
            刷新
          </Button>
        }
      />
      <div className="stats-periods">
        <StatsPeriod title="今日" stats={stats.today} />
        <StatsPeriod title="本周" stats={stats.week} />
        <StatsPeriod title="累计" stats={stats.total} />
      </div>
      <section className="stats-note">
        <h3>阅读时长</h3>
        <p>阅读分钟需要插件端记录阅读器停留时间，后续会和文章记录一起同步到桌面端。</p>
      </section>
    </div>
  );
}

function StatsPeriod({ stats, title }: { stats: ReadingStatsPeriod; title: string }) {
  return (
    <section className="stats-period">
      <h3>{title}</h3>
      <div className="stats-grid">
        <StatsMetric label="文章" value={stats.articles} />
        <StatsMetric label="批注" value={stats.annotations} />
        <StatsMetric label="讨论" value={stats.comments} />
        <StatsMetric label="AI 参与" value={stats.aiComments} />
      </div>
    </section>
  );
}

function StatsMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="stats-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ReadingLibrary({
  agents,
  articles,
  onRefresh,
}: {
  agents: Agent[];
  articles: ArticleRecord[];
  onRefresh: () => void;
}) {
  const [activeShelf, setActiveShelf] = useState<'annotations' | 'card'>('annotations');
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const sortedArticles = useMemo(() => sortArticles(articles), [articles]);
  const selectedArticle =
    sortedArticles.find((article) => article.id === selectedArticleId) || sortedArticles[0] || null;
  const annotations = useMemo(
    () => (selectedArticle ? sortAnnotations(selectedArticle.annotations) : []),
    [selectedArticle],
  );
  const reviewAgents = useMemo(() => agents.filter((agent) => agent.kind === 'review'), [agents]);
  const selectedAnnotation =
    annotations.find((annotation) => annotation.id === selectedAnnotationId) ||
    annotations[0] ||
    null;
  const readingCardCount =
    selectedArticle?.readingCard?.sections.length || (selectedArticle ? 4 : 0);
  const stats = articles.reduce(
    (result, article) => ({
      annotations: result.annotations + article.annotations.length,
      comments:
        result.comments +
        article.annotations.reduce((count, annotation) => count + annotation.comments.length, 0),
    }),
    { annotations: 0, comments: 0 },
  );

  useEffect(() => {
    if (!selectedArticle) {
      setSelectedAnnotationId(null);
      return;
    }
    const nextAnnotation = sortAnnotations(selectedArticle.annotations)[0] || null;
    setSelectedAnnotationId(nextAnnotation?.id || null);
  }, [selectedArticle?.id]);

  return (
    <div
      className={
        activeShelf === 'card'
          ? 'library-screen is-card-expanded'
          : 'library-screen is-annotations-expanded'
      }
    >
      <section className="article-rail">
        <div className="article-rail-header">
          <div>
            <h2>阅读库</h2>
            <p>插件同步的已批注文章</p>
          </div>
          <Button type="button" variant="secondary" onClick={onRefresh}>
            <RefreshCcw size={16} />
            刷新
          </Button>
        </div>
        <div className="library-stats">
          <LibraryStat label="文章" value={articles.length} />
          <LibraryStat label="批注" value={stats.annotations} />
          <LibraryStat label="讨论" value={stats.comments} />
        </div>
        {sortedArticles.length > 0 ? (
          <div className="library-list">
            {sortedArticles.map((article) => (
              <ArticleListItem
                active={article.id === selectedArticle?.id}
                article={article}
                key={article.id}
                onSelect={() => {
                  setSelectedArticleId(article.id);
                  setSelectedAnnotationId(sortAnnotations(article.annotations)[0]?.id || null);
                }}
              />
            ))}
          </div>
        ) : (
          <section className="library-empty">
            <BookOpen size={32} />
            <h3>还没有同步文章</h3>
            <p>在浏览器插件阅读器里创建批注后，这里会出现对应文章。</p>
          </section>
        )}
      </section>

      <div
        className={
          activeShelf === 'annotations' ? 'library-shelf is-expanded' : 'library-shelf is-collapsed'
        }
      >
        <ShelfTab
          count={annotations.length}
          icon={<Quote size={18} />}
          label="批注"
          onClick={() => setActiveShelf('annotations')}
        />
        <div className="library-shelf-content">
          {activeShelf === 'annotations' ? (
            selectedArticle ? (
              <AnnotationNotebook
                annotation={selectedAnnotation}
                annotations={annotations}
                article={selectedArticle}
                onSelect={setSelectedAnnotationId}
              />
            ) : (
              <section className="annotation-notebook is-empty">
                <div className="notebook-empty">选择一篇文章查看批注</div>
              </section>
            )
          ) : null}
        </div>
      </div>

      <div
        className={
          activeShelf === 'card' ? 'library-shelf is-expanded' : 'library-shelf is-collapsed'
        }
      >
        <ShelfTab
          count={readingCardCount}
          icon={<FileText size={18} />}
          label="读后卡片"
          onClick={() => setActiveShelf('card')}
        />
        <div className="library-shelf-content">
          {activeShelf === 'card' ? (
            <ReadingCard
              article={selectedArticle}
              reviewAgents={reviewAgents}
              onGenerated={onRefresh}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ShelfTab({
  count,
  icon,
  label,
  onClick,
}: {
  count: number;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="library-shelf-tab" type="button" onClick={onClick}>
      <span className="library-shelf-tab-icon">{icon}</span>
      <span className="library-shelf-tab-label">{label}</span>
      <span className="library-shelf-tab-count">{count}</span>
    </button>
  );
}

function AnnotationNotebook({
  annotation,
  annotations,
  article,
  onSelect,
}: {
  annotation: Annotation | null;
  annotations: Annotation[];
  article: ArticleRecord;
  onSelect: (id: string | null) => void;
}) {
  const selectedIndex = annotation
    ? annotations.findIndex((item) => item.id === annotation.id)
    : -1;
  const annotationAuthor = annotation ? annotationAuthorProfile(annotation) : null;
  const canPage = selectedIndex >= 0 && annotations.length > 1;

  function selectByOffset(offset: number) {
    if (!canPage) return;
    const nextIndex = (selectedIndex + offset + annotations.length) % annotations.length;
    onSelect(annotations[nextIndex]?.id || null);
  }

  return (
    <section className="annotation-notebook">
      <div className="notebook-rings" aria-hidden="true" />
      <div className="notebook-cover">
        <header className="notebook-header">
          <div className="min-w-0">
            <h2>{article.title}</h2>
            <p>
              {article.byline || urlHost(article.canonicalUrl || article.url)} ·{' '}
              {formatDate(article.updatedAt)}
            </p>
          </div>
          <div className="notebook-header-actions">
            <OpenArticleButton article={article} />
            <div className="annotation-pagination">
              <button
                aria-label="上一条批注"
                type="button"
                disabled={!canPage}
                onClick={() => selectByOffset(-1)}
              >
                <ChevronLeft size={17} />
              </button>
              <span>
                {annotations.length > 0 ? `${selectedIndex + 1} / ${annotations.length}` : '0 / 0'}
              </span>
              <button
                aria-label="下一条批注"
                type="button"
                disabled={!canPage}
                onClick={() => selectByOffset(1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </header>

        {annotation ? (
          <>
            <div className="notebook-scroll">
              <section className="quote-card">
                <div className="annotation-type">
                  <span>
                    {annotation.annotationType
                      ? annotationTypeLabel(annotation.annotationType)
                      : '批注'}
                  </span>
                </div>
                <div className="quote-title">
                  <Quote size={18} />
                  <strong>原文</strong>
                  <CopyIconButton label="复制原文" value={annotation.anchor.exact} />
                </div>
                <blockquote>{annotation.anchor.exact}</blockquote>
                <div className="annotation-author">
                  <AvatarImage
                    value={annotationAuthor?.avatar || ''}
                    className="size-8"
                    fallback={(annotationAuthor?.name || '批').slice(0, 1)}
                  />
                  <div>
                    <strong>{annotationAuthor?.name}</strong>
                    <time>{formatDateTime(annotation.createdAt)}</time>
                  </div>
                </div>
              </section>

              <section className="comment-thread">
                {annotation.comments.length > 0 ? (
                  annotation.comments.map((comment) => (
                    <CommentCard comment={comment} key={comment.id} />
                  ))
                ) : (
                  <div className="comment-empty">这条批注还没有评论</div>
                )}
              </section>
            </div>
            <footer className="notebook-footer">
              <time>批注时间：{formatDateTime(annotation.createdAt)}</time>
            </footer>
          </>
        ) : (
          <div className="notebook-empty">这篇文章还没有批注</div>
        )}
      </div>
    </section>
  );
}

function CommentCard({ comment }: { comment: AnnotationComment }) {
  const author = commentAuthorProfile(comment);
  const html = useMemo(() => renderMarkdown(comment.content), [comment.content]);

  return (
    <article className="comment-card">
      <header>
        <AvatarImage value={author.avatar} className="size-9" fallback={author.name.slice(0, 1)} />
        <div className="min-w-0">
          <strong>{author.name}</strong>
          <time>{formatDateTime(comment.createdAt)}</time>
        </div>
        <CopyIconButton label="复制评论" value={comment.content} />
      </header>
      <div className="comment-markdown" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}

function CopyIconButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      aria-label={copied ? '已复制' : label}
      className={copied ? 'copy-icon-button is-copied' : 'copy-icon-button'}
      type="button"
      onClick={copy}
    >
      {copied ? <Check size={15} /> : <Clipboard size={14} />}
    </button>
  );
}

function OpenArticleButton({ article }: { article: ArticleRecord }) {
  const url = articleExternalUrl(article);

  async function open() {
    if (!url) return;
    const desktop = window.yomitomoDesktop as typeof window.yomitomoDesktop & {
      openUrl?: (url: string) => Promise<void>;
    };
    if (typeof desktop?.openUrl === 'function') {
      try {
        await desktop.openUrl(url);
        return;
      } catch {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <button
      aria-label="在浏览器中打开原文"
      className="open-article-button"
      disabled={!url}
      type="button"
      title={url || '原文链接不可用'}
      onClick={open}
    >
      <ExternalLink size={16} />
      <span>打开原文</span>
    </button>
  );
}

function ReadingCard({
  article,
  reviewAgents,
  onGenerated,
}: {
  article: ArticleRecord | null;
  reviewAgents: Agent[];
  onGenerated: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [aiCard, setAiCard] = useState<ReadingCardRecord | null>(null);
  const [aiError, setAiError] = useState('');
  const [aiState, setAiState] = useState<'idle' | 'generating' | 'done' | 'error'>('idle');
  const [reviewError, setReviewError] = useState('');
  const [reviewState, setReviewState] = useState<'idle' | 'reviewing' | 'done' | 'error'>('idle');
  const [selectedReviewAgentIds, setSelectedReviewAgentIds] = useState<string[]>([]);
  const articleText = useMemo(() => (article ? articlePlainText(article) : ''), [article]);
  const card = useMemo(
    () => (article ? aiCard?.contentMarkdown || buildReadingCard(article, articleText) : ''),
    [aiCard, article, articleText],
  );
  const stats = useMemo(() => (article ? buildReadingCardStats(article) : null), [article]);
  const evidenceUnits = useMemo(
    () => (article ? buildReadingCardEvidenceUnits(article) : []),
    [article],
  );
  const sections = useMemo(
    () => (article ? buildReadingCardSections(article, articleText) : []),
    [article, articleText],
  );
  const reviewAgentIds = useMemo(() => reviewAgents.map((agent) => agent.id), [reviewAgents]);
  const reviewAgentKey = reviewAgentIds.join('|');

  useEffect(() => {
    setAiCard(article?.readingCard || null);
    setAiError('');
    setAiState(article?.readingCard ? 'done' : 'idle');
    setReviewError('');
    setReviewState(article?.readingCard?.review ? 'done' : 'idle');
  }, [article?.id, article?.readingCard?.updatedAt, article?.readingCard?.review?.updatedAt]);

  useEffect(() => {
    setSelectedReviewAgentIds((current) => {
      const availableIds = new Set(reviewAgentIds);
      const kept = current.filter((id) => availableIds.has(id));
      return kept.length > 0 ? kept : reviewAgentIds;
    });
  }, [reviewAgentKey]);

  async function copyCard() {
    if (!card) return;
    await navigator.clipboard.writeText(card);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function generateAiCard() {
    if (!article || aiState === 'generating') return;
    setAiState('generating');
    setAiError('');
    try {
      const result = await window.yomitomoDesktop.generateReadingCard({
        article,
        articleText,
        evidenceUnits,
      });
      setAiCard(result.readingCard);
      setAiState('done');
      setReviewError('');
      setReviewState('idle');
      onGenerated();
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI 提炼失败');
      setAiState('error');
    }
  }

  async function reviewAiCard() {
    if (!article || !aiCard || reviewState === 'reviewing') return;
    if (selectedReviewAgentIds.length === 0) {
      setReviewError('请选择审核助手');
      return;
    }
    setReviewState('reviewing');
    setReviewError('');
    try {
      const result = await window.yomitomoDesktop.reviewReadingCard({
        article,
        articleText,
        evidenceUnits,
        readingCard: aiCard,
        reviewAgentIds: selectedReviewAgentIds,
      });
      setAiCard({ ...aiCard, review: result.review });
      setReviewState('done');
      onGenerated();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : '读后卡片审稿失败');
      setReviewState('error');
    }
  }

  function toggleReviewAgent(agentId: string) {
    setSelectedReviewAgentIds((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId],
    );
    setReviewError('');
  }

  if (!article) {
    return (
      <aside className="reading-card">
        <div className="reading-card-empty">选择一篇文章查看读后卡片</div>
      </aside>
    );
  }

  return (
    <aside className="reading-card">
      <div className="reading-card-header">
        <div>
          <h3>读后卡片</h3>
          <p>{article.title}</p>
          {stats ? (
            <div className="reading-card-meta">
              <span>批注 {stats.annotations}</span>
              <span>评论 {stats.comments}</span>
              <span>助手 {stats.aiContributions}</span>
            </div>
          ) : null}
        </div>
        <div className="reading-card-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={aiState === 'generating'}
            onClick={generateAiCard}
          >
            {aiState === 'generating' ? (
              <LoaderCircle className="reading-card-spin" size={16} />
            ) : (
              <Sparkles size={16} />
            )}
            {aiState === 'generating' ? '生成中' : aiCard ? '重新提炼' : 'AI 提炼'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={
              !aiCard ||
              aiState === 'generating' ||
              reviewState === 'reviewing' ||
              selectedReviewAgentIds.length === 0
            }
            onClick={reviewAiCard}
          >
            {reviewState === 'reviewing' ? (
              <LoaderCircle className="reading-card-spin" size={16} />
            ) : (
              <Scale size={16} />
            )}
            {reviewState === 'reviewing' ? '审稿中' : aiCard?.review ? '重新审稿' : '审核卡片'}
          </Button>
          <Button type="button" variant="secondary" onClick={copyCard}>
            <Clipboard size={16} />
            {copied ? '已复制' : '复制 Markdown'}
          </Button>
        </div>
      </div>
      {aiCard ? (
        <div className="reading-card-review-agent-strip">
          <span>审核助手</span>
          {reviewAgents.length > 0 ? (
            <div>
              {reviewAgents.map((agent) => {
                const selected = selectedReviewAgentIds.includes(agent.id);
                return (
                  <button
                    aria-pressed={selected}
                    className={selected ? 'is-selected' : ''}
                    key={agent.id}
                    type="button"
                    onClick={() => toggleReviewAgent(agent.id)}
                  >
                    <i style={{ background: agent.annotationColor }} />
                    <AvatarImage
                      value={agent.avatar}
                      className="size-6"
                      fallback={agent.nickname.slice(0, 1) || 'AI'}
                    />
                    <strong>{agent.nickname}</strong>
                    {selected ? <Check size={13} /> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <p>请先在助手设置中创建审核助手。</p>
          )}
        </div>
      ) : null}
      <div className="reading-card-body">
        {aiError ? <p className="reading-card-error">{aiError}</p> : null}
        {reviewError ? <p className="reading-card-error">{reviewError}</p> : null}
        {aiCard ? (
          <ReadingCardDeck article={article} readingCard={aiCard} stats={stats} />
        ) : (
          sections.map((section) => (
            <section key={section.title}>
              <h4>{section.title}</h4>
              {section.title === '阅读轨迹' ? (
                evidenceUnits.length > 0 ? (
                  <div className="reading-card-evidence-list">
                    {evidenceUnits.map((unit) => (
                      <ReadingCardEvidence unit={unit} key={unit.id} />
                    ))}
                  </div>
                ) : (
                  <p className="reading-card-placeholder">暂无</p>
                )
              ) : (
                <ul>
                  {(section.items.length > 0 ? section.items : ['暂无']).map((item, index) => (
                    <li key={`${section.title}-${index}`}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))
        )}
      </div>
    </aside>
  );
}

function ReadingCardEvidence({ unit }: { unit: ReadingCardEvidenceUnit }) {
  return (
    <article className="reading-card-evidence">
      <header>
        <span className="reading-card-evidence-index">{unit.index}</span>
        <div className="reading-card-evidence-heading">
          <div className="reading-card-evidence-chips">
            {unit.annotationType ? <span>{unit.annotationType}</span> : null}
            <span>{unit.annotationAuthorLabel}</span>
          </div>
          <time>{formatDateTime(unit.createdAt)}</time>
        </div>
      </header>
      <blockquote>{unit.quote}</blockquote>
      {unit.comments.length > 0 ? (
        <div className="reading-card-thread">
          {unit.comments.map((comment) => (
            <div className="reading-card-comment" key={comment.id}>
              <strong>{comment.authorLabel}</strong>
              <p>{comment.content}</p>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ReadingCardDeck({
  article,
  readingCard,
  stats,
}: {
  article: ArticleRecord;
  readingCard: ReadingCardRecord;
  stats: ReturnType<typeof buildReadingCardStats> | null;
}) {
  const sections = normalizeReadingCardViewSections(readingCard);

  return (
    <div className="reading-card-deck">
      <section className="reading-card-cover">
        <div>
          <span>AI 读后卡片</span>
          <h4>{article.title}</h4>
        </div>
        <dl>
          <div>
            <dt>批注</dt>
            <dd>{stats?.annotations ?? 0}</dd>
          </div>
          <div>
            <dt>评论</dt>
            <dd>{stats?.comments ?? 0}</dd>
          </div>
          <div>
            <dt>助手</dt>
            <dd>{stats?.aiContributions ?? 0}</dd>
          </div>
        </dl>
        <p>
          {readingCard.providerName || '默认供应商'} · {readingCard.modelName || '模型未记录'} ·{' '}
          {formatDate(readingCard.updatedAt)}
        </p>
      </section>

      {readingCard.review ? <ReadingCardReviewPanel review={readingCard.review} /> : null}

      {sections.map((section) => (
        <ReadingCardSectionCard section={section} key={section.title} />
      ))}
    </div>
  );
}

function ReadingCardReviewPanel({ review }: { review: ReadingCardReviewRecord }) {
  const issueCount = review.reviewerResults.reduce(
    (count, result) => count + result.findings.length,
    0,
  );
  const passCount = review.reviewerResults.filter((result) => result.verdict === 'pass').length;

  return (
    <section className="reading-card-review-panel">
      <header>
        <div>
          <span>审稿结果</span>
          <h4>读后卡片审核</h4>
        </div>
        <time>{formatDate(review.updatedAt)}</time>
      </header>
      <div className="reading-card-review-summary">
        <div>
          <strong>{review.reviewerResults.length}</strong>
          <span>审核助手</span>
        </div>
        <div>
          <strong>{passCount}</strong>
          <span>通过</span>
        </div>
        <div>
          <strong>{issueCount}</strong>
          <span>问题</span>
        </div>
      </div>
      <div className="reading-card-reviewers">
        {review.reviewerResults.map((result) => (
          <ReadingCardReviewerCard result={result} key={result.id} />
        ))}
      </div>
    </section>
  );
}

function ReadingCardReviewerCard({ result }: { result: ReadingCardReviewerResult }) {
  return (
    <article className="reading-card-reviewer-card">
      <header>
        <AvatarImage
          value={result.reviewerAvatar}
          className="size-8"
          fallback={result.reviewerNickname.slice(0, 1) || 'AI'}
        />
        <div>
          <strong>{result.reviewerNickname}</strong>
          <span>@{result.reviewerUsername}</span>
        </div>
        <mark className={result.verdict === 'pass' ? 'is-pass' : 'is-revise'}>
          {result.verdict === 'pass' ? '通过' : '需修改'}
        </mark>
      </header>
      {result.summary ? <p>{result.summary}</p> : null}
      {result.findings.length > 0 ? (
        <div className="reading-card-review-findings">
          {result.findings.map((finding, index) => (
            <article className="reading-card-review-finding" key={`${finding.problem}-${index}`}>
              <header>
                <span className={`is-${finding.severity}`}>
                  {reviewSeverityLabel(finding.severity)}
                </span>
                <strong>{finding.section || '整张卡片'}</strong>
                {finding.evidenceIds.length > 0 ? (
                  <em>{finding.evidenceIds.map((id) => `#${id}`).join(' ')}</em>
                ) : null}
              </header>
              <p>{finding.problem}</p>
              {finding.suggestedRewrite ? (
                <blockquote>{finding.suggestedRewrite}</blockquote>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="reading-card-review-empty">未发现需要修改的问题。</p>
      )}
      <ReadingCardReviewList title="保留点" items={result.acceptedClaims} />
      <ReadingCardReviewList title="缺口" items={result.missingAngles} />
    </article>
  );
}

function ReadingCardReviewList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="reading-card-review-list">
      <strong>{title}</strong>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function reviewSeverityLabel(severity: ReadingCardReviewerResult['findings'][number]['severity']) {
  return severity === 'high' ? '高' : severity === 'low' ? '低' : '中';
}

function ReadingCardSectionCard({ section }: { section: PersistedReadingCardSection }) {
  const blocks = splitReadingCardSection(section.content);
  const isCore = section.title === '核心主张';

  return (
    <section className={isCore ? 'reading-card-section-card is-core' : 'reading-card-section-card'}>
      <header>
        <span>{readingCardSectionIndex(section.title)}</span>
        <h4>{section.title}</h4>
      </header>
      {blocks.map((block, index) => (
        <article
          className={block.title ? 'reading-card-mini-card has-title' : 'reading-card-mini-card'}
          key={`${section.title}-${block.title || index}`}
        >
          {block.title ? <h5>{block.title}</h5> : null}
          <div
            className="reading-card-markdown"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(block.content) }}
          />
        </article>
      ))}
    </section>
  );
}

function normalizeReadingCardViewSections(
  readingCard: ReadingCardRecord,
): PersistedReadingCardSection[] {
  if (readingCard.sections.length > 0) return readingCard.sections;
  return parseReadingCardMarkdownSections(readingCard.contentMarkdown);
}

function parseReadingCardMarkdownSections(markdown: string): PersistedReadingCardSection[] {
  const sections: PersistedReadingCardSection[] = [];
  let current: PersistedReadingCardSection | null = null;
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      if (current) sections.push(current);
      current = { title: heading[1].trim(), content: '' };
      continue;
    }
    if (!current) continue;
    current.content = `${current.content}${current.content ? '\n' : ''}${line}`.trim();
  }
  if (current) sections.push(current);
  return sections;
}

function splitReadingCardSection(content: string) {
  const blocks: Array<{ title?: string; content: string }> = [];
  let current: { title?: string; content: string } | null = null;

  for (const line of content.split('\n')) {
    const heading = line.match(/^###\s+(.+)$/);
    if (heading) {
      if (current) blocks.push(current);
      current = { title: heading[1].trim(), content: '' };
      continue;
    }
    if (!current) current = { content: '' };
    current.content = `${current.content}${current.content ? '\n' : ''}${line}`.trim();
  }

  if (current && (current.title || current.content)) blocks.push(current);
  return blocks.length > 0 ? blocks : [{ content: '暂无' }];
}

function readingCardSectionIndex(title: string) {
  const order = ['核心主张', '我关注了什么', '讨论中浮现了什么', '可复用洞见', '后续行动线索'];
  const index = order.indexOf(title);
  return index >= 0 ? String(index + 1).padStart(2, '0') : '·';
}

function AboutSettings() {
  return (
    <div className="settings-panel">
      <PanelHeader
        icon={<Info size={20} />}
        title="关于"
        description="应用信息、日志查看和本地诊断。"
      />
      <section className="detail-pane about-section">
        <LogViewer />
      </section>
    </div>
  );
}

function LogViewer() {
  const [logPath, setLogPath] = useState('');
  const [rawLog, setRawLog] = useState('');
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<LogLevelFilter>('all');
  const [status, setStatus] = useState('');
  const [refreshState, setRefreshState] = useState<SaveState>('idle');
  const [clearState, setClearState] = useState<SaveState>('idle');

  useEffect(() => {
    loadLog();
  }, []);

  const entries = useMemo(() => parseLogEntries(rawLog), [rawLog]);
  const hasLogContent = rawLog.trim().length > 0;
  const visibleEntries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (level !== 'all' && entry.level !== level) return false;
      if (!needle) return true;
      return entry.raw.toLowerCase().includes(needle);
    });
  }, [entries, level, query]);

  async function loadLog() {
    const desktop = window.yomitomoDesktop;
    if (!desktop || refreshState === 'saving') return;

    setRefreshState('saving');
    const [path, content] = await Promise.all([desktop.getLogPath(), desktop.readLog()]);
    setLogPath(path);
    setRawLog(content);
    setStatus(`已加载 ${formatDateTime(new Date().toISOString())}`);
    setRefreshState('saved');
    window.setTimeout(() => setRefreshState('idle'), 1000);
  }

  async function clearLog() {
    const desktop = window.yomitomoDesktop;
    if (!desktop || !hasLogContent || clearState === 'saving') return;

    setClearState('saving');
    await desktop.clearLog();
    setRawLog('');
    setStatus('日志已清理');
    setClearState('saved');
    window.setTimeout(() => setClearState('idle'), 1000);
  }

  return (
    <div className="log-viewer">
      <div className="log-header">
        <div>
          <h3>日志</h3>
          <p>打开此页时加载一次，点击刷新读取新内容。</p>
        </div>
        <div className="log-actions">
          <Button
            className={
              refreshState === 'saving'
                ? 'action-button test-action log-refresh-action is-loading'
                : 'action-button test-action log-refresh-action'
            }
            disabled={refreshState === 'saving'}
            variant="secondary"
            type="button"
            onClick={loadLog}
          >
            <RefreshCcw size={16} />
            {refreshState === 'saving' ? '刷新中' : refreshState === 'saved' ? '已刷新' : '刷新'}
          </Button>
          <Button
            className={
              clearState === 'saved'
                ? 'action-button danger-action log-clear-action is-cleared'
                : 'action-button danger-action log-clear-action'
            }
            disabled={!hasLogContent || clearState === 'saving'}
            variant="destructive"
            type="button"
            onClick={clearLog}
          >
            {clearState === 'saved' ? <Check size={16} /> : <Trash2 size={16} />}
            {clearState === 'saving' ? '清理中' : clearState === 'saved' ? '已清理' : '清理'}
          </Button>
        </div>
      </div>
      <div className="log-path-row">
        <FileText size={16} />
        <span>{logPath || '日志路径加载中...'}</span>
        {logPath ? (
          <Button
            variant="secondary"
            type="button"
            onClick={() => navigator.clipboard.writeText(logPath)}
          >
            复制路径
          </Button>
        ) : null}
      </div>
      <div className="log-toolbar">
        <div className="log-search">
          <Search size={16} />
          <Input
            placeholder="搜索日志事件、内容或路径"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Select value={level} onValueChange={(value) => setLevel(value as LogLevelFilter)}>
          <SelectTrigger className="log-level-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="theme-select-content">
            <SelectGroup>
              <SelectItem value="all">全部级别</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="log-summary">
        <span>
          {visibleEntries.length} / {entries.length} 条
        </span>
        <span>{status}</span>
      </div>
      <div className="log-list">
        {visibleEntries.length > 0 ? (
          visibleEntries.map((entry) => <LogEntryRow entry={entry} key={entry.id} />)
        ) : (
          <div className="log-empty">没有匹配的日志</div>
        )}
      </div>
    </div>
  );
}

function LogEntryRow({ entry }: { entry: LogEntry }) {
  return (
    <article className={`log-entry is-${entry.level}`}>
      <div className="log-entry-meta">
        <span>{entry.level}</span>
        <time>{formatDateTime(entry.at)}</time>
      </div>
      <strong>{entry.event}</strong>
      {entry.data === undefined ? null : <pre>{formatLogData(entry.data)}</pre>}
    </article>
  );
}

function LibraryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="library-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ArticleListItem({
  active,
  article,
  onSelect,
}: {
  active: boolean;
  article: ArticleRecord;
  onSelect: () => void;
}) {
  const comments = article.annotations.reduce(
    (count, annotation) => count + annotation.comments.length,
    0,
  );

  return (
    <button
      className={active ? 'library-item is-active' : 'library-item'}
      type="button"
      onClick={onSelect}
    >
      <div className="min-w-0">
        <h3>{article.title}</h3>
        <p>{article.byline || urlHost(article.canonicalUrl || article.url) || '未知作者'}</p>
        <time>{formatDate(article.updatedAt)}</time>
      </div>
      <span className="library-item-count">
        {article.annotations.length} 批注 · {comments} 评
      </span>
    </button>
  );
}

function ProviderSettings({
  draft,
  providers,
  selectedId,
  testState,
  canSave,
  onChange,
  onCreate,
  onDelete,
  onSave,
  saveState,
  onSelect,
  onTest,
}: {
  draft: ProviderDraft;
  providers: LlmProvider[];
  selectedId: string | null;
  testState: string;
  canSave: boolean;
  onChange: (draft: ProviderDraft) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onSave: () => void;
  saveState: SaveState;
  onSelect: (provider: LlmProvider) => void;
  onTest: (id: string) => void;
}) {
  const saveLabel = saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : '保存';

  return (
    <div className="settings-panel">
      <PanelHeader
        icon={<KeyRound size={20} />}
        title="供应商"
        description="管理 API 类型、Base URL、模型和 API Key。"
      />
      <div className="settings-detail-grid">
        <ConfigList createLabel="新增供应商" title="已配置供应商" onCreate={onCreate}>
          {providers.map((provider) => (
            <button
              className={
                provider.id === selectedId
                  ? 'config-list-item is-plain is-active'
                  : 'config-list-item is-plain'
              }
              key={provider.id}
              type="button"
              onClick={() => onSelect(provider)}
            >
              <span className="min-w-0">
                <strong>{provider.name}</strong>
                <span>
                  {provider.type} · {provider.modelName}
                </span>
              </span>
            </button>
          ))}
        </ConfigList>
        <section className="detail-pane">
          <div className="detail-pane-header">
            <div>
              <h3>{draft.id ? '编辑供应商' : '新增供应商'}</h3>
              <p>{draft.id ? '点击左侧其他供应商切换详情。' : '填写完成后保存到供应商列表。'}</p>
            </div>
            <div className="flex gap-2">
              {draft.id ? (
                <Button
                  className="action-button test-action"
                  variant="secondary"
                  type="button"
                  onClick={() => onTest(draft.id!)}
                >
                  测试
                </Button>
              ) : null}
              {draft.id ? (
                <Button
                  className="action-button danger-action"
                  variant="destructive"
                  size="icon"
                  type="button"
                  onClick={() => onDelete(draft.id!)}
                >
                  <Trash2 size={15} />
                </Button>
              ) : null}
              <Button
                className={
                  saveState === 'saved'
                    ? 'action-button save-action is-saved'
                    : 'action-button save-action'
                }
                disabled={!canSave}
                type="button"
                onClick={onSave}
              >
                {saveState === 'saved' ? <Check size={16} /> : <Save size={16} />}
                {saveLabel}
              </Button>
            </div>
          </div>
          <ProviderForm draft={draft} onChange={onChange} />
          {testState ? (
            <p className="mt-4 rounded-xl bg-secondary px-4 py-3 text-sm text-secondary-foreground">
              {testState}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function AgentSettings({
  agents,
  draft,
  error,
  providers,
  selectedId,
  canSave,
  onChange,
  onCreate,
  onDelete,
  onSave,
  saveState,
  onSelect,
}: {
  agents: Agent[];
  draft: AgentDraft;
  error: string;
  providers: ProviderOption[];
  selectedId: string | null;
  canSave: boolean;
  onChange: (draft: AgentDraft) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onSave: () => void;
  saveState: SaveState;
  onSelect: (agent: Agent) => void;
}) {
  const saveLabel = saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : '保存';

  return (
    <div className="settings-panel">
      <PanelHeader
        icon={<Bot size={20} />}
        title="助手"
        description="管理助手身份、头像、供应商和个性。"
      />
      <div className="settings-detail-grid">
        <ConfigList
          createLabel="新增助手"
          empty={
            <div className="agent-list-empty">
              <Bot size={22} />
              <strong>还没有助手</strong>
              <p>新增一个助手后，浏览器阅读器里就能邀请它参与批注。</p>
            </div>
          }
          title="已配置助手"
          onCreate={onCreate}
        >
          {agents.map((agent) => {
            const personalityName = agentPersonalityName(agent);
            return (
              <button
                className={
                  agent.id === selectedId ? 'config-list-item is-active' : 'config-list-item'
                }
                key={agent.id}
                type="button"
                onClick={() => onSelect(agent)}
              >
                <AvatarImage value={agent.avatar} className="size-10" fallback="AI" />
                <span className="min-w-0">
                  <strong>{agent.nickname}</strong>
                  <span>
                    {agentKindLabel(agent.kind)} · {personalityName}
                  </span>
                </span>
              </button>
            );
          })}
        </ConfigList>
        <section className="detail-pane">
          <div className="detail-pane-header">
            <div>
              <h3>{draft.id ? '编辑助手' : '新增助手'}</h3>
              <p>
                {providers.length > 0
                  ? '选择预设个性，或切换到自定义个性。'
                  : '先配置供应商，再保存助手。'}
              </p>
            </div>
            <div className="flex gap-2">
              {draft.id ? (
                <Button
                  className="action-button danger-action"
                  variant="destructive"
                  size="icon"
                  type="button"
                  onClick={() => onDelete(draft.id!)}
                >
                  <Trash2 size={15} />
                </Button>
              ) : null}
              <Button
                className={
                  saveState === 'saved'
                    ? 'action-button save-action is-saved'
                    : 'action-button save-action'
                }
                disabled={!canSave}
                type="button"
                onClick={onSave}
              >
                {saveState === 'saved' ? <Check size={16} /> : <Save size={16} />}
                {saveLabel}
              </Button>
            </div>
          </div>
          <AgentForm draft={draft} error={error} providers={providers} onChange={onChange} />
        </section>
      </div>
    </div>
  );
}

function ConfigList({
  title,
  children,
  createLabel = '新增',
  empty,
  onCreate,
}: {
  title: string;
  children: React.ReactNode;
  createLabel?: string;
  empty?: React.ReactNode;
  onCreate: () => void;
}) {
  const hasItems = React.Children.count(children) > 0;

  return (
    <aside className="config-list">
      <div className="config-list-header">
        <div className="config-list-title">{title}</div>
        <Button className="action-button create-action" size="sm" type="button" onClick={onCreate}>
          <Plus size={16} />
          {createLabel}
        </Button>
      </div>
      <div className="config-list-scroll">{hasItems ? children : empty}</div>
    </aside>
  );
}
function PanelHeader({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="panel-header">
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
          {icon}
        </div>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {action}
    </header>
  );
}

function ProviderForm({
  draft,
  onChange,
}: {
  draft: ProviderDraft;
  onChange: (draft: ProviderDraft) => void;
}) {
  return (
    <div className="settings-form-grid">
      <Field label="名称">
        <Input
          value={draft.name || ''}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </Field>
      <Field label="API 类型">
        <Select
          value={draft.type || 'anthropic'}
          onValueChange={(value) => onChange({ ...draft, type: value as ProviderType })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="theme-select-content">
            <SelectGroup>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="gemini">Gemini</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Base URL">
        <Input
          value={draft.baseUrl || ''}
          onChange={(event) => onChange({ ...draft, baseUrl: event.target.value })}
        />
      </Field>
      <Field label="模型">
        <Input
          value={draft.modelName || ''}
          onChange={(event) => onChange({ ...draft, modelName: event.target.value })}
        />
      </Field>
      <Field className="col-span-2" label="API Key">
        <SecretInput
          value={draft.apiKey || ''}
          onChange={(apiKey) => onChange({ ...draft, apiKey })}
        />
      </Field>
    </div>
  );
}

function AgentForm({
  draft,
  error,
  providers,
  onChange,
}: {
  draft: AgentDraft;
  error: string;
  providers: ProviderOption[];
  onChange: (draft: AgentDraft) => void;
}) {
  const agentKind = draft.kind || 'annotation';
  const availablePersonalities = personalitiesForKind(agentKind);
  const rawPersonalityId =
    draft.personalityId || findAgentPersonalityId(draft.soul || defaultAgentSoul);
  const personalityId = availablePersonalities.some((item) => item.id === rawPersonalityId)
    ? rawPersonalityId
    : customPersonalityId;
  const isCustomPersonality = personalityId === customPersonalityId;

  function changeKind(kind: AgentKind) {
    const firstPersonality = personalitiesForKind(kind)[0];
    onChange({
      ...draft,
      kind,
      personalityId: firstPersonality?.id || customPersonalityId,
      soul: firstPersonality?.soul || '',
      temperature: firstPersonality?.temperature ?? customPersonality.temperature,
      annotationDensity: draft.annotationDensity || 'medium',
    });
  }

  function changePersonality(nextId: string) {
    const personality = availablePersonalities.find((item) => item.id === nextId);
    if (personality) {
      onChange({
        ...draft,
        personalityId: nextId,
        soul: personality.soul,
        temperature: personality.temperature,
      });
      return;
    }
    onChange({
      ...draft,
      personalityId: customPersonalityId,
      soul: '',
      temperature: draft.temperature ?? customPersonality.temperature,
    });
  }

  return (
    <div className="settings-form-grid">
      <Field
        className="col-span-2"
        description="阅读助手会出现在浏览器阅读器；审核助手用于后续读后卡片审稿流程。"
        label="助手类型"
      >
        <div className="agent-kind-grid">
          {agentKindOptions.map((option) => (
            <button
              className={
                agentKind === option.value ? 'agent-kind-choice is-active' : 'agent-kind-choice'
              }
              key={option.value}
              type="button"
              onClick={() => changeKind(option.value)}
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>
      </Field>
      <Field description="当前助手调用的模型供应商。" label="供应商">
        <Select
          disabled={providers.length === 0}
          value={draft.providerId || providers[0]?.id || ''}
          onValueChange={(providerId) => onChange({ ...draft, providerId })}
        >
          <SelectTrigger className="provider-select-trigger">
            <SelectValue placeholder="选择供应商" />
          </SelectTrigger>
          <SelectContent className="theme-select-content provider-select-content">
            <SelectGroup>
              {providers.map((provider) => (
                <SelectItem className="provider-select-item" key={provider.id} value={provider.id}>
                  <span className="provider-select-item-mark" />
                  <span className="provider-select-item-copy">
                    <strong>{provider.label}</strong>
                    <span>
                      {provider.type} · {provider.modelName}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field description="批注和评论中展示的名称。" label="昵称">
        <Input
          value={draft.nickname || ''}
          onChange={(event) => onChange({ ...draft, nickname: event.target.value })}
        />
      </Field>
      <Field
        className="col-span-2"
        description="用于 @ 提及，仅支持英文、数字和下划线。"
        label="用户名"
      >
        <Input
          value={draft.username || ''}
          onChange={(event) =>
            onChange({ ...draft, username: sanitizeUsernameInput(event.target.value) })
          }
        />
      </Field>
      <Field
        className="col-span-2"
        description="这些颜色已按阅读器高亮可见性筛选。"
        label={agentKind === 'review' ? '标识颜色' : '批注颜色'}
      >
        <ColorPicker
          value={draft.annotationColor || annotationColors[1]}
          onChange={(annotationColor) => onChange({ ...draft, annotationColor })}
        />
      </Field>
      {agentKind === 'annotation' ? (
        <Field
          className="col-span-2"
          description="决定助手主动批注时的积极程度，会影响提示词和模型采样。"
          label="批注密度"
        >
          <div className="density-grid">
            {annotationDensityOptions.map((option) => (
              <button
                className={
                  (draft.annotationDensity || 'medium') === option.value
                    ? 'density-choice is-active'
                    : 'density-choice'
                }
                key={option.value}
                type="button"
                onClick={() => onChange({ ...draft, annotationDensity: option.value })}
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>
        </Field>
      ) : null}
      <Field className="col-span-2" label="头像">
        <AvatarPicker
          value={draft.avatar || ''}
          onChange={(avatar) => onChange({ ...draft, avatar })}
        />
      </Field>
      <Field className="col-span-2" label="个性">
        <div className="personality-editor">
          <div className="personality-grid">
            {availablePersonalities.map((personality) => (
              <button
                className={
                  personalityId === personality.id
                    ? 'personality-choice is-active'
                    : 'personality-choice'
                }
                key={personality.id}
                type="button"
                onClick={() => changePersonality(personality.id)}
              >
                <PersonalityIcon type={personality.icon} />
                <strong>{personality.name}</strong>
                <span>{personality.description}</span>
                {personalityId === personality.id ? (
                  <Check className="personality-check" size={16} />
                ) : null}
              </button>
            ))}
            <button
              className={
                isCustomPersonality ? 'personality-choice is-active' : 'personality-choice'
              }
              type="button"
              onClick={() => changePersonality(customPersonalityId)}
            >
              <PersonalityIcon type={customPersonality.icon} />
              <strong>{customPersonality.name}</strong>
              <span>{customPersonality.description}</span>
              {isCustomPersonality ? <Check className="personality-check" size={16} /> : null}
            </button>
          </div>
          {isCustomPersonality ? (
            <div className="custom-personality-panel">
              <Field description="保存自定义个性时必填。" label="自定义系统提示词">
                <Textarea
                  value={draft.soul || ''}
                  onChange={(event) => onChange({ ...draft, soul: event.target.value })}
                />
              </Field>
              <Field description="数值越高，回复越发散；数值越低，回复越稳定。" label="温度">
                <div className="temperature-control">
                  <input
                    max="1"
                    min="0"
                    step="0.05"
                    type="range"
                    value={draft.temperature ?? customPersonality.temperature}
                    onChange={(event) =>
                      onChange({ ...draft, temperature: Number(event.target.value) })
                    }
                  />
                  <strong>{(draft.temperature ?? customPersonality.temperature).toFixed(2)}</strong>
                </div>
              </Field>
            </div>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}
        </div>
      </Field>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="color-swatches">
      {annotationColors.map((color) => (
        <button
          className={value === color ? 'color-swatch is-active' : 'color-swatch'}
          key={color}
          style={{ backgroundColor: color }}
          type="button"
          aria-label={`选择颜色 ${color}`}
          onClick={() => onChange(color)}
        >
          {value === color ? <Check size={15} /> : null}
        </button>
      ))}
    </div>
  );
}

function AvatarPicker({ value, onChange }: { value: string; onChange: (avatar: string) => void }) {
  const usesCustomAvatar = value && agentAvatars.every((avatar) => avatar.src !== value);

  async function loadFile(file: File | undefined) {
    if (!file) return;
    onChange(await readFileAsDataUrl(file));
  }

  return (
    <div className="avatar-picker">
      <div className="avatar-grid">
        {agentAvatars.map((avatar) => (
          <button
            className={value === avatar.src ? 'avatar-choice is-active' : 'avatar-choice'}
            key={avatar.id}
            type="button"
            onClick={() => onChange(avatar.src)}
          >
            <img alt="" src={avatar.src} />
          </button>
        ))}
        {usesCustomAvatar ? (
          <button className="avatar-choice is-active" type="button">
            <img alt="" src={value} />
          </button>
        ) : null}
      </div>
      <label className="avatar-upload-choice">
        <Upload size={17} />
        <span>上传</span>
        <input
          accept="image/*"
          type="file"
          onChange={(event) => loadFile(event.target.files?.[0])}
        />
      </label>
    </div>
  );
}

function PersonalityIcon({
  type,
}: {
  type: (typeof agentPersonalities)[number]['icon'] | 'custom';
}) {
  return (
    <span className={`personality-icon is-${type}`}>
      {type === 'lens' ? <Search size={17} /> : null}
      {type === 'scales' ? <Scale size={17} /> : null}
      {type === 'checklist' ? <ListChecks size={17} /> : null}
      {type === 'leaf' ? (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M8 18c7-9 13-9 18-9-1 9-6 15-15 15" />
          <path d="M7 25c5-6 10-9 16-11" />
        </svg>
      ) : null}
      {type === 'pyramid' ? (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M16 5 5 27h22L16 5Z" />
          <path d="M11 18h10" />
          <path d="M9 23h14" />
        </svg>
      ) : null}
      {type === 'question' ? (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M12 12a5 5 0 1 1 8 4c-2 1.4-4 2.6-4 5" />
          <path d="M16 26h.01" />
        </svg>
      ) : null}
      {type === 'quill' ? (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M25 6c-7 1-12 4-15 9-2 3-2 6 0 8 2 2 5 2 8 0 5-3 8-8 9-15" />
          <path d="M8 25c4-4 8-8 12-12" />
        </svg>
      ) : null}
      {type === 'custom' ? (
        <svg aria-hidden="true" viewBox="0 0 32 32">
          <path d="M16 7v18" />
          <path d="M7 16h18" />
        </svg>
      ) : null}
    </span>
  );
}

function SecretInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        className="pr-12"
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        className="secret-toggle"
        type="button"
        aria-label={visible ? '隐藏 API Key' : '显示 API Key'}
        onClick={() => setVisible((next) => !next)}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

function ProfileAvatarEditor({ onChange }: { onChange: (avatar: string) => void }) {
  async function loadFile(file: File | undefined) {
    if (!file) return;
    onChange(await readFileAsDataUrl(file));
  }

  return (
    <div className="grid gap-3">
      <label className="upload-button">
        <Upload size={16} />
        上传头像
        <input
          accept="image/*"
          type="file"
          onChange={(event) => loadFile(event.target.files?.[0])}
        />
      </label>
    </div>
  );
}

function AvatarImage({
  value,
  fallback,
  className = 'size-10',
}: {
  value: string;
  fallback: string;
  className?: string;
}) {
  const image = isImageAvatar(value);
  const svg = isSvgAvatar(value);
  const classes = ['avatar-image', className, image ? 'is-image' : '', svg ? 'is-svg' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes}>
      {image ? <img alt="" src={value} /> : <span>{value || fallback}</span>}
    </span>
  );
}

function Field({
  label,
  description,
  className = '',
  children,
}: {
  label: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`grid gap-2 ${className}`}>
      <div className="field-copy">
        <Label>{label}</Label>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
