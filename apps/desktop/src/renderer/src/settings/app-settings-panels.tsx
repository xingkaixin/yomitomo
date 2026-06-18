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
import { useTranslation } from 'react-i18next';
import { messageSendShortcutOptions } from './app-settings';
import type { DataManagementPathKind, DataManagementPaths } from '../../../preload';
import { CopyIconButton } from '../shell/app-ui';
import { AutoSaveStatus } from './app-settings-save-status';
import { SettingsConfirmDialog } from './app-settings-confirm-dialog';
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
import type { SaveableDraft } from './use-saveable-draft';

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

function messageSendShortcutCopy(
  shortcut: MessageSendShortcut,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (shortcut === 'enter') {
    return {
      title: t('settings.shortcuts.enterTitle'),
      description: t('settings.shortcuts.enterDescription'),
    };
  }

  return {
    title: t('settings.shortcuts.modEnterTitle'),
    description: t('settings.shortcuts.modEnterDescription'),
  };
}

type SelectionShortcutAction = keyof SelectionActionShortcuts;
type ShortcutSaveSection = 'message' | 'selection';

const selectionShortcutRows: Array<{
  action: SelectionShortcutAction;
  descriptionKey: string;
  labelKey: string;
}> = [
  {
    action: 'copy',
    descriptionKey: 'settings.shortcuts.copyDescription',
    labelKey: 'settings.shortcuts.copyLabel',
  },
  {
    action: 'annotate',
    descriptionKey: 'settings.shortcuts.annotateDescription',
    labelKey: 'settings.shortcuts.annotateLabel',
  },
  {
    action: 'ask',
    descriptionKey: 'settings.shortcuts.askDescription',
    labelKey: 'settings.shortcuts.askLabel',
  },
];

const logRetentionOptions: Array<{ value?: number }> = [
  {},
  { value: 90 },
  { value: 30 },
  { value: 15 },
];

