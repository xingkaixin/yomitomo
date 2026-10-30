import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon } from '@hugeicons/core-free-icons';
import { useReducer, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ReadingMemoryStatusSnapshot } from '../../../ipc-contract';
import {
  readingMemoryModelSources,
  type ReadingMemoryModelSource,
} from '../../../reading-memory-model-sources';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Button } from '../components/ui/button';
import { getDesktopApi } from '../shell/app-desktop-api';
import { SettingsConfirmDialog } from './app-settings-confirm-dialog';
import { SettingsGroup, SettingsRow } from './app-settings-kit';

type ModelAction = 'download' | 'cancel' | 'remove' | 'pause' | 'resume' | 'rebuild';
const activeStatusPollMs = 1_000;
const idleStatusPollMs = 10_000;

// Each status read runs coverage queries in main; poll quickly only while something is changing.
function statusPollDelay(snapshot: ReadingMemoryStatusSnapshot | undefined) {
  if (!snapshot) return idleStatusPollMs;
  const active =
    snapshot.model.status === 'checking' ||
    snapshot.model.status === 'downloading' ||
    snapshot.semantic.state === 'building' ||
    snapshot.semantic.state === 'rebuilding' ||
    snapshot.projection.state === 'building' ||
    snapshot.projection.state === 'stale';
  return active ? activeStatusPollMs : idleStatusPollMs;
}

const readingMemoryStatusQueryKey = ['reading-memory', 'status'] as const;

type ModelActionState = { error: boolean; pending: ModelAction | null };

type ModelActionEvent =
  | { type: 'started'; action: ModelAction }
  | { type: 'succeeded' }
  | { type: 'failed' }
  | { type: 'settled' };

function modelActionReducer(state: ModelActionState, event: ModelActionEvent): ModelActionState {
  switch (event.type) {
    case 'started':
      return { error: false, pending: event.action };
    case 'succeeded':
      return { ...state, error: false };
    case 'failed':
      return { ...state, error: true };
    case 'settled':
      return { ...state, pending: null };
  }
}

function useReadingMemoryModelStatus() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: readingMemoryStatusQueryKey,
    queryFn: () => getDesktopApi().readingMemory.model.status(),
    refetchInterval: (query) => statusPollDelay(query.state.data),
  });
  const [action, dispatch] = useReducer(modelActionReducer, { error: false, pending: null });
  const operationRef = useRef<{ action: ModelAction } | null>(null);

  async function run(nextAction: ModelAction, source: ReadingMemoryModelSource = 'modelscope') {
    const current = operationRef.current;
    if (current && !(nextAction === 'cancel' && current.action === 'download')) return;
    const operation = { action: nextAction };
    operationRef.current = operation;
    dispatch({ type: 'started', action: nextAction });
    // An in-flight status read started before this action must not overwrite its result.
    await queryClient.cancelQueries({ queryKey: readingMemoryStatusQueryKey });
    try {
      const { model, index } = getDesktopApi().readingMemory;
      const actions = {
        download: () => model.download(source),
        cancel: model.cancel,
        remove: model.remove,
        pause: index.pause,
        resume: index.resume,
        rebuild: index.rebuild,
      };
      const next = await actions[nextAction]();
      if (operationRef.current !== operation) return;
      queryClient.setQueryData(readingMemoryStatusQueryKey, next);
      dispatch({ type: 'succeeded' });
    } catch {
      if (operationRef.current !== operation) return;
      dispatch({ type: 'failed' });
    } finally {
      if (operationRef.current === operation) {
        operationRef.current = null;
        dispatch({ type: 'settled' });
      }
    }
  }

  const error: 'action' | 'load' | null = action.error ? 'action' : status.isError ? 'load' : null;
  return {
    snapshot: status.data ?? null,
    error,
    pending: action.pending,
    run,
    refresh: () => status.refetch(),
  };
}

