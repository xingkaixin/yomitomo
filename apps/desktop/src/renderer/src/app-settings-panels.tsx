import React, { useState } from 'react';
import {
  Bot,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  ListChecks,
  Plus,
  Save,
  Scale,
  Search,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import type { Agent, AgentKind, AppSettings, LlmProvider, ProviderType } from '@yomitomo/shared';
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
import { AvatarImage, Field, PanelHeader } from './app-ui';
import type { ProviderOption, SaveState } from './app-types';

export const agentAvatars = [
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
