import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchWeReadNotebooks,
  fetchWeReadReadingStats,
  testWeReadConnection,
  WEREAD_SKILL_VERSION,
} from './weread-client';

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function requestBody(call: Parameters<typeof fetch>) {
  const body = call[1]?.body;
  return JSON.parse(typeof body === 'string' ? body : '') as Record<string, unknown>;
}

describe('weread client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

    await expect(testWeReadConnection('secret')).rejects.toThrow('微信读书请求失败：HTTP 502');
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
});
