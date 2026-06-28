import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeReadBook, WeReadBookDetail } from '@yomitomo/shared';
import { syncWeReadLibrary } from './weread-sync';
import {
  fetchWeReadBookDetail,
  fetchWeReadNotebooks,
  hasValidWeReadBookDetailContent,
  mergeWeReadNotebookBook,
} from './weread-client';

vi.mock('./weread-client', () => ({
  fetchWeReadBookDetail: vi.fn(),
  fetchWeReadNotebooks: vi.fn(),
  hasValidWeReadBookDetailContent: vi.fn(),
  mergeWeReadNotebookBook: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hasValidWeReadBookDetailContent).mockImplementation(
    (bookDetail) => bookDetail.highlights.length + bookDetail.thoughts.length > 0,
  );
  vi.mocked(mergeWeReadNotebookBook).mockImplementation((bookDetail, notebookBook) => ({
    ...bookDetail,
    book: { ...bookDetail.book, ...notebookBook },
  }));
});

describe('syncWeReadLibrary', () => {
  it('rejects before loading notebooks when the API key is missing', async () => {
    const persistence = {
      readStoredWeReadApiKey: vi.fn(async () => ''),
      saveWeReadBookDetails: vi.fn(),
    };
    const logger = testLogger();

    await expect(
      syncWeReadLibrary({
        persistence,
        reason: 'manual',
        ...logger,
      }),
    ).rejects.toThrow('WEREAD_API_KEY_REQUIRED');

    expect(fetchWeReadNotebooks).not.toHaveBeenCalled();
    expect(persistence.saveWeReadBookDetails).not.toHaveBeenCalled();
    expect(logger.logInfo).not.toHaveBeenCalled();
    expect(logger.logError).not.toHaveBeenCalled();
  });

  it('saves an empty detail list when the notebook library is empty', async () => {
    vi.mocked(fetchWeReadNotebooks).mockResolvedValueOnce([]);
    const result = syncResult();
    const persistence = {
      readStoredWeReadApiKey: vi.fn(async () => 'weread-key'),
      saveWeReadBookDetails: vi.fn(async () => result),
    };
    const logger = testLogger();

    await expect(
      syncWeReadLibrary({
        persistence,
        reason: 'startup',
        ...logger,
      }),
    ).resolves.toBe(result);

    expect(fetchWeReadNotebooks).toHaveBeenCalledWith('weread-key');
    expect(fetchWeReadBookDetail).not.toHaveBeenCalled();
    expect(persistence.saveWeReadBookDetails).toHaveBeenCalledWith([]);
    expect(logger.logInfo).toHaveBeenCalledWith('weread.sync.complete', {
      reason: 'startup',
      bookCount: 0,
      detailCount: 0,
      durationMs: 1,
    });
  });

  it('fetches book details, merges notebook metadata, and skips empty details', async () => {
    vi.mocked(fetchWeReadNotebooks).mockResolvedValueOnce([
      bookFixture('book_1', 'Notebook Title'),
      bookFixture('book_empty', 'Empty Notebook'),
    ]);
    vi.mocked(fetchWeReadBookDetail).mockImplementation(async (_apiKey, bookId) =>
      bookDetailFixture(bookId, {
        title: `Detail ${bookId}`,
        thoughtCount: bookId === 'book_empty' ? 0 : 1,
      }),
    );
    const result = syncResult();
    const persistence = {
      readStoredWeReadApiKey: vi.fn(async () => 'weread-key'),
      saveWeReadBookDetails: vi.fn(async () => result),
    };

    await expect(
      syncWeReadLibrary({
        persistence,
        reason: 'manual',
        ...testLogger(),
      }),
    ).resolves.toBe(result);

    expect(fetchWeReadBookDetail).toHaveBeenCalledWith('weread-key', 'book_1');
    expect(fetchWeReadBookDetail).toHaveBeenCalledWith('weread-key', 'book_empty');
    expect(persistence.saveWeReadBookDetails).toHaveBeenCalledWith([
      expect.objectContaining({
        book: expect.objectContaining({
          bookId: 'book_1',
          title: 'Notebook Title',
        }),
      }),
    ]);
  });

  it('logs sync failure and does not persist partial details when a detail fetch fails', async () => {
    const error = new Error('detail timeout');
    vi.mocked(fetchWeReadNotebooks).mockResolvedValueOnce([bookFixture('book_failed')]);
    vi.mocked(fetchWeReadBookDetail).mockRejectedValueOnce(error);
    const persistence = {
      readStoredWeReadApiKey: vi.fn(async () => 'weread-key'),
      saveWeReadBookDetails: vi.fn(),
    };
    const logger = testLogger();

    await expect(
      syncWeReadLibrary({
        persistence,
        reason: 'auto',
        ...logger,
      }),
    ).rejects.toThrow(error);

    expect(persistence.saveWeReadBookDetails).not.toHaveBeenCalled();
    expect(logger.logError).toHaveBeenCalledWith(
      'weread.sync.book_detail_failed',
      error,
      expect.objectContaining({ bookId: 'book_failed', stage: 'book_detail' }),
    );
    expect(logger.logError).toHaveBeenCalledWith('weread.sync.failed', error, {
      reason: 'auto',
      durationMs: 1,
    });
  });
});

function testLogger() {
  return {
    logInfo: vi.fn(),
    logError: vi.fn(),
    elapsedMs: () => 1,
  };
}

function syncResult() {
  return {
    settings: {
      configured: true,
      openMethod: 'deeplink' as const,
      syncMode: 'manual' as const,
      status: 'connected' as const,
    },
    books: [],
  };
}

function bookFixture(bookId: string, title = bookId): WeReadBook {
  return {
    bookId,
    title,
    reviewCount: 1,
    noteCount: 1,
    bookmarkCount: 0,
    readingProgress: 0,
    syncedAt: '2026-06-28T00:00:00.000Z',
    updatedAt: '2026-06-28T00:00:00.000Z',
  };
}

function bookDetailFixture(
  bookId: string,
  options: {
    title?: string;
    thoughtCount?: number;
  } = {},
): WeReadBookDetail {
  const thoughtCount = options.thoughtCount ?? 1;
  return {
    book: bookFixture(bookId, options.title || bookId),
    chapters: [],
    highlights: [],
    thoughts: Array.from({ length: thoughtCount }, (_, index) => ({
      reviewId: `thought_${bookId}_${index}`,
      bookId,
      content: 'note',
      chapterUid: 1,
      chapterIdx: 1,
      range: '0-1',
      createTime: 0,
    })),
  };
}