const settingsSections: Array<{
  key: SettingsSectionKey;
  titleKey: string;
  descriptionKey: string;
  icon: React.ReactNode;
}> = [
  {
    key: 'collection',
    titleKey: 'settings.sections.collection',
    descriptionKey: 'settings.descriptions.collection',
    icon: <Settings size={17} />,
  },
  {
    key: 'models',
    titleKey: 'settings.sections.models',
    descriptionKey: 'settings.descriptions.models',
    icon: <KeyRound size={17} />,
  },
  {
    key: 'dataSources',
    titleKey: 'settings.sections.dataSources',
    descriptionKey: 'settings.descriptions.dataSources',
    icon: <Blocks size={17} />,
  },
  {
    key: 'shortcuts',
    titleKey: 'settings.sections.shortcuts',
    descriptionKey: 'settings.descriptions.shortcuts',
    icon: <Keyboard size={17} />,
  },
  {
    key: 'data',
    titleKey: 'settings.sections.data',
    descriptionKey: 'settings.descriptions.data',
    icon: <Database size={17} />,
  },
  {
    key: 'about',
    titleKey: 'settings.sections.about',
    descriptionKey: 'settings.descriptions.about',
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
  const { t } = useTranslation();
  const visibleSettingsSections = developerModeEnabled
    ? [
        ...settingsSections.slice(0, -1),
        {
          key: 'aiTrace' as const,
          titleKey: 'settings.sections.aiTrace',
          descriptionKey: 'settings.descriptions.aiTrace',
          icon: <Route size={17} />,
        },
        settingsSections[settingsSections.length - 1],
      ]
    : settingsSections;

  return (
    <div className="settings-shell">
      <div className="settings-shell-layout">
        <nav className="settings-side-nav" aria-label={t('settings.navLabel')}>
          {visibleSettingsSections.map((section) => {
            const active = activeSection === section.key;
            const title = t(section.titleKey);
            return (
              <button
                aria-current={active ? 'page' : undefined}
                className={active ? 'settings-side-nav-item is-active' : 'settings-side-nav-item'}
                data-tooltip={title}
                key={section.key}
                type="button"
                onClick={() => onSectionChange(section.key)}
              >
                <span className="settings-side-nav-icon">{section.icon}</span>
                <span className="settings-side-nav-label">{title}</span>
              </button>
            );
          })}
        </nav>
        <section className="settings-shell-content">{children}</section>
      </div>
    </div>
  );
}

type ShortcutSettingsLegacyProps = {
  settingsDraft: AppSettings;
  canSave: boolean;
  onSettingsChange: (draft: AppSettings) => void;
  onSave: (draft?: AppSettings) => void;
  saveError?: string;
  saveState: SaveState;
};

type ShortcutSettingsProps = { draft: SaveableDraft<AppSettings> } | ShortcutSettingsLegacyProps;

export function ShortcutSettings(props: ShortcutSettingsProps) {
  const { settingsDraft, canSave, onSettingsChange, onSave, saveError, saveState } =
    resolveShortcutSettingsProps(props);
  const { t } = useTranslation();
  const [recordingAction, setRecordingAction] = useState<SelectionShortcutAction | null>(null);
  const [saveSection, setSaveSection] = useState<ShortcutSaveSection | null>(null);
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
      ) {
        setSaveSection('selection');
        onSave(nextDraft);
      }
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
    ) {
      setSaveSection('selection');
      onSave(nextDraft);
    }
  }

  function retrySave(section: ShortcutSaveSection) {
    setSaveSection(section);
    onSave();
  }

  return (
    <SettingsPage
      trail={[t('settings.shortcuts.trailRoot'), t('settings.shortcuts.trailPage')]}
      description={t('settings.shortcuts.description')}
    >
      <SettingsGroup
        label={t('settings.shortcuts.messageGroup')}
        aside={
          <>
            <span className="settings-hint">{t('settings.shortcuts.messageHint')}</span>
            <AutoSaveStatus
              error={saveError}
              state={saveSection === 'message' ? saveState : 'idle'}
              onRetry={canSave ? () => retrySave('message') : undefined}
            />
          </>
        }
        cardProps={{ role: 'radiogroup', 'aria-label': t('settings.shortcuts.messageAria') }}
      >
        {messageSendShortcutOptions.map((option) => {
          const active = selectedShortcut === option.value;
          const keys = messageSendShortcutKeys(option.value, shortcutModifier);
          const copy = messageSendShortcutCopy(option.value, t);

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
                setSaveSection('message');
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
        label={t('settings.shortcuts.selectionGroup')}
        aside={
          <>
            <span className="settings-hint">{t('settings.shortcuts.selectionHint')}</span>
            <AutoSaveStatus
              error={saveError}
              state={saveSection === 'selection' ? saveState : 'idle'}
              onRetry={canSave ? () => retrySave('selection') : undefined}
            />
          </>
        }
      >
        {selectionShortcutRows.map((row) => {
          const rowLabel = t(row.labelKey);
          const rowDescription = t(row.descriptionKey);
          const key = selectionShortcuts[row.action];
          const defaultKey = defaultSelectionActionShortcuts[row.action];
          const modified = key !== defaultKey;
          const recording = recordingAction === row.action;
          const conflictingRow = selectionShortcutRows.find(
            (item) => item.action !== row.action && selectionShortcuts[item.action] === key,
          );
          const conflictingLabel = conflictingRow
            ? t(conflictingRow.labelKey)
            : t('settings.shortcuts.otherAction');
          const conflict = Boolean(conflictingRow);

          return (
            <SettingsRow
              className={conflict ? 'has-conflict' : recording ? 'is-recording' : undefined}
              key={row.action}
              title={rowLabel}
              description={rowDescription}
            >
              {conflict ? (
                <span className="shortcut-conflict-badge" role="alert">
                  {t('settings.shortcuts.conflict', { key, label: conflictingLabel })}
                </span>
              ) : null}
              <button
                className={recording ? 'settings-key-button is-recording' : 'settings-key-button'}
                type="button"
                aria-label={t('settings.shortcuts.setShortcut', { label: rowLabel })}
                onClick={() => setRecordingAction(row.action)}
              >
                <Kbd className="settings-keycap">{recording ? '...' : key}</Kbd>
                <span>
                  {recording ? t('settings.shortcuts.recording') : t('settings.shortcuts.edit')}
                </span>
              </button>
              {modified && !recording ? (
                <button
                  className="settings-reset-button"
                  type="button"
                  aria-label={t('settings.shortcuts.resetShortcut', {
                    key: defaultKey,
                    label: rowLabel,
                  })}
                  onClick={() => resetSelectionShortcut(row.action)}
                >
                  <RefreshCw size={13} />
                  {t('settings.shortcuts.reset')}
                </button>
              ) : null}
            </SettingsRow>
          );
        })}
      </SettingsGroup>

      <SettingsGroup label={t('settings.shortcuts.pageGroup')}>
        <SettingsRow
          leading={<Book size={18} />}
          title={t('settings.shortcuts.pageTitle')}
          description={t('settings.shortcuts.pageDescription')}
        >
          <span className="settings-keyset" aria-label={t('settings.shortcuts.arrowKeys')}>
            <Kbd className="settings-keycap is-readonly">←</Kbd>
            <Kbd className="settings-keycap is-readonly">→</Kbd>
          </span>
        </SettingsRow>
      </SettingsGroup>
    </SettingsPage>
  );
}

function resolveShortcutSettingsProps(props: ShortcutSettingsProps): ShortcutSettingsLegacyProps {
  if ('draft' in props) {
    return {
      settingsDraft: props.draft.value,
      canSave: props.draft.canSave,
      onSettingsChange: props.draft.update,
      onSave: (draft) => {
        void props.draft.save(draft);
      },
      saveError: props.draft.saveError,
      saveState: props.draft.saveState,
    };
  }
  return props;
}

export function DataManagementSettings({
  settings,
  onStoreUpdated,
}: {
  settings: AppSettings;
  onStoreUpdated: (store: DesktopStore) => void;
}) {
  const { t } = useTranslation();
  const [paths, setPaths] = useState<DataManagementPaths | null>(null);
  const [busyAction, setBusyAction] = useState('');
  const [status, setStatus] = useState('');
  const [retentionSaveState, setRetentionSaveState] = useState<SaveState>('idle');
  const [retentionSaveError, setRetentionSaveError] = useState('');
  const [lastRetentionDays, setLastRetentionDays] = useState<number | undefined>(undefined);
  const [confirmAction, setConfirmAction] = useState<'clear-log' | 'restore-db' | null>(null);

  useEffect(() => {
    let mounted = true;
    window.yomitomoDesktop
      .getDataManagementPaths()
      .then((nextPaths) => {
        if (mounted) setPaths(nextPaths);
      })
      .catch((error) => {
        if (mounted) setStatus(dataManagementErrorMessage(error, t));
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
      setStatus(
        days
          ? t('settings.data.retentionSavedDays', { count: days })
          : t('settings.data.retentionSavedForever'),
      );
      window.setTimeout(() => setRetentionSaveState('idle'), 1200);
    });
  }

  async function clearLog() {
    setConfirmAction(null);
    await runDataAction('clear-log', async () => {
      await window.yomitomoDesktop.clearLog();
      setStatus(t('settings.data.logCleared'));
    });
  }

  async function backupDatabase() {
    await runDataAction('backup-db', async () => {
      const result = await window.yomitomoDesktop.backupDatabase();
      setStatus(
        result.canceled
          ? t('settings.data.backupCanceled')
          : t('settings.data.backupDone', { path: result.filePath }),
      );
    });
  }

  async function restoreDatabase() {
    setConfirmAction(null);
    await runDataAction('restore-db', async () => {
      const result = await window.yomitomoDesktop.restoreDatabase();
      if (result.canceled) {
        setStatus(t('settings.data.restoreCanceled'));
        return;
      }

      onStoreUpdated(result.store);
      setStatus(t('settings.data.restoreDone', { path: result.backupPath }));
    });
  }

  async function runDataAction(action: string, task: () => Promise<void>) {
    setBusyAction(action);
    setStatus('');
    try {
      await task();
    } catch (error) {
      const message = dataManagementErrorMessage(error, t);
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
  const confirmDialog =
    confirmAction === 'clear-log'
      ? {
          title: t('settings.data.clearLogConfirmTitle'),
          description: t('settings.data.clearLogConfirmDescription'),
          confirmLabel: t('settings.data.clearLogConfirm'),
        }
      : confirmAction === 'restore-db'
        ? {
            title: t('settings.data.restoreDatabaseConfirmTitle'),
            description: t('settings.data.restoreDatabaseConfirmDescription'),
            confirmLabel: t('settings.data.restoreDatabaseConfirm'),
          }
        : null;

  return (
    <SettingsPage
      trail={[t('settings.data.trailRoot'), t('settings.data.trailPage')]}
      description={t('settings.data.description')}
    >
      <SettingsGroup label={t('settings.data.localGroup')}>
        <DataPathRow
          icon={<HardDrive size={18} />}
          label={t('settings.data.dataDir')}
          path={paths?.dataDir || ''}
          onOpen={() => openPath('dataDir')}
        />
        <DataPathRow
          icon={<FileText size={18} />}
          label={t('settings.data.logFile')}
          path={paths?.logFile || ''}
          onOpen={() => openPath('logFile')}
        />
        <DataPathRow
          icon={<Database size={18} />}
          label={t('settings.data.databaseFile')}
          path={paths?.databaseFile || ''}
          onOpen={() => openPath('databaseFile')}
        />
      </SettingsGroup>

      <div className="settings-group-grid">
        <SettingsGroup
          label={t('settings.data.retentionGroup')}
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
            ariaLabel={t('settings.data.retentionAria')}
            block
            wrap
            value={retentionValue}
            options={logRetentionOptions.map((option) => ({
              label: option.value
                ? t('settings.data.retentionDays', { count: option.value })
                : t('settings.data.retentionForever'),
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
              onClick={() => setConfirmAction('clear-log')}
            >
              <Trash2 size={15} />
              {t('settings.data.clearLog')}
            </Button>
          </div>
        </SettingsGroup>

        <SettingsGroup label={t('settings.data.databaseGroup')} padded>
          <div className="settings-callout">
            <Info size={16} />
            <span>{t('settings.data.backupNote')}</span>
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
              {t('settings.data.backupDatabase')}
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
              onClick={() => setConfirmAction('restore-db')}
            >
              <Upload size={15} />
              {t('settings.data.restoreDatabase')}
            </Button>
          </div>
        </SettingsGroup>
      </div>

      {status ? <p className="data-management-status">{status}</p> : null}
      {confirmDialog ? (
        <SettingsConfirmDialog
          cancelLabel={t('settings.confirm.cancel')}
          confirmLabel={confirmDialog.confirmLabel}
          description={confirmDialog.description}
          open
          title={confirmDialog.title}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            if (confirmAction === 'clear-log') void clearLog();
            if (confirmAction === 'restore-db') void restoreDatabase();
          }}
        />
      ) : null}
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
  const { t } = useTranslation();
  return (
    <SettingsRow
      leading={icon}
      title={label}
      description={<code className="settings-path">{path || t('settings.data.loading')}</code>}
    >
      {path ? <CopyIconButton label={t('settings.data.copyPath', { label })} value={path} /> : null}
      <button
        aria-label={t('settings.data.openPath', { label })}
        className="settings-icon-button"
        data-tooltip={t('settings.data.openPath', { label })}
        disabled={!path}
        type="button"
        onClick={onOpen}
      >
        <FolderOpen size={16} />
      </button>
    </SettingsRow>
  );
}

function dataManagementErrorMessage(error: unknown, t: ReturnType<typeof useTranslation>['t']) {
  const message = error instanceof Error ? error.message : '';
  const errorKey = dataManagementErrorKey(message);
  return errorKey ? t(errorKey) : message || t('settings.data.errorFallback');
}

function dataManagementErrorKey(message: string) {
  if (!/^DATA_MANAGEMENT_[A-Z_]+$/.test(message)) return '';
  return `settings.data.errors.${message
    .replace(/^DATA_MANAGEMENT_/, '')
    .toLowerCase()
    .replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())}`;
}
