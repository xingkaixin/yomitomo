import React, { useState } from 'react';
import {
  Bot,
  Check,
  Eye,
  EyeOff,
  Image as ImageIcon,
  KeyRound,
  Keyboard,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Unplug,
  Upload,
  User,
} from 'lucide-react';
import type { Agent, AgentKind, AppSettings, LlmProvider, ProviderType } from '@yomitomo/shared';
import { providerPresets, reasoningEffortOptions } from '@yomitomo/shared';
import {
  agentKindLabel,
  agentPersonalities,
  agentPersonalityName,
  annotationColors,
  annotationDensityOptions,
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
import chenYanshuCover from './assets/agent-profiles/chen-yanshu-cover.webp';
import guXingjianCover from './assets/agent-profiles/gu-xingjian-cover.webp';
import linZhiweiCover from './assets/agent-profiles/lin-zhiwei-cover.webp';
import shenQingyuanCover from './assets/agent-profiles/shen-qingyuan-cover.webp';
import xuWenquCover from './assets/agent-profiles/xu-wenqu-cover.webp';
import zhouYanCover from './assets/agent-profiles/zhou-yan-cover.webp';
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
import { AvatarImage, CopyIconButton, Field, PanelHeader } from './app-ui';
import type { ProviderOption, SaveState } from './app-types';
import type { PairingConnectionStatus, PairingInfo } from '../../preload';

type AvatarOption = { id: string; src: string };
type AgentFilter = AgentKind;

const agentFilterOptions: Array<{ value: AgentFilter; label: string }> = [
  { value: 'annotation', label: '阅读助手' },
  { value: 'review', label: '审核助手' },
];

const agentCoverMap: Record<string, string> = {
  'reading-partner': linZhiweiCover,
  'root-reviewer': zhouYanCover,
  'question-mentor': xuWenquCover,
  'insight-editor': chenYanshuCover,
  'concept-translator': shenQingyuanCover,
  'structure-navigator': guXingjianCover,
};

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
          description="读后笔记等默认 AI 任务会使用这个供应商。"
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
          id="general-save-images"
          className="col-span-2"
          description="保存文章时把正文图片写入本机数据库，桌面端查看原文时直接读取本地数据。"
          label="保存图片"
        >
          <label className="settings-toggle-card" htmlFor="general-save-images">
            <span className="settings-toggle-main">
              <span className="settings-toggle-icon">
                <ImageIcon size={17} />
              </span>
              <span>
                <strong>保存文章图片</strong>
                <em>开启后新同步的文章会内联图片数据。</em>
              </span>
            </span>
            <input
              id="general-save-images"
              type="checkbox"
              checked={Boolean(settingsDraft.saveArticleImages)}
              onChange={(event) =>
                onSettingsChange({
                  ...settingsDraft,
                  saveArticleImages: event.target.checked,
                })
              }
            />
            <span className="settings-toggle-switch" aria-hidden="true" />
          </label>
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
  error,
  saveState,
  onToggle,
}: {
  agents: Agent[];
  error: string;
  saveState: SaveState;
  onToggle: (agent: Agent) => void;
}) {
  const [filter, setFilter] = useState<AgentFilter>('annotation');
  const filteredAgents = agents.filter((agent) => (agent.kind || 'annotation') === filter);
  const emptyKindLabel = agentKindLabel(filter);
  const statusText =
    error ||
    (saveState === 'saving'
      ? '正在保存助手状态。'
      : saveState === 'saved'
        ? '助手状态已保存。'
        : '');

  return (
    <div className="settings-panel">
      <PanelHeader
        icon={<Bot size={20} />}
        title="助手"
        description={statusText || '按阅读助手和审核助手查看角色卡片，控制它们是否进入对应工作流。'}
      />
      <section className="agent-library">
        <AgentFilterTabs agents={agents} value={filter} onChange={setFilter} />
        <div className="agent-card-list">
          {filteredAgents.length === 0 ? (
            <div className="agent-list-empty">
              <Bot size={22} />
              <strong>还没有{emptyKindLabel}</strong>
              <p>配置供应商后会自动生成预设助手库。</p>
            </div>
          ) : (
            filteredAgents.map((agent) => (
              <AgentProfileListCard agent={agent} key={agent.id} onToggle={onToggle} />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function AgentProfileListCard({
  agent,
  onToggle,
}: {
  agent: Agent;
  onToggle: (agent: Agent) => void;
}) {
  const personalityName = agentPersonalityName(agent);
  const personality = agentPersonalities.find(
    (item) => item.id === (agent.presetId || findAgentPersonalityId(agent.soul)),
  );
  const cover = personality ? agentCoverMap[personality.id] : undefined;
  const intro = personality?.selfIntroduction || personality?.introduction || '';
  const motto = personality?.description || personalityName;

  return (
    <article className={agent.enabled ? 'agent-list-card is-enabled' : 'agent-list-card'}>
      {cover ? (
        <img className="agent-list-cover" src={cover} alt={`${agent.nickname} 工作照`} />
      ) : (
        <div className="agent-list-cover is-placeholder">
          <AvatarImage
            value={agent.avatar}
            className="size-16"
            fallback={agent.nickname.slice(0, 1)}
          />
        </div>
      )}
      <div className="agent-list-content">
        <div className="agent-list-heading">
          <div className="agent-list-title-row">
            <AvatarImage
              value={agent.avatar}
              className="size-10"
              fallback={agent.nickname.slice(0, 1)}
            />
            <div>
              <h3>{agent.nickname}</h3>
              {motto ? <p>{motto}</p> : null}
            </div>
          </div>
          <span>{personality?.roleTitle || personalityName}</span>
        </div>
        {intro ? <p className="agent-list-intro">{intro}</p> : null}
        <div className="agent-list-footer">
          <span>{agent.enabled ? '已启用' : '已关闭'}</span>
          <label className="agent-card-toggle">
            <input
              aria-label={`${agent.enabled ? '关闭' : '启用'}${agent.nickname}`}
              type="checkbox"
              checked={agent.enabled}
              onChange={() => onToggle(agent)}
            />
            <span className="settings-toggle-switch" aria-hidden="true" />
          </label>
        </div>
      </div>
    </article>
  );
}

function ConfigList({
  title,
  children,
  controls,
  empty,
  onCreate,
}: {
  title: string;
  children: React.ReactNode;
  controls?: React.ReactNode;
  empty?: React.ReactNode;
  onCreate?: () => void;
}) {
  const hasItems = React.Children.count(children) > 0;

  return (
    <aside className="config-list">
      <div className="config-list-header">
        <div className="config-list-title">{title}</div>
        {onCreate ? (
          <Button
            className="action-button create-action"
            size="sm"
            type="button"
            onClick={onCreate}
          >
            <Plus size={16} />
            新增
          </Button>
        ) : null}
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
        const count = agents.filter(
          (agent) => (agent.kind || 'annotation') === option.value,
        ).length;
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
  const modelInputMode = draft.modelInputMode || 'list';
  const isCustomModel = modelInputMode === 'custom';
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
      if (fallbackModels.length > 0) {
        onChange({
          ...draft,
          modelInputMode: 'list',
          modelName: fallbackModels.includes(draft.modelName || '')
            ? draft.modelName
            : fallbackModels[0],
          modelNames: fallbackModels,
        });
      }
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
          modelInputMode: 'list',
          modelName: names.includes(draft.modelName || '') ? draft.modelName : names[0],
          modelNames: names,
        });
      } else {
        onChange({
          ...draft,
          modelInputMode: 'list',
          modelNames: [],
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
      modelInputMode: 'list',
    });
  }

  function useCustomModel() {
    setModelOptions([]);
    setModelError('');
    setModelNotice('');
    onChange({
      ...draft,
      modelInputMode: 'custom',
      modelNames: undefined,
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
          {isCustomModel ? (
            <Input
              id="provider-model"
              name="provider-model"
              autoComplete="off"
              value={draft.modelName || ''}
              onChange={(event) => onChange({ ...draft, modelName: event.target.value })}
            />
          ) : (
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
          )}
          <Button
            className={
              isCustomModel
                ? 'action-button provider-model-mode-button is-active'
                : 'action-button provider-model-mode-button'
            }
            type="button"
            variant="secondary"
            onClick={useCustomModel}
          >
            <Keyboard size={15} />
            自定义
          </Button>
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
  const personality =
    agentPersonalities.find((item) => item.id === draft.presetId) ||
    agentPersonalities.find((item) => item.soul === draft.soul) ||
    personalitiesForKind(agentKind)[0];

  return (
    <div className="settings-form-grid">
      <section className="agent-profile-card col-span-2">
        <div className="agent-profile-hero">
          <AvatarImage
            value={draft.avatar || ''}
            className="size-20"
            fallback={draft.nickname?.slice(0, 1) || 'AI'}
          />
          <div>
            <span>{agentKindLabel(agentKind)}</span>
            <h4>{personality?.roleTitle || draft.nickname}</h4>
            <p>{personality?.introduction || '选择左侧预设助手查看介绍。'}</p>
          </div>
        </div>
        {personality ? (
          <div className="agent-profile-scenes">
            <div>
              <strong>工作照提示词</strong>
              <p>{personality.portraitPrompt}</p>
            </div>
            <div>
              <strong>工作场景</strong>
              <p>{personality.sceneDescription}</p>
            </div>
          </div>
        ) : null}
      </section>
      <Field
        className="col-span-2"
        id="agent-enabled"
        description="启用后，这位助手会进入对应的阅读或审核选择列表。"
        label="启用状态"
      >
        <button
          aria-pressed={Boolean(draft.enabled)}
          className={draft.enabled ? 'agent-enable-toggle is-enabled' : 'agent-enable-toggle'}
          type="button"
          onClick={() => onChange({ ...draft, enabled: !draft.enabled })}
        >
          {draft.enabled ? <Eye size={16} /> : <EyeOff size={16} />}
          <span>{draft.enabled ? '已启用' : '未启用'}</span>
        </button>
      </Field>
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
      <Field
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
      {error ? <p className="form-error col-span-2">{error}</p> : null}
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
