import React, { useCallback, useMemo, useReducer } from 'react';
import i18next from 'i18next';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import type { ArticleRecord, ArticleSummaryRecord } from '@yomitomo/shared';
import { articleDisplayTitle } from '../reading-library/app-reading-library-utils';
import { getOptionalDesktopApi } from './app-desktop-api';

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
  imageRef?: React.Ref<HTMLImageElement>;
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
// Covers and thumbnails are data URLs of up to a few MB; keep the recently shown ones only.
const articleCoverCache = createRecentCache(96);
const pdfThumbnailCache = createRecentCache(96);
const siteIconCache = createRecentCache(256);

type ArticleBookRecord = ArticleRecord | ArticleSummaryRecord;

type RecentCache = ReturnType<typeof createRecentCache>;

type StoredImageRequest = (articleId: string) => Promise<string | null> | undefined;

// Covers that load a stored image are keyed by what they load, so each mount loads once.
export function ArticleBook({ article }: { article: ArticleBookRecord }) {
  if (article.sourceType === 'pdf') return <PdfCover key={article.id} article={article} />;
  if (article.sourceType === 'text') return <TextCover article={article} />;
  if (article.sourceType !== 'ebook') return <WebCover key={article.id} article={article} />;
  const coverSource = safeHttpUrl(article.leadImageUrl) ? 'direct' : 'stored';
  return <EbookBook key={`${article.id}:${coverSource}`} article={article} />;
}

// 文本封面：稿纸（装订色条 + 标题 + 横线 + 作者），后层叠纸 hover 扇出；类型仅由色条区分。
function TextCover({ article }: { article: ArticleBookRecord }) {
  const isMarkdown = article.text?.format === 'markdown';
  const title = normalizeLabel(articleDisplayTitle(article));
  const author = normalizeLabel(article.byline || '');
  const classes = ['article-book', 'is-flat-cover', 'is-text-cover'];
  classes.push(isMarkdown ? 'is-md' : 'is-txt');

  return (
    <span aria-hidden="true" className={classes.join(' ')}>
      <span className="text-cover-sheet s3" />
      <span className="text-cover-sheet s2" />
      <span className="article-cover-card text-cover-card">
        <span className="text-cover-spine" />
        <strong className="text-cover-title">{title}</strong>
        <span className="text-cover-ruled" />
        {author ? <span className="text-cover-author">{author}</span> : null}
      </span>
    </span>
  );
}

function EbookBook({ article }: { article: ArticleBookRecord }) {
  const coverUrl = useEbookCover(article);
  const { imageRef, ratio: coverRatio, updateRatio } = useNativeCoverRatio(coverUrl);
  const visual = useMemo(
    () => ebookBookVisual(article, coverUrl, coverRatio),
    [article, coverRatio, coverUrl],
  );

  return (
    <BookCoverFrame
      className={visual.className}
      imageRef={visual.nativeCover ? imageRef : undefined}
      imageUrl={visual.imageUrl}
      nativeCover={visual.nativeCover}
      style={visual.style}
      subtitle={visual.subtitle}
      title={visual.title}
      onImageError={(event) => {
        event.currentTarget.hidden = true;
      }}
      onImageLoad={visual.nativeCover ? updateRatio : undefined}
    />
  );
}

