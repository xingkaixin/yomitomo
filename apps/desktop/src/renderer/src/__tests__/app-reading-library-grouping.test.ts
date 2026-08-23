// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { groupLibraryArticles } from '../reading-library/app-reading-library';
import {
  annotation,
  annotationWithPublishedDistillation,
  article,
} from './app-reading-library-test-support';

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

  it('groups count-based sorts by their selected count', () => {
    expect(
      groupLibraryArticles(
        [
          article({ id: 'two_annotations', annotations: [annotation('a1'), annotation('a2')] }),
          article({ id: 'one_annotation', annotations: [annotation('a3')] }),
          article({ id: 'also_one_annotation', annotations: [annotation('a4')] }),
          article({ id: 'no_annotations', annotations: [] }),
        ],
        'annotations',
      ).map((group) => ({
        label: group.label,
        ids: group.articles.map((item) => item.id),
      })),
    ).toEqual([
      { label: '2 条划线', ids: ['two_annotations'] },
      { label: '1 条划线', ids: ['one_annotation', 'also_one_annotation'] },
      { label: '暂无划线', ids: ['no_annotations'] },
    ]);

    expect(
      groupLibraryArticles(
        [
          article({
            id: 'two_distillations',
            annotations: [
              annotationWithPublishedDistillation('d1'),
              annotationWithPublishedDistillation('d2'),
            ],
          }),
          article({ id: 'no_distillations', annotations: [annotation('d3')] }),
        ],
        'discussions',
      ).map((group) => ({
        label: group.label,
        ids: group.articles.map((item) => item.id),
      })),
    ).toEqual([
      { label: '2 条沉淀', ids: ['two_distillations'] },
      { label: '暂无沉淀', ids: ['no_distillations'] },
    ]);
  });
});
