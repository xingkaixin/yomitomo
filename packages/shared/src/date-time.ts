export type RelativeTimeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

export type RelativeTimeParts = {
  count: number;
  unit: RelativeTimeUnit;
};

export function relativeTimeParts(value: string, now: number | Date = Date.now()) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;

  const nowTimestamp = typeof now === 'number' ? now : now.getTime();
  const elapsedSeconds = Math.max(0, Math.floor((nowTimestamp - timestamp) / 1000));
  if (elapsedSeconds < 60) return { count: 0, unit: 'second' } satisfies RelativeTimeParts;

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60)
    return { count: elapsedMinutes, unit: 'minute' } satisfies RelativeTimeParts;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return { count: elapsedHours, unit: 'hour' } satisfies RelativeTimeParts;

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) return { count: elapsedDays, unit: 'day' } satisfies RelativeTimeParts;
  if (elapsedDays < 30)
    return { count: Math.floor(elapsedDays / 7), unit: 'week' } satisfies RelativeTimeParts;
  if (elapsedDays < 365)
    return { count: Math.floor(elapsedDays / 30), unit: 'month' } satisfies RelativeTimeParts;
  return { count: Math.floor(elapsedDays / 365), unit: 'year' } satisfies RelativeTimeParts;
}

export function formatDateTimeValue(
  value: string,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale || 'zh-CN', options).format(date);
}
