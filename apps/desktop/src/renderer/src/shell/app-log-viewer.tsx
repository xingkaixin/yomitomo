import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Bug,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  MessageSquare,
  Package,
  Play,
  RefreshCw,
  Search,
  Tag,
  X,
} from 'lucide-react';
import thirdPartyNoticesRaw from '../../../../../../THIRD_PARTY_NOTICES.md?raw';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../components/ui/dialog';
import { IconButton } from '../components/ui/icon-button';
import { Input } from '../components/ui/input';
import {
  SettingsGroup,
  SettingsPage,
  SettingsRow,
  SettingsRowCopy,
  SettingsRowDescriptionTooltip,
  SettingsToggle,
} from '../settings/app-settings-kit';
import { appToast } from './app-toast';
import { normalizeUiLanguage, type AppSettings, type DesktopStore } from '@yomitomo/shared';
import type { AppInfo } from '../../../preload';
import type { AppUpdateState } from '../../../app-update-types';
import { useTranslation } from 'react-i18next';

type LicensePackage = {
  name: string;
  versions: string;
  license: string;
  homepage: string;
};

const githubUrl = 'https://github.com/xingkaixin/yomitomo';
const homepageUrl = 'https://yomitomo.app';
const feedbackUrl = 'https://github.com/xingkaixin/yomitomo/issues';
const thirdPartyPackages = parseThirdPartyNotices(thirdPartyNoticesRaw);
type AppT = ReturnType<typeof useTranslation>['t'];

// 开发用：注入「发现新版本」状态，无需重启。
// manual 走更新前弹窗（A 场景）；auto 只点亮常驻入口、不弹窗（自动检查场景）。
async function handleSimulatePreUpdate() {
  const desktop = window.yomitomoDesktop as Partial<typeof window.yomitomoDesktop> | undefined;
  if (typeof desktop?.simulateUpdateAvailable !== 'function') return;
  await desktop.simulateUpdateAvailable('manual');
}

async function handleSimulateAutoUpdate() {
  const desktop = window.yomitomoDesktop as Partial<typeof window.yomitomoDesktop> | undefined;
  if (typeof desktop?.simulateUpdateAvailable !== 'function') return;
  await desktop.simulateUpdateAvailable('auto');
}

