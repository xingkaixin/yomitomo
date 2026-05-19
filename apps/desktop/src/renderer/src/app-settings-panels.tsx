import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronRight,
  Database,
  Download,
  FileText,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Info,
  Keyboard,
  KeyRound,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AppSettings,
  DesktopStore,
  MessageSendShortcut,
  SelectionActionShortcuts,
} from '@yomitomo/shared';
import {
  defaultSelectionActionShortcuts,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcutDraft,
  normalizeSelectionActionShortcutKey,
  selectionActionShortcutsConflict,
} from '@yomitomo/shared';
import { getShortcutModifier, messageSendShortcutKeys } from '@yomitomo/reader-ui/reader-utils';
import { messageSendShortcutOptions } from './app-settings';
import type { DataManagementPathKind, DataManagementPaths } from '../../preload';
import { CopyIconButton, Field, PanelHeader } from './app-ui';
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

const logRetentionOptions: Array<{ label: string; value?: number }> = [
  { label: '永久' },
  { label: '最近 90 天', value: 90 },
  { label: '最近 30 天', value: 30 },
  { label: '最近 15 天', value: 15 },
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
    description: '查看路径、清理日志并备份数据库。',
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
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? 'settings-nav-item is-active' : 'settings-nav-item'}
      type="button"
      onClick={onClick}
    >
      {icon ? icon : null}
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

