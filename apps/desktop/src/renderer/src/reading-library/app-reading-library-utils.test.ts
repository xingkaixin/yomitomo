import { describe, expect, it } from 'vitest';
import type { ArticleRecord } from '@yomitomo/shared';
import {
  articleAnnotationCount,
  articleDistillationCount,
  articleThoughtCount,
} from './app-reading-library-utils';

describe('article library counts', () => {
  it('reports annotation-derived counts consistently', () => {
    const createdAt = '2026-07-27T08:00:00.000Z';
    const article: ArticleRecord = {
      id: 'article_1',
      url: 'https://example.com/article',
      canonicalUrl: 'https://example.com/article',
      sourceType: 'web',
      title: 'Article',
      contentHash: 'hash_1',
      annotations: [
        {
          id: 'annotation_1',
          anchor: { exact: 'text', prefix: '', suffix: '', start: 0, end: 4 },
          author: 'user',
          color: '#f4c95d',
          comments: [
            {
              id: 'thought_1',
              author: 'user',
              content: '想法',
              createdAt,
            },
            {
              id: 'reply_1',
              author: 'ai',
              content: '回复',
              createdAt,
              replyTo: 'thought_1',
            },
          ],
          distillation: {
            status: 'published',
            content: '沉淀',
            publishedAt: createdAt,
          },
          createdAt,
          updatedAt: createdAt,
        },
      ],
      createdAt,
      updatedAt: createdAt,
    };

    expect({
      annotations: articleAnnotationCount(article),
      thoughts: articleThoughtCount(article),
      distillations: articleDistillationCount(article),
    }).toEqual({
      annotations: 1,
      thoughts: 1,
      distillations: 1,
    });
  });
});
