import React, { useState } from 'react';
import { Check, Clipboard, ExternalLink } from 'lucide-react';
import type { ArticleRecord } from '@yomitomo/shared';
import { articleExternalUrl, isImageAvatar, isSvgAvatar } from './app-utils';
import { IconButton } from '../components/ui/icon-button';
import { useTranslation } from 'react-i18next';

export function CopyIconButton({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <IconButton
      aria-label={copied ? t('common.copied') : label}
      className={copied ? 'copy-icon-button is-copied' : 'copy-icon-button'}
      data-tooltip={copied ? t('common.copied') : label}
      onClick={copy}
    >
      {copied ? <Check size={15} /> : <Clipboard size={14} />}
    </IconButton>
  );
}

export function OpenArticleButton({
  article,
  iconOnly = false,
}: {
  article: ArticleRecord;
  iconOnly?: boolean;
}) {
  const { t } = useTranslation();
  const url = articleExternalUrl(article);

  async function open() {
    if (!url) return;
    const desktop = window.yomitomoDesktop as typeof window.yomitomoDesktop & {
      openUrl?: (url: string) => Promise<void>;
    };
    if (typeof desktop?.openUrl === 'function') {
      try {
        await desktop.openUrl(url);
        return;
      } catch {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  if (iconOnly) {
    return (
      <IconButton
        aria-label={t('common.openOriginalLink')}
        className="open-article-button is-icon-only"
        disabled={!url}
        title={url ? t('common.openOriginalLink') : t('common.originalLinkUnavailable')}
        onClick={open}
      >
        <ExternalLink size={16} />
      </IconButton>
    );
  }

  return (
    <button
      aria-label={t('common.openOriginalLink')}
      className="open-article-button"
      disabled={!url}
      type="button"
      title={url ? t('common.openOriginalLink') : t('common.originalLinkUnavailable')}
      onClick={open}
    >
      <ExternalLink size={16} />
      <span>{t('common.openOriginalLink')}</span>
    </button>
  );
}

export function PanelHeader({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="panel-header">
      <div className="flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
          {icon}
        </div>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {action}
    </header>
  );
}

export function AvatarImage({
  value,
  fallback,
  className = 'size-10',
}: {
  value: string;
  fallback: string;
  className?: string;
}) {
  const image = isImageAvatar(value);
  const svg = isSvgAvatar(value);
  const classes = ['avatar-image', className, image ? 'is-image' : '', svg ? 'is-svg' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes}>
      {image ? <img alt="" src={value} /> : <span>{value || fallback}</span>}
    </span>
  );
}
