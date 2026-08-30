import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReadingMemoryStatusSnapshot } from '../../../ipc-contract';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { getDesktopApi } from '../shell/app-desktop-api';
import { SettingsConfirmDialog } from './app-settings-confirm-dialog';
import { SettingsGroup, SettingsRow } from './app-settings-kit';

type ModelAction = 'download' | 'cancel' | 'remove' | 'pause' | 'resume' | 'rebuild';
type ModelSettingsSession = {
  revision: number;
  operation: { action: ModelAction } | null;
  refresh: () => Promise<void>;
};

function useReadingMemoryModelStatus() {
  const [snapshot, setSnapshot] = useState<ReadingMemoryStatusSnapshot | null>(null);
  const [error, setError] = useState<'load' | 'action' | null>(null);
  const [pending, setPending] = useState<ModelAction | null>(null);
  const sessionRef = useRef<ModelSettingsSession | null>(null);

  useEffect(() => {
    const session: ModelSettingsSession = { revision: 0, operation: null, refresh };
    sessionRef.current = session;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      const revision = ++session.revision;
      try {
        const next = await getDesktopApi().readingMemory.model.status();
        if (sessionRef.current !== session || revision !== session.revision) return;
        setSnapshot(next);
        setError((current) => (current === 'load' ? null : current));
      } catch {
        if (sessionRef.current === session && revision === session.revision) setError('load');
      }
    }

    async function poll() {
      await refresh();
      if (sessionRef.current === session) timer = setTimeout(() => void poll(), 1_000);
    }

    void poll();
    return () => {
      clearTimeout(timer);
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, []);

  async function run(action: ModelAction) {
    const session = sessionRef.current;
    if (!session) return;
    if (session.operation && !(action === 'cancel' && session.operation.action === 'download')) {
      return;
    }
    const operation = { action };
    session.operation = operation;
    session.revision += 1;
    setPending(action);
    setError(null);
    try {
      const { model, index } = getDesktopApi().readingMemory;
      const actions = {
        download: model.download,
        cancel: model.cancel,
        remove: model.remove,
        pause: index.pause,
        resume: index.resume,
        rebuild: index.rebuild,
      };
      const next = await actions[action]();
      if (sessionRef.current !== session || session.operation !== operation) return;
      session.revision += 1;
      setSnapshot(next);
      setError(null);
    } catch {
      if (sessionRef.current !== session || session.operation !== operation) return;
      session.revision += 1;
      setError('action');
    } finally {
      if (sessionRef.current === session && session.operation === operation) {
        session.operation = null;
        setPending(null);
      }
    }
  }

  return { snapshot, error, pending, run, refresh: () => sessionRef.current?.refresh() };
}

export function ReadingMemoryModelSettings() {
  const { t, i18n } = useTranslation();
  const { snapshot, error, pending, run, refresh } = useReadingMemoryModelStatus();
  const [removeConfirmationOpen, setRemoveConfirmationOpen] = useState(false);
  const model = snapshot?.model;
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

  return (
    <>
      <SettingsGroup
        label={t('settings.models.localMemory.title')}
        note={t('settings.models.localMemory.description')}
        cardProps={{ role: 'region', 'aria-label': t('settings.models.localMemory.title') }}
      >
        {!snapshot ? (
          <p className="px-4 py-3 text-sm text-muted-foreground" role="status">
            {error
              ? t('settings.models.localMemory.loadFailed')
              : t('settings.models.localMemory.loading')}
          </p>
        ) : (
          <>
            <SettingsRow
              title={t('settings.models.localMemory.model')}
              description={
                <span className="font-mono text-xs break-all">{snapshot.model.internalId}</span>
              }
              className="flex-wrap"
            >
              <Badge variant="outline" role="status">
                {t(`settings.models.localMemory.lifecycle.${snapshot.model.status}`)}
              </Badge>
              {downloading ? (
                <Button
                  className="action-button"
                  variant="secondary"
                  disabled={busy && pending !== 'download'}
                  onClick={() => void run('cancel')}
                >
                  {t('settings.models.localMemory.cancelDownload')}
                </Button>
              ) : snapshot.model.status !== 'available' ? (
                <Button
                  className="action-button"
                  disabled={
                    busy ||
                    error === 'load' ||
                    snapshot.model.status === 'checking' ||
                    snapshot.model.failure === 'unsupported-platform'
                  }
                  onClick={() => void run('download')}
                >
                  {t(
                    snapshot.model.downloadedBytes > 0
                      ? 'settings.models.localMemory.resumeDownload'
                      : 'settings.models.localMemory.download',
                  )}
                </Button>
              ) : null}
            </SettingsRow>
            <div className="space-y-3 px-4 py-3">
              <dl className="space-y-3 text-xs">
                {[
                  [
                    t('settings.models.localMemory.downloadSize'),
                    bytes(snapshot.model.downloadSizeBytes),
                  ],
                  [t('settings.models.localMemory.source'), snapshot.model.sourceUrl],
                  [t('settings.models.localMemory.directory'), snapshot.model.directory],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3"
                  >
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="m-0 select-text font-mono leading-relaxed break-all">{value}</dd>
                  </div>
                ))}
              </dl>
              {downloading ? (
                <div className="space-y-2">
                  <progress
                    className="block h-1.5 w-full accent-primary"
                    aria-label={t('settings.models.localMemory.downloadProgress', {
                      downloaded: bytes(snapshot.model.downloadedBytes),
                      total: bytes(snapshot.model.downloadSizeBytes),
                    })}
                    max={Math.max(snapshot.model.downloadSizeBytes, 1)}
                    value={snapshot.model.downloadedBytes}
                  />
                  <p className="m-0 text-xs text-muted-foreground tabular-nums">
                    {t('settings.models.localMemory.downloadProgress', {
                      downloaded: bytes(snapshot.model.downloadedBytes),
                      total: bytes(snapshot.model.downloadSizeBytes),
                    })}
                  </p>
                </div>
              ) : snapshot.model.status !== 'available' && snapshot.model.downloadedBytes > 0 ? (
                <p className="m-0 text-xs text-muted-foreground">
                  {t('settings.models.localMemory.retainedProgress', {
                    bytes: bytes(snapshot.model.downloadedBytes),
                  })}
                </p>
              ) : null}
              {snapshot.model.failure ? (
                <p className="m-0 text-sm text-destructive" role="alert">
                  {t(`settings.models.localMemory.failure.${snapshot.model.failure}`)}
                </p>
              ) : null}
            </div>
            <SettingsRow
              title={t('settings.models.localMemory.projection')}
              description={
                <span>
                  {t('settings.models.localMemory.projectionCoverage', {
                    count: snapshot.projection.coverage.projectedAssetCount,
                    total: number(snapshot.projection.coverage.eligibleAssetCount),
                  })}
                </span>
              }
              className="flex-wrap"
            >
              <span className="text-xs text-muted-foreground">
                {t(`settings.models.localMemory.projectionState.${snapshot.projection.state}`)}
              </span>
            </SettingsRow>
            <SettingsRow
              title={t('settings.models.localMemory.semantic')}
              description={
                <span>
                  {t('settings.models.localMemory.semanticCoverage', {
                    count: snapshot.semantic.coverage.indexedEntryCount,
                    total: number(snapshot.semantic.coverage.eligibleEntryCount),
                  })}
                </span>
              }
              className="flex-wrap"
            >
              <span className="text-xs text-muted-foreground">
                {t(`settings.models.localMemory.semanticState.${snapshot.semantic.state}`)}
                {snapshot.semantic.indexingPaused
                  ? ` · ${t('settings.models.localMemory.paused')}`
                  : ''}
              </span>
            </SettingsRow>
            <div className="space-y-3 px-4 py-3">
              <dl className="space-y-1 text-xs text-muted-foreground">
                <div className="flex flex-wrap gap-x-3">
                  <dt>{t('settings.models.localMemory.modelVersion')}</dt>
                  <dd className="m-0 font-mono break-all">{snapshot.semantic.modelVersion}</dd>
                </div>
                <div className="flex flex-wrap gap-x-3">
                  <dt>{t('settings.models.localMemory.queryModelVersion')}</dt>
                  <dd className="m-0 font-mono break-all">
                    {snapshot.semantic.queryModelVersion ?? '—'}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="action-button"
                  variant="secondary"
                  disabled={!canIndex}
                  onClick={() => void run(snapshot.semantic.indexingPaused ? 'resume' : 'pause')}
                >
                  {t(
                    snapshot.semantic.indexingPaused
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
                <Button
                  className="action-button"
                  variant="ghost"
                  disabled={!canRemove}
                  onClick={() => setRemoveConfirmationOpen(true)}
                >
                  {t('settings.models.localMemory.remove')}
                </Button>
              </div>
            </div>
          </>
        )}
        {pending ? (
          <p className="px-4 py-3 text-xs text-muted-foreground" role="status">
            {t('settings.models.localMemory.working')}
          </p>
        ) : null}
        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            {snapshot || error === 'action' ? (
              <p className="m-0 text-sm text-destructive" role="alert">
                {t(
                  error === 'load'
                    ? 'settings.models.localMemory.loadFailed'
                    : 'settings.models.localMemory.actionFailed',
                )}
              </p>
            ) : null}
            {error === 'load' ? (
              <Button className="action-button" variant="secondary" onClick={() => void refresh()}>
                {t('settings.models.localMemory.refresh')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </SettingsGroup>
      <SettingsConfirmDialog
        open={removeConfirmationOpen}
        title={t('settings.models.localMemory.removeTitle')}
        description={t('settings.models.localMemory.removeDescription')}
        confirmLabel={t('settings.models.localMemory.remove')}
        cancelLabel={t('settings.confirm.cancel')}
        onCancel={() => setRemoveConfirmationOpen(false)}
        onConfirm={() => {
          setRemoveConfirmationOpen(false);
          void run('remove');
        }}
      />
    </>
  );
}
