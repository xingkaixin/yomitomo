import { relativeTimeParts, type RelativeTimeParts } from '@yomitomo/shared';

export type ReaderDateLabels = {
  dateLocale?: string;
  relativeTimeLabel?: (parts: RelativeTimeParts) => string;
};

export function defaultReaderRelativeTimeLabel(parts: RelativeTimeParts) {
  if (parts.unit === 'second') return '刚才';
  const unitLabels: Record<Exclude<RelativeTimeParts['unit'], 'second'>, string> = {
    minute: '分钟',
    hour: '小时',
    day: '天',
    week: '周',
    month: '个月',
    year: '年',
  };
  return `${parts.count} ${unitLabels[parts.unit]}前`;
}

export function createReaderTimeFormatter(labels?: ReaderDateLabels) {
  return new Intl.DateTimeFormat(labels?.dateLocale || 'zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(
  value: string,
  labels?: ReaderDateLabels,
  formatter?: Intl.DateTimeFormat,
) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return (formatter ?? createReaderTimeFormatter(labels)).format(date);
}

export function formatRelativeTime(value: string, labels?: ReaderDateLabels) {
  const parts = relativeTimeParts(value);
  if (!parts) return value;
  return (labels?.relativeTimeLabel || defaultReaderRelativeTimeLabel)(parts);
}
