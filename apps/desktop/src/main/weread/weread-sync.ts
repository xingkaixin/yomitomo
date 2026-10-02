import { performance } from 'node:perf_hooks';
import { Effect } from 'effect';
import type { WeReadBook, WeReadBookDetail, WeReadSyncResult } from '@yomitomo/shared';

const WEREAD_SYNC_DETAIL_CONCURRENCY = 3;

type WeReadSyncLogger = {
  logInfo: (event: string, data?: Record<string, unknown>) => void;
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => void;
  elapsedMs?: (startedAt: number) => number;
};

type WeReadSyncPersistence = {
  readStoredWeReadApiKey: () => Promise<string>;
  saveWeReadLibrarySnapshot: (
    input: {
      details: WeReadBookDetail[];
      authoritativeBookIds: string[];
    },
    logInfo?: WeReadSyncLogger['logInfo'],
  ) => Promise<WeReadSyncResult>;
};

type WeReadSyncInput = {
  persistence: WeReadSyncPersistence;
  reason: string;
} & WeReadSyncLogger;

let librarySyncQueue: Promise<void> = Promise.resolve();

export function syncWeReadLibrary(input: WeReadSyncInput) {
  const result = librarySyncQueue.then(() => Effect.runPromise(runWeReadLibrarySyncEffect(input)));
  librarySyncQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

const runWeReadLibrarySyncEffect = Effect.fn('WeRead.syncLibrary')(function* (
  input: WeReadSyncInput,
) {
  const startedAt = performance.now();
  const apiKey = yield* Effect.tryPromise({
    try: () => input.persistence.readStoredWeReadApiKey(),
    catch: (error) => error,
  });
  if (!apiKey) return yield* Effect.fail(new Error('WEREAD_API_KEY_REQUIRED'));

  const client = yield* Effect.tryPromise({
    try: () => import('./weread-client'),
    catch: (error) => error,
  });
  input.logInfo('weread.sync.start', { reason: input.reason });
  return yield* Effect.gen(function* () {
    const notebooksStartedAt = performance.now();
    const books = yield* client.fetchWeReadNotebooksEffect(apiKey);
    input.logInfo('weread.sync.notebooks_loaded', {
      reason: input.reason,
      bookCount: books.length,
      durationMs: elapsedMs(input, notebooksStartedAt),
    });
    const details = yield* fetchWeReadSyncDetailsEffect({
      books,
      fetchBookDetail: (bookId) => client.fetchWeReadBookDetailEffect(apiKey, bookId),
      hasValidContent: client.hasValidWeReadBookDetailContent,
      logError: input.logError,
      logInfo: input.logInfo,
      mergeNotebookBook: client.mergeWeReadNotebookBook,
      elapsedMs: input.elapsedMs,
    });
    const result = yield* Effect.tryPromise({
      try: () =>
        input.persistence.saveWeReadLibrarySnapshot(
          { details, authoritativeBookIds: books.map((book) => book.bookId) },
          input.logInfo,
        ),
      catch: (error) => error,
    });
    input.logInfo('weread.sync.complete', {
      reason: input.reason,
      bookCount: books.length,
      detailCount: details.length,
      durationMs: elapsedMs(input, startedAt),
    });
    return result;
  }).pipe(
    Effect.tapError((error) =>
      Effect.sync(() =>
        input.logError('weread.sync.failed', error, {
          reason: input.reason,
          durationMs: elapsedMs(input, startedAt),
        }),
      ),
    ),
  );
});

export const fetchWeReadSyncDetailsEffect = Effect.fn('WeRead.fetchSyncDetails')(function* (input: {
  books: WeReadBook[];
  fetchBookDetail: (bookId: string) => Effect.Effect<WeReadBookDetail, unknown>;
  hasValidContent: (detail: WeReadBookDetail) => boolean;
  mergeNotebookBook: (detail: WeReadBookDetail, book: WeReadBook) => WeReadBookDetail;
  logInfo: WeReadSyncLogger['logInfo'];
  logError: WeReadSyncLogger['logError'];
  elapsedMs?: (startedAt: number) => number;
  concurrency?: number;
}) {
  const details = yield* Effect.forEach(
    input.books,
    (book) =>
      Effect.gen(function* () {
        const startedAt = performance.now();
        const detail = yield* input.fetchBookDetail(book.bookId).pipe(
          Effect.map((value) => input.mergeNotebookBook(value, book)),
          Effect.tapError((error) =>
            Effect.sync(() =>
              input.logError('weread.sync.book_detail_failed', error, {
                bookId: book.bookId,
                title: book.title,
                stage: 'book_detail',
                durationMs: elapsedMs(input, startedAt),
              }),
            ),
          ),
        );
        input.logInfo('weread.sync.book_detail_loaded', {
          bookId: book.bookId,
          title: book.title,
          stage: 'book_detail',
          durationMs: elapsedMs(input, startedAt),
        });
        return input.hasValidContent(detail) ? detail : undefined;
      }),
    { concurrency: Math.max(1, input.concurrency ?? WEREAD_SYNC_DETAIL_CONCURRENCY) },
  );
  return details.filter((detail): detail is WeReadBookDetail => detail !== undefined);
});

function elapsedMs(input: { elapsedMs?: (startedAt: number) => number }, startedAt: number) {
  return input.elapsedMs?.(startedAt) ?? Number((performance.now() - startedAt).toFixed(2));
}
