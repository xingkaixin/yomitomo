import { performance } from 'node:perf_hooks';
import type { WeReadBook, WeReadBookDetail, WeReadSyncResult } from '@yomitomo/shared';

const WEREAD_SYNC_DETAIL_CONCURRENCY = 3;

type WeReadSyncLogger = {
  logInfo: (event: string, data?: Record<string, unknown>) => void;
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => void;
  elapsedMs?: (startedAt: number) => number;
};

type WeReadSyncPersistence = {
  readStoredWeReadApiKey: () => Promise<string>;
  saveWeReadLibrarySnapshot: (input: {
    details: WeReadBookDetail[];
    authoritativeBookIds: string[];
  }) => Promise<WeReadSyncResult>;
};

export async function syncWeReadLibrary(
  input: {
    persistence: WeReadSyncPersistence;
    reason: string;
  } & WeReadSyncLogger,
) {
  const startedAt = performance.now();
  const apiKey = await input.persistence.readStoredWeReadApiKey();
  if (!apiKey) throw new Error('WEREAD_API_KEY_REQUIRED');

  const {
    fetchWeReadBookDetail,
    fetchWeReadNotebooks,
    hasValidWeReadBookDetailContent,
    mergeWeReadNotebookBook,
  } = await import('./weread-client');
  input.logInfo('weread.sync.start', { reason: input.reason });
  try {
    const notebooksStartedAt = performance.now();
    const books = await fetchWeReadNotebooks(apiKey);
    input.logInfo('weread.sync.notebooks_loaded', {
      reason: input.reason,
      bookCount: books.length,
      durationMs: elapsedMs(input, notebooksStartedAt),
    });
    const details = await fetchWeReadSyncDetails({
      books,
      fetchBookDetail: (bookId) => fetchWeReadBookDetail(apiKey, bookId),
      hasValidContent: hasValidWeReadBookDetailContent,
      logError: input.logError,
      logInfo: input.logInfo,
      mergeNotebookBook: mergeWeReadNotebookBook,
      elapsedMs: input.elapsedMs,
    });
    const result = await input.persistence.saveWeReadLibrarySnapshot({
      details,
      authoritativeBookIds: books.map((book) => book.bookId),
    });
    input.logInfo('weread.sync.complete', {
      reason: input.reason,
      bookCount: books.length,
      detailCount: details.length,
      durationMs: elapsedMs(input, startedAt),
    });
    return result;
  } catch (error) {
    input.logError('weread.sync.failed', error, {
      reason: input.reason,
      durationMs: elapsedMs(input, startedAt),
    });
    throw error;
  }
}

export async function fetchWeReadSyncDetails(input: {
  books: WeReadBook[];
  fetchBookDetail: (bookId: string) => Promise<WeReadBookDetail>;
  hasValidContent: (detail: WeReadBookDetail) => boolean;
  mergeNotebookBook: (detail: WeReadBookDetail, book: WeReadBook) => WeReadBookDetail;
  logInfo: WeReadSyncLogger['logInfo'];
  logError: WeReadSyncLogger['logError'];
  elapsedMs?: (startedAt: number) => number;
  concurrency?: number;
}) {
  const concurrency = Math.max(1, input.concurrency ?? WEREAD_SYNC_DETAIL_CONCURRENCY);
  const details: Array<WeReadBookDetail | undefined> = [];
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      const book = input.books[index];
      if (!book) return;

      const startedAt = performance.now();
      try {
        const detail = input.mergeNotebookBook(await input.fetchBookDetail(book.bookId), book);
        if (input.hasValidContent(detail)) details[index] = detail;
        input.logInfo('weread.sync.book_detail_loaded', {
          bookId: book.bookId,
          title: book.title,
          stage: 'book_detail',
          durationMs: elapsedMs(input, startedAt),
        });
      } catch (error) {
        input.logError('weread.sync.book_detail_failed', error, {
          bookId: book.bookId,
          title: book.title,
          stage: 'book_detail',
          durationMs: elapsedMs(input, startedAt),
        });
        throw error;
      }
    }
  }

  const workerCount = Math.min(concurrency, input.books.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return details.filter((detail): detail is WeReadBookDetail => Boolean(detail));
}

function elapsedMs(input: { elapsedMs?: (startedAt: number) => number }, startedAt: number) {
  return input.elapsedMs?.(startedAt) ?? Number((performance.now() - startedAt).toFixed(2));
}
