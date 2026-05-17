import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronRight,
  Database,
  Image as ImageIcon,
  Info,
  Keyboard,
  KeyRound,
  RefreshCw,
  Save,
  Settings,
} from 'lucide-react';
import type { AppSettings, MessageSendShortcut, SelectionActionShortcuts } from '@yomitomo/shared';
import {
  defaultSelectionActionShortcuts,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcutDraft,
  normalizeSelectionActionShortcutKey,
  selectionActionShortcutsConflict,
} from '@yomitomo/shared';
import { getShortcutModifier, messageSendShortcutKeys } from '@yomitomo/reader-ui/reader-utils';
import { messageSendShortcutOptions } from './app-settings';
import { Field, PanelHeader } from './app-ui';
import type { SaveState } from './app-types';
import { Button } from './components/ui/button';
import { Kbd } from './components/ui/kbd';

export { AgentForm, AgentSettings } from './app-settings-agent-panel';
export { ProviderForm } from './app-settings-provider-form';
export { ProviderSettings } from './app-settings-provider-panel';
export { UserProfileSettingsDialog } from './app-settings-profile-dialog';

export type SettingsSectionKey = 'collection' | 'models' | 'shortcuts' | 'data' | 'about';

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
  { action: 'annotate', label: '记录想法', description: '阅读区选中文本后的想法入口。' },
];

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
          <p>用于选中文本后的复制和记录想法。</p>
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
