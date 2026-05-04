import React, { useState } from 'react';
import {
  Bot,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  ListChecks,
  Plus,
  RefreshCw,
  Save,
  Scale,
  Search,
  Trash2,
  Unplug,
  Upload,
  User,
} from 'lucide-react';
import type { Agent, AgentKind, AppSettings, LlmProvider, ProviderType } from '@yomitomo/shared';
import { providerPresets, reasoningEffortOptions } from '@yomitomo/shared';
import {
  agentKindLabel,
  agentKindOptions,
  agentPersonalities,
  agentPersonalityName,
  annotationColors,
  annotationDensityOptions,
  customPersonality,
  customPersonalityId,
  defaultAgentSoul,
  findAgentPersonalityId,
  personalitiesForKind,
  sanitizeUsernameInput,
  type AgentDraft,
  type ProviderDraft,
  type UserDraft,
} from './app-settings';
import { readFileAsDataUrl, svgToDataUrl } from './app-utils';
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
import reviewAvatar01Raw from './assets/review-avatars/notionists-1777882430781.svg?raw';
import reviewAvatar02Raw from './assets/review-avatars/notionists-1777882429343.svg?raw';
import reviewAvatar03Raw from './assets/review-avatars/notionists-1777882427960.svg?raw';
import reviewAvatar04Raw from './assets/review-avatars/notionists-1777882426245.svg?raw';
import reviewAvatar05Raw from './assets/review-avatars/notionists-1777882424152.svg?raw';
import reviewAvatar06Raw from './assets/review-avatars/notionists-1777882422463.svg?raw';
import reviewAvatar07Raw from './assets/review-avatars/notionists-1777882420595.svg?raw';
import reviewAvatar08Raw from './assets/review-avatars/notionists-1777882418767.svg?raw';
import reviewAvatar09Raw from './assets/review-avatars/notionists-1777882415900.svg?raw';
import reviewAvatar10Raw from './assets/review-avatars/notionists-1777882413773.svg?raw';
import reviewAvatar11Raw from './assets/review-avatars/notionists-1777882411527.svg?raw';
import reviewAvatar12Raw from './assets/review-avatars/notionists-1777882408840.svg?raw';
import reviewAvatar13Raw from './assets/review-avatars/notionists-1777882406509.svg?raw';
import reviewAvatar14Raw from './assets/review-avatars/notionists-1777882404878.svg?raw';
import reviewAvatar15Raw from './assets/review-avatars/notionists-1777882403212.svg?raw';
import reviewAvatar16Raw from './assets/review-avatars/notionists-1777882401189.svg?raw';
import reviewAvatar17Raw from './assets/review-avatars/notionists-1777882399095.svg?raw';
import reviewAvatar18Raw from './assets/review-avatars/notionists-1777882397541.svg?raw';
import reviewAvatar19Raw from './assets/review-avatars/notionists-1777882396039.svg?raw';
import reviewAvatar20Raw from './assets/review-avatars/notionists-1777882394280.svg?raw';
import anthropicLogo from './assets/providers/anthropic.png';
import bailianLogo from './assets/providers/bailian.png';
import deepseekLogo from './assets/providers/deepseek.png';
import googleLogo from './assets/providers/google.png';
import minimaxLogo from './assets/providers/minimax.png';
import mimoLogo from './assets/providers/mimo.svg';
import moonshotLogo from './assets/providers/moonshot.webp';
import openaiLogo from './assets/providers/openai.png';
import volcengineLogo from './assets/providers/volcengine.png';
import zhipuLogo from './assets/providers/zhipu.png';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { Textarea } from './components/ui/textarea';
import { AvatarImage, CopyIconButton, Field, PanelHeader } from './app-ui';
import type { ProviderOption, SaveState } from './app-types';
import type { PairingConnectionStatus, PairingInfo } from '../../preload';

type AvatarOption = { id: string; src: string };
type AgentFilter = 'all' | AgentKind;

const agentFilterOptions: Array<{ value: AgentFilter; label: string }> = [
  { value: 'all', label: '全部助手' },
  { value: 'annotation', label: '阅读助手' },
  { value: 'review', label: '审核助手' },
];

