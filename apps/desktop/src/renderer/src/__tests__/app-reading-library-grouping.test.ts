import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeAppI18n } from '../i18n/app-i18n';
import { groupLibraryArticles } from '../reading-library/app-reading-library-utils';
import { article } from './app-reading-library-fixtures';

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('groupLibraryArticles', () => {
  it('groups recent reading by article update time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T12:00:00.000+08:00'));

    const olderAddedRecentRead = article({
      id: 'older_added_recent_read',
      createdAt: '2026-05-05T09:00:00.000+08:00',
      updatedAt: '2026-05-09T10:00:00.000+08:00',
    });
    const todayAddedRead = article({
      id: 'today_added_read',
      createdAt: '2026-05-09T08:00:00.000+08:00',
      updatedAt: '2026-05-09T09:00:00.000+08:00',
    });
    const olderAddedStaleRead = article({
      id: 'older_added_stale_read',
      createdAt: '2026-05-05T08:00:00.000+08:00',
      updatedAt: '2026-05-01T09:00:00.000+08:00',
    });

    expect(
      groupLibraryArticles(
        [olderAddedRecentRead, todayAddedRead, olderAddedStaleRead],
        'recentReading',
      ).map((group) => ({
        label: group.label,
        ids: group.articles.map((item) => item.id),
      })),
    ).toEqual([
      { label: '今天', ids: ['older_added_recent_read', 'today_added_read'] },
      { label: '更早', ids: ['older_added_stale_read'] },
    ]);
  });
});
