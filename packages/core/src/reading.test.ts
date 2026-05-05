import { describe, expect, it } from 'vitest';
import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import {
  buildReadingCard,
  buildReadingCardEvidenceUnits,
  buildReadingCardSections,
  buildReadingQuestions,
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
    questionStatus: input.questionStatus,
    color: '#f4c95d',
    agentNickname: input.agentNickname,
    userNickname: input.userNickname,
    comments: input.comments || [
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

  it('builds daily reading activity levels', () => {
    const days = computeReadingActivityDays(
      [
        {
          ...article('today', '2026-05-03T08:00:00.000Z', [
            annotation('a1', 0, '2026-05-03T09:00:00.000Z'),
          ]),
          readingCard: {
            id: 'card-1',
            articleId: 'today',
            title: 'Card',
            contentMarkdown: '',
            sections: [],
            providerId: 'provider-1',
            providerName: 'Provider',
            modelName: 'model',
            createdAt: '2026-05-03T10:00:00.000Z',
            updatedAt: '2026-05-03T10:00:00.000Z',
          },
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
      cards: 1,
      score: 5,
      level: 4,
    });
  });

  it('builds reading card sections from annotations and comments', () => {
    const sections = buildReadingCardSections(
      article('today', '2026-05-03', [
        annotation('a1', 0, '2026-05-03T08:00:00.000Z'),
        annotation('a2', 12, '2026-05-03T09:00:00.000Z'),
        annotation('a3', 24, '2026-05-03T10:00:00.000Z'),
      ]),
    );

    expect(sections.map((section) => section.title)).toEqual([
      '阅读轨迹',
      '我的关注',
      '助手补充',
      '后续问题',
    ]);
    expect(sections.find((section) => section.title === '后续问题')?.items).toEqual([
      '【未决】我：为什么？（原文：text a3）',
    ]);
  });

  it('builds ordered evidence units with source labels and sorted comments', () => {
    const units = buildReadingCardEvidenceUnits(
      article('today', '2026-05-03', [
        annotation('a2', 20, '2026-05-03T09:00:00.000Z', {
          author: 'ai',
          agentNickname: '研究助手',
          annotationType: 'key_point',
          comments: [
            {
              id: 'late',
              author: 'user',
              userNickname: 'Kevin',
              content: '后回复',
              createdAt: '2026-05-03T09:02:00.000Z',
            },
            {
              id: 'early',
              author: 'ai',
              agentNickname: '研究助手',
              content: '先补充',
              createdAt: '2026-05-03T09:01:00.000Z',
            },
          ],
        }),
        annotation('a1', 10, '2026-05-03T08:00:00.000Z', {
          userNickname: 'Kevin',
        }),
      ]),
    );

    expect(units.map((unit) => unit.id)).toEqual(['a1', 'a2']);
    expect(units[0]).toMatchObject({
      index: 1,
      annotationAuthorLabel: 'Kevin',
    });
    expect(units[1]).toMatchObject({
      index: 2,
      annotationType: '关键判断',
      annotationAuthorLabel: '研究助手',
    });
    expect(units[1].comments.map((comment) => comment.id)).toEqual(['early', 'late']);
  });

  it('builds trackable reading questions with statuses', () => {
    const questions = buildReadingQuestions(
      article('today', '2026-05-03', [
        annotation('a1', 0, '2026-05-03T08:00:00.000Z', {
          annotationType: 'question',
          questionStatus: 'parked',
          comments: [],
        }),
        annotation('a2', 12, '2026-05-03T09:00:00.000Z', {
          comments: [
            {
              id: 'c1',
              author: 'user',
              content: '如何验证？',
              createdAt: '2026-05-03T09:01:00.000Z',
              questionStatus: 'answered',
            },
          ],
        }),
      ]),
    );

    expect(questions).toMatchObject([
      { id: 'a1', annotationId: 'a1', status: 'parked', text: 'text a1' },
      { id: 'c1', annotationId: 'a2', commentId: 'c1', status: 'answered' },
    ]);
  });

  it('builds a full markdown card from evidence units', () => {
    const markdown = buildReadingCard(
      article('today', '2026-05-03T10:00:00.000Z', [
        annotation('a1', 0, '2026-05-03T08:00:00.000Z', {
          userNickname: 'Kevin',
          annotationType: 'question',
          comments: [
            {
              id: 'c1',
              author: 'user',
              userNickname: 'Kevin',
              content: '这里如何验证？',
              createdAt: '2026-05-03T08:01:00.000Z',
            },
          ],
        }),
      ]),
      '文章正文摘要',
    );

    expect(markdown).toContain('批注：1 条 · 评论：1 条 · 助手参与：0 条');
    expect(markdown).toContain('## 阅读轨迹');
    expect(markdown).toContain('1. 【延伸问题】【Kevin】“text a1”');
    expect(markdown).toContain('Kevin');
    expect(markdown).toContain('这里如何验证？');
  });
});