const providerLogoMap: Record<string, string> = {
  'anthropic.png': anthropicLogo,
  'bailian.png': bailianLogo,
  'deepseek.png': deepseekLogo,
  'google.png': googleLogo,
  'minimax.png': minimaxLogo,
  'mimo.svg': mimoLogo,
  'moonshot.webp': moonshotLogo,
  'openai.png': openaiLogo,
  'volcengine.png': volcengineLogo,
  'zhipu.png': zhipuLogo,
};

function ProviderOptionContent({ provider }: { provider: ProviderOption }) {
  const logoSrc = provider.logo ? providerLogoMap[provider.logo] : undefined;

  return (
    <span className="provider-option-content">
      {logoSrc ? (
        <img className="provider-select-logo" src={logoSrc} alt="" />
      ) : (
        <span className="provider-select-item-mark" />
      )}
      <span className="provider-select-item-copy">
        <strong>{provider.label}</strong>
        <span>
          {provider.type} · {provider.modelName}
        </span>
      </span>
    </span>
  );
}

function makeAvatarOptions(prefix: string, raws: string[]): AvatarOption[] {
  return raws.map((raw, index) => ({ id: `${prefix}-${index + 1}`, src: svgToDataUrl(raw) }));
}

export const readingAgentAvatars = makeAvatarOptions('reading-avatar', [
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
]);

export const reviewAgentAvatars = makeAvatarOptions('review-avatar', [
  reviewAvatar01Raw,
  reviewAvatar02Raw,
  reviewAvatar03Raw,
  reviewAvatar04Raw,
  reviewAvatar05Raw,
  reviewAvatar06Raw,
  reviewAvatar07Raw,
  reviewAvatar08Raw,
  reviewAvatar09Raw,
  reviewAvatar10Raw,
  reviewAvatar11Raw,
  reviewAvatar12Raw,
  reviewAvatar13Raw,
  reviewAvatar14Raw,
  reviewAvatar15Raw,
  reviewAvatar16Raw,
  reviewAvatar17Raw,
  reviewAvatar18Raw,
  reviewAvatar19Raw,
  reviewAvatar20Raw,
]);

export const agentAvatars = readingAgentAvatars;

export function agentAvatarsForKind(kind: AgentKind | undefined) {
  return (kind || 'annotation') === 'review' ? reviewAgentAvatars : readingAgentAvatars;
}

export function defaultAvatarForKind(kind: AgentKind | undefined) {
  return agentAvatarsForKind(kind)[0]?.src || '';
}

export function avatarForKind(value: string | undefined, kind: AgentKind | undefined) {
  const avatars = agentAvatarsForKind(kind);
  return avatars.some((avatar) => avatar.src === value) ? value || '' : defaultAvatarForKind(kind);
}