type ModelSettingsViewEvent =
  | { type: 'sourceSelected'; source: ReadingMemoryModelSource }
  | {
      type: 'removeRequested';
    }
  | { type: 'removeDismissed' };

type ModelSettingsViewState = {
  removeConfirmationOpen: boolean;
  selectedSource: ReadingMemoryModelSource;
};

function modelSettingsViewReducer(
  state: ModelSettingsViewState,
  event: ModelSettingsViewEvent,
): ModelSettingsViewState {
  switch (event.type) {
    case 'sourceSelected':
      return { ...state, selectedSource: event.source };
    case 'removeRequested':
      return { ...state, removeConfirmationOpen: true };
    case 'removeDismissed':
      return { ...state, removeConfirmationOpen: false };
  }
}

type StatusTone = 'ready' | 'active' | 'idle' | 'error';
type ReadingMemoryModelStatus = ReadingMemoryStatusSnapshot['model']['status'];

const modelTone: Record<ReadingMemoryModelStatus, StatusTone> = {
  checking: 'active',
  'not-installed': 'idle',
  downloading: 'active',
  available: 'ready',
  failed: 'error',
};
const projectionTone: Record<ReadingMemoryStatusSnapshot['projection']['state'], StatusTone> = {
  not_built: 'idle',
  building: 'active',
  available: 'ready',
  stale: 'active',
  failed: 'error',
};
const semanticTone: Record<ReadingMemoryStatusSnapshot['semantic']['state'], StatusTone> = {
  checking: 'active',
  not_installed: 'idle',
  downloading: 'active',
  building: 'active',
  available: 'ready',
  rebuilding: 'active',
  failed: 'error',
};

function StatusLabel({
  tone,
  live = false,
  children,
}: {
  tone: StatusTone;
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <span className="reading-memory-status" data-tone={tone} role={live ? 'status' : undefined}>
      {children}
    </span>
  );
}