export function AboutSettings({
  onStartOnboarding = () => undefined,
  settings = {},
  onStoreUpdated = () => undefined,
}: {
  onStartOnboarding?: () => void;
  settings?: AppSettings;
  onStoreUpdated?: (store: DesktopStore) => void;
}) {
  const { t } = useTranslation();
  const [appInfo, setAppInfo] = useState<AppInfo>({ desktopVersion: '' });
  const [updateState, setUpdateState] = useState<AppUpdateState | null>(null);
  const [devResetDone, setDevResetDone] = useState(false);
  const [licensesOpen, setLicensesOpen] = useState(false);
  const [developerModeSaving, setDeveloperModeSaving] = useState(false);

  useEffect(() => {
    const desktop = window.yomitomoDesktop as Partial<typeof window.yomitomoDesktop> | undefined;
    if (typeof desktop?.getAppInfo !== 'function') return;

    let mounted = true;
    void desktop.getAppInfo().then((nextInfo) => {
      if (mounted) setAppInfo(nextInfo);
    });
    if (typeof desktop.getUpdateStatus === 'function') {
      void desktop.getUpdateStatus().then((nextState) => {
        if (mounted) setUpdateState(nextState);
      });
    }
    const unsubscribe =
      typeof desktop.onUpdateStatus === 'function'
        ? desktop.onUpdateStatus((nextState) => {
            if (mounted) setUpdateState(nextState);
          })
        : undefined;

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  async function handleUpdateAction() {
    const desktop = window.yomitomoDesktop as Partial<typeof window.yomitomoDesktop> | undefined;
    const action = updateAction(updateState, t);
    const method = desktop?.[action.method];
    if (typeof method !== 'function') return;
    const nextState = await method();
    setUpdateState(nextState);
    if (action.method === 'checkForUpdates' && nextState.status === 'not-available') {
      appToast.success(t('about.updateToast.notAvailableTitle'), {
        description: t('about.updateToast.notAvailableDescription'),
      });
    }
  }

  async function toggleDeveloperMode() {
    const desktop = window.yomitomoDesktop as Partial<typeof window.yomitomoDesktop> | undefined;
    if (typeof desktop?.saveSettings !== 'function') return;
    setDeveloperModeSaving(true);
    try {
      const nextStore = await desktop.saveSettings({
        ...settings,
        developerModeEnabled: !settings.developerModeEnabled,
      });
      onStoreUpdated(nextStore);
    } finally {
      setDeveloperModeSaving(false);
    }
  }

  // 开发用：开发环境没有真实更新链路，把 lastSeenVersion 重置为旧值，
  // 重启后即可命中「更新后弹窗」判定，预览 B 场景效果。
  async function handleSimulateUpdate() {
    const desktop = window.yomitomoDesktop as Partial<typeof window.yomitomoDesktop> | undefined;
    if (typeof desktop?.saveSettings !== 'function') return;
    const nextStore = await desktop.saveSettings({ ...settings, lastSeenVersion: '0.0.0' });
    onStoreUpdated(nextStore);
    setDevResetDone(true);
  }

  const updateCopy = updateStateCopy(updateState, t);
  const updateButton = updateAction(updateState, t);
  const developerModeEnabled = Boolean(settings.developerModeEnabled);
  const resourceUrls = localizedResourceUrls(settings.uiLanguage);

  const resourceRows: Array<{
    icon: React.ReactNode;
    title: string;
    description: string;
    label: string;
    actionIcon: React.ReactNode;
    onAction: () => void;
  }> = [
    {
      icon: <FileText size={18} />,
      title: t('about.releaseNotes.title'),
      description: t('about.releaseNotes.description'),
      label: t('about.releaseNotes.label'),
      actionIcon: <ExternalLink size={16} />,
      onAction: () => openExternal(resourceUrls.releaseNotes),
    },
    {
      icon: <BookOpen size={18} />,
      title: t('about.docs.title'),
      description: t('about.docs.description'),
      label: t('about.docs.label'),
      actionIcon: <ExternalLink size={16} />,
      onAction: () => openExternal(resourceUrls.docs),
    },
    {
      icon: <ExternalLink size={18} />,
      title: t('about.github.title'),
      description: t('about.github.description'),
      label: t('about.github.label'),
      actionIcon: <ExternalLink size={16} />,
      onAction: () => openExternal(githubUrl),
    },
    {
      icon: <ExternalLink size={18} />,
      title: t('about.website.title'),
      description: t('about.website.description'),
      label: t('about.website.label'),
      actionIcon: <ExternalLink size={16} />,
      onAction: () => openExternal(resourceUrls.homepage),
    },
    {
      icon: <MessageSquare size={18} />,
      title: t('about.feedback.title'),
      description: t('about.feedback.description'),
      label: t('about.feedback.label'),
      actionIcon: <ExternalLink size={16} />,
      onAction: () => openExternal(feedbackUrl),
    },
    {
      icon: <Package size={18} />,
      title: t('about.licenses.title'),
      description: t('about.licenses.description', { count: thirdPartyPackages.length }),
      label: t('about.licenses.label'),
      actionIcon: <ChevronRight size={16} />,
      onAction: () => setLicensesOpen(true),
    },
  ];

  return (
    <SettingsPage
      trail={[t('about.trailSettings'), t('about.trailAbout')]}
      description={t('about.description')}
    >
      <SettingsGroup label={t('about.versionGroup')}>
        <SettingsRow
          leading={<Tag size={18} />}
          title={
            <>
              {t('about.desktop')}{' '}
              <span className="settings-version-tag">
                {formatVersion(appInfo.desktopVersion, t)}
              </span>
            </>
          }
          description={updateCopy}
        >
          <Button
            className={
              updateButton.busy
                ? 'action-button about-update-action is-loading'
                : 'action-button about-update-action'
            }
            disabled={updateButton.disabled}
            type="button"
            onClick={handleUpdateAction}
          >
            {updateButton.icon}
            {updateButton.label}
          </Button>
        </SettingsRow>
        {import.meta.env.DEV ? (
          <div className="settings-row about-update-dev">
            <Button className="action-button" type="button" onClick={handleSimulateUpdate}>
              {t('about.dev.simulateAfter')}
            </Button>
            <Button className="action-button" type="button" onClick={handleSimulatePreUpdate}>
              {t('about.dev.simulateBefore')}
            </Button>
            <Button className="action-button" type="button" onClick={handleSimulateAutoUpdate}>
              {t('about.dev.simulateAuto')}
            </Button>
            <p className="about-update-status">
              {devResetDone ? t('about.dev.resetDone') : t('about.dev.hint')}
            </p>
          </div>
        ) : null}
      </SettingsGroup>

      <SettingsGroup label={t('about.resourcesGroup')}>
        {resourceRows.map((row) => (
          <SettingsRowDescriptionTooltip description={row.description} key={row.title}>
            <button
              aria-label={`${row.label}. ${row.description}`}
              className="settings-row settings-row-button about-resource-row"
              type="button"
              onClick={row.onAction}
            >
              <span className="settings-row-leading">{row.icon}</span>
              <SettingsRowCopy
                title={row.title}
                description={row.description}
                infoMode="decorative"
              />
              <div className="settings-row-control">{row.actionIcon}</div>
            </button>
          </SettingsRowDescriptionTooltip>
        ))}
      </SettingsGroup>

      <SettingsGroup label={t('about.advancedGroup')}>
        <SettingsRow
          leading={<Play size={18} />}
          title={t('about.onboarding.title')}
          description={t('about.onboarding.description')}
        >
          <Button
            className="action-button about-link-action"
            type="button"
            onClick={onStartOnboarding}
          >
            {t('about.onboarding.action')}
            <Play size={15} />
          </Button>
        </SettingsRow>
        <SettingsRow
          leading={<Bug size={18} />}
          title={t('about.developerMode.title')}
          description={t('about.developerMode.description')}
        >
          <SettingsToggle
            checked={developerModeEnabled}
            disabled={developerModeSaving}
            label={t('about.developerMode.label')}
            onChange={toggleDeveloperMode}
          />
        </SettingsRow>
      </SettingsGroup>

      {licensesOpen ? <OpenSourceLicensesDialog onClose={() => setLicensesOpen(false)} /> : null}
    </SettingsPage>
  );
}

function OpenSourceLicensesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [expandedPackage, setExpandedPackage] = useState('');
  const visiblePackages = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return thirdPartyPackages;
    return thirdPartyPackages.filter((item) =>
      [item.name, item.versions, item.license].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [query]);

  return (
    <Dialog open onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogPortal>
        <DialogOverlay className="license-dialog-overlay">
          <DialogContent className="license-dialog">
            <header>
              <div>
                <DialogTitle id="license-dialog-title">{t('about.licenses.title')}</DialogTitle>
                <DialogDescription>
                  {t('about.licenses.dialogDescription', { count: thirdPartyPackages.length })}
                </DialogDescription>
              </div>
              <IconButton
                aria-label={t('about.licenses.close')}
                className="license-dialog-close"
                onClick={onClose}
              >
                <X size={20} />
              </IconButton>
            </header>

            <label className="license-search">
              <Search size={17} />
              <Input
                placeholder={t('about.licenses.searchPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <div className="license-list" role="list">
              <article className="license-package is-source" role="listitem">
                <div className="license-package-row">
                  <Package size={16} />
                  <strong>Yomitomo</strong>
                  <em>{t('about.licenses.source')}</em>
                  <span>MIT</span>
                </div>
              </article>
              {visiblePackages.map((item) => {
                const packageKey = licensePackageKey(item);
                const expanded = expandedPackage === packageKey;
                return (
                  <article className="license-package" key={packageKey} role="listitem">
                    <button
                      aria-expanded={expanded}
                      className="license-package-row"
                      type="button"
                      onClick={() => setExpandedPackage(expanded ? '' : packageKey)}
                    >
                      {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <strong>{item.name}</strong>
                      <em>{item.versions}</em>
                      <span>{item.license}</span>
                    </button>
                    {expanded ? (
                      <div className="license-package-detail">
                        <dl>
                          <div>
                            <dt>{t('about.licenses.package')}</dt>
                            <dd>{item.name}</dd>
                          </div>
                          <div>
                            <dt>{t('about.licenses.version')}</dt>
                            <dd>{item.versions}</dd>
                          </div>
                          <div>
                            <dt>{t('about.licenses.license')}</dt>
                            <dd>{item.license}</dd>
                          </div>
                        </dl>
                        {item.homepage ? (
                          <Button
                            className="action-button about-link-action"
                            type="button"
                            variant="secondary"
                            onClick={() => openExternal(item.homepage)}
                          >
                            Homepage
                            <ExternalLink size={15} />
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

function formatVersion(version: string, t: AppT) {
  return version ? `v${version}` : t('about.loading');
}

function localizedResourceUrls(language: unknown) {
  const normalized = normalizeUiLanguage(language);
  const prefix = normalized === 'en' ? '/en' : '';

  return {
    homepage: `${homepageUrl}${prefix}/`,
    docs: `${homepageUrl}${prefix}/docs/`,
    releaseNotes: `${homepageUrl}${prefix}/changelogs/`,
  };
}

function updateAction(
  state: AppUpdateState | null,
  t: AppT,
): {
  label: string;
  method: 'checkForUpdates' | 'downloadUpdate' | 'installUpdate';
  disabled: boolean;
  busy: boolean;
  icon: React.ReactNode;
} {
  if (!state) {
    return {
      label: t('about.updateAction.check'),
      method: 'checkForUpdates',
      disabled: true,
      busy: false,
      icon: <RefreshCw size={15} />,
    };
  }

  if (state.status === 'available') {
    return {
      label: t('about.updateAction.download'),
      method: 'downloadUpdate',
      disabled: false,
      busy: false,
      icon: <Download size={15} />,
    };
  }

  if (state.status === 'downloaded') {
    return {
      label: t('about.updateAction.install'),
      method: 'installUpdate',
      disabled: false,
      busy: false,
      icon: <RefreshCw size={15} />,
    };
  }

  const busy = state.status === 'checking' || state.status === 'downloading';
  return {
    label:
      state.status === 'downloading'
        ? `${Math.round(state.progress?.percent || 0)}%`
        : t('about.updateAction.check'),
    method: 'checkForUpdates',
    disabled: busy || state.status === 'unsupported',
    busy,
    icon: <RefreshCw size={15} />,
  };
}

function updateStateCopy(state: AppUpdateState | null, t: AppT) {
  if (!state) return t('about.updateState.loading');

  if (state.status === 'checking') return t('about.updateState.checking');
  if (state.status === 'available') {
    return t('about.updateState.available', {
      version: formatVersion(state.availableVersion || '', t),
    });
  }
  if (state.status === 'not-available') return t('about.updateState.notAvailable');
  if (state.status === 'downloading') {
    return t('about.updateState.downloading', {
      percent: `${Math.round(state.progress?.percent || 0)}%`,
    });
  }
  if (state.status === 'downloaded') return t('about.updateState.downloaded');
  if (state.status === 'error') {
    return updateStateMessage(state.message, t) || t('about.updateState.error');
  }
  if (state.status === 'unsupported') {
    return updateStateMessage(state.message, t) || t('about.updateState.unsupported');
  }
  return t('about.updateState.idle');
}

function updateStateMessage(message: string | undefined, t: AppT) {
  if (!message) return '';
  if (!/^UPDATE_[A-Z_]+$/.test(message)) return message;
  return t(`about.updateState.errors.${updateStateErrorKey(message)}`, { defaultValue: '' });
}

function updateStateErrorKey(message: string) {
  return message
    .replace(/^UPDATE_/, '')
    .toLowerCase()
    .replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function licensePackageKey(item: LicensePackage) {
  return [item.name, item.versions, item.license].join('::');
}

function openExternal(url: string) {
  const desktop = window.yomitomoDesktop as Partial<typeof window.yomitomoDesktop> | undefined;
  if (typeof desktop?.openUrl === 'function') {
    void desktop.openUrl(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

function parseThirdPartyNotices(raw: string): LicensePackage[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) => line.startsWith('| ') && !line.includes('| Package |') && !line.includes('| --- |'),
    )
    .map(parsePackageRow)
    .filter((item): item is LicensePackage => Boolean(item));
}

function parsePackageRow(line: string): LicensePackage | null {
  const cells = line
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
  if (cells.length !== 4) return null;
  return {
    name: cells[0] || '',
    versions: cells[1] || '',
    license: cells[2] || '',
    homepage: markdownLinkUrl(cells[3]),
  };
}

function markdownLinkUrl(value: string) {
  return value.match(/\((https?:\/\/[^)]+)\)/)?.[1] || '';
}