export function DataManagementSettings({
  settings,
  onStoreUpdated,
}: {
  settings: AppSettings;
  onStoreUpdated: (store: DesktopStore) => void;
}) {
  const [paths, setPaths] = useState<DataManagementPaths | null>(null);
  const [busyAction, setBusyAction] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    let mounted = true;
    window.yomitomoDesktop
      .getDataManagementPaths()
      .then((nextPaths) => {
        if (mounted) setPaths(nextPaths);
      })
      .catch((error) => {
        if (mounted) setStatus(dataManagementErrorMessage(error));
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function openPath(kind: DataManagementPathKind) {
    await runDataAction(`open:${kind}`, async () => {
      await window.yomitomoDesktop.openDataManagementPath(kind);
    });
  }

  async function saveLogRetention(days?: number) {
    await runDataAction(`retention:${days ?? 'forever'}`, async () => {
      const input: AppSettings = { ...settings };
      Object.assign(input, { logRetentionDays: days });
      const nextStore = await window.yomitomoDesktop.saveSettings(input);
      onStoreUpdated(nextStore);
      setStatus(days ? `日志将保留最近 ${days} 天。` : '日志将永久保留，直到手动清空。');
    });
  }

  async function clearLog() {
    await runDataAction('clear-log', async () => {
      await window.yomitomoDesktop.clearLog();
      setStatus('日志文件已清空。');
    });
  }

  async function backupDatabase() {
    await runDataAction('backup-db', async () => {
      const result = await window.yomitomoDesktop.backupDatabase();
      setStatus(result.canceled ? '已取消数据库备份。' : `数据库已备份到 ${result.filePath}`);
    });
  }

  async function restoreDatabase() {
    await runDataAction('restore-db', async () => {
      const result = await window.yomitomoDesktop.restoreDatabase();
      if (result.canceled) {
        setStatus('已取消数据库还原。');
        return;
      }

      onStoreUpdated(result.store);
      setStatus(`数据库已还原。原数据库已备份到 ${result.backupPath}`);
    });
  }

  async function runDataAction(action: string, task: () => Promise<void>) {
    setBusyAction(action);
    setStatus('');
    try {
      await task();
    } catch (error) {
      setStatus(dataManagementErrorMessage(error));
    } finally {
      setBusyAction('');
    }
  }

  const activeRetentionDays = settings.logRetentionDays;

  return (
    <div className="settings-panel">
      <PanelHeader
        icon={<Database size={20} />}
        title="数据管理"
        description="查看本地数据位置，管理日志保留，并备份或还原数据库。"
      />
      <div className="data-management-grid">
        <section className="data-management-card" aria-labelledby="data-paths-title">
          <div className="data-management-card-heading">
            <span>
              <FolderOpen size={18} />
            </span>
            <div>
              <h3 id="data-paths-title">本地位置</h3>
              <p>路径只用于定位文件，不在这里展示日志内容。</p>
            </div>
          </div>
          <div className="data-path-list">
            <DataPathRow
              icon={<HardDrive size={16} />}
              label="数据目录"
              path={paths?.dataDir || ''}
              onOpen={() => openPath('dataDir')}
            />
            <DataPathRow
              icon={<FileText size={16} />}
              label="日志文件"
              path={paths?.logFile || ''}
              onOpen={() => openPath('logFile')}
            />
            <DataPathRow
              icon={<Database size={16} />}
              label="数据库文件"
              path={paths?.databaseFile || ''}
              onOpen={() => openPath('databaseFile')}
            />
          </div>
        </section>

        <section className="data-management-card" aria-labelledby="log-policy-title">
          <div className="data-management-card-heading">
            <span>
              <FileText size={18} />
            </span>
            <div>
              <h3 id="log-policy-title">日志</h3>
              <p>只保留排查用日志文件路径、保留时间和清空操作。</p>
            </div>
          </div>
          <div className="data-retention-options" role="group" aria-label="日志保留时间">
            {logRetentionOptions.map((option) => {
              const active = (activeRetentionDays || undefined) === option.value;
              const action = `retention:${option.value ?? 'forever'}`;
              return (
                <button
                  className={active ? 'data-retention-option is-active' : 'data-retention-option'}
                  disabled={busyAction === action}
                  key={option.label}
                  type="button"
                  onClick={() => void saveLogRetention(option.value)}
                >
                  {active ? <Check size={14} /> : null}
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="data-management-actions">
            <Button
              className={
                busyAction === 'clear-log'
                  ? 'action-button data-danger-action is-loading'
                  : 'action-button data-danger-action'
              }
              disabled={busyAction === 'clear-log'}
              type="button"
              variant="secondary"
              onClick={() => void clearLog()}
            >
              <Trash2 size={15} />
              清空日志
            </Button>
          </div>
        </section>

        <section className="data-management-card" aria-labelledby="database-tools-title">
          <div className="data-management-card-heading">
            <span>
              <Database size={18} />
            </span>
            <div>
              <h3 id="database-tools-title">数据库</h3>
              <p>备份当前 SQLite 数据库，或从兼容的数据库文件还原。</p>
            </div>
          </div>
          <p className="data-management-note">
            数据库备份不包含系统钥匙串中的模型密钥，也不包含单独保存的 EPUB 原文件。
          </p>
          <div className="data-management-actions">
            <Button
              className={
                busyAction === 'backup-db'
                  ? 'action-button data-primary-action is-loading'
                  : 'action-button data-primary-action'
              }
              disabled={busyAction === 'backup-db'}
              type="button"
              onClick={() => void backupDatabase()}
            >
              <Download size={15} />
              备份数据库
            </Button>
            <Button
              className={
                busyAction === 'restore-db'
                  ? 'action-button data-restore-action is-loading'
                  : 'action-button data-restore-action'
              }
              disabled={busyAction === 'restore-db'}
              type="button"
              variant="secondary"
              onClick={() => void restoreDatabase()}
            >
              <Upload size={15} />
              还原数据库
            </Button>
          </div>
        </section>
      </div>
      {status ? <p className="data-management-status">{status}</p> : null}
    </div>
  );
}

function DataPathRow({
  icon,
  label,
  path,
  onOpen,
}: {
  icon: React.ReactNode;
  label: string;
  path: string;
  onOpen: () => void;
}) {
  return (
    <div className="data-path-row">
      <span className="data-path-icon">{icon}</span>
      <div>
        <strong>{label}</strong>
        <code>{path || '读取中'}</code>
      </div>
      {path ? <CopyIconButton label={`复制${label}路径`} value={path} /> : null}
      <button
        aria-label={`打开${label}`}
        className="data-path-open"
        disabled={!path}
        type="button"
        onClick={onOpen}
      >
        <FolderOpen size={15} />
      </button>
    </div>
  );
}

function dataManagementErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '数据管理操作失败。';
}
