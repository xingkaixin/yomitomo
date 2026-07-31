import { describe, expect, it } from 'vitest';
import type { Annotation, ArticleCounts } from '@yomitomo/shared';
import { articleCounts } from './article-counts';

describe('articleCounts', () => {
  it('derives every count from loaded annotations', () => {
    const createdAt = '2026-07-27T08:00:00.000Z';
    const annotations: Annotation[] = [
      {
        id: 'annotation_1',
        anchor: { exact: 'text', prefix: '', suffix: '', start: 0, end: 4 },
        author: { kind: 'user', username: 'reader' },
        color: '#f4c95d',
        comments: [
          {
            id: 'thought_1',
            author: { kind: 'user', username: 'reader' },
            content: '想法',
            createdAt,
          },
          {
            id: 'reply_1',
            author: { kind: 'agent', agentId: 'agent_1', username: 'assistant' },
            content: '回复',
            createdAt,
            replyTo: 'thought_1',
          },
        ],
        distillation: {
          status: 'published',
          content: '沉淀',
          publishedAt: createdAt,
          reviewSessions: [
            {
              id: 'review_1',
              agentId: 'agent_1',
              createdAt,
              updatedAt: createdAt,
              messages: [
                {
                  id: 'review_message_1',
                  author: { kind: 'agent', agentId: 'agent_1', username: 'assistant' },
                  content: '审阅',
                  createdAt,
                },
              ],
            },
          ],
        },
        createdAt,
        updatedAt: createdAt,
      },
    ];

    expect(articleCounts({ annotations })).toEqual({
      annotationCount: 1,
      thoughtCount: 1,
      discussionCommentCount: 1,
      aiCommentCount: 2,
      distillationCount: 1,
    });
  });

  it('uses an aggregate snapshot without deriving from missing details', () => {
    const counts: ArticleCounts = {
      annotationCount: 8,
      thoughtCount: 5,
      discussionCommentCount: 3,
      aiCommentCount: 2,
      distillationCount: 1,
    };

    expect(articleCounts({ counts })).toBe(counts);
  });
});
