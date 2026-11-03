import i18next from 'i18next';
import { articleCounts } from '@yomitomo/core';
import {
  cleanEpubDisplayTitle,
  type ArticleRecord,
  type ArticleSummaryRecord,
  type LibraryContentSourceId,
  type WeReadBook,
} from '@yomitomo/shared';

export type LibrarySource = LibraryContentSourceId;

export type LibrarySort = 'recentReading' | 'recentAdded' | 'annotations' | 'discussions';

export function articleDisplayTitle(article: ArticleRecord | ArticleSummaryRecord) {
  if (article.sourceType !== 'ebook') return article.title;
  const metadata = article.ebook.metadata;
  return (
    cleanEpubDisplayTitle({
      metadataTitle: metadata.originalTitle || article.title || metadata.displayTitle,
      fileName: metadata.fileName,
      creator: article.byline,
    }) || article.title
  );
}

export function groupLibraryArticles<T extends ArticleRecord | ArticleSummaryRecord>(
  articles: T[],
  sort: LibrarySort,
) {
  const groups = new Map<string, T[]>();
  for (const article of articles) {
    const label = libraryArticleGroupLabel(article, sort);
    groups.set(label, [...(groups.get(label) || []), article]);
  }
  return Array.from(groups, ([label, groupArticles]) => ({ label, articles: groupArticles }));
}

function libraryArticleGroupLabel(
  article: ArticleRecord | ArticleSummaryRecord,
  sort: LibrarySort,
) {
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

export function articleAnnotationCount(article: ArticleRecord | ArticleSummaryRecord) {
  return articleCounts(article).annotationCount;
}

export function articleDistillationCount(article: ArticleRecord | ArticleSummaryRecord) {
  return articleCounts(article).distillationCount;
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

function localDayDistance(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.floor((todayStart - dateStart) / 86_400_000);
}