export function BookCoverFrame({
  className,
  imageRef,
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
              ref={imageRef}
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
function PdfCover({ article }: { article: ArticleBookRecord }) {
  const thumbnail = usePdfThumbnail(article.id);
  const readingProgress =
    article.readingProgress?.kind === 'page' ? article.readingProgress : undefined;
  const pageCount = article.pdf?.metadata.pageCount ?? readingProgress?.pageCount ?? 0;
  const currentPage = pageCount ? Math.min((readingProgress?.pageIndex ?? 0) + 1, pageCount) : 0;

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
function WebCover({ article }: { article: ArticleBookRecord }) {
  const [failedFaviconUrl, dispatch] = useReducer(webCoverReducer, undefined);
  const faviconUrl = useArticleSiteIcon(article.id);
  const faviconFailed = failedFaviconUrl === faviconUrl;
  const domain = articleDomain(article);
  const title = normalizeLabel(articleDisplayTitle(article));
  const letter = (domain || title || '·').charAt(0).toUpperCase();

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
              <img
                alt=""
                src={faviconUrl}
                onError={() => dispatch({ type: 'faviconFailed', url: faviconUrl })}
              />
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

function webCoverReducer(
  _failedFaviconUrl: string | undefined,
  event: { type: 'faviconFailed'; url: string },
) {
  return event.url;
}

function usePdfThumbnail(articleId: string) {
  return useStoredArticleImage(pdfThumbnailCache, articleId, (id) =>
    getOptionalDesktopApi()
      ?.article?.pdf?.getThumbnail(id)
      .then((value) => value || null),
  );
}

// 懒加载本地 favicon（data URI）：摘要不携带 siteIconUrl 以避免全量快照膨胀，按需读取并缓存。
function useArticleSiteIcon(articleId: string) {
  return useStoredArticleImage(siteIconCache, articleId, (id) =>
    getOptionalDesktopApi()
      ?.article?.getSiteIcon?.(id)
      .then((value) => value || null),
  );
}

function useStoredArticleImage(
  cache: RecentCache,
  articleId: string,
  request: StoredImageRequest | null,
) {
  const [image, dispatch] = useReducer(storedImageReducer, undefined, () =>
    request ? cache.get(articleId) : undefined,
  );

  useMountEffect(() => {
    if (!request) return;
    const cached = cache.get(articleId);
    if (cached !== undefined) {
      dispatch({ type: 'loaded', image: cached });
      return;
    }
    void request(articleId)
      ?.then((value) => {
        cache.set(articleId, value);
        dispatch({ type: 'loaded', image: value });
      })
      .catch(() => {
        cache.set(articleId, null);
      });
  });

  return image || undefined;
}

function storedImageReducer(
  _image: string | null | undefined,
  event: { type: 'loaded'; image: string | null },
) {
  return event.image;
}

export function useNativeCoverRatio(imageUrl: string | undefined) {
  const [measured, dispatch] = useReducer(nativeCoverRatioReducer, null);
  const ratio = measured && measured.imageUrl === imageUrl ? measured.ratio : null;

  const measure = useCallback(
    (image: HTMLImageElement) => {
      const { naturalHeight, naturalWidth } = image;
      if (naturalWidth > 0 && naturalHeight > 0) {
        dispatch({ type: 'measured', imageUrl, ratio: naturalWidth / naturalHeight });
      }
    },
    [imageUrl],
  );

  const imageRef = useCallback(
    (image: HTMLImageElement | null) => {
      if (imageUrl && image?.complete) measure(image);
    },
    [imageUrl, measure],
  );

  function updateRatio(event: React.SyntheticEvent<HTMLImageElement>) {
    measure(event.currentTarget);
  }

  return { imageRef, ratio, updateRatio };
}

function nativeCoverRatioReducer(
  _measured: { imageUrl: string | undefined; ratio: number } | null,
  event: { type: 'measured'; imageUrl: string | undefined; ratio: number },
) {
  return { imageUrl: event.imageUrl, ratio: event.ratio };
}

export function nativeBookCoverStyle(ratio: number | null): BookCoverFrameStyle {
  return {
    '--book-color': NATIVE_COVER_SHELL,
    '--book-cover-ratio': String(ratio || DEFAULT_NATIVE_RATIO),
    '--book-text-color': '#ffffff',
  };
}

function useEbookCover(article: ArticleBookRecord) {
  const directCoverUrl = safeHttpUrl(article.leadImageUrl);
  const storedCoverUrl = useStoredArticleImage(
    articleCoverCache,
    article.id,
    directCoverUrl
      ? null
      : (id) =>
          getOptionalDesktopApi()
            ?.article?.getCover?.(id)
            .then((value) => safeHttpUrl(value) || null),
  );
  return directCoverUrl ?? storedCoverUrl;
}

function ebookBookVisual(
  article: ArticleBookRecord,
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

function pdfPalette(article: ArticleBookRecord) {
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

const PDF_HEADER_AUTHOR_FORMAT: FormatPdfAuthorsOptions = {
  maxAuthors: 4,
  maxLength: 72,
};

export function formatPdfHeaderAuthors(value: string) {
  return formatPdfAuthors(value, PDF_HEADER_AUTHOR_FORMAT);
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
  return hasCjkText(firstAuthor)
    ? i18next.t('common.cjkEtAl', { defaultValue: 'et al.' })
    : 'et al.';
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

function articleDomain(article: ArticleBookRecord) {
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

function createRecentCache(limit: number) {
  const entries = new Map<string, string | null>();
  return {
    get(key: string) {
      const value = entries.get(key);
      if (value !== undefined) {
        entries.delete(key);
        entries.set(key, value);
      }
      return value;
    },
    set(key: string, value: string | null) {
      entries.delete(key);
      entries.set(key, value);
      if (entries.size > limit) entries.delete(entries.keys().next().value as string);
    },
  };
}
