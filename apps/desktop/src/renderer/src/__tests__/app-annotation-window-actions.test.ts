import { describe, expect, it, vi } from 'vitest';
import { createAnnotationWindowActions } from '../annotation-discussion/app-annotation-window-actions';

describe('annotation window actions', () => {
  it('loads the article and store together', async () => {
    const article = { id: 'article-1' };
    const store = { agents: [] };
    const getArticle = vi.fn().mockResolvedValue(article);
    const getState = vi.fn().mockResolvedValue(store);
    const actions = createAnnotationWindowActions(
      () => ({ getArticle, getState }) as unknown as AnnotationWindowDesktopApi,
    );

    await expect(actions.loadWindow('article-1')).resolves.toEqual({ article, store });
    expect(getArticle).toHaveBeenCalledWith('article-1');
    expect(getState).toHaveBeenCalledOnce();
  });

  it('reloads the latest article after deleting a comment', async () => {
    const deleteArticleComment = vi.fn().mockResolvedValue(undefined);
    const getArticle = vi.fn().mockResolvedValue({ id: 'article-1', annotations: [] });
    const actions = createAnnotationWindowActions(
      () => ({ deleteArticleComment, getArticle }) as unknown as AnnotationWindowDesktopApi,
    );

    await actions.deleteCommentAndReload('article-1', 'annotation-1', 'comment-1');

    expect(deleteArticleComment).toHaveBeenCalledWith('article-1', 'annotation-1', 'comment-1');
    expect(deleteArticleComment.mock.invocationCallOrder[0]).toBeLessThan(
      getArticle.mock.invocationCallOrder[0],
    );
  });

  it('reloads only when a distillation patch was saved', async () => {
    const saveArticleAnnotationDistillation = vi
      .fn()
      .mockResolvedValueOnce({ article: { id: 'article-1' } })
      .mockResolvedValueOnce(null);
    const getArticle = vi.fn().mockResolvedValue({ id: 'article-1' });
    const actions = createAnnotationWindowActions(
      () =>
        ({
          saveArticleAnnotationDistillation,
          getArticle,
        }) as unknown as AnnotationWindowDesktopApi,
    );
    const input = {
      articleId: 'article-1',
      annotationId: 'annotation-1',
      distillation: undefined,
      updatedAt: '2026-07-19T00:00:00.000Z',
    };

    await expect(actions.saveDistillationAndReload(input)).resolves.toEqual({ id: 'article-1' });
    await expect(actions.saveDistillationAndReload(input)).resolves.toBeNull();
    expect(getArticle).toHaveBeenCalledOnce();
  });

  it('returns a no-op subscription when patch events are unavailable', () => {
    const actions = createAnnotationWindowActions(
      () => ({ onArticlePatched: false }) as unknown as AnnotationWindowDesktopApi,
    );

    expect(() => actions.subscribeToArticlePatches(vi.fn())()).not.toThrow();
  });
});

type AnnotationWindowDesktopApi = ReturnType<Parameters<typeof createAnnotationWindowActions>[0]>;