export function ReadingMemoryModelSettings() {
  const { t, i18n } = useTranslation();
  const { snapshot, error, pending, run, refresh } = useReadingMemoryModelStatus();
  const [{ removeConfirmationOpen, selectedSource }, dispatch] = useReducer(
    modelSettingsViewReducer,
    { removeConfirmationOpen: false, selectedSource: 'modelscope' },
  );
  const model = snapshot?.model;
  const source = model?.source ?? selectedSource;
  const downloading = model?.status === 'downloading' || pending === 'download';
  const busy = pending !== null;
  const canIndex = model?.status === 'available' && !busy && error !== 'load';
  const canRemove =
    model && model.status !== 'checking' && !downloading && !busy && error !== 'load';
  const number = (value: number) => new Intl.NumberFormat(i18n.language).format(value);
  const bytes = (value: number) =>
    t('settings.models.localMemory.byteSize', {
      size: new Intl.NumberFormat(i18n.language, {
        style: 'unit',
        unit: 'megabyte',
        maximumFractionDigits: 1,
      }).format(value / 1_000_000),
      bytes: number(value),
    });

  if (!snapshot) {
    return (
      <SettingsGroup
        label={t('settings.models.localMemory.title')}
        note={t('settings.models.localMemory.description')}
        cardProps={{ role: 'region', 'aria-label': t('settings.models.localMemory.title') }}
      >
        <p className="px-4 py-3 text-sm text-muted-foreground" role="status">
          {error
            ? t('settings.models.localMemory.loadFailed')
            : t('settings.models.localMemory.loading')}
        </p>
        {error === 'load' ? <LoadRetry onRetry={() => void refresh()} /> : null}
      </SettingsGroup>
    );
  }

  const { semantic, projection } = snapshot;
  const modelAvailable = snapshot.model.status === 'available';
  const showRemove =
    !downloading &&
    snapshot.model.status !== 'checking' &&
    (modelAvailable ||
      snapshot.model.downloadedBytes > 0 ||
      semantic.coverage.indexedEntryCount > 0);
  const showQueryVersion =
    semantic.queryModelVersion !== null && semantic.queryModelVersion !== semantic.modelVersion;
  const facts: Array<{ label: string; value: string; mono?: boolean }> = [
    {
      label: t('settings.models.localMemory.downloadSize'),
      value: bytes(snapshot.model.downloadSizeBytes),
    },
    {
      label: t('settings.models.localMemory.source'),
      value: readingMemoryModelSources[source].url,
      mono: true,
    },
    {
      label: t('settings.models.localMemory.directory'),
      value: snapshot.model.directory,
      mono: true,
    },
  ];
  if (showQueryVersion) {
    facts.push({
      label: t('settings.models.localMemory.queryModelVersion'),
      value: semantic.queryModelVersion ?? '',
      mono: true,
    });
  }

  return (
    <>
      <SettingsGroup
        label={t('settings.models.localMemory.title')}
        note={t('settings.models.localMemory.description')}
        cardProps={{ role: 'region', 'aria-label': t('settings.models.localMemory.title') }}
      >
        <div>
          <SettingsRow
            title={t('settings.models.localMemory.model')}
            description={<span className="reading-memory-id">{snapshot.model.internalId}</span>}
            className="flex-wrap"
          >
            <StatusLabel tone={modelTone[snapshot.model.status]} live>
              {t(`settings.models.localMemory.lifecycle.${snapshot.model.status}`)}
            </StatusLabel>
            {downloading ? (
              <Button
                className="action-button"
                variant="secondary"
                disabled={busy && pending !== 'download'}
                onClick={() => void run('cancel')}
              >
                {t('settings.models.localMemory.cancelDownload')}
              </Button>
            ) : !modelAvailable ? (
              <Button
                className="action-button"
                disabled={
                  busy ||
                  error === 'load' ||
                  snapshot.model.status === 'checking' ||
                  snapshot.model.failure === 'unsupported-platform'
                }
                onClick={() => void run('download', source)}
              >
                {t(
                  snapshot.model.downloadedBytes > 0
                    ? 'settings.models.localMemory.resumeDownload'
                    : 'settings.models.localMemory.download',
                )}
              </Button>
            ) : null}
          </SettingsRow>
          {downloading ? (
            <div className="reading-memory-progress">
              <progress
                aria-label={t('settings.models.localMemory.downloadProgress', {
                  downloaded: bytes(snapshot.model.downloadedBytes),
                  total: bytes(snapshot.model.downloadSizeBytes),
                })}
                max={Math.max(snapshot.model.downloadSizeBytes, 1)}
                value={snapshot.model.downloadedBytes}
              />
              <p>
                {t('settings.models.localMemory.downloadProgress', {
                  downloaded: bytes(snapshot.model.downloadedBytes),
                  total: bytes(snapshot.model.downloadSizeBytes),
                })}
              </p>
            </div>
          ) : !modelAvailable && snapshot.model.downloadedBytes > 0 ? (
            <p className="reading-memory-notice">
              {t('settings.models.localMemory.retainedProgress', {
                bytes: bytes(snapshot.model.downloadedBytes),
              })}
            </p>
          ) : null}
          {snapshot.model.failure ? (
            <p className="reading-memory-notice is-error" role="alert">
              {t(`settings.models.localMemory.failure.${snapshot.model.failure}`)}
            </p>
          ) : null}
        </div>
        {modelAvailable ? null : (
          <SettingsRow
            title={t('settings.models.localMemory.downloadSource')}
            description={t('settings.models.localMemory.downloadSourceHint')}
          >
            <Select
              value={source}
              disabled={busy || downloading}
              onValueChange={(value) => {
                if (value === 'modelscope' || value === 'huggingface') {
                  dispatch({ type: 'sourceSelected', source: value });
                }
              }}
            >
              <SelectTrigger
                aria-label={t('settings.models.localMemory.downloadSource')}
                className="task-route-select-trigger"
              >
                <SelectValue>{readingMemoryModelSources[source].name}</SelectValue>
              </SelectTrigger>
              <SelectContent className="theme-select-content">
                {Object.entries(readingMemoryModelSources).map(([id, item]) => (
                  <SelectItem key={id} value={id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
        )}
        <dl className="reading-memory-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd className={fact.mono ? 'is-mono' : undefined}>{fact.value}</dd>
            </div>
          ))}
        </dl>
        <SettingsRow
          title={t('settings.models.localMemory.projection')}
          description={
            <span>
              {t('settings.models.localMemory.projectionCoverage', {
                count: projection.coverage.projectedAssetCount,
                total: number(projection.coverage.eligibleAssetCount),
              })}
            </span>
          }
        >
          <StatusLabel tone={projectionTone[projection.state]}>
            {t(`settings.models.localMemory.projectionState.${projection.state}`)}
          </StatusLabel>
        </SettingsRow>
        <SettingsRow
          title={t('settings.models.localMemory.semantic')}
          description={
            <span>
              {t('settings.models.localMemory.semanticCoverage', {
                count: semantic.coverage.indexedEntryCount,
                total: number(semantic.coverage.eligibleEntryCount),
              })}
            </span>
          }
        >
          <StatusLabel tone={semantic.indexingPaused ? 'idle' : semanticTone[semantic.state]}>
            {t(`settings.models.localMemory.semanticState.${semantic.state}`)}
            {semantic.indexingPaused ? ` · ${t('settings.models.localMemory.paused')}` : ''}
          </StatusLabel>
        </SettingsRow>
        {modelAvailable || showRemove ? (
          <div className="reading-memory-actions">
            {modelAvailable ? (
              <>
                <Button
                  className="action-button"
                  variant="secondary"
                  disabled={!canIndex}
                  onClick={() => void run(semantic.indexingPaused ? 'resume' : 'pause')}
                >
                  {t(
                    semantic.indexingPaused
                      ? 'settings.models.localMemory.resume'
                      : 'settings.models.localMemory.pause',
                  )}
                </Button>
                <Button
                  className="action-button"
                  variant="secondary"
                  disabled={!canIndex}
                  onClick={() => void run('rebuild')}
                >
                  {t('settings.models.localMemory.rebuild')}
                </Button>
              </>
            ) : null}
            {showRemove ? (
              <Button
                className="action-button reading-memory-remove"
                variant="ghost"
                disabled={!canRemove}
                onClick={() => dispatch({ type: 'removeRequested' })}
              >
                <HugeiconsIcon icon={Delete02Icon} size={15} />
                {t('settings.models.localMemory.remove')}
              </Button>
            ) : null}
          </div>
        ) : null}
        {pending && pending !== 'download' ? (
          <p className="px-4 py-3 text-xs text-muted-foreground" role="status">
            {t('settings.models.localMemory.working')}
          </p>
        ) : null}
        {error === 'action' ? (
          <p className="px-4 py-3 text-sm text-destructive" role="alert">
            {t('settings.models.localMemory.actionFailed')}
          </p>
        ) : null}
        {error === 'load' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="m-0 text-sm text-destructive" role="alert">
              {t('settings.models.localMemory.loadFailed')}
            </p>
            <LoadRetry onRetry={() => void refresh()} />
          </div>
        ) : null}
      </SettingsGroup>
      <SettingsConfirmDialog
        open={removeConfirmationOpen}
        title={t('settings.models.localMemory.removeTitle')}
        description={t('settings.models.localMemory.removeDescription')}
        confirmLabel={t('settings.models.localMemory.remove')}
        cancelLabel={t('settings.confirm.cancel')}
        onCancel={() => dispatch({ type: 'removeDismissed' })}
        onConfirm={() => {
          dispatch({ type: 'removeDismissed' });
          void run('remove');
        }}
      />
    </>
  );
}

function LoadRetry({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Button className="action-button" variant="secondary" onClick={onRetry}>
      {t('settings.models.localMemory.refresh')}
    </Button>
  );
}
