import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchWeReadBookDetail,
  fetchWeReadNotebooks,
  fetchWeReadReadingStats,
  testWeReadConnection,
  WEREAD_REQUEST_TIMEOUT_MS,
  WEREAD_SKILL_VERSION,
} from './weread-client';

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

function mockBookDetailFetch(reviewResponses: Record<string, unknown>[]) {
  let reviewIndex = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    const body = requestBody([_input, init] as Parameters<typeof fetch>);
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

  it('stops thoughts pagination when hasMore lacks a next synckey', async () => {
    const warnMock = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = mockBookDetailFetch([reviewPage('review_1', { hasMore: 1 })]);

    const detail = await fetchWeReadBookDetail('secret', 'book_1');

    expect(detail.thoughts.map((thought) => thought.reviewId)).toEqual(['review_1']);
    expect(reviewRequestBodies(fetchMock)).toHaveLength(1);
    expect(warnMock).toHaveBeenCalledWith('[weread] thoughts pagination stopped without synckey', {
      bookId: 'book_1',
      page: 0,
    });
  });

  it('stops thoughts pagination when the next synckey repeats', async () => {
    const fetchMock = mockBookDetailFetch([
      reviewPage('review_1', { hasMore: 1, synckey: 7 }),
      reviewPage('review_2', { hasMore: 1, synckey: 7 }),
    ]);

    const detail = await fetchWeReadBookDetail('secret', 'book_1');

    expect(detail.thoughts.map((thought) => thought.reviewId)).toEqual(['review_1', 'review_2']);
    expect(reviewRequestBodies(fetchMock)).toMatchObject([
      { api_name: '/review/list/mine', bookid: 'book_1', count: 100 },
      { api_name: '/review/list/mine', bookid: 'book_1', count: 100, synckey: 7 },
    ]);
  });
});
