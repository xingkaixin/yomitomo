import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createReaderTimeFormatter,
  formatRelativeTime,
  formatTime,
  type ReaderDateLabels,
} from './reader-date-utils';

describe('reader date utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-27T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('formats relative time with coarser long-distance buckets', () => {
    expect(formatRelativeTime('2026-05-27T11:59:30.000Z')).toBe('刚才');
    expect(formatRelativeTime('2026-05-27T11:45:00.000Z')).toBe('15 分钟前');
    expect(formatRelativeTime('2026-05-27T09:00:00.000Z')).toBe('3 小时前');
    expect(formatRelativeTime('2026-05-24T12:00:00.000Z')).toBe('3 天前');
    expect(formatRelativeTime('2026-05-06T12:00:00.000Z')).toBe('3 周前');
    expect(formatRelativeTime('2026-02-27T12:00:00.000Z')).toBe('2 个月前');
    expect(formatRelativeTime('2024-11-27T12:00:00.000Z')).toBe('1 年前');
  });

  it('formats full time for exact timestamp tooltips', () => {
    expect(formatTime('2026-05-27T11:45:00.000Z')).toContain('2026');
  });

  it('preserves date formatting when language or system time zone changes', () => {
    const value = '1970-01-01T11:45:00.000Z';
    for (const timeZone of ['Asia/Shanghai', 'Asia/Singapore', 'America/New_York']) {
      vi.stubEnv('TZ', timeZone);
      for (const dateLocale of ['zh-CN', 'en', 'ja', undefined]) {
        const expected = new Intl.DateTimeFormat(dateLocale || 'zh-CN', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(value));
        const formatter = createReaderTimeFormatter({ dateLocale });
        expect(formatTime(value, { dateLocale })).toBe(expected);
        expect(formatTime(value, { dateLocale }, formatter)).toBe(expected);
      }
    }
    expect(formatTime('invalid date')).toBe('invalid date');
  });

  it('uses injected labels for localized relative time', () => {
    const labels: ReaderDateLabels = {
      dateLocale: 'en-US',
      relativeTimeLabel: (parts) =>
        parts.unit === 'second' ? 'Just now' : `${parts.count} ${parts.unit}s ago`,
    };

    expect(formatRelativeTime('2026-05-27T11:59:30.000Z', labels)).toBe('Just now');
    expect(formatRelativeTime('2026-05-27T11:45:00.000Z', labels)).toBe('15 minutes ago');
  });
});
