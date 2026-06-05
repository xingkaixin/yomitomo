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
import { Input } from '../components/ui/input';
import {
  SettingsGroup,
  SettingsPage,
  SettingsRow,
  SettingsToggle,
} from '../settings/app-settings-kit';
import type { AppSettings, DesktopStore } from '@yomitomo/shared';
import type { AppInfo } from '../../../preload';
import type { AppUpdateState } from '../../../app-update-types';

type LicensePackage = {
  name: string;
  versions: string;
  license: string;
  homepage: string;
};

const githubUrl = 'https://github.com/xingkaixin/yomitomo';
const homepageUrl = 'https://yomitomo.app';
const releasesUrl = 'https://github.com/xingkaixin/yomitomo/releases';
const feedbackUrl = 'https://github.com/xingkaixin/yomitomo/issues';
const thirdPartyPackages = parseThirdPartyNotices(thirdPartyNoticesRaw);

// 开发用：注入「发现新版本」状态，即时弹出更新前弹窗（A 场景），无需重启。
async function handleSimulatePreUpdate() {
  const desktop = window.yomitomoDesktop as Partial<typeof window.yomitomoDesktop> | undefined;
  if (typeof desktop?.simulateUpdateAvailable !== 'function') return;
  await desktop.simulateUpdateAvailable();
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
    const action = updateAction(updateState);
    const method = desktop?.[action.method];
    if (typeof method !== 'function') return;
    const nextState = await method();
    setUpdateState(nextState);
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

  const updateCopy = updateStateCopy(updateState);
  const updateButton = updateAction(updateState);
  const developerModeEnabled = Boolean(settings.developerModeEnabled);

  const resourceRows: Array<{
    icon: React.ReactNode;
    title: string;
    description: string;
    label: string;
    onAction: () => void;
  }> = [
    {
      icon: <FileText size={18} />,
      title: '更新记录',
      description: '查看版本发布说明和主要变化。',
      label: '查看更新记录',
      onAction: () => openExternal(releasesUrl),
    },
    {
      icon: <BookOpen size={18} />,
      title: 'GitHub 项目',
      description: '打开源码主页、README 和项目资料。',
      label: '打开 GitHub',
      onAction: () => openExternal(githubUrl),
    },
    {
      icon: <ExternalLink size={18} />,
      title: '官网',
      description: '打开 Yomitomo 官网入口。',
      label: '打开官网',
      onAction: () => openExternal(homepageUrl),
    },
    {
      icon: <MessageSquare size={18} />,
      title: '反馈入口',
      description: '提交问题、建议和可复现信息。',
      label: '提交反馈',
      onAction: () => openExternal(feedbackUrl),
    },
    {
      icon: <Package size={18} />,
      title: '开源许可证',
      description: `Yomitomo 使用 MIT，第三方组件包含 ${thirdPartyPackages.length} 个开源项目。`,
      label: '查看许可证',
      onAction: () => setLicensesOpen(true),
    },
  ];

  return (
    <SettingsPage trail={['设置', '关于']} description="查看版本、更新、文档、反馈和开源许可证。">
      <SettingsGroup label="版本">
        <SettingsRow
          leading={<Tag size={18} />}
          title={
            <>
              桌面端{' '}
              <span className="settings-version-tag">{formatVersion(appInfo.desktopVersion)}</span>
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
              模拟版本更新（更新后弹窗）
            </Button>
            <Button className="action-button" type="button" onClick={handleSimulatePreUpdate}>
              模拟发现新版本（更新前弹窗）
            </Button>
            <p className="about-update-status">
              {devResetDone
                ? '已重置更新标记，重启应用即可预览「已更新」弹窗。'
                : '开发用：「更新后」重置标记后重启预览；「更新前」点击即时弹出。'}
            </p>
          </div>
        ) : null}
      </SettingsGroup>

      <SettingsGroup label="资源">
        {resourceRows.map((row) => (
          <button
            aria-label={row.label}
            className="settings-row settings-row-button"
            key={row.title}
            type="button"
            onClick={row.onAction}
          >
            <span className="settings-row-leading">{row.icon}</span>
            <div className="settings-row-copy">
              <strong>{row.title}</strong>
              <p>{row.description}</p>
            </div>
            <div className="settings-row-control">
              <ExternalLink size={16} />
            </div>
          </button>
        ))}
      </SettingsGroup>

      <SettingsGroup label="高级">
        <SettingsRow
          leading={<Play size={18} />}
          title="重新查看 onboarding"
          description="重新打开首次引导流程。"
        >
          <Button
            className="action-button about-link-action"
            type="button"
            onClick={onStartOnboarding}
          >
            启动 onboarding
            <Play size={15} />
          </Button>
        </SettingsRow>
        <SettingsRow
          leading={<Bug size={18} />}
          title="开发者模式"
          description="显示调试入口、内部状态和开发辅助工具。"
        >
          <SettingsToggle
            checked={developerModeEnabled}
            disabled={developerModeSaving}
            label="开发者模式"
            onChange={toggleDeveloperMode}
          />
        </SettingsRow>
      </SettingsGroup>

      {licensesOpen ? <OpenSourceLicensesDialog onClose={() => setLicensesOpen(false)} /> : null}
    </SettingsPage>
  );
}

