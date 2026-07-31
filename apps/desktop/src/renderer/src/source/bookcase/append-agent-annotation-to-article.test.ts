import { describe, expect, it, vi } from 'vitest';
import type { Annotation } from '@yomitomo/shared';
import { appendAgentAnnotationToArticle } from './append-agent-annotation-to-article';

const annotation: Annotation = {
  id: 'annotation_1',
  anchor: { exact: 'text', prefix: '', suffix: '', start: 0, end: 4 },
  author: { kind: 'agent', agentId: 'agent_1', username: 'agent' },
  color: '#f4c95d',
  comments: [],
  distillation: { status: 'published', content: 'thought' },
  createdAt: '2026-07-31T00:00:00.000Z',
  updatedAt: '2026-07-31T00:00:00.000Z',
};

describe('appendAgentAnnotationToArticle', () => {
  it('merges optimistically before persisting and keeps the persisted active annotation open', async () => {
    let currentAnnotations: Annotation[] = [];
    const applyAnnotations = vi.fn((nextAnnotations: Annotation[]) => {
      currentAnnotations = nextAnnotations;
    });
    const mergeArticleAgentAnnotation = vi.fn(async () => ({ activeId: annotation.id }));
    const onOpenAnnotation = vi.fn();

    await appendAgentAnnotationToArticle({
      annotations: () => currentAnnotations,
      applyAnnotations,
      annotation,
      articleId: 'article_1',
      isCurrentArticle: (articleId) => articleId === 'article_1',
      mergeArticleAgentAnnotation,
      onOpenAnnotation,
    });

    expect(applyAnnotations).toHaveBeenCalledWith([annotation]);
    expect(mergeArticleAgentAnnotation).toHaveBeenCalledWith('article_1', annotation);
    expect(onOpenAnnotation).toHaveBeenNthCalledWith(1, annotation.id);
    expect(onOpenAnnotation).toHaveBeenNthCalledWith(2, annotation.id);
  });

  it('clears the active annotation when the source cannot show its persisted location', async () => {
    let currentAnnotations: Annotation[] = [];
    const applyAnnotations = vi.fn((nextAnnotations: Annotation[]) => {
      currentAnnotations = nextAnnotations;
    });
    const onOpenAnnotation = vi.fn();

    await appendAgentAnnotationToArticle({
      annotations: () => currentAnnotations,
      applyAnnotations,
      annotation,
      articleId: 'article_1',
      isAnnotationVisible: () => false,
      isCurrentArticle: (articleId) => articleId === 'article_1',
      mergeArticleAgentAnnotation: async () => ({ activeId: annotation.id }),
      onOpenAnnotation,
    });

    expect(onOpenAnnotation).toHaveBeenNthCalledWith(1, null);
    expect(onOpenAnnotation).toHaveBeenNthCalledWith(2, null);
  });
});
