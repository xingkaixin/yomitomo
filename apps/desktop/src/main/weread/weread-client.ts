import type {
  WeReadBook,
  WeReadBookDetail,
  WeReadChapter,
  WeReadHighlight,
  WeReadReadingStats,
  WeReadReadingStatsBook,
  WeReadReadingStatsItem,
  WeReadReadingStatsMode,
  WeReadThought,
  WeReadUser,
} from '@yomitomo/shared';
import { Effect } from 'effect';
import { withTimeoutAbortSignalEffect } from '../effect-abort-signal';

const WEREAD_GATEWAY_URL = 'https://i.weread.qq.com/api/agent/gateway';
export const WEREAD_REQUEST_TIMEOUT_MS = 30_000;
export const WEREAD_SKILL_VERSION = '1.0.3';

type WeReadGatewayResponse = Record<string, unknown>;
type WeReadClientError =
  | WeReadApiError
  | WeReadGatewayDecodeError
  | WeReadHttpError
  | WeReadNetworkError
  | WeReadTimeoutError
  | WeReadUpgradeError;

class WeReadHttpError extends Error {
  readonly _tag = 'WeReadHttpError';

  constructor(readonly status: number) {
    super(`WeRead request failed: HTTP ${status}`);
  }
}

class WeReadNetworkError extends Error {
  readonly _tag = 'WeReadNetworkError';

  constructor(cause: unknown) {
    super(`WeRead request failed: ${errorMessage(cause)}`);
  }
}

class WeReadTimeoutError extends Error {
  readonly _tag = 'WeReadTimeoutError';

  constructor(readonly apiName: string) {
    super(`WeRead request timed out: ${apiName}`);
  }
}

class WeReadGatewayDecodeError extends Error {
  readonly _tag = 'WeReadGatewayDecodeError';

  constructor(cause: unknown) {
    super(`Failed to parse WeRead response: ${errorMessage(cause)}`);
  }
}

class WeReadUpgradeError extends Error {
  readonly _tag = 'WeReadUpgradeError';

  constructor(message: string) {
    super(message || 'WeRead API version needs to be upgraded');
  }
}

class WeReadApiError extends Error {
  readonly _tag = 'WeReadApiError';

  constructor(
    readonly errcode: number,
    message: string,
  ) {
    super(message || `WeRead API returned error: ${errcode}`);
  }
}

export async function testWeReadConnection(apiKey: string) {
  const response = await Effect.runPromise(
    requestWeReadEffect(apiKey, '/user/notebooks', { count: 1 }),
  );
  await Effect.runPromise(decodeNotebookPageEffect(response));
  return { ok: true, message: 'OK' };
}

export async function fetchWeReadNotebooks(apiKey: string) {
  return Effect.runPromise(fetchWeReadNotebooksEffect(apiKey));
}

export async function fetchWeReadBookDetail(
  apiKey: string,
  bookId: string,
): Promise<WeReadBookDetail> {
  return Effect.runPromise(fetchWeReadBookDetailEffect(apiKey, bookId));
}

export async function fetchWeReadReadingStats(
  apiKey: string,
  mode: WeReadReadingStatsMode,
  baseTime?: number,
): Promise<WeReadReadingStats> {
  return Effect.runPromise(fetchWeReadReadingStatsEffect(apiKey, mode, baseTime));
}

export function mergeWeReadNotebookBook(
  detail: WeReadBookDetail,
  notebookBook: WeReadBook,
): WeReadBookDetail {
  return {
    ...detail,
    book: {
      ...detail.book,
      cover: detail.book.cover || notebookBook.cover,
      intro: detail.book.intro || notebookBook.intro,
      markedStatus: notebookBook.markedStatus,
      sort: notebookBook.sort,
      syncedAt: notebookBook.syncedAt,
      updatedAt: notebookBook.updatedAt,
    },
  };
}

export function hasValidWeReadBookDetailContent(detail: WeReadBookDetail) {
  return detail.highlights.length + detail.thoughts.length > 0;
}

