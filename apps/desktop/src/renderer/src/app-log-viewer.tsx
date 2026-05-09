import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Info,
  MessageSquare,
  Package,
  Play,
  Search,
  Tag,
  X,
} from 'lucide-react';
import thirdPartyNoticesRaw from '../../../../../THIRD_PARTY_NOTICES.md?raw';
import { PanelHeader } from './app-ui';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import type { AppInfo, PairingConnectionStatus } from '../../preload';

type LicensePackage = {
  name: string;
  versions: string;
  license: string;
  homepage: string;
};

const docsUrl = 'https://github.com/xingkaixin/yomitomo#readme';
const releasesUrl = 'https://github.com/xingkaixin/yomitomo/releases';
const feedbackUrl = 'https://github.com/xingkaixin/yomitomo/issues';
const thirdPartyPackages = parseThirdPartyNotices(thirdPartyNoticesRaw);

export function AboutSettings({
  onStartOnboarding = () => undefined,
  pairingConnectionStatus,
}: {
  onStartOnboarding?: () => void;
  pairingConnectionStatus?: PairingConnectionStatus;
}) {
  const [appInfo, setAppInfo] = useState<AppInfo>({ desktopVersion: '' });
  const [licensesOpen, setLicensesOpen] = useState(false);
  const extensionVersion = extensionVersionView(pairingConnectionStatus);

  useEffect(() => {
    const desktop = window.yomitomoDesktop as Partial<typeof window.yomitomoDesktop> | undefined;
    if (typeof desktop?.getAppInfo !== 'function') return;

    let mounted = true;
    desktop.getAppInfo().then((nextInfo) => {
      if (mounted) setAppInfo(nextInfo);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="settings-panel">
      <PanelHeader
        icon={<Info size={20} />}
        title="关于"
        description="查看版本、更新、文档、反馈和开源许可证。"
      />
      <div className="about-grid">
        <section className="about-card about-version-card" aria-labelledby="about-version-title">
          <div className="about-card-heading">
            <span>
              <Tag size={18} />
            </span>
            <div>
              <h3 id="about-version-title">应用版本</h3>
              <p>桌面端和已配对浏览器扩展的版本信息。</p>
            </div>
          </div>
          <div className="about-version-list">
            <VersionRow label="桌面端" value={formatVersion(appInfo.desktopVersion)} />
            <VersionRow
              label="浏览器扩展"
              value={extensionVersion.value}
              detail={extensionVersion.detail}
            />
          </div>
        </section>

        <AboutActionCard
          icon={<FileText size={18} />}
          title="更新记录"
          description="查看版本发布说明和主要变化。"
          actionLabel="查看更新记录"
          onAction={() => openExternal(releasesUrl)}
        />
        <AboutActionCard
          icon={<BookOpen size={18} />}
          title="官网 / 文档"
          description="打开项目文档、使用说明和源码主页。"
          actionLabel="打开文档"
          onAction={() => openExternal(docsUrl)}
        />
        <AboutActionCard
          icon={<MessageSquare size={18} />}
          title="反馈入口"
          description="提交问题、建议和可复现信息。"
          actionLabel="提交反馈"
          onAction={() => openExternal(feedbackUrl)}
        />
        <AboutActionCard
          icon={<Play size={18} />}
          title="初次设置流程"
          description="从第一页重新打开 onboarding，用于检查身份、模型和内置文章流程。"
          actionLabel="启动 onboarding"
          actionIcon={<Play size={15} />}
          onAction={onStartOnboarding}
        />
        <AboutActionCard
          icon={<Package size={18} />}
          title="开源许可证"
          description={`Yomitomo 使用 Apache-2.0，生产依赖包含 ${thirdPartyPackages.length} 个开源软件包。`}
          actionLabel="查看许可证"
          onAction={() => setLicensesOpen(true)}
        />
      </div>
      {licensesOpen ? <OpenSourceLicensesDialog onClose={() => setLicensesOpen(false)} /> : null}
    </div>
  );
}

function VersionRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="about-version-row">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <em>{detail}</em> : null}
    </div>
  );
}

function AboutActionCard({
  icon,
  title,
  description,
  actionLabel,
  actionIcon = <ExternalLink size={15} />,
  onAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  actionIcon?: React.ReactNode;
  onAction: () => void;
}) {
  return (
    <section className="about-card">
      <div className="about-card-heading">
        <span>{icon}</span>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      <Button className="action-button about-link-action" type="button" onClick={onAction}>
        {actionLabel}
        {actionIcon}
      </Button>
    </section>
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
            <p>本应用使用了 {thirdPartyPackages.length} 个开源软件包。</p>
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
              <span>Apache-2.0</span>
            </div>
          </article>
          {visiblePackages.map((item) => {
            const expanded = expandedPackage === item.name;
            return (
              <article className="license-package" key={item.name} role="listitem">
                <button
                  aria-expanded={expanded}
                  className="license-package-row"
                  type="button"
                  onClick={() => setExpandedPackage(expanded ? '' : item.name)}
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

function extensionVersionView(status: PairingConnectionStatus | undefined) {
  const versions = status?.extensionVersions?.filter(Boolean) || [];
  if (versions.length > 0) {
    return {
      value: versions.map(formatVersion).join(', '),
      detail: '当前配对版本',
    };
  }

  if (status?.lastExtensionVersion) {
    return {
      value: formatVersion(status.lastExtensionVersion),
      detail: '当前配对版本',
    };
  }

  return {
    value: '还未配对',
    detail: '在浏览器扩展输入桌面端配对码后显示',
  };
}

function formatVersion(version: string) {
  return version ? `v${version}` : '读取中';
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
