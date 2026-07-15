import { afterEach, describe, expect, it, vi } from 'vitest';
import { Effect, Fiber } from 'effect';

import {
  fetchWeReadBookDetail,
  fetchWeReadNotebooks,
  fetchWeReadReadingStats,
  testWeReadConnection,
  weReadClientTestApi,
  WEREAD_REQUEST_TIMEOUT_MS,
  WEREAD_SKILL_VERSION,
} from './weread-client';

function noop() {}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function requestBody(call: Parameters<typeof fetch>) {
  const body = call[1]?.body;
  return JSON.parse(typeof body === 'string' ? body : '') as Record<string, unknown>;
}

function reviewRequestBodies(fetchMock: { mock: { calls: Parameters<typeof fetch>[] } }) {
  return fetchMock.mock.calls
    .map((call) => requestBody(call))
    .filter((body) => body.api_name === '/review/list/mine');
}

function reviewPage(
  reviewId: string,
  input: { hasMore: number; synckey?: number; range?: string },
) {
  return {
    hasMore: input.hasMore,
    ...(input.synckey === undefined ? {} : { synckey: input.synckey }),
    reviews: [
      {
        review: {
          reviewId,
          bookId: 'book_1',
          chapterUid: 1,
          range: input.range || `${reviewId}-range`,
          abstract: `${reviewId}-abstract`,
          content: `${reviewId}-content`,
          createTime: 1,
        },
      },
    ],
  };
}

function mockBookDetailFetch(
  reviewResponses: Record<string, unknown>[],
  overrides: Record<string, unknown> = {},
) {
  let reviewIndex = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    const body = requestBody([_input, init] as Parameters<typeof fetch>);
    const override = overrides[String(body.api_name)];
    if (override !== undefined) return response(override);
    if (body.api_name === '/review/list/mine') {
      return response(reviewResponses[reviewIndex++] || reviewResponses.at(-1) || {});
    }
    if (body.api_name === '/book/chapterinfo') {
      return response({ chapters: [{ chapterUid: 1, chapterIdx: 1, title: '第一章' }] });
    }
    if (body.api_name === '/book/bookmarklist') return response({ updated: [] });
    if (body.api_name === '/book/info') return response({ bookId: 'book_1', title: '书' });
    if (body.api_name === '/book/getprogress') return response({ book: {} });
    throw new Error(`Unexpected WeRead API: ${String(body.api_name)}`);
  });
}

