import { describe, expect, it } from 'vitest';
import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import {
  buildReadingCardSections,
  computeReadingStats,
  sortAnnotations,
  sortArticles,
} from './reading';

function annotation(id: string, start: number, createdAt: string): Annotation {
  return {
    id,
    anchor: {
      exact: `text ${id}`,
      prefix: '',
      suffix: '',
      start,
      end: start + 6,
    },
    author: 'user',
    color: '#f4c95d',
    comments: [
      {
        id: `comment-${id}`,
        author: id === 'a2' ? 'ai' : 'user',
        content: id === 'a3' ? '为什么？' : `comment ${id}`,
        createdAt,
      },
    ],
    createdAt,
    updatedAt: createdAt,
  };
}

function article(id: string, updatedAt: string, annotations: Annotation[] = []): ArticleRecord {
  return {
    id,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title: `Article ${id}`,
    contentHash: id,
    annotations,
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('reading core', () => {
  it('sorts articles and annotations deterministically', () => {
    expect(sortArticles([article('old', '2026-01-01'), article('new', '2026-01-02')])).toEqual([
      article('new', '2026-01-02'),
      article('old', '2026-01-01'),
    ]);

    const annotations = [
      annotation('a1', 20, '2026-01-01T00:00:00.000Z'),
      annotation('a2', 10, '2026-01-02T00:00:00.000Z'),
    ];
    expect(sortAnnotations(annotations).map((item) => item.id)).toEqual(['a2', 'a1']);
  });

  it('computes stats for today, week and total', () => {
    const stats = computeReadingStats(
      [
        article('today', '2026-05-03T08:00:00.000Z', [
          annotation('a1', 0, '2026-05-03T08:00:00.000Z'),
          annotation('a2', 12, '2026-05-03T09:00:00.000Z'),
        ]),
        article('older', '2026-04-20T08:00:00.000Z', [
          annotation('a3', 24, '2026-04-20T08:00:00.000Z'),
        ]),
      ],
      new Date('2026-05-03T12:00:00.000Z'),
    );

    expect(stats.today).toEqual({ articles: 1, annotations: 2, comments: 2, aiComments: 1 });
    expect(stats.week).toEqual({ articles: 1, annotations: 2, comments: 2, aiComments: 1 });
    expect(stats.total).toEqual({ articles: 2, annotations: 3, comments: 3, aiComments: 1 });
  });

  it('builds reading card sections from annotations and comments', () => {
    const sections = buildReadingCardSections(article('today', '2026-05-03', [
      annotation('a1', 0, '2026-05-03T08:00:00.000Z'),
      annotation('a2', 12, '2026-05-03T09:00:00.000Z'),
      annotation('a3', 24, '2026-05-03T10:00:00.000Z'),
    ]));

    expect(sections.map((section) => section.title)).toEqual([
      '文章快照',
      '关键原文',
      '我的批注',
      '助手补充',
      '后续问题',
    ]);
    expect(sections.find((section) => section.title === '后续问题')?.items).toEqual(['为什么？']);
  });
});
