import { afterEach, describe, expect, it, vi } from 'vitest';

import { articleImportWorkerTestApi } from './article-import-worker';

describe('article import worker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('gives urls with colliding short hashes distinct article ids', () => {
    expect(articleImportWorkerTestApi.webArticleId('https://example.com/articles/1r')).not.toBe(
      articleImportWorkerTestApi.webArticleId('https://example.com/articles/30'),
    );
  });

  it('cancels a stalled image body when its download times out', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, {
        headers: { 'content-type': 'image/png' },
      }),
    );

    const result = fetchImageDataUrl();
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(result).resolves.toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
  });
});

function fetchImageDataUrl(url = 'https://cdn.example.com/image.png') {
  return articleImportWorkerTestApi.fetchArticleImageDataUrl(
    url,
    'https://example.com/post',
    'Yomitomo Test',
  );
}