describe('weread client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('paginates notebooks and keeps the external Promise API sorted', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response({
          hasMore: 1,
          books: [
            {
              bookId: 'book_older',
              title: '旧书',
              bookmarkCount: 1,
              sort: 10,
            },
            {
              bookId: 'book_empty',
              title: '空书',
              sort: 8,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          hasMore: 0,
          books: [
            {
              bookId: 'book_newer',
              title: '新书',
              noteCount: 1,
              sort: 30,
            },
          ],
        }),
      );

    await expect(fetchWeReadNotebooks('secret')).resolves.toMatchObject([
      { bookId: 'book_newer', title: '新书', sort: 30 },
      { bookId: 'book_older', title: '旧书', sort: 10 },
      { bookId: 'book_empty', title: '空书', sort: 8 },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBody(fetchMock.mock.calls[0])).toMatchObject({
      api_name: '/user/notebooks',
      count: 100,
      skill_version: WEREAD_SKILL_VERSION,
    });
    expect(requestBody(fetchMock.mock.calls[1])).toMatchObject({
      api_name: '/user/notebooks',
      count: 100,
      lastSort: 8,
    });
  });

  it.each([
    ['missing books', { hasMore: 0 }],
    ['wrong books type', { books: {}, hasMore: 0 }],
    ['non-object gateway body', 'upstream unavailable'],
    ['missing pagination state', { books: [] }],
    ['non-object book item', { books: [null], hasMore: 0 }],
  ])('rejects incomplete notebook authority: %s', async (_name, body) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(body));

    await expect(fetchWeReadNotebooks('secret')).rejects.toThrow('Failed to parse WeRead response');
  });

  it('rejects with the HTTP error message from the Effect boundary', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({}, 502));

    await expect(testWeReadConnection('secret')).rejects.toThrow('WeRead request failed: HTTP 502');
  });

  it('aborts a hanging gateway request after the configured timeout', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );

    const result = testWeReadConnection('secret');
    const assertion = expect(result).rejects.toThrow('WeRead request timed out: /user/notebooks');
    await vi.advanceTimersByTimeAsync(WEREAD_REQUEST_TIMEOUT_MS);

    await assertion;
  });

  it('aborts a gateway request when its Effect is interrupted', async () => {
    const request = hangingFetch();
    vi.spyOn(globalThis, 'fetch').mockImplementation(request.run);
    const fiber = Effect.runFork(
      weReadClientTestApi.requestWeReadEffect('secret', '/user/notebooks'),
    );

    await request.started.promise;
    await Effect.runPromise(Fiber.interrupt(fiber));
    const aborted = request.aborted();
    request.release();

    expect(aborted).toBe(true);
  });

  it('rejects with the gateway business error from the Effect boundary', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        errcode: 1001,
        errmsg: '签名无效',
      }),
    );

    await expect(fetchWeReadReadingStats('secret', 'overall')).rejects.toThrow('签名无效');
  });

  it('continues thoughts pagination when the next synckey is zero', async () => {
    const fetchMock = mockBookDetailFetch([
      reviewPage('review_1', { hasMore: 1, synckey: 0 }),
      reviewPage('review_2', { hasMore: 0 }),
    ]);

    const detail = await fetchWeReadBookDetail('secret', 'book_1');

    expect(detail.thoughts.map((thought) => thought.reviewId)).toEqual(['review_1', 'review_2']);
    expect(reviewRequestBodies(fetchMock)).toMatchObject([
      { api_name: '/review/list/mine', bookid: 'book_1', count: 100 },
      { api_name: '/review/list/mine', bookid: 'book_1', count: 100, synckey: 0 },
    ]);
  });

  it('stops thoughts pagination when hasMore is false', async () => {
    const fetchMock = mockBookDetailFetch([reviewPage('review_1', { hasMore: 0, synckey: 9 })]);

    const detail = await fetchWeReadBookDetail('secret', 'book_1');

    expect(detail.thoughts.map((thought) => thought.reviewId)).toEqual(['review_1']);
    expect(reviewRequestBodies(fetchMock)).toHaveLength(1);
  });

  it('rejects thoughts pagination when hasMore lacks a next synckey', async () => {
    const fetchMock = mockBookDetailFetch([reviewPage('review_1', { hasMore: 1 })]);

    await expect(fetchWeReadBookDetail('secret', 'book_1')).rejects.toThrow('missing synckey');

    expect(reviewRequestBodies(fetchMock)).toHaveLength(1);
  });

  it('rejects thoughts pagination when the next synckey repeats', async () => {
    const fetchMock = mockBookDetailFetch([
      reviewPage('review_1', { hasMore: 1, synckey: 7 }),
      reviewPage('review_2', { hasMore: 1, synckey: 7 }),
    ]);

    await expect(fetchWeReadBookDetail('secret', 'book_1')).rejects.toThrow('repeats synckey');

    expect(reviewRequestBodies(fetchMock)).toMatchObject([
      { api_name: '/review/list/mine', bookid: 'book_1', count: 100 },
      { api_name: '/review/list/mine', bookid: 'book_1', count: 100, synckey: 7 },
    ]);
  });

  it.each([
    ['/book/chapterinfo', { chapters: {} }],
    ['/book/bookmarklist', { updated: null }],
    ['/review/list/mine', { reviews: {}, hasMore: 0 }],
  ])('rejects an incomplete detail response from %s', async (apiName, body) => {
    mockBookDetailFetch([reviewPage('review_1', { hasMore: 0 })], { [apiName]: body });

    await expect(fetchWeReadBookDetail('secret', 'book_1')).rejects.toThrow(
      'Failed to parse WeRead response',
    );
  });
});

function hangingFetch() {
  const started = deferredPromise();
  let signal: AbortSignal | undefined;
  let rejectRequest: (reason?: unknown) => void = noop;
  return {
    started,
    run: (_input: URL | RequestInfo, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        signal = init?.signal instanceof AbortSignal ? init.signal : undefined;
        rejectRequest = reject;
        started.resolve();
      }),
    aborted: () => signal?.aborted === true,
    release: () => rejectRequest(new DOMException('Aborted', 'AbortError')),
  };
}

function deferredPromise(): { promise: Promise<void>; resolve: () => void } {
  let resolve = noop;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
