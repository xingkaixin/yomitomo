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
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Quote,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import type {
  Agent,
  DesktopStore,
  LlmProvider,
  ProviderType,
} from '@yomitomo/shared';
import { renderMarkdown } from '@yomitomo/shared';
import {
  annotationTypeLabel,
  buildReadingCard,
  buildReadingCardSections,
  computeReadingStats,
  sortAnnotations,
  sortArticles,
  type ReadingStatsPeriod,
} from '@yomitomo/core';
import {
  agentDraftHasChanges,
  agentPersonalities,
  agentPersonalityName,
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
  const canSaveUser = userSaveState !== 'saving' && userHasChanges;

  async function refreshStore() {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;

    const nextStore = await desktop.getState();
    setStore(nextStore);
    setUserDraft(nextStore.user);
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
      personalityId: 'reading-partner',
      temperature: agentPersonalities[0].temperature,
      providerId: store.providers[0]?.id || '',
    });
    setAgentSaveError('');
    setAgentSaveState('idle');
  }

  async function saveUserDraft() {
    if (!window.yomitomoDesktop || !canSaveUser) return;
    setUserSaveState('saving');
    try {
      const nextStore = await window.yomitomoDesktop.saveUser(userDraft);
      setStore(nextStore);
      setUserDraft(nextStore.user);
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
            <ReadingLibrary articles={store.articles} onRefresh={refreshStore} />
          ) : null}
          {activeSetting === 'stats' ? (
            <ReadingStatsPanel articles={store.articles} onRefresh={refreshStore} />
          ) : null}
          {activeSetting === 'general' ? (
            <GeneralSettings
              draft={userDraft}
              canSave={canSaveUser}
              onChange={(draft) => {
                setUserDraft(draft);
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
  canSave,
  onChange,
  onSave,
  saveState,
}: {
  draft: UserDraft;
  canSave: boolean;
  onChange: (draft: UserDraft) => void;
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
  articles,
  onRefresh,
}: {
  articles: ArticleRecord[];
  onRefresh: () => void;
}) {
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const sortedArticles = useMemo(() => sortArticles(articles), [articles]);
  const selectedArticle =
    sortedArticles.find((article) => article.id === selectedArticleId) || sortedArticles[0] || null;
  const annotations = useMemo(
    () => (selectedArticle ? sortAnnotations(selectedArticle.annotations) : []),
    [selectedArticle],
  );
  const selectedAnnotation =
    annotations.find((annotation) => annotation.id === selectedAnnotationId) ||
    annotations[0] ||
    null;
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
    <div className="library-screen">
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

      {selectedArticle ? (
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
      )}

      <ReadingCard article={selectedArticle} />
    </div>
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

function ReadingCard({ article }: { article: ArticleRecord | null }) {
  const [copied, setCopied] = useState(false);
  const articleText = useMemo(() => (article ? articlePlainText(article) : ''), [article]);
  const card = useMemo(() => (article ? buildReadingCard(article, articleText) : ''), [
    article,
    articleText,
  ]);
  const sections = useMemo(
    () => (article ? buildReadingCardSections(article, articleText) : []),
    [article, articleText],
  );

  async function copyCard() {
    if (!card) return;
    await navigator.clipboard.writeText(card);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
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
        </div>
        <Button type="button" variant="secondary" onClick={copyCard}>
          <Clipboard size={16} />
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
      <div className="reading-card-body">
        {sections.map((section) => (
          <section key={section.title}>
            <h4>{section.title}</h4>
            <ul>
              {(section.items.length > 0 ? section.items : ['暂无']).map((item, index) => (
                <li key={`${section.title}-${index}`}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
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
                  <span>{personalityName}</span>
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
  const personalityId =
    draft.personalityId || findAgentPersonalityId(draft.soul || defaultAgentSoul);
  const isCustomPersonality = personalityId === customPersonalityId;

  function changePersonality(nextId: string) {
    const personality = agentPersonalities.find((item) => item.id === nextId);
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
        label="批注颜色"
      >
        <ColorPicker
          value={draft.annotationColor || annotationColors[1]}
          onChange={(annotationColor) => onChange({ ...draft, annotationColor })}
        />
      </Field>
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
      <Field className="col-span-2" label="头像">
        <AvatarPicker
          value={draft.avatar || ''}
          onChange={(avatar) => onChange({ ...draft, avatar })}
        />
      </Field>
      <Field className="col-span-2" label="个性">
        <div className="personality-editor">
          <div className="personality-grid">
            {agentPersonalities.map((personality) => (
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
