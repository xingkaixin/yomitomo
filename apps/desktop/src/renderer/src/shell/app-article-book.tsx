import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ArticleSummaryRecord } from '@yomitomo/shared';
import { articleDisplayTitle } from '../reading-library/app-reading-library-utils';

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
const pdfThumbnailCache = new Map<string, string | null>();
const siteIconCache = new Map<string, string | null>();

export function ArticleBook({ article }: { article: ArticleSummaryRecord }) {
  if (article.sourceType === 'pdf') return <PdfCover article={article} />;
  if (article.sourceType !== 'ebook') return <WebCover article={article} />;
  return <EbookBook article={article} />;
}

function EbookBook({ article }: { article: ArticleSummaryRecord }) {
  const coverUrl = useEbookCover(article);
  const [coverRatio, setCoverRatio] = useState<number | null>(null);
  const visual = useMemo(
    () => ebookBookVisual(article, coverUrl, coverRatio),
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

// PDF 封面：第一页缩略图，hover 滑入阅读器工具栏（当前阅读进度页码 / 缩放）。
function PdfCover({ article }: { article: ArticleSummaryRecord }) {
  const thumbnail = usePdfThumbnail(article.id);
  const pageCount = article.pdf?.metadata.pageCount ?? article.readingProgress?.pageCount ?? 0;
  const currentPage = pageCount
    ? Math.min((article.readingProgress?.pageIndex ?? 0) + 1, pageCount)
    : 0;

  return (
    <span aria-hidden="true" className="article-book is-flat-cover is-pdf-cover">
      <span className="article-cover-card">
        <span className="pdf-cover-bar">
          <span>{pageCount ? `${currentPage} / ${pageCount}` : '–'}</span>
          <span className="pdf-cover-bar-zoom">100%</span>
        </span>
        {thumbnail ? (
          <img className="pdf-cover-page" alt="" loading="lazy" src={thumbnail} />
        ) : (
          <span className="pdf-cover-fallback" />
        )}
      </span>
    </span>
  );
}

// 网页封面：白底卡片，favicon + 域名 + 标题，hover 滑入浏览器栏。
function WebCover({ article }: { article: ArticleSummaryRecord }) {
  const [faviconFailed, setFaviconFailed] = useState(false);
  const faviconUrl = useArticleSiteIcon(article.id);
  const domain = articleDomain(article);
  const title = normalizeLabel(articleDisplayTitle(article));
  const letter = (domain || title || '·').charAt(0).toUpperCase();

  useEffect(() => {
    setFaviconFailed(false);
  }, [faviconUrl]);

  return (
    <span aria-hidden="true" className="article-book is-flat-cover is-web-cover">
      <span className="article-cover-card">
        <span className="web-cover-chrome">
          <i />
          <i />
          <i />
          <span className="web-cover-chrome-url" />
        </span>
        <span className="web-cover-body">
          <span className="web-cover-fav">
            {faviconUrl && !faviconFailed ? (
              <img alt="" src={faviconUrl} onError={() => setFaviconFailed(true)} />
            ) : (
              <span className="web-cover-fav-letter">{letter}</span>
            )}
          </span>
          {domain ? <span className="web-cover-domain">{domain}</span> : null}
          <strong className="web-cover-title">{title}</strong>
        </span>
      </span>
    </span>
  );
}

function usePdfThumbnail(articleId: string) {
  const [thumbnail, setThumbnail] = useState<string | undefined>(
    () => pdfThumbnailCache.get(articleId) || undefined,
  );

  useEffect(() => {
    const cached = pdfThumbnailCache.get(articleId);
    if (cached !== undefined) {
      setThumbnail(cached || undefined);
      return;
    }

    const request = window.yomitomoDesktop?.getPdfThumbnail?.(articleId);
    if (!request) return;

    let cancelled = false;
    void request
      .then((value) => {
        const next = value || null;
        pdfThumbnailCache.set(articleId, next);
        if (!cancelled) setThumbnail(next || undefined);
      })
      .catch(() => {
        pdfThumbnailCache.set(articleId, null);
      });

    return () => {
      cancelled = true;
    };
  }, [articleId]);

  return thumbnail;
}

// 懒加载本地 favicon（data URI）：摘要不携带 siteIconUrl 以避免全量快照膨胀，按需读取并缓存。
export function useArticleSiteIcon(articleId: string, enabled = true) {
  const [iconUrl, setIconUrl] = useState<string | undefined>(
    () => siteIconCache.get(articleId) || undefined,
  );

  useEffect(() => {
    if (!enabled) return;
    const cached = siteIconCache.get(articleId);
    if (cached !== undefined) {
      setIconUrl(cached || undefined);
      return;
    }

    const request = window.yomitomoDesktop?.getArticleSiteIcon?.(articleId);
    if (!request) return;

    let cancelled = false;
    void request
      .then((value) => {
        const next = value || null;
        siteIconCache.set(articleId, next);
        if (!cancelled) setIconUrl(next || undefined);
      })
      .catch(() => {
        siteIconCache.set(articleId, null);
      });

    return () => {
      cancelled = true;
    };
  }, [articleId, enabled]);

  return iconUrl;
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

function useEbookCover(article: ArticleSummaryRecord) {
  const directCoverUrl = safeHttpUrl(article.leadImageUrl);
  const [coverUrl, setCoverUrl] = useState<string | undefined>(directCoverUrl);

  useEffect(() => {
    const nextDirectCoverUrl = safeHttpUrl(article.leadImageUrl);
    if (nextDirectCoverUrl) {
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
  }, [article.id, article.leadImageUrl]);

  return coverUrl;
}

function ebookBookVisual(
  article: ArticleSummaryRecord,
  coverUrl: string | undefined,
  coverRatio: number | null,
) {
  if (coverUrl) {
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
  const title = normalizeLabel(articleDisplayTitle(article));
  const bylineLabel = normalizeLabel(article.byline || '');
  const hasCjkTitle = /[\u3400-\u9fff]/.test(title);
  const style: ArticleBookStyle = {
    '--book-author-scale': String(authorScale(bylineLabel)),
    '--book-color': palette.color,
    '--book-text-color': palette.text,
    '--book-title-letter-spacing': hasCjkTitle ? '0.02em' : '0',
    '--book-title-scale': String(titleScale(title)),
  };

  return {
    className: 'is-generated-cover',
    imageUrl: undefined,
    nativeCover: false,
    style,
    subtitle: bylineLabel,
    title,
  };
}

function pdfPalette(article: ArticleSummaryRecord) {
  const seed = stableHash(
    [article.id, article.canonicalUrl, articleDisplayTitle(article), article.contentHash].join('|'),
  );
  return PDF_COVER_PALETTES[seed % PDF_COVER_PALETTES.length];
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

function articleDomain(article: ArticleSummaryRecord) {
  return normalizeLabel(urlHostname(article.canonicalUrl) || urlHostname(article.url) || '');
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