function fetchWeReadNotebooksEffect(apiKey: string) {
  return Effect.gen(function* () {
    const books: WeReadBook[] = [];
    const bookIds = new Set<string>();
    let lastSort: number | undefined;

    for (let page = 0; page < 50; page += 1) {
      const response = yield* requestWeReadEffect(apiKey, '/user/notebooks', {
        count: 100,
        ...(lastSort === undefined ? {} : { lastSort }),
      });
      const notebookPage = yield* decodeNotebookPageEffect(response);
      for (const book of notebookPage.books) {
        if (bookIds.has(book.bookId)) {
          return yield* Effect.fail(
            new WeReadGatewayDecodeError(`duplicate notebook book: ${book.bookId}`),
          );
        }
        bookIds.add(book.bookId);
        books.push(book);
      }
      if (!notebookPage.hasMore) return sortWeReadNotebooks(books);

      const nextLastSort = notebookPage.books.at(-1)?.sort;
      if (nextLastSort === undefined || nextLastSort === lastSort) {
        return yield* Effect.fail(
          new WeReadGatewayDecodeError('incomplete notebooks pagination cursor'),
        );
      }
      lastSort = nextLastSort;
    }

    return yield* Effect.fail(
      new WeReadGatewayDecodeError('notebooks pagination exceeds 50 pages'),
    );
  });
}

function fetchWeReadBookDetailEffect(apiKey: string, bookId: string) {
  return Effect.gen(function* () {
    const [info, chaptersResponse, progressResponse, bookmarksResponse, thoughtsResponse] =
      yield* Effect.all(
        [
          requestWeReadEffect(apiKey, '/book/info', { bookId }),
          requestWeReadEffect(apiKey, '/book/chapterinfo', { bookId }),
          requestWeReadEffect(apiKey, '/book/getprogress', { bookId }),
          requestWeReadEffect(apiKey, '/book/bookmarklist', { bookId }),
          fetchWeReadThoughtsEffect(apiKey, bookId),
        ],
        { concurrency: 'unbounded' },
      );

    const chapterItems = yield* requiredObjectArrayEffect(
      chaptersResponse,
      '/book/chapterinfo',
      'chapters',
    );
    const bookmarkItems = yield* requiredObjectArrayEffect(
      bookmarksResponse,
      '/book/bookmarklist',
      'updated',
    );
    const chapters = chapterItems.map((item) => chapterFromResponse(bookId, item));
    const chapterIndexByUid = new Map(
      chapters.map((chapter) => [chapter.chapterUid, chapter.chapterIdx]),
    );
    const highlights = bookmarkItems
      .map((item) => highlightFromResponse(bookId, item, chapterIndexByUid))
      .filter(isValidWeReadHighlight);
    const thoughts = thoughtsResponse
      .map((item) => thoughtFromResponse(bookId, item, chapterIndexByUid))
      .filter(isValidWeReadThought);
    const book = withValidContentCounts(
      mergeBookInfo(notebookBookFromResponse({ bookId, book: info }), progressResponse),
      highlights,
      thoughts,
    );

    return { book, chapters, highlights, thoughts };
  });
}

function fetchWeReadReadingStatsEffect(
  apiKey: string,
  mode: WeReadReadingStatsMode,
  baseTime?: number,
) {
  return Effect.gen(function* () {
    const response = yield* requestWeReadEffect(apiKey, '/readdata/detail', {
      mode,
      ...(mode === 'overall' || baseTime === undefined ? {} : { baseTime }),
    });
    return readingStatsFromResponse(mode, response);
  });
}

