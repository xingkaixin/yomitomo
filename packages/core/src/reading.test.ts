import { describe, expect, it } from 'vitest';
import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import {
  computeReadingActivityDays,
  computeReadingStats,
  sortAnnotations,
  sortArticles,
} from './reading';

function annotation(
  id: string,
  start: number,
  createdAt: string,
  input: Partial<Annotation> = {},
): Annotation {
  return {
    id,
    anchor: {
      exact: input.anchor?.exact || `text ${id}`,
      prefix: input.anchor?.prefix || '',
      suffix: input.anchor?.suffix || '',
      start,
      end: start + 6,
    },
    author: input.author || 'user',
    annotationType: input.annotationType,
    color: '#f4c95d',
    agentNickname: input.agentNickname,
    userNickname: input.userNickname,
    comments: input.comments || [
      {
        id: `comment-${id}`,
        author: id === 'a2' ? 'ai' : 'user',
        content: id === 'a3' ? '为什么？' : `comment ${id}`,
        createdAt: nextMinute(createdAt),
      },
    ],
    createdAt,
    updatedAt: createdAt,
  };
}

function nextMinute(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? value : new Date(time + 60_000).toISOString();
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

  it('counts comments by their own created date', () => {
    const stats = computeReadingStats(
      [
        article('older', '2026-04-20T08:00:00.000Z', [
          annotation('a1', 0, '2026-04-20T08:00:00.000Z', {
            comments: [
              {
                id: 'today-comment',
                author: 'ai',
                content: 'today',
                createdAt: '2026-05-03T08:00:00.000Z',
              },
            ],
          }),
        ]),
      ],
      new Date('2026-05-03T12:00:00.000Z'),
    );

    expect(stats.today).toEqual({ articles: 0, annotations: 0, comments: 1, aiComments: 1 });
  });

  it('excludes the annotation body from comment totals', () => {
    const createdAt = '2026-05-03T08:00:00.000Z';
    const record = article('today', createdAt, [
      annotation('a1', 0, createdAt, {
        comments: [
          {
            id: 'body',
            author: 'user',
            content: '批注正文',
            createdAt,
          },
        ],
      }),
    ]);

    expect(computeReadingStats([record], new Date('2026-05-03T12:00:00.000Z')).today).toEqual({
      articles: 1,
      annotations: 1,
      comments: 0,
      aiComments: 0,
    });
  });

  it('builds daily reading activity levels', () => {
    const days = computeReadingActivityDays(
      [
        {
          ...article('today', '2026-05-03T08:00:00.000Z', [
            annotation('a1', 0, '2026-05-03T09:00:00.000Z'),
          ]),
        },
      ],
      3,
      new Date('2026-05-03T12:00:00.000Z'),
    );

    expect(days.map((day) => day.date)).toEqual(['2026-05-01', '2026-05-02', '2026-05-03']);
    expect(days[2]).toMatchObject({
      articles: 1,
      annotations: 1,
      comments: 1,
      score: 3,
      level: 4,
    });
  });
});
