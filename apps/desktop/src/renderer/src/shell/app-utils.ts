import type {
  Annotation,
  ArticleRecord,
  ArticleSummaryRecord,
  Comment as AnnotationComment,
} from '@yomitomo/shared';
import { formatDateTimeValue } from '@yomitomo/shared';
import i18next from 'i18next';

export type LogEntry = {
  id: string;
  at: string;
  level: string;
  event: string;
  data?: unknown;
  raw: string;
};

export function isImageAvatar(value: string) {
  return (
    value.startsWith('data:image/') ||
    value.startsWith('blob:') ||
    value.startsWith('file:') ||
    value.startsWith('http') ||
    value.startsWith('/')
  );
}

export function isSvgAvatar(value: string) {
  return value.startsWith('data:image/svg+xml') || value.endsWith('.svg');
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener(
      'load',
      () => resolve(typeof reader.result === 'string' ? reader.result : ''),
      { once: true },
    );
    reader.addEventListener('error', () => reject(reader.error), { once: true });
    reader.readAsDataURL(file);
  });
}

export function annotationAuthorProfile(annotation: Annotation) {
  if (annotation.author === 'ai') {
    return {
      avatar: annotation.agentAvatar || '',
      name: annotation.agentNickname || annotation.agentUsername || i18next.t('common.assistant'),
    };
  }
  return {
    avatar: annotation.userAvatar || '',
    name: annotation.userNickname || annotation.userUsername || i18next.t('common.me'),
  };
}

export function commentAuthorProfile(comment: AnnotationComment) {
  if (comment.author === 'ai') {
    return {
      avatar: comment.agentAvatar || '',
      name: comment.agentNickname || comment.agentUsername || i18next.t('common.assistant'),
    };
  }
  return {
    avatar: comment.userAvatar || '',
    name: comment.userNickname || comment.userUsername || i18next.t('common.me'),
  };
}

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

export function articleReadingStatsLine(stats: {
  annotations: number;
  comments: number;
  aiContributions: number;
}) {
  return i18next.t('common.articleReadingStatsLine', stats);
}

export function articlePlainText(article: ArticleRecord | ArticleSummaryRecord) {
  const html = 'contentHtml' in article ? article.contentHtml || '' : '';
  if (!html) return article.excerpt || '';
  const container = document.createElement('div');
  container.innerHTML = html;
  return container.textContent?.replace(/\s+/g, ' ').trim() || article.excerpt || '';
}

export function parseLogEntries(raw: string): LogEntry[] {
  return raw
    .split('\n')
    .map((line, index) => parseLogLine(line, index))
    .filter((entry): entry is LogEntry => Boolean(entry));
}

export function formatLogData(data: unknown) {
  if (typeof data === 'string') return data;
  return JSON.stringify(data, null, 2);
}

export function formatDateTime(value: string) {
  return formatDateTimeValue(value, i18next.language, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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

function parseLogLine(line: string, index: number): LogEntry | null {
  const raw = line.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<LogEntry> & {
      at?: unknown;
      level?: unknown;
      event?: unknown;
      data?: unknown;
    };
    return {
      id: `${index}-${typeof parsed.at === 'string' ? parsed.at : ''}`,
      at: typeof parsed.at === 'string' ? parsed.at : '',
      level: typeof parsed.level === 'string' ? parsed.level : 'info',
      event: typeof parsed.event === 'string' ? parsed.event : 'log',
      data: parsed.data,
      raw,
    };
  } catch {
    return {
      id: `${index}-raw`,
      at: '',
      level: 'info',
      event: 'raw',
      data: raw,
      raw,
    };
  }
}
