import i18next from 'i18next';
import { articlePublishedDistillationCount } from '@yomitomo/core';
import {
  cleanEpubDisplayTitle,
  type ArticleSummaryRecord,
  type WeReadBook,
} from '@yomitomo/shared';
import { articlePlainText, formatDate, urlHost } from '../shell/app-utils';

export type LibraryFilter = 'all' | 'new' | 'progress' | 'done';

export type LibrarySource = 'web' | 'ebook' | 'pdf' | 'text' | 'weread';

export type LibrarySort = 'recentReading' | 'recentAdded' | 'annotations' | 'discussions';

const libraryFilters: LibraryFilter[] = ['all', 'new', 'progress', 'done'];

const librarySorts: LibrarySort[] = ['recentAdded', 'recentReading', 'annotations', 'discussions'];

export function libraryFilterOptions(): Array<{ value: LibraryFilter; label: string }> {
  return libraryFilters.map((value) => ({
    value,
    label: i18next.t(`library.filters.${value}`),
  }));
}

export function librarySortOptions(): Array<{ value: LibrarySort; label: string }> {
  return librarySorts.map((value) => ({
    value,
    label: i18next.t(`library.sort.${value}`),
  }));
}

export function articleMatchesLibrarySearch(article: ArticleSummaryRecord, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  if (!normalizedQuery) return true;

  return [
    articleDisplayTitle(article),
    article.title,
    article.byline,
    article.siteName,
    article.excerpt,
    article.ebook?.metadata.originalTitle,
    article.ebook?.metadata.fileName,
    article.pdf?.metadata.fileName,
    urlHost(article.canonicalUrl || article.url),
    article.canonicalUrl,
    article.url,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('zh-CN')
    .includes(normalizedQuery);
}

export function librarySourceForArticle(article: ArticleSummaryRecord): LibrarySource {
  if (
    article.sourceType === 'ebook' ||
    article.sourceType === 'pdf' ||
    article.sourceType === 'text'
  )
    return article.sourceType;
  return 'web';
}

export function articleDisplayTitle(article: ArticleSummaryRecord) {
  if (article.sourceType !== 'ebook') return article.title;
  const metadata = article.ebook?.metadata;
  return (
    cleanEpubDisplayTitle({
      metadataTitle: metadata?.originalTitle || article.title || metadata?.displayTitle,
      fileName: metadata?.fileName,
      creator: article.byline,
    }) || article.title
  );
}

export function articleMatchesLibraryFilter(article: ArticleSummaryRecord, filter: LibraryFilter) {
  const status = libraryArticleStatus(article);
  if (filter === 'new') return status.tone === 'new';
  if (filter === 'progress') return status.tone === 'progress';
  if (filter === 'done') return status.tone === 'done';
  return true;
}

export function compareLibraryArticles(
  left: ArticleSummaryRecord,
  right: ArticleSummaryRecord,
  sort: LibrarySort,
) {
  if (sort === 'recentAdded') {
    return (
      compareTimestampDesc(left.createdAt, right.createdAt) ||
      compareTimestampDesc(left.updatedAt, right.updatedAt) ||
      articleDisplayTitle(left).localeCompare(articleDisplayTitle(right), 'zh-CN')
    );
  }

  if (sort === 'annotations') {
    return (
      articleAnnotationCount(right) - articleAnnotationCount(left) ||
      compareTimestampDesc(left.updatedAt, right.updatedAt) ||
      articleDisplayTitle(left).localeCompare(articleDisplayTitle(right), 'zh-CN')
    );
  }

  if (sort === 'discussions') {
    return (
      articleDistillationCount(right) - articleDistillationCount(left) ||
      compareTimestampDesc(left.updatedAt, right.updatedAt) ||
      articleDisplayTitle(left).localeCompare(articleDisplayTitle(right), 'zh-CN')
    );
  }

  return (
    compareTimestampDesc(left.updatedAt, right.updatedAt) ||
    compareTimestampDesc(left.createdAt, right.createdAt) ||
    articleDisplayTitle(left).localeCompare(articleDisplayTitle(right), 'zh-CN')
  );
}

export function groupLibraryArticles(articles: ArticleSummaryRecord[], sort: LibrarySort) {
  const groups = new Map<string, ArticleSummaryRecord[]>();
  for (const article of articles) {
    const label = libraryArticleGroupLabel(article, sort);
    groups.set(label, [...(groups.get(label) || []), article]);
  }
  return Array.from(groups, ([label, groupArticles]) => ({ label, articles: groupArticles }));
}

function libraryArticleGroupLabel(article: ArticleSummaryRecord, sort: LibrarySort) {
  if (sort === 'recentAdded') return formatLibraryDateGroup(article.createdAt);
  if (sort === 'annotations')
    return formatLibraryCountGroup(articleAnnotationCount(article), 'annotations');
  if (sort === 'discussions')
    return formatLibraryCountGroup(articleDistillationCount(article), 'distillations');
  return formatLibraryDateGroup(article.updatedAt);
}

function formatLibraryCountGroup(count: number, unit: 'annotations' | 'distillations') {
  if (count <= 0) return i18next.t(`library.group.empty.${unit}`);
  return i18next.t(`library.group.count.${unit}`, { count });
}

export function libraryArticleStatus(article: ArticleSummaryRecord) {
  if (articleAnnotationCount(article) === 0)
    return { label: i18next.t('library.status.new'), tone: 'new' };
  if ((article.readingProgress?.progress ?? 0) >= 0.98)
    return { label: i18next.t('library.status.done'), tone: 'done' };
  return { label: i18next.t('library.status.progress'), tone: 'progress' };
}

export function articleAnnotationCount(article: ArticleSummaryRecord) {
  return article.annotationCount ?? article.annotations.length;
}

export function articleThoughtCount(article: ArticleSummaryRecord) {
  return (
    article.commentCount ??
    article.annotations.reduce(
      (count, annotation) =>
        count + annotation.comments.filter((comment) => !comment.replyTo).length,
      0,
    )
  );
}

export function articleDistillationCount(article: ArticleSummaryRecord) {
  return article.distillationCount ?? articlePublishedDistillationCount(article.annotations);
}

export function articleReadingMinutes(article: ArticleSummaryRecord) {
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

export function formatLibraryShortDate(value: string, locale = i18next.language || 'zh-CN') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function weReadBookLibraryDate(book: WeReadBook) {
  return weReadTimestampIso(book.lastReadAt) || book.updatedAt;
}

function weReadTimestampIso(value: number | undefined) {
  if (!value) return undefined;
  const timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function formatLibraryDateGroup(value: string) {
  const days = localDayDistance(value);
  if (days <= 0) return i18next.t('library.dateGroup.today');
  if (days === 1) return i18next.t('library.dateGroup.yesterday');
  if (days < 7) return i18next.t('library.dateGroup.thisWeek');
  return i18next.t('library.dateGroup.earlier');
}

export function formatLibraryRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);

  const time = new Intl.DateTimeFormat(i18next.language || 'zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  const days = localDayDistance(value);
  if (days <= 0) return i18next.t('library.relativeTime.today', { time });
  if (days === 1) return i18next.t('library.relativeTime.yesterday', { time });
  if (days < 7) return `${weekdayLabel(date)} ${time}`;
  return formatDate(value);
}

function weekdayLabel(date: Date) {
  return new Intl.DateTimeFormat(i18next.language || 'zh-CN', { weekday: 'short' }).format(date);
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
