import { Effect } from 'effect';
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
  fetchWeReadBookDetailEffect: (apiKey: string, bookId: string) =>
    Effect.tryPromise({
      try: () => fetchWeReadBookDetail(apiKey, bookId),
      catch: (error) => error,
    }),
  fetchWeReadBookDetail: vi.fn(),
  fetchWeReadNotebooksEffect: (apiKey: string) =>
    Effect.tryPromise({ try: () => fetchWeReadNotebooks(apiKey), catch: (error) => error }),
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
  it('serializes automatic and manual snapshots from fetch through persistence', async () => {
    let releaseNotebooks!: (books: WeReadBook[]) => void;
    const notebooks = new Promise<WeReadBook[]>((resolve) => {
      releaseNotebooks = resolve;
    });
    vi.mocked(fetchWeReadNotebooks)
      .mockReturnValueOnce(notebooks)
      .mockResolvedValueOnce([bookFixture('book_old'), bookFixture('book_new')]);
    vi.mocked(fetchWeReadBookDetail).mockImplementation(async (_key, bookId) =>
      bookDetailFixture(bookId),
    );
    const snapshots: string[][] = [];
    const persistence = {
      readWeReadApiKeyRef: () => 'weread-key-ref',
      readStoredWeReadApiKey: vi.fn(async () => 'weread-key'),
      saveWeReadLibrarySnapshot: vi.fn(async (input: { authoritativeBookIds: string[] }) => {
        snapshots.push(input.authoritativeBookIds);
        return syncResult();
      }),
    };
    const automatic = syncWeReadLibrary({ persistence, reason: 'auto:startup', ...testLogger() });
    await vi.waitFor(() => expect(fetchWeReadNotebooks).toHaveBeenCalledOnce());
    const manual = syncWeReadLibrary({ persistence, reason: 'manual', ...testLogger() });
    await new Promise<void>((resolve) => setImmediate(resolve));
    const apiKeyReadsBeforeCompletion = persistence.readStoredWeReadApiKey.mock.calls.length;
    releaseNotebooks([bookFixture('book_old')]);
    await Promise.all([automatic, manual]);

    expect(apiKeyReadsBeforeCompletion).toBe(1);
    expect(snapshots).toEqual([['book_old'], ['book_old', 'book_new']]);
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
      readWeReadApiKeyRef: () => 'weread-key-ref',
      readStoredWeReadApiKey: vi.fn(async () => 'weread-key'),
      saveWeReadLibrarySnapshot: vi.fn(async () => result),
    };
    const logger = testLogger();

    await expect(
      syncWeReadLibrary({
        persistence,
        reason: 'manual',
        ...logger,
      }),
    ).resolves.toBe(result);

    expect(fetchWeReadBookDetail).toHaveBeenCalledWith('weread-key', 'book_1');
    expect(fetchWeReadBookDetail).toHaveBeenCalledWith('weread-key', 'book_empty');
    expect(persistence.saveWeReadLibrarySnapshot).toHaveBeenCalledWith(
      {
        details: [
          expect.objectContaining({
            book: expect.objectContaining({
              bookId: 'book_1',
              title: 'Notebook Title',
            }),
          }),
        ],
        authoritativeBookIds: ['book_1', 'book_empty'],
        apiKeyRef: 'weread-key-ref',
      },
      logger.logInfo,
    );
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