function fetchWeReadThoughtsEffect(apiKey: string, bookId: string) {
  return Effect.gen(function* () {
    const thoughts: Record<string, unknown>[] = [];
    let synckey: number | undefined;

    for (let page = 0; page < 50; page += 1) {
      const response = yield* requestWeReadEffect(apiKey, '/review/list/mine', {
        bookid: bookId,
        count: 100,
        ...(synckey === undefined ? {} : { synckey }),
      });
      const reviewPage = yield* decodeCollectionPageEffect(
        response,
        '/review/list/mine',
        'reviews',
      );
      thoughts.push(...reviewPage.items);
      if (!reviewPage.hasMore) return thoughts;

      const nextSynckey = optionalNumber(response.synckey);
      if (nextSynckey === undefined) {
        return yield* Effect.fail(
          new WeReadGatewayDecodeError(`thoughts page ${page} is missing synckey`),
        );
      }
      if (synckey !== undefined && nextSynckey === synckey) {
        return yield* Effect.fail(
          new WeReadGatewayDecodeError(`thoughts page ${page} repeats synckey`),
        );
      }
      synckey = nextSynckey;
    }

    return yield* Effect.fail(new WeReadGatewayDecodeError('thoughts pagination exceeds 50 pages'));
  });
}

function requestWeReadEffect(
  apiKey: string,
  apiName: string,
  params: Record<string, unknown> = {},
): Effect.Effect<WeReadGatewayResponse, WeReadClientError> {
  return withTimeoutAbortSignalEffect(WEREAD_REQUEST_TIMEOUT_MS, [], (timeoutSignal) =>
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: (effectSignal) =>
          fetch(WEREAD_GATEWAY_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            signal: AbortSignal.any([timeoutSignal, effectSignal]),
            body: JSON.stringify({
              api_name: apiName,
              skill_version: WEREAD_SKILL_VERSION,
              ...params,
            }),
          }),
        catch: (error) =>
          isAbortError(error) ? new WeReadTimeoutError(apiName) : new WeReadNetworkError(error),
      });
      if (!response.ok) {
        return yield* Effect.fail(new WeReadHttpError(response.status));
      }

      const value = yield* Effect.tryPromise({
        try: () => response.json() as Promise<unknown>,
        catch: (error) =>
          isAbortError(error)
            ? new WeReadTimeoutError(apiName)
            : new WeReadGatewayDecodeError(error),
      });
      const data = objectValue(value);
      if (!data) {
        return yield* Effect.fail(
          new WeReadGatewayDecodeError('gateway response must be an object'),
        );
      }
      if (data.upgrade_info && typeof data.upgrade_info === 'object') {
        const message = stringValue(objectValue(data.upgrade_info)?.message);
        return yield* Effect.fail(new WeReadUpgradeError(message));
      }
      const errcode = numberValue(data.errcode);
      if (errcode) {
        return yield* Effect.fail(new WeReadApiError(errcode, stringValue(data.errmsg)));
      }
      return data;
    }),
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function notebookBookFromResponse(item: Record<string, unknown>): WeReadBook {
  const book = objectValue(item.book) || item;
  const now = new Date().toISOString();
  return {
    bookId: stringValue(item.bookId) || stringValue(book.bookId),
    title: stringValue(book.title) || '未命名书籍',
    author: stringValue(book.author) || undefined,
    cover: stringValue(book.cover) || undefined,
    intro: stringValue(book.intro) || undefined,
    reviewCount: numberValue(item.reviewCount),
    noteCount: numberValue(item.noteCount),
    bookmarkCount: numberValue(item.bookmarkCount),
    readingProgress: numberValue(item.readingProgress),
    markedStatus: optionalNumber(item.markedStatus),
    sort: optionalNumber(item.sort),
    syncedAt: now,
    updatedAt: now,
  };
}

function mergeBookInfo(book: WeReadBook, progressResponse: Record<string, unknown>): WeReadBook {
  const progress = objectValue(progressResponse.book);
  if (!progress) return book;
  return {
    ...book,
    readingProgress: numberValue(progress.progress),
    currentChapterUid: optionalNumber(progress.chapterUid),
    currentChapterOffset: optionalNumber(progress.chapterOffset),
    readingTime: optionalNumber(progress.readingTime),
    recordReadingTime: optionalNumber(progress.recordReadingTime),
    lastReadAt: optionalNumber(progress.updateTime),
  };
}

