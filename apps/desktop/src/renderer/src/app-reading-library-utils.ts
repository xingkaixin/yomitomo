import type { ArticleRecord } from '@yomitomo/shared';
import { articlePlainText, formatDate, urlHost } from './app-utils';

export type LibraryFilter = 'all' | 'new' | 'progress' | 'done';

export type LibrarySource = 'web' | 'ebook';

export type LibrarySort = 'recentReading' | 'recentAdded' | 'annotations' | 'discussions';

export const LIBRARY_FILTER_OPTIONS: Array<{ value: LibraryFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'new', label: '新收录' },
  { value: 'progress', label: '进行中' },
  { value: 'done', label: '已读完' },
];

export const LIBRARY_SORT_OPTIONS: Array<{ value: LibrarySort; label: string }> = [
  { value: 'recentAdded', label: '最近添加' },
  { value: 'recentReading', label: '最近阅读' },
  { value: 'annotations', label: '批注最多' },
  { value: 'discussions', label: '讨论最多' },
];

export function articleMatchesLibrarySearch(article: ArticleRecord, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  if (!normalizedQuery) return true;

  return [
    article.title,
    article.byline,
    article.siteName,
    article.excerpt,
    article.ebook?.metadata.fileName,
    urlHost(article.canonicalUrl || article.url),
    article.canonicalUrl,
    article.url,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('zh-CN')
    .includes(normalizedQuery);
}

export function librarySourceForArticle(article: ArticleRecord): LibrarySource {
  return article.sourceType === 'ebook' ? 'ebook' : 'web';
}

export function articleMatchesLibraryFilter(article: ArticleRecord, filter: LibraryFilter) {
  const status = libraryArticleStatus(article);
  if (filter === 'new') return status.tone === 'new';
  if (filter === 'progress') return status.tone === 'progress';
  if (filter === 'done') return status.tone === 'done';
  return true;
}

export function articleSiteIconUrl(article: ArticleRecord) {
  const iconUrl = safeLibraryImageUrl(article.siteIconUrl);
  if (iconUrl) return withFaviconThrowErrorParam(iconUrl);

  const host = articleHost(article);
  return host ? faviconServiceUrl(host) : '';
}

function articleHost(article: ArticleRecord) {
  try {
    const url = new URL(article.canonicalUrl || article.url);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function safeLibraryImageUrl(value: string | undefined) {
  if (!value) return '';
  if (value.startsWith('data:image/')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function faviconServiceUrl(host: string) {
  const url = new URL(`https://favicon.im/${encodeURIComponent(host)}`);
  url.searchParams.set('throw-error-on-404', 'true');
  return url.href;
}

function withFaviconThrowErrorParam(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname !== 'favicon.im') return value;
    url.searchParams.set('throw-error-on-404', 'true');
    return url.href;
  } catch {
    return value;
  }
}

export function compareLibraryArticles(
  left: ArticleRecord,
  right: ArticleRecord,
  sort: LibrarySort,
) {
  if (sort === 'recentAdded') {
    return (
      compareTimestampDesc(left.createdAt, right.createdAt) ||
      compareTimestampDesc(left.updatedAt, right.updatedAt) ||
      left.title.localeCompare(right.title, 'zh-CN')
    );
  }

  if (sort === 'annotations') {
    return (
      articleAnnotationCount(right) - articleAnnotationCount(left) ||
      compareTimestampDesc(left.updatedAt, right.updatedAt) ||
      left.title.localeCompare(right.title, 'zh-CN')
    );
  }

  if (sort === 'discussions') {
    return (
      articleThoughtCount(right) - articleThoughtCount(left) ||
      compareTimestampDesc(left.updatedAt, right.updatedAt) ||
      left.title.localeCompare(right.title, 'zh-CN')
    );
  }

  return (
    compareTimestampDesc(left.updatedAt, right.updatedAt) ||
    compareTimestampDesc(left.createdAt, right.createdAt) ||
    left.title.localeCompare(right.title, 'zh-CN')
  );
}

export function groupLibraryArticles(articles: ArticleRecord[], sort: LibrarySort) {
  const groups = new Map<string, ArticleRecord[]>();
  for (const article of articles) {
    const label = libraryArticleGroupLabel(article, sort);
    groups.set(label, [...(groups.get(label) || []), article]);
  }
  return Array.from(groups, ([label, groupArticles]) => ({ label, articles: groupArticles }));
}

function libraryArticleGroupLabel(article: ArticleRecord, sort: LibrarySort) {
  if (sort === 'recentAdded') return formatLibraryDateGroup(article.createdAt);
  if (sort === 'annotations')
    return formatLibraryCountGroup(articleAnnotationCount(article), '批注');
  if (sort === 'discussions') return formatLibraryCountGroup(articleThoughtCount(article), '讨论');
  return formatLibraryDateGroup(article.updatedAt);
}

function formatLibraryCountGroup(count: number, unit: '批注' | '讨论') {
  if (count <= 0) return `暂无${unit}`;
  return `${count} 条${unit}`;
}

export function libraryArticleStatus(article: ArticleRecord) {
  if (articleAnnotationCount(article) === 0) return { label: '新收录', tone: 'new' };
  if ((article.readingProgress?.progress ?? 0) >= 0.98) return { label: '已读完', tone: 'done' };
  return { label: '进行中', tone: 'progress' };
}

export function articleAnnotationCount(article: ArticleRecord) {
  return article.annotationCount ?? article.annotations.length;
}

export function articleThoughtCount(article: ArticleRecord) {
  return (
    article.commentCount ??
    article.annotations.reduce(
      (count, annotation) =>
        count + annotation.comments.filter((comment) => !comment.replyTo).length,
      0,
    )
  );
}

export function articleReadingMinutes(article: ArticleRecord) {
  const text =
    (typeof document === 'undefined' ? article.excerpt : articlePlainText(article)) ||
    article.title;
  const cjkCount = text.match(/[\u3400-\u9fff]/g)?.length || 0;
  const wordCount = text
    .replace(/[\u3400-\u9fff]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(cjkCount / 450 + wordCount / 220));
}

function formatLibraryDateGroup(value: string) {
  const days = localDayDistance(value);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return '本周早些时候';
  return '更早';
}

export function formatLibraryRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);

  const time = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  const days = localDayDistance(value);
  if (days <= 0) return `今天 ${time}`;
  if (days === 1) return `昨天 ${time}`;
  if (days < 7) return `${weekdayLabel(date)} ${time}`;
  return formatDate(value);
}

function weekdayLabel(date: Date) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()] || '';
}

function localDayDistance(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.floor((todayStart - dateStart) / 86_400_000);
}

function compareTimestampDesc(
  left: string | number | undefined,
  right: string | number | undefined,
) {
  return timestampValue(right) - timestampValue(left);
}

function timestampValue(value: string | number | undefined) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}
