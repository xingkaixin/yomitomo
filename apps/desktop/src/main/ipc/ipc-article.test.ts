import { describe, expect, it, vi } from 'vitest';
import { cleanupDeletedArticleSourceAssets } from './ipc-article';

const storageMocks = vi.hoisted(() => ({
  deleteEbookSourceFile: vi.fn<(articleId: string) => Promise<void>>(),
  deletePdfSourceFile: vi.fn<(articleId: string) => Promise<void>>(),
  deletePdfThumbnail: vi.fn<(articleId: string) => Promise<void>>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
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