function withValidContentCounts(
  book: WeReadBook,
  highlights: WeReadHighlight[],
  thoughts: WeReadThought[],
): WeReadBook {
  return {
    ...book,
    reviewCount: thoughts.length,
    noteCount: highlights.length,
    bookmarkCount: highlights.length,
  };
}

function chapterFromResponse(bookId: string, item: Record<string, unknown>): WeReadChapter {
  return {
    bookId,
    chapterUid: numberValue(item.chapterUid),
    chapterIdx: numberValue(item.chapterIdx),
    title: stringValue(item.title) || '未命名章节',
    level: numberValue(item.level) || 1,
    wordCount: optionalNumber(item.wordCount),
  };
}

function highlightFromResponse(
  bookId: string,
  item: Record<string, unknown>,
  chapterIndexByUid: Map<number, number>,
): WeReadHighlight {
  const chapterUid = numberValue(item.chapterUid);
  return {
    bookmarkId:
      stringValue(item.bookmarkId) || `${bookId}:${chapterUid}:${stringValue(item.range)}`,
    bookId: stringValue(item.bookId) || bookId,
    chapterUid,
    chapterIdx: chapterIndexByUid.get(chapterUid),
    range: stringValue(item.range) || undefined,
    markText: stringValue(item.markText),
    colorStyle: optionalNumber(item.colorStyle),
    createTime: numberValue(item.createTime),
  };
}

function thoughtFromResponse(
  bookId: string,
  item: Record<string, unknown>,
  chapterIndexByUid: Map<number, number>,
): WeReadThought {
  const review = objectValue(item.review) || item;
  const chapterUid = optionalNumber(review.chapterUid);
  return {
    reviewId: stringValue(review.reviewId) || stringValue(item.reviewId),
    bookId: stringValue(review.bookId) || bookId,
    userVid: optionalNumber(review.userVid),
    author: userFromResponse(review.author),
    chapterUid,
    chapterIdx: chapterUid === undefined ? undefined : chapterIndexByUid.get(chapterUid),
    chapterName: stringValue(review.chapterName) || undefined,
    range: stringValue(review.range) || undefined,
    abstract: stringValue(review.abstract) || undefined,
    content: stringValue(review.content) || stringValue(review.htmlContent),
    createTime: numberValue(review.createTime),
  };
}

function isValidWeReadHighlight(highlight: WeReadHighlight) {
  return Boolean(highlight.chapterUid && highlight.range && highlight.markText.trim());
}

function isValidWeReadThought(thought: WeReadThought) {
  return Boolean(
    thought.chapterUid !== undefined &&
    thought.range &&
    (thought.abstract?.trim() || thought.content.trim()),
  );
}

function userFromResponse(value: unknown): WeReadUser | undefined {
  const user = objectValue(value);
  if (!user) return undefined;
  return {
    userVid: optionalNumber(user.userVid),
    name: stringValue(user.name) || undefined,
    avatar: stringValue(user.avatar) || undefined,
  };
}

function readingStatsFromResponse(
  mode: WeReadReadingStatsMode,
  response: Record<string, unknown>,
): WeReadReadingStats {
  return {
    mode,
    totalReadTime: numberValue(response.totalReadTime),
    readDays: optionalNumber(response.readDays),
    dayAverageReadTime: optionalNumber(response.dayAverageReadTime),
    compare: optionalNumber(response.compare),
    readRate: optionalNumber(response.readRate),
    wrReadTime: optionalNumber(response.wrReadTime),
    wrListenTime: optionalNumber(response.wrListenTime),
    readStat: arrayValue(response.readStat).map(readingStatsItemFromResponse),
    readTimes: numberMapFromResponse(response.readTimes),
    readLongest: arrayValue(response.readLongest).map(readingStatsBookFromResponse),
    preferCategory: arrayValue(response.preferCategory).map(readingStatsItemFromResponse),
    preferCategoryWord: stringValue(response.preferCategoryWord) || undefined,
    preferTimeWord: stringValue(response.preferTimeWord) || undefined,
    preferTime: numberArrayFromResponse(response.preferTime),
    preferAuthor: stringValue(response.preferAuthor) || undefined,
    preferPublisher: stringValue(response.preferPublisher) || undefined,
    authorCount: optionalNumber(response.authorCount),
    registTime: optionalNumber(response.registTime),
  };
}

