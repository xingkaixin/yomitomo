import React, { useEffect, useMemo, useState } from 'react';
import type { ArticleSummaryRecord } from '@yomitomo/shared';

type ArticleBookStyle = React.CSSProperties & {
  '--book-from': string;
  '--book-to': string;
  '--book-text': string;
  '--book-accent': string;
  '--book-line': string;
  '--book-line-faint': string;
  '--book-spine-gradient': string;
  '--book-reflection': string;
  '--book-cover-shadow': string;
  '--book-title-scale': string;
  '--book-author-scale': string;
  '--book-title-letter-spacing': string;
  '--book-author-letter-spacing': string;
  '--book-cover-font-family': string;
};

const BOOK_COVER_PALETTES = [
  { from: '#1a5c2a', to: '#0d3518', text: '#ffffff', accent: '#2a8c42', mode: 'dark' },
  { from: '#1a3a5c', to: '#0d1f35', text: '#ffffff', accent: '#2a6a8c', mode: 'dark' },
  { from: '#5c1a2a', to: '#350d18', text: '#ffffff', accent: '#8c2a42', mode: 'dark' },
  { from: '#4a1a5c', to: '#2b0d35', text: '#ffffff', accent: '#7a2a8c', mode: 'dark' },
  { from: '#5c4a1a', to: '#352b0d', text: '#ffffff', accent: '#8c7a2a', mode: 'dark' },
  { from: '#1a5c5c', to: '#0d3535', text: '#ffffff', accent: '#2a8c8c', mode: 'dark' },
  { from: '#3d1a1a', to: '#230d0d', text: '#ffffff', accent: '#6d2a2a', mode: 'dark' },
  { from: '#1a1a5c', to: '#0d0d35', text: '#ffffff', accent: '#2a2a8c', mode: 'dark' },
  { from: '#2d4a3a', to: '#162518', text: '#ffffff', accent: '#4a7a5a', mode: 'dark' },
  { from: '#3a3a3a', to: '#1a1a1a', text: '#ffffff', accent: '#5a5a5a', mode: 'dark' },
  { from: '#e8f0e4', to: '#d0e2c8', text: '#1a3318', accent: '#a8cca0', mode: 'light' },
  { from: '#e4ecf5', to: '#c8d8ea', text: '#162a42', accent: '#92b4d4', mode: 'light' },
  { from: '#f5e8e4', to: '#ead0c8', text: '#3e1810', accent: '#d4a092', mode: 'light' },
  { from: '#f0e4f5', to: '#e0c8ea', text: '#2e1240', accent: '#c0a0d4', mode: 'light' },
  { from: '#f5f0e4', to: '#eae0c8', text: '#3a2e10', accent: '#d4c892', mode: 'light' },
  { from: '#e4f5f5', to: '#c8eaea', text: '#103a3a', accent: '#92d4d4', mode: 'light' },
  { from: '#f5e4e4', to: '#eac8c8', text: '#3e1010', accent: '#d49292', mode: 'light' },
  { from: '#ebebf5', to: '#d4d4ea', text: '#18184a', accent: '#9898c8', mode: 'light' },
  { from: '#faf6f0', to: '#f0e8d8', text: '#3a3020', accent: '#c8b898', mode: 'light' },
  { from: '#f2f2f2', to: '#e0e0e0', text: '#222222', accent: '#aaaaaa', mode: 'light' },
  { from: '#fdf8f0', to: '#f5ead5', text: '#4a3520', accent: '#d4b880', mode: 'light' },
  { from: '#eef5f0', to: '#d5eadc', text: '#1a3a28', accent: '#88bba0', mode: 'light' },
] as const;

const articleCoverCache = new Map<string, string | null>();

export function ArticleBook({ article }: { article: ArticleSummaryRecord }) {
  const coverUrl = useArticleCover(article);
  const visual = useMemo(() => articleBookVisual(article, coverUrl), [article, coverUrl]);

  return (
    <span
      aria-hidden="true"
      className={visual.nativeCover ? 'article-book is-native-cover' : 'article-book'}
      style={visual.style}
    >
      <span className="article-book-ground-shadow" />
      <span className="article-book-scene">
        <span className="article-book-cover">
          {visual.imageUrl ? (
            <img
              alt=""
              className="article-book-cover-image"
              src={visual.imageUrl}
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          ) : null}
          <span className="article-book-cover-spine" />
          <span className="article-book-cover-top-rule" />
          <span className="article-book-cover-copy">
            <strong>{visual.title}</strong>
          </span>
          <span className="article-book-cover-bottom-rule" />
          <span className="article-book-cover-author">
            {visual.bylineLabel ? <em>{visual.bylineLabel}</em> : null}
          </span>
          <span className="article-book-cover-texture" />
          <span className="article-book-cover-reflection" />
        </span>
      </span>
    </span>
  );
}