export function SettingsNavButton({
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

export function GeneralSettings({
  draft,
  pairingConnectionStatus,
  pairingInfo,
  providers,
  settingsDraft,
  canSave,
  onChange,
  onSettingsChange,
  onSave,
  onRotatePairing,
  saveState,
}: {
  draft: UserDraft;
  pairingConnectionStatus: PairingConnectionStatus;
  pairingInfo: PairingInfo | null;
  providers: ProviderOption[];
  settingsDraft: AppSettings;
  canSave: boolean;
  onChange: (draft: UserDraft) => void;
  onSettingsChange: (draft: AppSettings) => void;
  onSave: () => void;
  onRotatePairing: () => void;
  saveState: SaveState;
}) {
  const saveLabel = saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : '保存';
  const readerSessionCount = pairingConnectionStatus.authenticatedSocketCount;
  const extensionConnected = readerSessionCount > 0;
  const pairingTitle = extensionConnected ? '已连通' : '插件未工作';
  const pairingDescription = extensionConnected
    ? `${readerSessionCount} 个阅读器会话正在连接本机`
    : '打开浏览器阅读器后会自动连接本机';

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
        <Field id="general-nickname" description="批注和评论中展示的名称。" label="昵称">
          <Input
            id="general-nickname"
            name="nickname"
            autoComplete="off"
            value={draft.nickname || ''}
            onChange={(event) => onChange({ ...draft, nickname: event.target.value })}
          />
        </Field>
        <Field
          id="general-username"
          description="用于 @ 提及，仅支持英文、数字和下划线。"
          label="用户名"
        >
          <Input
            id="general-username"
            name="username"
            autoComplete="off"
            spellCheck={false}
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
          id="general-default-provider"
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
            <SelectTrigger
              id="general-default-provider"
              aria-describedby="general-default-provider-description"
              aria-labelledby="general-default-provider-label"
              className="theme-select-trigger provider-select-trigger"
            >
              <SelectValue placeholder={providers.length > 0 ? '选择默认供应商' : '先添加供应商'} />
            </SelectTrigger>
            <SelectContent className="theme-select-content provider-select-content">
              {providers.map((provider) => (
                <SelectItem className="provider-select-item" key={provider.id} value={provider.id}>
                  <ProviderOptionContent provider={provider} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          className="col-span-2"
          description={
            extensionConnected
              ? '当前有浏览器阅读器会话连到本机，连接标识会同步显示在扩展端。'
              : '配对标识保留在本机，阅读器启动后会按已保存的配对信息连接。'
          }
          label="扩展连接"
        >
          <div
            className={
              extensionConnected ? 'pairing-connected-card' : 'pairing-connected-card is-idle'
            }
          >
            <div className="pairing-connected-main">
              <span className="pairing-connected-icon">
                {extensionConnected ? <Check size={17} /> : <Unplug size={17} />}
              </span>
              <div>
                <strong>{pairingTitle}</strong>
                <p>{pairingDescription}</p>
              </div>
            </div>
            <div className="pairing-identity">
              <span>连接标识</span>
              <strong>{pairingInfo?.pairingId || 'YMT-......'}</strong>
            </div>
            <div className="pairing-actions">
              <CopyIconButton label="复制配对码" value={pairingInfo?.token || ''} />
              <Button type="button" variant="secondary" onClick={onRotatePairing}>
                <KeyRound size={16} />
                重新配对
              </Button>
            </div>
          </div>
        </Field>
      </div>
    </div>
  );
}

export function ProviderSettings({
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
              <img
                className="provider-logo"
                src={
                  providerLogoMap[provider.logo || 'anthropic.png'] ||
                  providerLogoMap['anthropic.png']
                }
                alt=""
              />
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

export function AgentSettings({
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
  onCreate: (kind: AgentKind) => void;
  onDelete: (id: string) => void;
  onSave: () => void;
  saveState: SaveState;
  onSelect: (agent: Agent) => void;
}) {
  const [filter, setFilter] = useState<AgentFilter>('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const saveLabel = saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : '保存';
  const filteredAgents =
    filter === 'all' ? agents : agents.filter((agent) => (agent.kind || 'annotation') === filter);
  const emptyKindLabel = filter === 'all' ? '助手' : agentKindLabel(filter);

  function createAgent(kind: AgentKind) {
    setFilter(kind);
    setCreateDialogOpen(false);
    onCreate(kind);
  }

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
              <strong>还没有{emptyKindLabel}</strong>
              <p>选择类型后创建助手，配置项会按用途展开。</p>
            </div>
          }
          title="已配置助手"
          controls={
            <AgentFilterTabs
              agents={agents}
              value={filter}
              onChange={(nextFilter) => {
                setFilter(nextFilter);
                const nextAgent =
                  nextFilter === 'all'
                    ? agents[0]
                    : agents.find((agent) => (agent.kind || 'annotation') === nextFilter);
                if (nextAgent && nextAgent.id !== selectedId) onSelect(nextAgent);
              }}
            />
          }
          onCreate={() => setCreateDialogOpen(true)}
        >
          {filteredAgents.map((agent) => {
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
                <AvatarImage
                  value={avatarForKind(agent.avatar, agent.kind)}
                  className="size-10"
                  fallback="AI"
                />
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
      {createDialogOpen ? (
        <AgentCreateDialog onClose={() => setCreateDialogOpen(false)} onCreate={createAgent} />
      ) : null}
    </div>
  );
}

function ConfigList({
  title,
  children,
  createLabel = '新增',
  controls,
  empty,
  onCreate,
}: {
  title: string;
  children: React.ReactNode;
  createLabel?: string;
  controls?: React.ReactNode;
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
      {controls}
      <div className="config-list-scroll">{hasItems ? children : empty}</div>
    </aside>
  );
}

function AgentFilterTabs({
  agents,
  value,
  onChange,
}: {
  agents: Agent[];
  value: AgentFilter;
  onChange: (value: AgentFilter) => void;
}) {
  return (
    <div className="agent-filter-tabs" role="tablist" aria-label="助手过滤">
      {agentFilterOptions.map((option) => {
        const count =
          option.value === 'all'
            ? agents.length
            : agents.filter((agent) => (agent.kind || 'annotation') === option.value).length;
        return (
          <button
            aria-selected={value === option.value}
            className={value === option.value ? 'agent-filter-tab is-active' : 'agent-filter-tab'}
            key={option.value}
            role="tab"
            type="button"
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
            <strong>{count}</strong>
          </button>
        );
      })}
    </div>
  );
}

function AgentCreateDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (kind: AgentKind) => void;
}) {
  return (
    <div className="agent-create-overlay" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="agent-create-title"
        aria-modal="true"
        className="agent-create-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <h3 id="agent-create-title">选择助手类型</h3>
            <p>不同类型会使用不同头像、个性预设和配置项。</p>
          </div>
          <Button
            className="action-button"
            size="icon"
            type="button"
            variant="ghost"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </Button>
        </header>
        <div className="agent-create-choice-grid">
          {agentKindOptions.map((option) => (
            <button
              className="agent-create-choice"
              key={option.value}
              type="button"
              onClick={() => onCreate(option.value)}
            >
              <span className="agent-create-choice-icon">
                {option.value === 'review' ? <Scale size={18} /> : <Bot size={18} />}
              </span>
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ProviderForm({
  draft,
  onChange,
}: {
  draft: ProviderDraft;
  onChange: (draft: ProviderDraft) => void;
}) {
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelError, setModelError] = useState('');
  const [modelNotice, setModelNotice] = useState('');
  const selectedPreset = providerPresets.find((preset) => preset.id === draft.presetId);
  const visibleModels =
    modelOptions.length > 0 ? modelOptions : draft.modelNames || selectedPreset?.modelNames || [];

  async function fetchModels() {
    const fallbackModels = selectedPreset?.modelNames || [];
    if (!window.yomitomoDesktop) return;
    if (!draft.apiKey?.trim()) {
      setModelError('');
      setModelNotice(
        fallbackModels.length > 0
          ? '已显示预设模型；填写 API Key 后可获取实时列表'
          : '填写 API Key 后可获取模型列表',
      );
      return;
    }
    setModelLoading(true);
    setModelError('');
    setModelNotice('');
    try {
      const models = await window.yomitomoDesktop.listProviderModels(draft);
      const names = models.map((model) => model.id).filter(Boolean);
      setModelOptions(names);
      setModelNotice(names.length > 0 ? `已获取 ${names.length} 个模型` : '未获取到模型列表');
      if (names.length > 0) {
        onChange({
          ...draft,
          modelName: names.includes(draft.modelName || '') ? draft.modelName : names[0],
          modelNames: names,
        });
      }
    } catch (error) {
      setModelError(error instanceof Error ? error.message : '获取模型列表失败');
      setModelNotice(fallbackModels.length > 0 ? '已显示预设模型作为候选' : '');
    } finally {
      setModelLoading(false);
    }
  }

  function applyPreset(presetId: string) {
    const preset = providerPresets.find((item) => item.id === presetId);
    if (!preset) return;
    setModelOptions([]);
    setModelError('');
    setModelNotice('');
    onChange({
      ...draft,
      presetId: preset.id,
      name: preset.name,
      type: preset.type,
      logo: preset.logo,
      baseUrl: preset.baseUrl,
      modelName: preset.modelName,
      modelNames: preset.modelNames,
    });
  }

  return (
    <div className="settings-form-grid">
      <Field id="provider-preset" className="col-span-2" label="预设服务商">
        <Select value={draft.presetId || ''} onValueChange={applyPreset}>
          <SelectTrigger id="provider-preset" aria-labelledby="provider-preset-label">
            <SelectValue placeholder="选择服务商" />
          </SelectTrigger>
          <SelectContent className="theme-select-content">
            <SelectGroup>
              {providerPresets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  <span className="provider-preset-item">
                    <img
                      className="provider-preset-logo"
                      src={providerLogoMap[preset.logo]}
                      alt=""
                    />
                    {preset.name}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field id="provider-name" label="名称">
        <Input
          id="provider-name"
          name="provider-name"
          autoComplete="off"
          value={draft.name || ''}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </Field>
      <Field id="provider-type" label="API 类型">
        <Select
          value={draft.type || 'anthropic'}
          onValueChange={(value) =>
            onChange({ ...draft, type: value as ProviderType, presetId: undefined })
          }
        >
          <SelectTrigger id="provider-type" aria-labelledby="provider-type-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="theme-select-content">
            <SelectGroup>
              <SelectItem value="openai-chat">OpenAI Chat</SelectItem>
              <SelectItem value="openai-responses">OpenAI Responses</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
              <SelectItem value="gemini">Gemini</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field id="provider-base-url" label="Base URL">
        <Input
          id="provider-base-url"
          name="provider-base-url"
          type="url"
          autoComplete="off"
          value={draft.baseUrl || ''}
          onChange={(event) => onChange({ ...draft, baseUrl: event.target.value })}
        />
      </Field>
      <Field id="provider-model" label="模型">
        <div className="provider-model-field">
          <Select
            disabled={visibleModels.length === 0}
            value={visibleModels.includes(draft.modelName || '') ? draft.modelName : ''}
            onValueChange={(modelName) => onChange({ ...draft, modelName })}
          >
            <SelectTrigger id="provider-model" aria-labelledby="provider-model-label">
              <SelectValue placeholder="选择模型" />
            </SelectTrigger>
            <SelectContent className="theme-select-content">
              <SelectGroup>
                {visibleModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            className="action-button"
            type="button"
            variant="secondary"
            disabled={modelLoading}
            onClick={fetchModels}
          >
            <RefreshCw size={15} />
            {modelLoading ? '获取中' : '获取'}
          </Button>
        </div>
        {modelNotice ? <p className="field-inline-note">{modelNotice}</p> : null}
        {modelError ? <p className="field-inline-error">{modelError}</p> : null}
      </Field>
      <Field id="provider-api-key" className="col-span-2" label="API Key">
        <SecretInput
          id="provider-api-key"
          value={draft.apiKey || ''}
          onChange={(apiKey) => onChange({ ...draft, apiKey })}
        />
      </Field>
      <Field id="provider-reasoning" className="col-span-2" label="思考强度">
        <Select
          value={draft.reasoningEffort || 'default'}
          onValueChange={(reasoningEffort) =>
            onChange({
              ...draft,
              reasoningEffort: reasoningEffort as LlmProvider['reasoningEffort'],
            })
          }
        >
          <SelectTrigger id="provider-reasoning" aria-labelledby="provider-reasoning-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="theme-select-content">
            <SelectGroup>
              {reasoningEffortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function moveOptionSelection<T extends string>(
  event: React.KeyboardEvent<HTMLElement>,
  values: T[],
  current: T,
  onSelect: (value: T) => void,
) {
  const keyOffset: Record<string, number> = {
    ArrowDown: 1,
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowUp: -1,
  };
  const currentIndex = Math.max(0, values.indexOf(current));
  let nextIndex = currentIndex;

  if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = values.length - 1;
  else if (event.key in keyOffset) {
    nextIndex = (currentIndex + keyOffset[event.key] + values.length) % values.length;
  } else {
    return;
  }

  const nextValue = values[nextIndex];
  if (!nextValue) return;

  event.preventDefault();
  const target = event.currentTarget;
  onSelect(nextValue);
  requestAnimationFrame(() => {
    const radios = Array.from(target.querySelectorAll<HTMLElement>('[role="radio"]'));
    radios[nextIndex]?.focus();
  });
}

export function AgentForm({
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
      <Field id="agent-provider" description="当前助手调用的模型供应商。" label="供应商">
        <Select
          disabled={providers.length === 0}
          value={draft.providerId || providers[0]?.id || ''}
          onValueChange={(providerId) => onChange({ ...draft, providerId })}
        >
          <SelectTrigger
            id="agent-provider"
            aria-describedby="agent-provider-description"
            aria-labelledby="agent-provider-label"
            className="provider-select-trigger"
          >
            <SelectValue placeholder="选择供应商" />
          </SelectTrigger>
          <SelectContent className="theme-select-content provider-select-content">
            <SelectGroup>
              {providers.map((provider) => (
                <SelectItem className="provider-select-item" key={provider.id} value={provider.id}>
                  <ProviderOptionContent provider={provider} />
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field id="agent-nickname" description="批注和评论中展示的名称。" label="昵称">
        <Input
          id="agent-nickname"
          name="agent-nickname"
          autoComplete="off"
          value={draft.nickname || ''}
          onChange={(event) => onChange({ ...draft, nickname: event.target.value })}
        />
      </Field>
      <Field
        className="col-span-2"
        id="agent-username"
        description="用于 @ 提及，仅支持英文、数字和下划线。"
        label="用户名"
      >
        <Input
          id="agent-username"
          name="agent-username"
          autoComplete="off"
          spellCheck={false}
          value={draft.username || ''}
          onChange={(event) =>
            onChange({ ...draft, username: sanitizeUsernameInput(event.target.value) })
          }
        />
      </Field>
      <Field
        className="col-span-2"
        id="agent-color"
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
          id="agent-annotation-density"
          description="决定助手主动批注时的积极程度，会影响提示词和模型采样。"
          label="批注密度"
        >
          <div
            aria-describedby="agent-annotation-density-description"
            aria-labelledby="agent-annotation-density-label"
            className="density-grid"
            role="radiogroup"
            onKeyDown={(event) =>
              moveOptionSelection(
                event,
                annotationDensityOptions.map((option) => option.value),
                draft.annotationDensity || 'medium',
                (annotationDensity) => onChange({ ...draft, annotationDensity }),
              )
            }
          >
            {annotationDensityOptions.map((option) => (
              <button
                aria-checked={(draft.annotationDensity || 'medium') === option.value}
                className={
                  (draft.annotationDensity || 'medium') === option.value
                    ? 'density-choice is-active'
                    : 'density-choice'
                }
                key={option.value}
                role="radio"
                tabIndex={(draft.annotationDensity || 'medium') === option.value ? 0 : -1}
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
          kind={agentKind}
          value={draft.avatar || ''}
          onChange={(avatar) => onChange({ ...draft, avatar })}
        />
      </Field>
      <Field className="col-span-2" id="agent-personality" label="个性">
        <div className="personality-editor">
          <div
            aria-labelledby="agent-personality-label"
            className="personality-grid"
            role="radiogroup"
            onKeyDown={(event) =>
              moveOptionSelection(
                event,
                [
                  ...availablePersonalities.map((personality) => personality.id),
                  customPersonalityId,
                ],
                personalityId,
                changePersonality,
              )
            }
          >
            {availablePersonalities.map((personality) => (
              <button
                aria-checked={personalityId === personality.id}
                className={
                  personalityId === personality.id
                    ? 'personality-choice is-active'
                    : 'personality-choice'
                }
                key={personality.id}
                role="radio"
                tabIndex={personalityId === personality.id ? 0 : -1}
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
              aria-checked={isCustomPersonality}
              className={
                isCustomPersonality ? 'personality-choice is-active' : 'personality-choice'
              }
              role="radio"
              tabIndex={isCustomPersonality ? 0 : -1}
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
              <Field
                id="agent-custom-soul"
                description="保存自定义个性时必填。"
                label="自定义系统提示词"
              >
                <Textarea
                  id="agent-custom-soul"
                  name="agent-custom-soul"
                  aria-describedby="agent-custom-soul-description"
                  autoComplete="off"
                  value={draft.soul || ''}
                  onChange={(event) => onChange({ ...draft, soul: event.target.value })}
                />
              </Field>
              <Field
                id="agent-temperature"
                description="数值越高，回复越发散；数值越低，回复越稳定。"
                label="温度"
              >
                <div className="temperature-control">
                  <input
                    id="agent-temperature"
                    name="agent-temperature"
                    aria-describedby="agent-temperature-description"
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

function AvatarPicker({
  kind,
  value,
  onChange,
}: {
  kind: AgentKind;
  value: string;
  onChange: (avatar: string) => void;
}) {
  const avatars = agentAvatarsForKind(kind);

  return (
    <div className="avatar-picker">
      <div className="avatar-grid">
        {avatars.map((avatar) => (
          <button
            className={value === avatar.src ? 'avatar-choice is-active' : 'avatar-choice'}
            key={avatar.id}
            type="button"
            onClick={() => onChange(avatar.src)}
          >
            <img alt="" src={avatar.src} />
          </button>
        ))}
      </div>
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

function SecretInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        className="pr-12"
        name={id}
        autoComplete="off"
        spellCheck={false}
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