function readingStatsItemFromResponse(item: Record<string, unknown>): WeReadReadingStatsItem {
  return {
    stat: stringValue(item.stat),
    counts: stringValue(item.counts),
  };
}

function readingStatsBookFromResponse(item: Record<string, unknown>): WeReadReadingStatsBook {
  const book = objectValue(item.book) || objectValue(item.bookInfo) || objectValue(item.albumInfo);
  return {
    bookId: stringValue(item.bookId) || (book ? stringValue(book.bookId) : undefined) || undefined,
    title: stringValue(item.title) || (book ? stringValue(book.title) : undefined) || undefined,
    author: stringValue(item.author) || (book ? stringValue(book.author) : undefined) || undefined,
    cover: stringValue(item.cover) || (book ? stringValue(book.cover) : undefined) || undefined,
    readTime: optionalNumber(item.readTime),
    finishReadingTime: optionalNumber(item.finishReadingTime),
  };
}

function numberMapFromResponse(value: unknown) {
  const object = objectValue(value);
  if (!object) return {};
  return Object.fromEntries(
    Object.entries(object)
      .map(([key, item]) => [key, optionalNumber(item)] as const)
      .filter((entry): entry is readonly [string, number] => entry[1] !== undefined),
  );
}

function numberArrayFromResponse(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => optionalNumber(item))
    .filter((item): item is number => item !== undefined);
  return items.length > 0 ? items : undefined;
}

function objectValue(value: unknown) {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<Record<string, unknown>[]>((items, item) => {
    const object = objectValue(item);
    if (object) items.push(object);
    return items;
  }, []);
}

function decodeNotebookPageEffect(response: WeReadGatewayResponse) {
  return Effect.try({
    try: () => {
      const page = decodeCollectionPage(response, '/user/notebooks', 'books');
      const books = page.items.map(notebookBookFromResponse);
      if (books.some((book) => !book.bookId)) {
        throw new Error('/user/notebooks.books contains a book without bookId');
      }
      return { books, hasMore: page.hasMore };
    },
    catch: (error) => new WeReadGatewayDecodeError(error),
  });
}

function decodeCollectionPageEffect(
  response: WeReadGatewayResponse,
  apiName: string,
  field: string,
) {
  return Effect.try({
    try: () => decodeCollectionPage(response, apiName, field),
    catch: (error) => new WeReadGatewayDecodeError(error),
  });
}

function decodeCollectionPage(response: WeReadGatewayResponse, apiName: string, field: string) {
  const items = requiredObjectArray(response, apiName, field);
  if (response.hasMore !== 0 && response.hasMore !== 1) {
    throw new Error(`${apiName}.hasMore must be 0 or 1`);
  }
  return { items, hasMore: response.hasMore === 1 };
}

function requiredObjectArrayEffect(
  response: WeReadGatewayResponse,
  apiName: string,
  field: string,
) {
  return Effect.try({
    try: () => requiredObjectArray(response, apiName, field),
    catch: (error) => new WeReadGatewayDecodeError(error),
  });
}

function requiredObjectArray(response: WeReadGatewayResponse, apiName: string, field: string) {
  const value = response[field];
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error(`${apiName}.${field} must be an array of objects`);
  }
  return value;
}

function sortWeReadNotebooks(books: WeReadBook[]) {
  return books.toSorted(
    (left, right) =>
      (right.lastReadAt || right.sort || 0) - (left.lastReadAt || left.sort || 0) ||
      right.updatedAt.localeCompare(left.updatedAt),
  );
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function optionalNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function numberValue(value: unknown) {
  return optionalNumber(value) || 0;
}

export const weReadClientTestApi = {
  requestWeReadEffect,
};
