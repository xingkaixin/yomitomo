import React, { useEffect, useState } from 'react';
import {
  Blocks,
  Book,
  Database,
  Download,
  FileText,
  FolderOpen,
  HardDrive,
  Info,
  Keyboard,
  KeyRound,
  RefreshCw,
  Settings,
  Route,
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
import { getShortcutModifier, messageSendShortcutKeys } from '@yomitomo/reader-ui/reader-shortcuts';
import { messageSendShortcutOptions } from './app-settings';
import type { DataManagementPathKind, DataManagementPaths } from '../../../preload';
import { CopyIconButton } from '../shell/app-ui';
import { AutoSaveStatus } from './app-settings-save-status';
import type { SaveState } from '../shell/app-types';
import { Button } from '../components/ui/button';
import { Kbd } from '../components/ui/kbd';
import {
  SettingsGroup,
  SettingsPage,
  SettingsRadioDot,
  SettingsRow,
  SettingsSegmented,
} from './app-settings-kit';

export { GeneralSettings } from './app-settings-general-panel';
export { DataSourcesPanel, WeReadSettingsPanel } from './app-settings-weread-panel';
export { AgentForm, AgentSettings } from './app-settings-agent-panel';
export { ProviderForm } from './app-settings-provider-form';
export { ProviderSettings } from './app-settings-provider-panel';
export { UserProfileSettingsDialog } from './app-settings-profile-dialog';
export { AiTraceSettingsPanel } from '../shell/app-assistant-diagnostics';

export type SettingsSectionKey =
  | 'collection'
  | 'models'
  | 'dataSources'
  | 'shortcuts'
  | 'data'
  | 'aiTrace'
  | 'about';

function messageSendShortcutCopy(shortcut: MessageSendShortcut) {
  if (shortcut === 'enter') {
    return {
      title: '回车发送',
      description: '按下回车即可发送信息，适合习惯即时发送的场景；按 Shift+回车 换行。',
    };
  }

  return {
    title: '组合键发送',
    description: '按下组合键发送信息，适合长文本输入、避免误发送；此时按回车换行。',
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
  { action: 'ask', label: '问一下', description: '阅读区选中文本后的问答入口。' },
];

const logRetentionOptions: Array<{ label: string; value?: number }> = [
  { label: '永久' },
  { label: '90 天', value: 90 },
  { label: '30 天', value: 30 },
  { label: '15 天', value: 15 },
];

const settingsSections: Array<{
  key: SettingsSectionKey;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'collection',
    title: '通用',
    description: '保存原文图片与阅读库入口显示偏好。',
    icon: <Settings size={17} />,
  },
  {
    key: 'models',
    title: '模型与路由',
    description: '分配任务模型，并维护模型供应商。',
    icon: <KeyRound size={17} />,
  },
  {
    key: 'dataSources',
    title: '数据来源',
    description: '管理微信读书等外部内容来源。',
    icon: <Blocks size={17} />,
  },
  {
    key: 'shortcuts',
    title: '快捷键',
    description: '配置划线、想法和回复等应用快捷键。',
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

export function SettingsSectionShell({
  activeSection,
  children,
  developerModeEnabled = false,
  onSectionChange,
}: {
  activeSection: SettingsSectionKey;
  children: React.ReactNode;
  developerModeEnabled?: boolean;
  onSectionChange: (section: SettingsSectionKey) => void;
}) {
  const visibleSettingsSections = developerModeEnabled
    ? [
        ...settingsSections.slice(0, -1),
        {
          key: 'aiTrace' as const,
          title: '助手调用链路',
          description: '查看助手执行链路、状态和脱敏 trace。',
          icon: <Route size={17} />,
        },
        settingsSections[settingsSections.length - 1],
      ]
    : settingsSections;

  return (
    <div className="settings-shell">
      <div className="settings-shell-layout">
        <nav className="settings-side-nav" aria-label="设置分类">
          {visibleSettingsSections.map((section) => {
            const active = activeSection === section.key;
            return (
              <button
                aria-current={active ? 'page' : undefined}
                className={active ? 'settings-side-nav-item is-active' : 'settings-side-nav-item'}
                data-tooltip={section.title}
                key={section.key}
                type="button"
                onClick={() => onSectionChange(section.key)}
              >
                <span className="settings-side-nav-icon">{section.icon}</span>
                <span className="settings-side-nav-label">{section.title}</span>
              </button>
            );
          })}
        </nav>
        <section className="settings-shell-content">{children}</section>
      </div>
    </div>
  );
}

export function ShortcutSettings({
  settingsDraft,
  canSave,
  onSettingsChange,
  onSave,
  saveError,
  saveState,
}: {
  settingsDraft: AppSettings;
  canSave: boolean;
  onSettingsChange: (draft: AppSettings) => void;
  onSave: (draft?: AppSettings) => void;
  saveError?: string;
  saveState: SaveState;
}) {
  const [recordingAction, setRecordingAction] = useState<SelectionShortcutAction | null>(null);
  const selectedShortcut = normalizeMessageSendShortcut(settingsDraft.messageSendShortcut);
  const shortcutModifier = getShortcutModifier();
  const selectionShortcuts = React.useMemo(
    () => normalizeSelectionActionShortcutDraft(settingsDraft.selectionActionShortcuts),
    [settingsDraft.selectionActionShortcuts],
  );

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

      const nextDraft = {
        ...settingsDraft,
        selectionActionShortcuts: {
          ...selectionShortcuts,
          [action]: key,
        },
      };
      onSettingsChange(nextDraft);
      if (
        !selectionActionShortcutsConflict(
          normalizeSelectionActionShortcutDraft(nextDraft.selectionActionShortcuts),
        )
      )
        onSave(nextDraft);
      finishRecording();
    }

    window.addEventListener('keydown', handleShortcutKeyDown, true);
    return () => window.removeEventListener('keydown', handleShortcutKeyDown, true);
  }, [onSave, onSettingsChange, recordingAction, selectionShortcuts, settingsDraft]);

  function resetSelectionShortcut(action: SelectionShortcutAction) {
    const nextDraft = {
      ...settingsDraft,
      selectionActionShortcuts: {
        ...selectionShortcuts,
        [action]: defaultSelectionActionShortcuts[action],
      },
    };
    onSettingsChange(nextDraft);
    if (
      !selectionActionShortcutsConflict(
        normalizeSelectionActionShortcutDraft(nextDraft.selectionActionShortcuts),
      )
    )
      onSave(nextDraft);
  }

  return (
    <SettingsPage trail={['设置', '快捷键']} description="配置应用内常用操作的键盘触发方式。">
      <SettingsGroup
        label="消息发送"
        aside={
          <>
            <span className="settings-hint">用于想法发布和回复发送，切换即时生效</span>
            <AutoSaveStatus
              error={saveError}
              state={saveState}
              onRetry={canSave ? () => onSave() : undefined}
            />
          </>
        }
        cardProps={{ role: 'radiogroup', 'aria-label': '想法和回复发送快捷键' }}
      >
        {messageSendShortcutOptions.map((option) => {
          const active = selectedShortcut === option.value;
          const keys = messageSendShortcutKeys(option.value, shortcutModifier);
          const copy = messageSendShortcutCopy(option.value);

          return (
            <button
              aria-checked={active}
              aria-label={copy.title}
              className="settings-row settings-row-button"
              key={option.value}
              role="radio"
              type="button"
              onClick={() => {
                const nextDraft = { ...settingsDraft, messageSendShortcut: option.value };
                onSettingsChange(nextDraft);
                onSave(nextDraft);
              }}
            >
              <span className="settings-row-leading">
                <SettingsRadioDot checked={active} />
              </span>
              <span className="settings-keyset" aria-hidden="true">
                {keys.map((key, index) => (
                  <React.Fragment key={key}>
                    {index > 0 ? <span className="settings-key-plus">+</span> : null}
                    <Kbd className="settings-keycap">{key}</Kbd>
                  </React.Fragment>
                ))}
              </span>
              <div className="settings-row-copy">
                <strong>{copy.title}</strong>
                <p>{copy.description}</p>
              </div>
            </button>
          );
        })}
      </SettingsGroup>

      <SettingsGroup
        label="阅读区选区操作"
        aside={<span className="settings-hint">支持 A-Z 单字母，重复键位会阻止保存</span>}
      >
        {selectionShortcutRows.map((row) => {
          const key = selectionShortcuts[row.action];
          const defaultKey = defaultSelectionActionShortcuts[row.action];
          const modified = key !== defaultKey;
          const recording = recordingAction === row.action;
          const conflictingRow = selectionShortcutRows.find(
            (item) => item.action !== row.action && selectionShortcuts[item.action] === key,
          );
          const conflict = Boolean(conflictingRow);

          return (
            <SettingsRow
              className={conflict ? 'has-conflict' : recording ? 'is-recording' : undefined}
              key={row.action}
              title={row.label}
              description={row.description}
            >
              {conflict ? (
                <span className="shortcut-conflict-badge" role="alert">
                  与{conflictingRow?.label || '其他操作'}共用 {key}
                </span>
              ) : null}
              <button
                className={recording ? 'settings-key-button is-recording' : 'settings-key-button'}
                type="button"
                aria-label={`设置${row.label}快捷键`}
                onClick={() => setRecordingAction(row.action)}
              >
                <Kbd className="settings-keycap">{recording ? '...' : key}</Kbd>
                <span>{recording ? '按字母键' : '修改'}</span>
              </button>
              {modified && !recording ? (
                <button
                  className="settings-reset-button"
                  type="button"
                  aria-label={`重置${row.label}为默认 ${defaultKey}`}
                  onClick={() => resetSelectionShortcut(row.action)}
                >
                  <RefreshCw size={13} />
                  重置
                </button>
              ) : null}
            </SettingsRow>
          );
        })}
      </SettingsGroup>

      <SettingsGroup label="阅读器翻页">
        <SettingsRow
          leading={<Book size={18} />}
          title="上一页 / 下一页"
          description="PDF 和电子书阅读时直接用键盘翻页，内置不可自定义。"
        >
          <span className="settings-keyset" aria-label="左右方向键">
            <Kbd className="settings-keycap is-readonly">←</Kbd>
            <Kbd className="settings-keycap is-readonly">→</Kbd>
          </span>
        </SettingsRow>
      </SettingsGroup>
    </SettingsPage>
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
  const [retentionSaveState, setRetentionSaveState] = useState<SaveState>('idle');
  const [retentionSaveError, setRetentionSaveError] = useState('');
  const [lastRetentionDays, setLastRetentionDays] = useState<number | undefined>(undefined);

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
    setLastRetentionDays(days);
    setRetentionSaveState('saving');
    setRetentionSaveError('');
    await runDataAction(`retention:${days ?? 'forever'}`, async () => {
      const input: AppSettings = { ...settings };
      Object.assign(input, { logRetentionDays: days });
      const nextStore = await window.yomitomoDesktop.saveSettings(input);
      onStoreUpdated(nextStore);
      setRetentionSaveState('saved');
      setStatus(days ? `日志将保留最近 ${days} 天。` : '日志将永久保留，直到手动清空。');
      window.setTimeout(() => setRetentionSaveState('idle'), 1200);
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
      const message = dataManagementErrorMessage(error);
      setStatus(message);
      if (action.startsWith('retention:')) {
        setRetentionSaveError(message);
        setRetentionSaveState('error');
      }
    } finally {
      setBusyAction('');
    }
  }

  const activeRetentionDays = settings.logRetentionDays;
  const retentionValue = activeRetentionDays || 0;

  return (
    <SettingsPage
      trail={['设置', '数据管理']}
      description="查看本地数据位置，管理日志保留，并备份或还原数据库。"
    >
      <SettingsGroup label="本地位置">
        <DataPathRow
          icon={<HardDrive size={18} />}
          label="数据目录"
          path={paths?.dataDir || ''}
          onOpen={() => openPath('dataDir')}
        />
        <DataPathRow
          icon={<FileText size={18} />}
          label="日志文件"
          path={paths?.logFile || ''}
          onOpen={() => openPath('logFile')}
        />
        <DataPathRow
          icon={<Database size={18} />}
          label="数据库文件"
          path={paths?.databaseFile || ''}
          onOpen={() => openPath('databaseFile')}
        />
      </SettingsGroup>

      <div className="settings-group-grid">
        <SettingsGroup
          label="日志保留"
          padded
          aside={
            <AutoSaveStatus
              error={retentionSaveError}
              state={retentionSaveState}
              onRetry={() => void saveLogRetention(lastRetentionDays)}
            />
          }
        >
          <SettingsSegmented
            ariaLabel="日志保留时间"
            block
            value={retentionValue}
            options={logRetentionOptions.map((option) => ({
              label: option.label,
              value: option.value ?? 0,
              disabled: busyAction === `retention:${option.value ?? 'forever'}`,
            }))}
            onChange={(value) => void saveLogRetention(value === 0 ? undefined : value)}
          />
          <div className="settings-card-actions">
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
        </SettingsGroup>

        <SettingsGroup label="数据库" padded>
          <div className="settings-callout">
            <Info size={16} />
            <span>备份不含钥匙串中的模型密钥，也不含单独保存的 EPUB 原文件。</span>
          </div>
          <div className="settings-card-actions">
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
        </SettingsGroup>
      </div>

      {status ? <p className="data-management-status">{status}</p> : null}
    </SettingsPage>
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
    <SettingsRow
      leading={icon}
      title={label}
      description={<code className="settings-path">{path || '读取中'}</code>}
    >
      {path ? <CopyIconButton label={`复制${label}路径`} value={path} /> : null}
      <button
        aria-label={`打开${label}`}
        className="settings-icon-button"
        data-tooltip={`打开${label}`}
        disabled={!path}
        type="button"
        onClick={onOpen}
      >
        <FolderOpen size={16} />
      </button>
    </SettingsRow>
  );
}

function dataManagementErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '数据管理操作失败。';
}