function useArticleCover(article: ArticleSummaryRecord) {
  const directCoverUrl = safeHttpUrl(article.leadImageUrl);
  const [coverUrl, setCoverUrl] = useState<string | undefined>(directCoverUrl);

  useEffect(() => {
    const nextDirectCoverUrl = safeHttpUrl(article.leadImageUrl);
    if (nextDirectCoverUrl || article.sourceType !== 'ebook') {
      setCoverUrl(nextDirectCoverUrl);
      return;
    }

    const cached = articleCoverCache.get(article.id);
    if (cached !== undefined) {
      setCoverUrl(cached || undefined);
      return;
    }

    let cancelled = false;
    void window.yomitomoDesktop
      ?.getArticleCover(article.id)
      .then((value) => {
        const loadedUrl = safeHttpUrl(value) || null;
        articleCoverCache.set(article.id, loadedUrl);
        if (!cancelled) setCoverUrl(loadedUrl || undefined);
      })
      .catch(() => {
        articleCoverCache.set(article.id, null);
      });

    return () => {
      cancelled = true;
    };
  }, [article.id, article.leadImageUrl, article.sourceType]);

  return coverUrl;
}

function articleBookVisual(article: ArticleSummaryRecord, coverUrl?: string) {
  const seed = stableHash(
    [article.id, article.canonicalUrl, article.title, article.siteName, article.contentHash].join(
      '|',
    ),
  );
  const palette = BOOK_COVER_PALETTES[seed % BOOK_COVER_PALETTES.length];
  const imageUrl = coverUrl;
  const nativeCover = article.sourceType === 'ebook' && Boolean(imageUrl);
  const bylineLabel = normalizeLabel(article.byline || '');
  const hasCjkTitle = /[\u3400-\u9fff]/.test(article.title);
  const isLight = palette.mode === 'light';
  const style: ArticleBookStyle = {
    '--book-from': palette.from,
    '--book-to': palette.to,
    '--book-text': palette.text,
    '--book-accent': palette.accent,
    '--book-line': isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.25)',
    '--book-line-faint': isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.18)',
    '--book-spine-gradient': isLight
      ? `linear-gradient(180deg, ${palette.accent}66 0%, ${palette.accent}18 100%)`
      : `linear-gradient(180deg, ${palette.accent}88 0%, ${palette.accent}22 100%)`,
    '--book-reflection': isLight
      ? 'linear-gradient(180deg, rgba(255, 255, 255, 0.35) 0%, transparent 100%)'
      : 'linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, transparent 100%)',
    '--book-cover-shadow': isLight
      ? '6px 6px 20px rgba(0, 0, 0, 0.15), 1px 1px 6px rgba(0, 0, 0, 0.08)'
      : '8px 8px 24px rgba(0, 0, 0, 0.35), 2px 2px 8px rgba(0, 0, 0, 0.2)',
    '--book-title-scale': String(titleScale(article.title)),
    '--book-author-scale': String(authorScale(bylineLabel)),
    '--book-title-letter-spacing': hasCjkTitle ? '0.04em' : '0',
    '--book-author-letter-spacing': '0.06em',
    '--book-cover-font-family': 'var(--font-reader-serif)',
  };

  return {
    bylineLabel,
    imageUrl,
    nativeCover,
    style,
    title: normalizeLabel(article.title),
  };
}

function normalizeLabel(value: string) {
  return value
    .replace(/^www\./, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeHttpUrl(value: string | undefined) {
  if (!value) return undefined;
  if (value.startsWith('data:image/')) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    return undefined;
  }
  return undefined;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function titleScale(value: string) {
  const length = Array.from(normalizeLabel(value)).length;
  if (length <= 6) return 0.12;
  if (length <= 12) return 0.09;
  if (length <= 20) return 0.072;
  if (length <= 30) return 0.06;
  return 0.05;
}

function authorScale(value: string) {
  const length = Array.from(value).length;
  if (length <= 10) return 0.052;
  if (length <= 20) return 0.046;
  if (length <= 36) return 0.04;
  return 0.035;
}
