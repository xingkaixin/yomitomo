import React, { useState } from 'react';
import { Check, Clipboard, ExternalLink } from 'lucide-react';
import type { ArticleRecord } from '@yomitomo/shared';
import { articleExternalUrl, isImageAvatar, isSvgAvatar } from './app-utils';
import { Label } from './components/ui/label';

export function CopyIconButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      aria-label={copied ? '已复制' : label}
      className={copied ? 'copy-icon-button is-copied' : 'copy-icon-button'}
      type="button"
      onClick={copy}
    >
      {copied ? <Check size={15} /> : <Clipboard size={14} />}
    </button>
  );
}

export function OpenArticleButton({ article }: { article: ArticleRecord }) {
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

  return (
    <button
      aria-label="在浏览器中打开原始链接"
      className="open-article-button"
      disabled={!url}
      type="button"
      title={url || '原文链接不可用'}
      onClick={open}
    >
      <ExternalLink size={16} />
      <span>打开原始链接</span>
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

export function Field({
  id,
  label,
  description,
  descriptionId,
  className = '',
  children,
}: {
  id?: string;
  label: string;
  description?: string;
  descriptionId?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const fallbackId = React.useId();
  const labelId = id ? `${id}-label` : `${fallbackId}-label`;
  const resolvedDescriptionId =
    descriptionId || (id && description ? `${id}-description` : undefined);

  return (
    <div className={`grid gap-2 ${className}`}>
      <div className="field-copy">
        <Label htmlFor={id} id={labelId}>
          {label}
        </Label>
        {description ? <p id={resolvedDescriptionId}>{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
