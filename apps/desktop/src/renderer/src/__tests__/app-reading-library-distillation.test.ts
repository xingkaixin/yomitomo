import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  articleDistillationStateChanged,
  articleReusingAnnotations,
  articleWithCommittedDistillation,
  articleWithDistillationAnimationStart,
  nextDistillationAnimationArticleUpdatedAt,
} from '../reading-library/app-reading-library-distillation';
import {
  annotation,
  annotationWithPublishedDistillation,
  article,
} from './app-reading-library-fixtures';

afterEach(() => {
  vi.useRealTimers();
});

describe('articleReusingAnnotations', () => {
  it('keeps unchanged annotation objects so their cards skip rendering', () => {
    const unchanged = annotation('note_1');
    const current = article({ annotations: [unchanged, annotation('note_2')] });
    const changed = annotationWithPublishedDistillation('note_2');
    const reloaded = article({ annotations: [structuredClone(unchanged), changed] });

    const result = articleReusingAnnotations(current, reloaded);

    expect(result.annotations[0]).toBe(unchanged);
    expect(result.annotations[1]).toBe(changed);
  });

  it('leaves an article alone when another article is open', () => {
    const reloaded = article({ annotations: [annotation('note_1')] });

    expect(articleReusingAnnotations(article({ id: 'article_2' }), reloaded)).toBe(reloaded);
  });
});

describe('articleWithDistillationAnimationStart', () => {
  it('starts publish morph from the unpublished annotation card state', () => {
    const published = annotationWithPublishedDistillation('note_1');
    const result = articleWithDistillationAnimationStart(
      article({ annotations: [published] }),
      {
        articleId: 'article_1',
        annotationId: 'note_1',
        distillation: published.distillation,
        transition: 'publish',
      },
      '2026-05-09T12:04:00.001Z',
    );

    expect(result.annotations[0]?.distillation?.status).toBe('unpublished');
    expect(result.updatedAt).toBe('2026-05-09T12:04:00.001Z');
  });

  it('starts unpublish morph from the published distillation card state', () => {
    const unpublished = {
      ...annotationWithPublishedDistillation('note_1'),
      distillation: {
        status: 'unpublished' as const,
        content: '沉淀 note_1',
        publishedAt: '2026-05-09T12:04:00.000Z',
      },
    };
    const result = articleWithDistillationAnimationStart(article({ annotations: [unpublished] }), {
      articleId: 'article_1',
      annotationId: 'note_1',
      distillation: unpublished.distillation,
      transition: 'unpublish',
    });

    expect(result.annotations[0]?.distillation?.status).toBe('published');
  });

  it('commits publish morph to a newer published article state', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T12:04:00.020Z'));

    const published = annotationWithPublishedDistillation('note_1');
    const currentArticle = article({
      updatedAt: '2026-05-09T12:04:00.000Z',
      annotations: [
        {
          ...published,
          distillation: {
            ...published.distillation!,
            status: 'unpublished',
            updatedAt: '2026-05-09T12:04:00.000Z',
          },
        },
      ],
    });
    const result = articleWithCommittedDistillation(currentArticle, {
      articleId: 'article_1',
      annotationId: 'note_1',
      distillation: currentArticle.annotations[0]?.distillation,
      transition: 'publish',
    });

    expect(result.annotations[0]?.distillation?.status).toBe('published');
    expect(Date.parse(result.updatedAt)).toBeGreaterThan(Date.parse(currentArticle.updatedAt));
  });

  it('commits unpublish morph to a newer annotation card state', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T12:04:00.020Z'));

    const published = annotationWithPublishedDistillation('note_1');
    const currentArticle = article({
      updatedAt: '2026-05-09T12:04:00.000Z',
      annotations: [
        {
          ...published,
          distillation: {
            ...published.distillation!,
            status: 'published',
            updatedAt: '2026-05-09T12:04:00.000Z',
          },
        },
      ],
    });
    const result = articleWithCommittedDistillation(currentArticle, {
      articleId: 'article_1',
      annotationId: 'note_1',
      distillation: currentArticle.annotations[0]?.distillation,
      transition: 'unpublish',
    });

    expect(result.annotations[0]?.distillation?.status).toBe('unpublished');
    expect(Date.parse(result.updatedAt)).toBeGreaterThan(Date.parse(currentArticle.updatedAt));
  });

  it('keeps repeated distillation morph article timestamps monotonic', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T12:04:00.000Z'));

    const previousAnimationUpdatedAt = '2026-05-09T12:04:00.020Z';
    const nextUpdatedAt = nextDistillationAnimationArticleUpdatedAt(
      '2026-05-09T12:04:00.000Z',
      '2026-05-09T12:04:00.000Z',
      previousAnimationUpdatedAt,
    );

    expect(Date.parse(nextUpdatedAt)).toBeGreaterThan(Date.parse(previousAnimationUpdatedAt));
  });

  it('detects distillation status changes separately from other article syncs', () => {
    const previous = article({
      annotations: [
        {
          ...annotation('note_1'),
          distillation: {
            status: 'unpublished',
            content: '沉淀 note_1',
          },
        },
      ],
    });
    const next = article({
      annotations: [
        {
          ...annotation('note_1'),
          distillation: {
            status: 'published',
            content: '沉淀 note_1',
            publishedAt: '2026-05-09T12:03:00.000Z',
          },
        },
      ],
    });

    expect(articleDistillationStateChanged(previous, next)).toBe(true);
    expect(
      articleDistillationStateChanged(previous, {
        ...previous,
        updatedAt: '2026-05-09T12:03:00.000Z',
      }),
    ).toBe(false);
  });
});
