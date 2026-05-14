import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  Bot,
  Check,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Info,
  KeyRound,
  Keyboard,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Settings,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import type {
  Agent,
  AgentKind,
  AppSettings,
  LlmProvider,
  MessageSendShortcut,
  ProviderType,
  SelectionActionShortcuts,
} from '@yomitomo/shared';
import {
  defaultSelectionActionShortcuts,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcutDraft,
  normalizeSelectionActionShortcutKey,
  providerPresets,
  reasoningEffortOptions,
  selectionActionShortcutsConflict,
} from '@yomitomo/shared';
import { getShortcutModifier, messageSendShortcutKeys } from '@yomitomo/reader-ui/reader-utils';
import {
  agentKindLabel,
  agentPersonalities,
  agentPersonalityName,
  annotationColors,
  annotationDensityOptions,
  findAgentPersonalityId,
  messageSendShortcutOptions,
  personalitiesForKind,
  sanitizeUsernameInput,
  userAnnotationColors,
  type AgentDraft,
  type ProviderDraft,
  type UserDraft,
} from './app-settings';
import { readFileAsDataUrl } from './app-utils';
import chenYanshuCover from './assets/agent-profiles/chen-yanshu-cover.webp';
import guXingjianCover from './assets/agent-profiles/gu-xingjian-cover.webp';
import linZhiweiCover from './assets/agent-profiles/lin-zhiwei-cover.webp';
import shenQingyuanCover from './assets/agent-profiles/shen-qingyuan-cover.webp';
import xuWenquCover from './assets/agent-profiles/xu-wenqu-cover.webp';
import zhouYanCover from './assets/agent-profiles/zhou-yan-cover.webp';
import heMinghengCover from './assets/reviewer-profiles/he-mingheng-cover.webp';
import liangZhengyanCover from './assets/reviewer-profiles/liang-zhengyan-cover.webp';
import suDingbaiCover from './assets/reviewer-profiles/su-dingbai-cover.webp';
import tangJianCover from './assets/reviewer-profiles/tang-jian-cover.webp';
import xiaGuiningCover from './assets/reviewer-profiles/xia-guining-cover.webp';
import yeTinglanCover from './assets/reviewer-profiles/ye-tinglan-cover.webp';
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
import { Kbd } from './components/ui/kbd';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { AvatarImage, Field, PanelHeader } from './app-ui';
import type { SaveState } from './app-types';

type AgentFilter = AgentKind;
export type SettingsSectionKey = 'collection' | 'models' | 'shortcuts' | 'data' | 'about';
type AgentPresenceLine = { enter: string; rest: string };
const PROVIDER_EDITOR_COMPACT_WIDTH = 900;
type ProviderTestStatus = 'idle' | 'testing' | 'success' | 'error';
type AgentLineCue = {
  agentId: string;
  id: string;
  state: 'enter' | 'rest';
  text: string;
};

const agentFilterOptions: Array<{ value: AgentFilter; label: string; agentLabel: string }> = [
  { value: 'annotation', label: '阅读理解', agentLabel: '阅读助手' },
  { value: 'review', label: '深度审阅', agentLabel: '审阅助手' },
];

const agentPronunciationMap: Record<string, string> = {
  'reading-partner': 'Lín Zhīwēi',
  'root-reviewer': 'Zhōu Yàn',
  'question-mentor': 'Xǔ Wènqú',
  'insight-editor': 'Chén Yànshū',
  'concept-translator': 'Shěn Qīngyuán',
  'structure-navigator': 'Gù Xíngjiǎn',
  'evidence-archivist': 'Liáng Zhèngyán',
  'reader-advocate': 'Yè Tīnglán',
  'final-copy-editor': 'Táng Jiǎn',
  'logic-auditor': 'Hé Mínghéng',
  'risk-examiner': 'Sū Dìngbái',
  'action-calibrator': 'Xià Guīníng',
};

function messageSendShortcutCopy(shortcut: MessageSendShortcut, shortcutName: string) {
  if (shortcut === 'enter') {
    return {
      title: '⏎ 发送',
      description: '按下 ⏎ 即可发送信息，适合习惯及时发送的场景。通过 Shift+⏎ 换行。',
    };
  }

  return {
    title: `${shortcutName} 发送`,
    description: `按下 ${shortcutName} 发送信息，适合长文本输入，避免误发送。此时通过 ⏎ 会换行。`,
  };
}

type SelectionShortcutAction = keyof SelectionActionShortcuts;

const selectionShortcutRows: Array<{
  action: SelectionShortcutAction;
  label: string;
  description: string;
}> = [
  { action: 'copy', label: '复制', description: '阅读区选中文本后的复制操作。' },
  { action: 'annotate', label: '添加批注', description: '阅读区选中文本后的批注入口。' },
];

