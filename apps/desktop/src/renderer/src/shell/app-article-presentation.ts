import type { ArticleRecord, ArticleSummaryRecord } from '@yomitomo/shared';
import { formatDateTimeValue } from '@yomitomo/shared';
import i18next from 'i18next';

export function urlHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

export function articleExternalUrl(article: ArticleRecord) {
  return validExternalUrl(article.canonicalUrl) || validExternalUrl(article.url);
}

export function articleIdentityLine(article: ArticleRecord) {
  if (article.sourceType === 'text') return article.byline || '';
  return [article.byline, formatDate(article.updatedAt)].filter(Boolean).join(' / ');
}

export function articlePlainText(article: ArticleRecord | ArticleSummaryRecord) {
  const html = 'contentHtml' in article ? article.contentHtml || '' : '';
  if (!html) return article.excerpt || '';
  const container = document.createElement('div');
  container.innerHTML = html;
  return container.textContent?.replace(/\s+/g, ' ').trim() || article.excerpt || '';
}

export function formatDate(value: string) {
  return formatDateTimeValue(value, i18next.language, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function validExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}