function OpenSourceLicensesDialog({ onClose }: { onClose: () => void }) {
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

  useEffect(() => {
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', closeWithEscape);
    return () => window.removeEventListener('keydown', closeWithEscape);
  }, [onClose]);

  return (
    <div
      className="license-dialog-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="license-dialog-title"
        aria-modal="true"
        className="license-dialog"
        role="dialog"
      >
        <header>
          <div>
            <h2 id="license-dialog-title">开源许可证</h2>
            <p>本应用使用了 {thirdPartyPackages.length} 个第三方开源组件。</p>
          </div>
          <button
            aria-label="关闭开源许可证"
            className="license-dialog-close"
            type="button"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        <label className="license-search">
          <Search size={17} />
          <Input
            placeholder="搜索软件包或许可证..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="license-list" role="list">
          <article className="license-package is-source" role="listitem">
            <div className="license-package-row">
              <Package size={16} />
              <strong>Yomitomo</strong>
              <em>源码</em>
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
                        <dt>软件包</dt>
                        <dd>{item.name}</dd>
                      </div>
                      <div>
                        <dt>版本</dt>
                        <dd>{item.versions}</dd>
                      </div>
                      <div>
                        <dt>许可证</dt>
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
      </section>
    </div>
  );
}

function formatVersion(version: string) {
  return version ? `v${version}` : '读取中';
}

function updateAction(state: AppUpdateState | null): {
  label: string;
  method: 'checkForUpdates' | 'downloadUpdate' | 'installUpdate';
  disabled: boolean;
  busy: boolean;
  icon: React.ReactNode;
} {
  if (!state) {
    return {
      label: '检查更新',
      method: 'checkForUpdates',
      disabled: true,
      busy: false,
      icon: <RefreshCw size={15} />,
    };
  }

  if (state.status === 'available') {
    return {
      label: '下载更新',
      method: 'downloadUpdate',
      disabled: false,
      busy: false,
      icon: <Download size={15} />,
    };
  }

  if (state.status === 'downloaded') {
    return {
      label: '重启安装',
      method: 'installUpdate',
      disabled: false,
      busy: false,
      icon: <RefreshCw size={15} />,
    };
  }

  const busy = state.status === 'checking' || state.status === 'downloading';
  return {
    label:
      state.status === 'downloading' ? `${Math.round(state.progress?.percent || 0)}%` : '检查更新',
    method: 'checkForUpdates',
    disabled: busy || state.status === 'unsupported',
    busy,
    icon: <RefreshCw size={15} />,
  };
}

function updateStateCopy(state: AppUpdateState | null) {
  if (!state) return '正在读取更新状态。';

  if (state.status === 'checking') return '正在检查 GitHub Releases 上的新版本。';
  if (state.status === 'available') {
    return `发现 ${formatVersion(state.availableVersion || '')}，可下载安装。`;
  }
  if (state.status === 'not-available') return '当前已是最新版本。';
  if (state.status === 'downloading') {
    return `正在下载更新，已完成 ${Math.round(state.progress?.percent || 0)}%。`;
  }
  if (state.status === 'downloaded') return '更新已下载，重启应用后完成安装。';
  if (state.status === 'error') return state.message || '更新失败，请稍后重试。';
  if (state.status === 'unsupported') return state.message || '当前环境不支持自动更新。';
  return '可手动检查 GitHub Releases 上的新版本。';
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