const agentCoverMap: Record<string, string> = {
  'reading-partner': linZhiweiCover,
  'root-reviewer': zhouYanCover,
  'question-mentor': xuWenquCover,
  'insight-editor': chenYanshuCover,
  'concept-translator': shenQingyuanCover,
  'structure-navigator': guXingjianCover,
  'evidence-archivist': liangZhengyanCover,
  'reader-advocate': yeTinglanCover,
  'final-copy-editor': tangJianCover,
  'logic-auditor': heMinghengCover,
  'risk-examiner': suDingbaiCover,
  'action-calibrator': xiaGuiningCover,
};

const defaultAgentPresenceLine: AgentPresenceLine = {
  enter: '我在，陪你慢慢看。',
  rest: '我先休息一下，有需要再叫我。',
};

const agentPresenceLineMap: Partial<Record<string, AgentPresenceLine>> = {
  'reading-partner': {
    enter: '我在，陪你慢慢看。',
    rest: '先走了，你继续读。',
  },
  'root-reviewer': {
    enter: '铅笔备好了，开始拆。',
    rest: '三角尺放下了，回头见。',
  },
  'question-mentor': {
    enter: '来了，看看哪里值得停一下。',
    rest: '问题先存着，想好了再聊。',
  },
  'insight-editor': {
    enter: '我来收拾，散的交给我。',
    rest: '卡片收好了，用的时候翻。',
  },
  'concept-translator': {
    enter: '在的，哪里读不顺跟我说。',
    rest: '撤了，顺了就好。',
  },
  'structure-navigator': {
    enter: '地图打开了，不会让你迷路。',
    rest: '导航关了，路你已经认得。',
  },
  'evidence-archivist': {
    enter: '把笔记交过来，我逐条对。',
    rest: '账清了，经得起查。',
  },
  'reader-advocate': {
    enter: '我看看你的困惑有没有被漏掉。',
    rest: '该留的都在了，撤了。',
  },
  'final-copy-editor': {
    enter: '红笔带了，希望用不上。',
    rest: '能存了。',
  },
  'logic-auditor': {
    enter: '给我看看你的推理链。',
    rest: '缝隙标完了，改不改你定。',
  },
  'risk-examiner': {
    enter: '动手之前，先让我问几句。',
    rest: '边界画完了，出了线别怪我。',
  },
  'action-calibrator': {
    enter: '看看你的"接下来"能不能落地。',
    rest: '能执行的都改好了，直接用。',
  },
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

const settingsSections: Array<{
  key: SettingsSectionKey;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'collection',
    title: '采集与保存',
    description: '管理文章采集时的本地保存行为。',
    icon: <ImageIcon size={17} />,
  },
  {
    key: 'models',
    title: '模型与路由',
    description: '分配任务模型，并维护模型供应商。',
    icon: <KeyRound size={17} />,
  },
  {
    key: 'shortcuts',
    title: '快捷键',
    description: '配置批注、评论等应用快捷键。',
    icon: <Keyboard size={17} />,
  },
  {
    key: 'data',
    title: '数据管理',
    description: '集中管理导出和清理类操作。',
    icon: <Database size={17} />,
  },
  {
    key: 'about',
    title: '关于',
    description: '查看版本、链接和开源许可证。',
    icon: <Info size={17} />,
  },
];

