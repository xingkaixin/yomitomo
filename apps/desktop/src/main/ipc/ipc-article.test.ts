import { describe, expect, it, vi } from 'vitest';
import type { Annotation } from '@yomitomo/shared';
import { cleanupDeletedArticleSourceAssets, registerArticleIpc } from './ipc-article';
import type { DesktopMainIpcContext } from './ipc';

const storageMocks = vi.hoisted(() => ({
  deleteEbookSourceFile: vi.fn<(articleId: string) => Promise<void>>(),
  deletePdfSourceFile: vi.fn<(articleId: string) => Promise<void>>(),
  deletePdfThumbnail: vi.fn<(articleId: string) => Promise<void>>(),
  ipcMainHandle: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: storageMocks.ipcMainHandle,
  },
}));

vi.mock('../ebooks/ebook-storage', () => ({
  deleteEbookSourceFile: storageMocks.deleteEbookSourceFile,
}));

vi.mock('../pdf/pdf-storage', () => ({
  deletePdfSourceFile: storageMocks.deletePdfSourceFile,
}));

vi.mock('../pdf/pdf-thumbnail-storage', () => ({
  deletePdfThumbnail: storageMocks.deletePdfThumbnail,
}));

describe('article IPC source asset cleanup', () => {
  it('deletes EPUB source assets', async () => {
    storageMocks.deleteEbookSourceFile.mockResolvedValue();
    const logError = vi.fn();

    await cleanupDeletedArticleSourceAssets({
      articleId: 'epub-article',
      sourceType: 'ebook',
      logError,
    });

    expect(storageMocks.deleteEbookSourceFile).toHaveBeenCalledWith('epub-article');
    expect(storageMocks.deletePdfSourceFile).not.toHaveBeenCalled();
    expect(storageMocks.deletePdfThumbnail).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('logs and reports cleanup failures', async () => {
    const error = new Error('delete failed');
    storageMocks.deleteEbookSourceFile.mockRejectedValue(error);
    const logError = vi.fn();

    await expect(
      cleanupDeletedArticleSourceAssets({
        articleId: 'epub-article',
        sourceType: 'ebook',
        logError,
      }),
    ).rejects.toThrow('ARTICLE_SOURCE_CLEANUP_FAILED');

    expect(logError).toHaveBeenCalledWith('article_source.cleanup_failed', error, {
      articleId: 'epub-article',
      sourceType: 'ebook',
    });
  });
});

describe('article IPC patch broadcasts', () => {
  it('broadcasts article patches after saving annotations', async () => {
    storageMocks.ipcMainHandle.mockClear();
    const annotation: Annotation = {
      id: 'annotation_1',
      anchor: { exact: 'quote', prefix: '', suffix: '', start: 0, end: 5 },
      author: 'user',
      color: '#f4c95d',
      comments: [],
      createdAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:00.000Z',
    };
    const patch = {
      type: 'article-upsert' as const,
      article: {
        id: 'article_1',
        url: 'https://example.com',
        canonicalUrl: 'https://example.com',
        sourceType: 'web' as const,
        title: '文章',
        contentHash: 'hash',
        annotations: [annotation],
        commentCount: 1,
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:01:00.000Z',
      },
    };
    const saveArticleAnnotation = vi.fn().mockResolvedValue(patch);
    const sendArticlePatched = vi.fn();

    registerArticleIpc({
      getStoreModule: async () => ({ saveArticleAnnotation }),
      sendArticlePatched,
    } as unknown as DesktopMainIpcContext);

    const handler = storageMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'article:save-annotation',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    const result = await handler({}, { articleId: 'article_1', annotation });

    expect(result).toEqual({ ok: true, value: patch });
    expect(sendArticlePatched).toHaveBeenCalledWith(patch);
  });

  it('broadcasts article patches after deleting comments', async () => {
    storageMocks.ipcMainHandle.mockClear();
    const patch = {
      type: 'article-upsert' as const,
      article: {
        id: 'article_1',
        url: 'https://example.com',
        canonicalUrl: 'https://example.com',
        sourceType: 'web' as const,
        title: '文章',
        contentHash: 'hash',
        annotations: [],
        annotationCount: 1,
        commentCount: 0,
        aiCommentCount: 0,
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:01:00.000Z',
      },
    };
    const deleteArticleComment = vi.fn().mockResolvedValue(patch);
    const sendArticlePatched = vi.fn();

    registerArticleIpc({
      getStoreModule: async () => ({ deleteArticleComment }),
      sendArticlePatched,
    } as unknown as DesktopMainIpcContext);

    const handler = storageMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'article:delete-comment',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    const input = {
      articleId: 'article_1',
      annotationId: 'annotation_1',
      commentId: 'comment_1',
    };
    const result = await handler({}, input);

    expect(deleteArticleComment).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ok: true, value: patch });
    expect(sendArticlePatched).toHaveBeenCalledWith(patch);
  });
});
