import { describe, expect, it } from 'vitest';
import type {
  Annotation,
  ArticleRecord,
  ArticleStatsRecord,
  ArticleSummaryRecord,
} from '@yomitomo/shared';
import { computeReadingActivityDays, computeReadingStats } from './reading';

const userAuthor = { kind: 'user', username: 'reader' } as const;
const agentAuthor = {
  kind: 'agent',
  agentId: 'agent_1',
  username: 'assistant',
} as const;

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
    author: input.author || userAuthor,
    annotationType: input.annotationType,
    color: '#f4c95d',
    distillation: input.distillation,
    comments: input.comments || [
      {
        id: `comment-${id}`,
        author: id === 'a2' ? agentAuthor : userAuthor,
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
    sourceType: 'web',
    title: `Article ${id}`,
    contentHash: id,
    annotations,
    createdAt: updatedAt,
    updatedAt,
  };
}

describe('reading core', () => {
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

    expect(stats.today).toEqual({
      articles: 1,
      annotations: 2,
      thoughts: 2,
      comments: 2,
      aiComments: 1,
      distillations: 0,
    });
    expect(stats.week).toEqual({
      articles: 1,
      annotations: 2,
      thoughts: 2,
      comments: 2,
      aiComments: 1,
      distillations: 0,
    });
    expect(stats.total).toEqual({
      articles: 2,
      annotations: 3,
      thoughts: 3,
      comments: 3,
      aiComments: 1,
      distillations: 0,
    });
  });

  it('counts comments by their own created date', () => {
    const stats = computeReadingStats(
      [
        article('older', '2026-04-20T08:00:00.000Z', [
          annotation('a1', 0, '2026-04-20T08:00:00.000Z', {
            comments: [
              {
                id: 'today-comment',
                author: agentAuthor,
                content: 'today',
                createdAt: '2026-05-03T08:00:00.000Z',
              },
            ],
          }),
        ]),
      ],
      new Date('2026-05-03T12:00:00.000Z'),
    );

    expect(stats.today).toEqual({
      articles: 0,
      annotations: 0,
      thoughts: 1,
      comments: 1,
      aiComments: 1,
      distillations: 0,
    });
  });

  it('counts stats summary activity on the day each event happened', () => {
    const now = new Date('2026-10-11T12:00:00.000Z');
    const summary: ArticleStatsRecord = {
      id: 'old-book',
      url: 'https://example.com/old-book',
      canonicalUrl: 'https://example.com/old-book',
      sourceType: 'web',
      title: 'Old book',
      contentHash: 'old-book',
      counts: {
        annotationCount: 1,
        thoughtCount: 1,
        discussionCommentCount: 0,
        aiCommentCount: 0,
        distillationCount: 0,
      },
      activityDates: {
        annotations: ['2026-09-01T12:00:00.000Z'],
        thoughts: ['2026-09-01T12:00:00.000Z'],
        discussionComments: [],
        aiComments: [],
        distillations: [],
      },
      createdAt: '2026-08-20T12:00:00.000Z',
      updatedAt: '2026-10-11T11:00:00.000Z',
    };

    const stats = computeReadingStats([summary], now);
    const days = computeReadingActivityDays([summary], 70, now);

    expect(stats.today).toMatchObject({ articles: 1, annotations: 0, thoughts: 0 });
    expect(stats.total).toMatchObject({ annotations: 1, thoughts: 1 });
    expect(days.find((day) => day.date === '2026-09-01')).toMatchObject({
      annotations: 1,
      thoughts: 1,
      score: 1,
    });
    expect(days.at(-1)).toMatchObject({ articles: 1, annotations: 0, thoughts: 0, score: 1 });
  });

  it('keeps summary and detailed thought and discussion counts consistent', () => {
    const createdAt = '2026-05-03T08:00:00.000Z';
    const comments = [
      { id: 'body', author: userAuthor, content: '批注正文', createdAt },
      { id: 'thought-1', author: userAuthor, content: '想法一', createdAt },
      {
        id: 'reply-1',
        author: agentAuthor,
        content: '回复一',
        createdAt,
        replyTo: 'thought-1',
      },
      {
        id: 'reply-2',
        author: userAuthor,
        content: '回复二',
        createdAt,
        replyTo: 'reply-1',
      },
      { id: 'thought-2', author: userAuthor, content: '想法二', createdAt },
      {
        id: 'reply-3',
        author: agentAuthor,
        content: '回复三',
        createdAt,
        replyTo: 'thought-2',
      },
    ];
    const detailed = article('detailed', createdAt, [
      annotation('annotation', 0, createdAt, { comments }),
    ]);
    const {
      annotations: _annotations,
      contentHtml: _contentHtml,
      focusCoReadingPlan: _focusCoReadingPlan,
      readerChatState: _readerChatState,
      ...summaryBase
    } = article('summary', createdAt);
    const summary: ArticleSummaryRecord = {
      ...summaryBase,
      counts: {
        annotationCount: 1,
        thoughtCount: 3,
        discussionCommentCount: 5,
        aiCommentCount: 2,
        distillationCount: 0,
      },
    };

    const detailedStats = computeReadingStats([detailed], new Date(createdAt)).today;
    const summaryStats = computeReadingStats([summary], new Date(createdAt)).today;
    const detailedActivity = computeReadingActivityDays([detailed], 1, new Date(createdAt))[0];
    const summaryActivity = computeReadingActivityDays([summary], 1, new Date(createdAt))[0];

    expect(summaryStats.thoughts).toBe(detailedStats.thoughts);
    expect(summaryStats.comments).toBe(detailedStats.comments);
    expect(summaryActivity).toMatchObject({
      thoughts: detailedActivity.thoughts,
      comments: detailedActivity.comments,
      score: detailedActivity.score,
    });
  });
});