function agentPresenceLine(agent: Agent, nextEnabled: boolean) {
  const personalityId = agent.presetId || findAgentPersonalityId(agent.soul);
  const lines = agentPresenceLineMap[personalityId] || defaultAgentPresenceLine;
  return nextEnabled ? lines.enter : lines.rest;
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

export function SettingsSectionShell({
  activeSection,
  children,
  onSectionChange,
}: {
  activeSection: SettingsSectionKey;
  children: React.ReactNode;
  onSectionChange: (section: SettingsSectionKey) => void;
}) {
  return (
    <div className="settings-hub-layout">
      <aside className="settings-section-sidebar">
        <header className="settings-section-heading">
          <span>
            <Settings size={18} />
          </span>
          <div>
            <h2>设置</h2>
            <p>采集、模型、快捷键、数据和应用信息集中管理。</p>
          </div>
        </header>
        <nav className="settings-section-nav" aria-label="设置分类">
          {settingsSections.map((section) => {
            const active = activeSection === section.key;
            return (
              <button
                aria-current={active ? 'page' : undefined}
                className={
                  active ? 'settings-section-nav-item is-active' : 'settings-section-nav-item'
                }
                key={section.key}
                type="button"
                onClick={() => onSectionChange(section.key)}
              >
                <span className="settings-section-nav-icon">{section.icon}</span>
                <span className="settings-section-nav-copy">
                  <strong>{section.title}</strong>
                  <em>{section.description}</em>
                </span>
                <ChevronRight size={16} />
              </button>
            );
          })}
        </nav>
      </aside>
      <section className="settings-section-content">{children}</section>
    </div>
  );
}

export function GeneralSettings({
  settingsDraft,
  canSave,
  onSettingsChange,
  onSave,
  saveState,
}: {
  settingsDraft: AppSettings;
  canSave: boolean;
  onSettingsChange: (draft: AppSettings) => void;
  onSave: () => void;
  saveState: SaveState;
}) {
  const saveLabel = saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : '保存';

  return (
    <div className="settings-panel">
      <PanelHeader
        icon={<Settings size={20} />}
        title="采集与保存"
        description="控制导入文章时的本地保存行为。"
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
        <Field
          id="general-save-images"
          className="col-span-2"
          description="采集文章时，将正文中的图片持久化保存，减少原站图片失效、防盗链或链接变更导致的阅读断裂。"
          label="保存原文图片"
        >
          <label className="settings-toggle-card" htmlFor="general-save-images">
            <span className="settings-toggle-main">
              <span className="settings-toggle-icon">
                <ImageIcon size={17} />
              </span>
              <span>
                <strong>采集文章时保存正文图片</strong>
                <em>
                  {settingsDraft.saveArticleImages
                    ? '已开启。新采集文章中的图片会随文章一起保存。'
                    : '已关闭。文章图片将保留原始链接。'}
                </em>
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
      </div>
    </div>
  );
}

export function ShortcutSettings({
  savedSettings,
  settingsDraft,
  canSave,
  onSettingsChange,
  onSave,
  saveState,
}: {
  savedSettings: AppSettings;
  settingsDraft: AppSettings;
  canSave: boolean;
  onSettingsChange: (draft: AppSettings) => void;
  onSave: () => void;
  saveState: SaveState;
}) {
  const [recordingAction, setRecordingAction] = useState<SelectionShortcutAction | null>(null);
  const saveLabel = saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : '保存';
  const selectedShortcut = normalizeMessageSendShortcut(settingsDraft.messageSendShortcut);
  const savedShortcut = normalizeMessageSendShortcut(savedSettings.messageSendShortcut);
  const shortcutModifier = getShortcutModifier();
  const selectionShortcuts = React.useMemo(
    () => normalizeSelectionActionShortcutDraft(settingsDraft.selectionActionShortcuts),
    [settingsDraft.selectionActionShortcuts],
  );
  const savedSelectionShortcuts = React.useMemo(
    () => normalizeSelectionActionShortcutDraft(savedSettings.selectionActionShortcuts),
    [savedSettings.selectionActionShortcuts],
  );
  const hasSelectionShortcutConflict = selectionActionShortcutsConflict(selectionShortcuts);

  useEffect(() => {
    if (!recordingAction) return;
    const action = recordingAction;

    function finishRecording() {
      setRecordingAction(null);
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }

    function handleShortcutKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        finishRecording();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const key = normalizeSelectionActionShortcutKey(event.key, '');
      if (!key) return;

      onSettingsChange({
        ...settingsDraft,
        selectionActionShortcuts: {
          ...selectionShortcuts,
          [action]: key,
        },
      });
      finishRecording();
    }

    window.addEventListener('keydown', handleShortcutKeyDown, true);
    return () => window.removeEventListener('keydown', handleShortcutKeyDown, true);
  }, [onSettingsChange, recordingAction, selectionShortcuts, settingsDraft]);

  function resetSelectionShortcut(action: SelectionShortcutAction) {
    onSettingsChange({
      ...settingsDraft,
      selectionActionShortcuts: {
        ...selectionShortcuts,
        [action]: defaultSelectionActionShortcuts[action],
      },
    });
  }

  return (
    <div className="settings-panel">
      <PanelHeader
        icon={<Keyboard size={20} />}
        title="快捷键"
        description="配置应用内常用操作的键盘触发方式。"
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
      <section className="shortcut-settings-card" aria-labelledby="shortcut-message-send-title">
        <header className="shortcut-settings-card-header">
          <h3 id="shortcut-message-send-title">消息发送</h3>
          <p>用于阅读器里的批注发布和评论发送。</p>
        </header>
        <div aria-label="批注和评论发送快捷键" className="shortcut-option-list" role="radiogroup">
          {messageSendShortcutOptions.map((option) => {
            const active = selectedShortcut === option.value;
            const current = savedShortcut === option.value;
            const keys = messageSendShortcutKeys(option.value, shortcutModifier);
            const shortcutName = keys.join('+');
            const copy = messageSendShortcutCopy(option.value, shortcutName);

            return (
              <button
                aria-checked={active}
                aria-label={copy.title}
                className={active ? 'shortcut-option-card is-active' : 'shortcut-option-card'}
                key={option.value}
                role="radio"
                type="button"
                onClick={() =>
                  onSettingsChange({ ...settingsDraft, messageSendShortcut: option.value })
                }
              >
                <span className="shortcut-radio" aria-hidden="true" />
                <span className="shortcut-keyset" aria-hidden="true">
                  {keys.map((key, index) => (
                    <React.Fragment key={key}>
                      {index > 0 ? <span className="shortcut-key-plus">+</span> : null}
                      <Kbd className="shortcut-keycap">{key}</Kbd>
                    </React.Fragment>
                  ))}
                </span>
                <span className="shortcut-option-copy">
                  <strong>{copy.title}</strong>
                  <span>{copy.description}</span>
                </span>
                <span className="shortcut-current-slot">
                  {current ? (
                    <span className="shortcut-current-badge">
                      <Check size={13} />
                      当前使用
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
        <p className="shortcut-tips">Tips：你可以随时切换快捷键，设置立即生效。</p>
      </section>
      <section className="shortcut-settings-card" aria-labelledby="shortcut-selection-title">
        <header className="shortcut-settings-card-header">
          <h3 id="shortcut-selection-title">阅读区选区操作</h3>
          <p>用于选中文本后的复制和添加批注。</p>
        </header>
        <div className="selection-shortcut-list">
          {selectionShortcutRows.map((row) => {
            const key = selectionShortcuts[row.action];
            const savedKey = savedSelectionShortcuts[row.action];
            const defaultKey = defaultSelectionActionShortcuts[row.action];
            const modified = key !== defaultKey;
            const current = key === savedKey;
            const recording = recordingAction === row.action;
            const conflict = hasSelectionShortcutConflict;
            const otherRow = selectionShortcutRows.find((item) => item.action !== row.action)!;

            return (
              <div
                className={
                  conflict
                    ? 'selection-shortcut-row has-conflict'
                    : recording
                      ? 'selection-shortcut-row is-recording'
                      : 'selection-shortcut-row'
                }
                key={row.action}
              >
                <div className="selection-shortcut-copy">
                  <strong>{row.label}</strong>
                  <span>{row.description}</span>
                </div>
                <button
                  className={
                    recording ? 'selection-shortcut-key is-recording' : 'selection-shortcut-key'
                  }
                  type="button"
                  aria-label={`设置${row.label}快捷键`}
                  onClick={() => setRecordingAction(row.action)}
                >
                  <Kbd className="shortcut-keycap">{recording ? '...' : key}</Kbd>
                  <span>{recording ? '按字母键' : '点击修改'}</span>
                </button>
                <span className="selection-shortcut-status">
                  {conflict ? (
                    <span className="shortcut-conflict-badge" role="alert">
                      与{otherRow.label}共用 {key}
                    </span>
                  ) : current ? (
                    <span className="shortcut-current-badge">
                      <Check size={13} />
                      当前使用
                    </span>
                  ) : null}
                </span>
                <span className="selection-shortcut-reset-slot">
                  {modified && !recording ? (
                    <button
                      className="selection-shortcut-reset"
                      type="button"
                      aria-label={`重置${row.label}为默认 ${defaultKey}`}
                      onClick={() => resetSelectionShortcut(row.action)}
                    >
                      <RefreshCw size={13} />
                      重置
                    </button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
        <p className={hasSelectionShortcutConflict ? 'shortcut-tips is-error' : 'shortcut-tips'}>
          支持 A-Z 单字母。重复键位会阻止保存。
        </p>
      </section>
    </div>
  );
}

export function UserProfileSettingsDialog({
  draft,
  canSave,
  onChange,
  onClose,
  onSave,
  saveState,
}: {
  draft: UserDraft;
  canSave: boolean;
  onChange: (draft: UserDraft) => void;
  onClose: () => void;
  onSave: () => void;
  saveState: SaveState;
}) {
  const saveLabel = saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : '保存';
  const selectedAnnotationColor = userAnnotationColors.includes(draft.annotationColor || '')
    ? draft.annotationColor || userAnnotationColors[0]
    : userAnnotationColors[0];

  React.useEffect(() => {
    if (!draft.annotationColor || userAnnotationColors.includes(draft.annotationColor)) return;
    onChange({ ...draft, annotationColor: userAnnotationColors[0] });
  }, [draft, onChange]);

  React.useEffect(() => {
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', closeWithEscape);
    return () => window.removeEventListener('keydown', closeWithEscape);
  }, [onClose]);

  return (
    <div
      className="user-profile-dialog-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="user-profile-dialog-title"
        aria-modal="true"
        className="user-profile-dialog"
        role="dialog"
      >
        <header>
          <div className="user-profile-dialog-heading">
            <span>
              <User size={19} />
            </span>
            <div>
              <h2 id="user-profile-dialog-title">个人设置</h2>
              <p>配置批注和评论中使用的身份信息。</p>
            </div>
          </div>
          <button
            aria-label="关闭个人设置"
            className="user-profile-dialog-close"
            type="button"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="user-profile-form">
          <div className="user-profile-avatar-row">
            <AvatarImage
              value={draft.avatar || ''}
              className="user-profile-avatar-preview"
              fallback={draft.nickname?.slice(0, 1) || '我'}
            />
            <ProfileAvatarEditor onChange={(avatar) => onChange({ ...draft, avatar })} />
          </div>
          <Field id="profile-nickname" description="批注和评论中展示的名称。" label="昵称">
            <Input
              id="profile-nickname"
              name="nickname"
              autoComplete="off"
              value={draft.nickname || ''}
              onChange={(event) => onChange({ ...draft, nickname: event.target.value })}
            />
          </Field>
          <Field
            id="profile-username"
            description="用于 @ 提及，支持文字、数字、下划线和短横线。"
            label="用户名"
          >
            <Input
              id="profile-username"
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
            <AnnotationColorPreview
              avatar={draft.avatar || ''}
              color={selectedAnnotationColor}
              nickname={draft.nickname || '我'}
            />
            <ColorPicker
              colors={userAnnotationColors}
              value={selectedAnnotationColor}
              onChange={(annotationColor) => onChange({ ...draft, annotationColor })}
            />
          </Field>
        </div>

        <footer>
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
        </footer>
      </section>
    </div>
  );
}

export function ProviderSettings({
  draft,
  settingsDraft,
  providers,
  selectedId,
  testState,
  canSave,
  canSaveRoutes,
  onChange,
  onRouteChange,
  onCreate,
  onDelete,
  onSave,
  saveState,
  routeSaveState,
  onRouteSave,
  onSelect,
  onTest,
}: {
  draft: ProviderDraft;
  settingsDraft: AppSettings;
  providers: LlmProvider[];
  selectedId: string | null;
  testState: string;
  canSave: boolean;
  canSaveRoutes: boolean;
  onChange: (draft: ProviderDraft) => void;
  onRouteChange: (draft: AppSettings) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onSave: () => void;
  saveState: SaveState;
  routeSaveState: SaveState;
  onRouteSave: () => void;
  onSelect: (provider: LlmProvider) => void;
  onTest: (id: string) => Promise<void> | void;
}) {
  const saveLabel = saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : '保存';
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [compactProviderEditor, setCompactProviderEditor] = useState(false);
  const [providerEditorOpen, setProviderEditorOpen] = useState(false);
  const [testStatus, setTestStatus] = useState<ProviderTestStatus>('idle');
  const usedProviderIds = new Set(
    [
      settingsDraft.readingAssistantProviderId,
      settingsDraft.reviewAssistantProviderId,
      settingsDraft.readingNoteProviderId,
    ].filter(Boolean),
  );

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width || panel.getBoundingClientRect().width;
      setCompactProviderEditor(width <= PROVIDER_EDITOR_COMPACT_WIDTH);
    });

    setCompactProviderEditor(panel.getBoundingClientRect().width <= PROVIDER_EDITOR_COMPACT_WIDTH);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (providerEditorOpen && !compactProviderEditor) setProviderEditorOpen(false);
  }, [compactProviderEditor, providerEditorOpen]);

  useEffect(() => {
    setTestStatus('idle');
  }, [selectedId]);

  useEffect(() => {
    if (!testState) return;
    if (testState === '测试中...') {
      setTestStatus('testing');
      return;
    }
    if (testStatus !== 'testing') return;
    if (testState.startsWith('连通成功')) {
      setTestStatus('success');
      return;
    }
    if (testState.startsWith('连通失败')) {
      setTestStatus('error');
    }
  }, [testState, testStatus]);

  useEffect(() => {
    if (!providerEditorOpen) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setProviderEditorOpen(false);
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [providerEditorOpen]);

  function selectProvider(provider: LlmProvider) {
    onSelect(provider);
    if (compactProviderEditor) setProviderEditorOpen(true);
  }

  function createProvider() {
    onCreate();
    if (compactProviderEditor) setProviderEditorOpen(true);
  }

  function deleteProvider(id: string) {
    onDelete(id);
    setProviderEditorOpen(false);
  }

  function testProvider(id: string) {
    setTestStatus('testing');
    void Promise.resolve(onTest(id)).catch(() => setTestStatus('error'));
  }

  const editorDialog =
    providerEditorOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="provider-editor-dialog-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setProviderEditorOpen(false);
            }}
          >
            <section
              aria-labelledby="provider-editor-dialog-title"
              aria-modal="true"
              className="provider-editor-dialog"
              role="dialog"
            >
              <button
                aria-label="关闭供应商编辑"
                className="provider-editor-close"
                type="button"
                onClick={() => setProviderEditorOpen(false)}
              >
                <X size={18} />
              </button>
              <ProviderEditorContent
                draft={draft}
                saveLabel={saveLabel}
                saveState={saveState}
                testStatus={testStatus}
                titleId="provider-editor-dialog-title"
                canSave={canSave}
                onChange={onChange}
                onDelete={deleteProvider}
                onSave={onSave}
                onTest={testProvider}
              />
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="settings-panel settings-model-panel" ref={panelRef}>
        <PanelHeader
          icon={<KeyRound size={20} />}
          title="模型与路由"
          description="为伴读任务分配默认模型，并管理模型服务商配置。"
        />
        <TaskProviderRoutes
          canSave={canSaveRoutes}
          providers={providers}
          saveState={routeSaveState}
          settingsDraft={settingsDraft}
          onChange={onRouteChange}
          onSave={onRouteSave}
        />
        <div className="settings-detail-grid">
          <ConfigList title="模型供应商" onCreate={createProvider}>
            {providers.map((provider) => (
              <button
                className={
                  provider.id === selectedId
                    ? 'config-list-item is-plain is-active'
                    : 'config-list-item is-plain'
                }
                key={provider.id}
                type="button"
                onClick={() => selectProvider(provider)}
              >
                {usedProviderIds.has(provider.id) ? (
                  <span className="provider-used-label">已使用</span>
                ) : null}
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
            <ProviderEditorContent
              draft={draft}
              saveLabel={saveLabel}
              saveState={saveState}
              testStatus={testStatus}
              canSave={canSave}
              onChange={onChange}
              onDelete={onDelete}
              onSave={onSave}
              onTest={testProvider}
            />
          </section>
        </div>
      </div>
      {editorDialog}
    </>
  );
}

function ProviderEditorContent({
  draft,
  saveLabel,
  saveState,
  testStatus,
  titleId,
  canSave,
  onChange,
  onDelete,
  onSave,
  onTest,
}: {
  draft: ProviderDraft;
  saveLabel: string;
  saveState: SaveState;
  testStatus: ProviderTestStatus;
  titleId?: string;
  canSave: boolean;
  onChange: (draft: ProviderDraft) => void;
  onDelete: (id: string) => void;
  onSave: () => void;
  onTest: (id: string) => void;
}) {
  const testResultIcon =
    testStatus === 'success' || testStatus === 'error' ? (
      <span
        aria-label={testStatus === 'success' ? '测试成功' : '测试失败'}
        className={`provider-test-status is-${testStatus}`}
        key={testStatus}
        role="status"
      >
        {testStatus === 'success' ? <Check size={15} /> : <X size={15} />}
      </span>
    ) : null;

  return (
    <>
      <div className="detail-pane-header">
        <div>
          <h3 id={titleId}>{draft.id ? '编辑供应商' : '新增供应商'}</h3>
          <p>管理模型服务商、API Key、Base URL 和可用模型。</p>
        </div>
        <div className="flex gap-2">
          {draft.id ? (
            <span className="provider-test-control">
              <Button
                className="action-button test-action"
                variant="secondary"
                type="button"
                onClick={() => onTest(draft.id!)}
              >
                {testStatus === 'testing' ? '测试中' : '测试'}
              </Button>
              {testResultIcon}
            </span>
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
    </>
  );
}

const taskRouteOptions: Array<{
  key: keyof Pick<
    AppSettings,
    'readingAssistantProviderId' | 'reviewAssistantProviderId' | 'readingNoteProviderId'
  >;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'readingAssistantProviderId',
    title: '阅读理解助手',
    description: '用于阅读器批注、追问和理解型对话。',
    icon: <BookOpen size={18} />,
  },
  {
    key: 'reviewAssistantProviderId',
    title: '深度审阅助手',
    description: '用于审核读后笔记的证据、逻辑和表达质量。',
    icon: <ShieldCheck size={18} />,
  },
  {
    key: 'readingNoteProviderId',
    title: '读后笔记助手',
    description: '用于生成审议报告和读后笔记正文。',
    icon: <Bot size={18} />,
  },
];

function TaskProviderRoutes({
  providers,
  settingsDraft,
  canSave,
  saveState,
  onChange,
  onSave,
}: {
  providers: LlmProvider[];
  settingsDraft: AppSettings;
  canSave: boolean;
  saveState: SaveState;
  onChange: (draft: AppSettings) => void;
  onSave: () => void;
}) {
  const saveLabel =
    saveState === 'saving' ? '保存中' : saveState === 'saved' ? '已保存' : '保存任务路由';

  return (
    <section className="task-route-panel" aria-labelledby="task-route-title">
      <div className="task-route-header">
        <div>
          <h3 id="task-route-title">任务路由</h3>
          <p>为不同伴读任务分配默认模型。</p>
        </div>
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
      <div className="task-route-list">
        {taskRouteOptions.map((option) => (
          <div className="task-route-row" key={option.key}>
            <div className="task-route-copy">
              <span className="task-route-icon">{option.icon}</span>
              <div>
                <strong>{option.title}</strong>
                <p>{option.description}</p>
              </div>
            </div>
            <Select
              disabled={providers.length === 0}
              value={settingsDraft[option.key] || ''}
              onValueChange={(providerId) =>
                onChange({ ...settingsDraft, [option.key]: providerId })
              }
            >
              <SelectTrigger
                aria-label={`${option.title}供应商`}
                className="task-route-select-trigger"
              >
                <SelectValue placeholder="选择供应商" />
              </SelectTrigger>
              <SelectContent className="theme-select-content provider-select-content">
                <SelectGroup>
                  {providers.map((provider) => (
                    <SelectItem
                      className="provider-select-item"
                      key={provider.id}
                      value={provider.id}
                    >
                      <span className="provider-option-content">
                        <img
                          className="provider-select-logo"
                          src={
                            providerLogoMap[provider.logo || 'anthropic.png'] ||
                            providerLogoMap['anthropic.png']
                          }
                          alt=""
                        />
                        <span className="provider-select-item-copy">
                          <strong>{provider.name}</strong>
                          <span>{provider.modelName}</span>
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </section>
  );
}

export function DataManagementSettings() {
  return (
    <div className="settings-panel">
      <PanelHeader
        icon={<Database size={20} />}
        title="数据管理"
        description="导出数据和清理数据会集中放在这里。"
      />
      <section className="settings-empty-panel">
        <Database size={24} />
        <strong>数据工具规划中</strong>
        <p>后续会在这里提供导出数据和清理数据入口。</p>
      </section>
    </div>
  );
}

export function AgentSettings({
  agents,
  error,
  onToggle,
}: {
  agents: Agent[];
  error: string;
  saveState: SaveState;
  onToggle: (agent: Agent) => void;
}) {
  const [filter, setFilter] = useState<AgentFilter>('annotation');
  const [lineCue, setLineCue] = useState<AgentLineCue | null>(null);
  const filteredAgents = agents.filter((agent) => (agent.kind || 'annotation') === filter);
  const currentMode = agentFilterOptions.find((option) => option.value === filter);
  const emptyKindLabel = currentMode?.agentLabel || agentKindLabel(filter);

  useEffect(() => {
    if (!lineCue) return;

    const timeoutId = window.setTimeout(() => {
      setLineCue((current) => (current?.id === lineCue.id ? null : current));
    }, 2600);

    return () => window.clearTimeout(timeoutId);
  }, [lineCue]);

  function handleAgentToggle(agent: Agent) {
    const nextEnabled = !agent.enabled;
    setLineCue({
      agentId: agent.id,
      id: `${agent.id}-${nextEnabled ? 'enter' : 'rest'}-${Date.now()}`,
      state: nextEnabled ? 'enter' : 'rest',
      text: agentPresenceLine(agent, nextEnabled),
    });
    onToggle(agent);
  }

  return (
    <div className="settings-panel agent-settings-panel">
      <header className="agent-library-header">
        <div>
          <h2>今天陪你思考的人</h2>
          <p>不同模式，不同视角，组成你专属的思考团队。</p>
        </div>
      </header>
      <section className="agent-library">
        <div className="agent-library-toolbar">
          <AgentFilterTabs agents={agents} value={filter} onChange={setFilter} />
          {error ? (
            <div className="agent-error-status" role="alert">
              {error}
            </div>
          ) : null}
        </div>
        <div className="agent-card-list">
          {filteredAgents.length === 0 ? (
            <div className="agent-list-empty">
              <Bot size={22} />
              <strong>还没有{emptyKindLabel}</strong>
              <p>配置供应商后会自动生成预设助手库。</p>
            </div>
          ) : (
            filteredAgents.map((agent) => (
              <AgentProfileListCard
                agent={agent}
                key={agent.id}
                lineCue={lineCue?.agentId === agent.id ? lineCue : null}
                onToggle={handleAgentToggle}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function AgentProfileListCard({
  agent,
  lineCue,
  onToggle,
}: {
  agent: Agent;
  lineCue: AgentLineCue | null;
  onToggle: (agent: Agent) => void;
}) {
  const personalityName = agentPersonalityName(agent);
  const personality = agentPersonalities.find(
    (item) => item.id === (agent.presetId || findAgentPersonalityId(agent.soul)),
  );
  const cover = personality ? agentCoverMap[personality.id] : undefined;
  const intro = personality?.selfIntroduction || personality?.introduction || '';
  const motto = personality?.description || personalityName;
  const roleTitle = personality?.roleTitle || personalityName;
  const pronunciation = personality ? agentPronunciationMap[personality.id] : '';

  return (
    <article
      className={agent.enabled ? 'agent-list-card is-enabled' : 'agent-list-card'}
      style={{ '--agent-accent': agent.annotationColor } as React.CSSProperties}
    >
      <div className="agent-list-body">
        <div className="agent-list-identity">
          <div className="agent-list-cover-frame">
            <span
              className={
                agent.enabled ? 'agent-list-status-badge' : 'agent-list-status-badge is-resting'
              }
            >
              {agent.enabled ? '在场' : '休息中'}
            </span>
            {lineCue ? (
              <span
                className={
                  lineCue.state === 'enter'
                    ? 'agent-list-line-bubble is-entering'
                    : 'agent-list-line-bubble is-resting'
                }
                key={lineCue.id}
              >
                {lineCue.text}
              </span>
            ) : null}
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
          </div>
          <div className="agent-list-heading">
            <div className="agent-list-name-row">
              <h3>{agent.nickname}</h3>
              {pronunciation ? <span>{pronunciation}</span> : null}
            </div>
            {motto ? <blockquote>{motto}</blockquote> : null}
          </div>
        </div>
        <div className="agent-list-content">
          {intro ? <p className="agent-list-intro">{intro}</p> : null}
        </div>
      </div>
      <div className="agent-list-footer">
        <span className="agent-list-role">{roleTitle}</span>
        <label className="agent-card-toggle">
          <input
            aria-label={agent.enabled ? `让${agent.nickname}先休息` : `请${agent.nickname}加入`}
            type="checkbox"
            checked={agent.enabled}
            onChange={() => onToggle(agent)}
          />
          <span className="settings-toggle-switch" aria-hidden="true" />
        </label>
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
    <div className="agent-filter-tabs" role="tablist" aria-label="思考模式">
      {agentFilterOptions.map((option) => {
        const count = agents.filter(
          (agent) => (agent.kind || 'annotation') === option.value,
        ).length;
        const Icon = option.value === 'annotation' ? BookOpen : ShieldCheck;
        return (
          <button
            aria-label={option.label}
            aria-selected={value === option.value}
            className={value === option.value ? 'agent-filter-tab is-active' : 'agent-filter-tab'}
            key={option.value}
            role="tab"
            type="button"
            onClick={() => onChange(option.value)}
          >
            <Icon size={18} />
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
  selectContentClassName = 'theme-select-content',
  showReasoning = true,
}: {
  draft: ProviderDraft;
  onChange: (draft: ProviderDraft) => void;
  selectContentClassName?: string;
  showReasoning?: boolean;
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
      reasoningEffort: draft.reasoningEffort || 'none',
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
          <SelectTrigger
            id="provider-preset"
            aria-labelledby="provider-preset-label"
            className="provider-select-trigger"
          >
            <SelectValue placeholder="选择服务商" />
          </SelectTrigger>
          <SelectContent className={selectContentClassName}>
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
          <SelectContent className={selectContentClassName}>
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
              <SelectContent className={selectContentClassName}>
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
      {showReasoning ? (
        <Field id="provider-reasoning" className="col-span-2" label="思考强度">
          <Select
            value={draft.reasoningEffort || 'none'}
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
            <SelectContent className={selectContentClassName}>
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
      ) : null}
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
  onChange,
}: {
  draft: AgentDraft;
  error: string;
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
      <Field
        id="agent-color"
        description="这些颜色已按阅读器高亮可见性筛选。"
        label={agentKind === 'review' ? '标识颜色' : '批注颜色'}
      >
        <ColorPicker
          colors={annotationColors}
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

function AnnotationColorPreview({
  avatar,
  color,
  nickname,
}: {
  avatar: string;
  color: string;
  nickname: string;
}) {
  return (
    <div
      className="annotation-color-preview"
      style={{ '--annotation-color': color } as React.CSSProperties}
    >
      <div className="annotation-color-preview-text">
        <p>
          阅读时看到值得保留的句子，
          <span>可以用下划线轻轻标出来</span>，旁边会留下你的批注。
        </p>
      </div>
      <div className="annotation-color-preview-card">
        <AvatarImage value={avatar} className="size-8" fallback={nickname.slice(0, 1) || '我'} />
        <div>
          <strong>{nickname}</strong>
          <p>这里值得留一条自己的判断。</p>
        </div>
      </div>
    </div>
  );
}

function ColorPicker({
  colors,
  value,
  onChange,
}: {
  colors: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="color-swatches">
      {colors.map((color) => (
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
