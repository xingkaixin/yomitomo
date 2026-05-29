import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ArticleSummaryRecord } from '@yomitomo/shared';

type BookCoverFrameStyle = React.CSSProperties & {
  '--book-color': string;
  '--book-text-color': string;
  '--book-cover-ratio'?: string;
};

type ArticleBookStyle = BookCoverFrameStyle & {
  '--book-title-scale': string;
  '--book-author-scale': string;
  '--book-title-letter-spacing': string;
};

type BookCoverFrameProps = {
  title?: string;
  subtitle?: string;
  imageUrl?: string;
  nativeCover?: boolean;
  className?: string;
  style: BookCoverFrameStyle;
  onImageLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  onImageError?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
};

const PDF_COVER_PALETTES = [
  { color: '#2b4570', text: '#ffffff' },
  { color: '#2a3d45', text: '#ffffff' },
  { color: '#8b585f', text: '#ffffff' },
  { color: '#e49273', text: '#000000' },
  { color: '#add8e2', text: '#000000' },
  { color: '#8b9094', text: '#ffffff' },
  { color: '#d9aa73', text: '#000000' },
] as const;

const NATIVE_COVER_SHELL = '#151515';
const DEFAULT_NATIVE_RATIO = 0.72;
const articleCoverCache = new Map<string, string | null>();

export function ArticleBook({ article }: { article: ArticleSummaryRecord }) {
  const coverUrl = useArticleCover(article);
  const [coverRatio, setCoverRatio] = useState<number | null>(null);
  const visual = useMemo(
    () => articleBookVisual(article, coverUrl, coverRatio),
    [article, coverRatio, coverUrl],
  );

  useEffect(() => {
    setCoverRatio(null);
  }, [coverUrl]);

  function updateCoverRatio(event: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalHeight, naturalWidth } = event.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) setCoverRatio(naturalWidth / naturalHeight);
  }

  return (
    <BookCoverFrame
      className={visual.className}
      imageUrl={visual.imageUrl}
      nativeCover={visual.nativeCover}
      style={visual.style}
      subtitle={visual.subtitle}
      title={visual.title}
      onImageError={(event) => {
        event.currentTarget.hidden = true;
      }}
      onImageLoad={visual.nativeCover ? updateCoverRatio : undefined}
    />
  );
}

export function BookCoverFrame({
  className,
  imageUrl,
  nativeCover,
  onImageError,
  onImageLoad,
  style,
  subtitle,
  title,
}: BookCoverFrameProps) {
  const classes = ['article-book'];
  if (nativeCover) classes.push('is-native-cover');
  if (className) classes.push(className);

  return (
    <span aria-hidden="true" className={classes.join(' ')} style={style}>
      <span className="article-book-ground-shadow" />
      <span className="article-book-scene">
        <span className="article-book-pages" />
        <span className="article-book-back" />
        <span className="article-book-front">
          {imageUrl ? (
            <img
              alt=""
              className="article-book-cover-image"
              loading="lazy"
              src={imageUrl}
              onError={onImageError}
              onLoad={onImageLoad}
            />
          ) : null}
          {title ? (
            <span className="article-book-cover-copy">
              <strong>{title}</strong>
            </span>
          ) : null}
          {subtitle ? (
            <span className="article-book-cover-author">
              <em>{subtitle}</em>
            </span>
          ) : null}
        </span>
      </span>
    </span>
  );
}

export function useNativeCoverRatio(imageUrl: string | undefined) {
  const [ratio, setRatio] = useState<number | null>(null);
  const lastImageUrlRef = useRef<string | undefined>(imageUrl);

  useEffect(() => {
    if (lastImageUrlRef.current === imageUrl) return;
    lastImageUrlRef.current = imageUrl;
    setRatio(null);
  }, [imageUrl]);

  function updateRatio(event: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalHeight, naturalWidth } = event.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) setRatio(naturalWidth / naturalHeight);
  }

  return { ratio, updateRatio };
}

export function nativeBookCoverStyle(ratio: number | null): BookCoverFrameStyle {
  return {
    '--book-color': NATIVE_COVER_SHELL,
    '--book-cover-ratio': String(ratio || DEFAULT_NATIVE_RATIO),
    '--book-text-color': '#ffffff',
  };
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

function articleBookVisual(
  article: ArticleSummaryRecord,
  coverUrl: string | undefined,
  coverRatio: number | null,
) {
  if (article.sourceType === 'ebook' && coverUrl) {
    return {
      className: undefined,
      imageUrl: coverUrl,
      nativeCover: true,
      style: nativeBookCoverStyle(coverRatio) as ArticleBookStyle,
      subtitle: undefined,
      title: undefined,
    };
  }

  const palette = pdfPalette(article);
  const bylineLabel = pdfAuthorLabel(article);
  const title = normalizeLabel(article.title);
  const hasCjkTitle = /[\u3400-\u9fff]/.test(title);
  const style: ArticleBookStyle = {
    '--book-author-scale': String(authorScale(bylineLabel)),
    '--book-color': palette.color,
    '--book-text-color': palette.text,
    '--book-title-letter-spacing': hasCjkTitle ? '0.02em' : '0',
    '--book-title-scale': String(titleScale(title)),
  };

  return {
    className: article.sourceType === 'pdf' ? 'is-pdf-cover' : 'is-generated-cover',
    imageUrl: undefined,
    nativeCover: false,
    style,
    subtitle: bylineLabel,
    title,
  };
}

function pdfPalette(article: ArticleSummaryRecord) {
  const seed = stableHash(
    [article.id, article.canonicalUrl, article.title, article.contentHash].join('|'),
  );
  return PDF_COVER_PALETTES[seed % PDF_COVER_PALETTES.length];
}

function pdfAuthorLabel(article: ArticleSummaryRecord) {
  if (!article.sourceType || article.sourceType === 'web') {
    return normalizeLabel(urlHostname(article.canonicalUrl) || urlHostname(article.url) || '');
  }
  if (article.sourceType !== 'pdf') return normalizeLabel(article.byline || '');
  return normalizeLabel(article.pdf?.metadata.author || '');
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

function urlHostname(value: string | undefined) {
  if (!value) return '';
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
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
  if (length <= 6) return 0.16;
  if (length <= 12) return 0.12;
  if (length <= 20) return 0.095;
  if (length <= 30) return 0.078;
  return 0.062;
}

function authorScale(value: string) {
  const length = Array.from(value).length;
  if (length === 0) return 0.052;
  if (length <= 10) return 0.06;
  if (length <= 20) return 0.052;
  if (length <= 36) return 0.046;
  return 0.039;
}
