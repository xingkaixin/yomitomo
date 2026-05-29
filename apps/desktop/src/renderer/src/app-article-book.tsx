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

type FormatPdfAuthorsOptions = {
  maxAuthors: number;
  maxLength?: number;
};

type FormatPdfTitleOptions = {
  compact?: boolean;
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
  const title =
    article.sourceType === 'pdf'
      ? formatPdfDisplayTitle(article.title, { compact: true })
      : normalizeLabel(article.title);
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

export function formatPdfDisplayTitle(value: string, options: FormatPdfTitleOptions = {}) {
  const title = normalizeLabel(value);
  if (!title) return '';
  const maxLength = options.compact ? 46 : 88;
  if (Array.from(title).length <= maxLength) return title;

  const separators = [': ', '：', ' - ', ' — ', ' – ', '. '];
  for (const separator of separators) {
    const index = title.indexOf(separator);
    if (index < 4 || index > maxLength) continue;
    return title.slice(0, index).trim();
  }

  return `${Array.from(title)
    .slice(0, maxLength - 1)
    .join('')
    .trim()}…`;
}

export function formatPdfAuthors(value: string, options: FormatPdfAuthorsOptions) {
  const authors = splitPdfAuthors(value).map(formatPdfAuthorName).filter(Boolean);
  if (authors.length === 0) return '';

  const maxAuthors = Math.max(1, options.maxAuthors);
  for (let count = Math.min(maxAuthors, authors.length); count > 0; count -= 1) {
    const label = pdfAuthorsLabel(authors, count);
    if (!options.maxLength || Array.from(label).length <= options.maxLength) return label;
  }

  return pdfAuthorsLabel(authors, 1);
}

function pdfAuthorLabel(article: ArticleSummaryRecord) {
  if (!article.sourceType || article.sourceType === 'web') {
    return normalizeLabel(urlHostname(article.canonicalUrl) || urlHostname(article.url) || '');
  }
  if (article.sourceType !== 'pdf') return normalizeLabel(article.byline || '');
  return formatPdfAuthors(article.pdf?.metadata.author || '', { maxAuthors: 1 });
}

function splitPdfAuthors(value: string) {
  return normalizeLabel(value)
    .split(/\s*(?:;|；|\band\b|&)\s*/i)
    .map((author) => author.trim())
    .filter(Boolean);
}

function formatPdfAuthorName(value: string) {
  if (hasCjkText(value)) return value;
  return value
    .split(/(\s+|-|')/)
    .map((part) => {
      if (!/[A-Za-z]/.test(part)) return part;
      if (/[a-z]/.test(part)) return part;
      return `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`;
    })
    .join('');
}

function pdfAuthorsLabel(authors: string[], count: number) {
  const visibleAuthors = authors.slice(0, count);
  const suffix = authors.length > visibleAuthors.length ? pdfAuthorsSuffix(authors[0]) : '';
  const separator = hasCjkText(authors[0]) ? '、' : '; ';
  return `${visibleAuthors.join(separator)}${suffix ? ` ${suffix}` : ''}`;
}

function pdfAuthorsSuffix(firstAuthor: string) {
  return hasCjkText(firstAuthor) ? '等' : 'et al.';
}

function hasCjkText(value: string) {
  return /[\u3400-\u9fff]/.test(value);
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
