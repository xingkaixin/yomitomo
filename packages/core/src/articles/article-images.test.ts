// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { ExtractedArticle } from './article-extraction';
import { inlineArticleImages } from './article-images';

function noop() {}

describe('inlineArticleImages', () => {
  it('rewrites article images to data urls', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith('/cover.jpg') ? 'data:image/jpeg;base64,cover' : 'data:image/png;base64,inline',
    );

    const article = await inlineArticleImages(articleRecord(), {
      articleDocument: document,
      fetcher,
    });

    expect(article.leadImageUrl).toBe('data:image/jpeg;base64,cover');
    expect(article.content).toContain('src="data:image/png;base64,inline"');
    expect(article.content).not.toContain('srcset=');
    expect(fetcher).toHaveBeenCalledWith('https://example.com/cover.jpg', expect.any(AbortSignal));
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.com/images/inline.jpg',
      expect.any(AbortSignal),
    );
  });

  it('keeps the original image url when fetching fails', async () => {
    const article = await inlineArticleImages(articleRecord(), {
      articleDocument: document,
      fetcher: async () => null,
    });

    expect(article.leadImageUrl).toBe('https://example.com/cover.jpg');
    expect(article.content).toContain('src="https://example.com/images/inline.jpg"');
  });

  it('keeps the original image url when fetching throws', async () => {
    const article = await inlineArticleImages(articleRecord(), {
      articleDocument: document,
      fetcher: async () => {
        throw new Error('network failed');
      },
    });

    expect(article.leadImageUrl).toBe('https://example.com/cover.jpg');
    expect(article.content).toContain('src="https://example.com/images/inline.jpg"');
  });

  it('prefers lazy image urls over placeholder src values', async () => {
    const fetcher = vi.fn(async () => 'data:image/png;base64,lazy');

    const article = await inlineArticleImages(
      articleRecord({
        content:
          '<p>正文</p><img src="data:image/gif;base64,placeholder" data-src="/images/lazy.jpg">',
      }),
      { articleDocument: document, fetcher },
    );

    expect(article.content).toContain('src="data:image/png;base64,lazy"');
    expect(article.content).not.toContain('data-src=');
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.com/images/lazy.jpg',
      expect.any(AbortSignal),
    );
  });

  it('inlines content images with bounded concurrency', async () => {
    let activeFetches = 0;
    let maxActiveFetches = 0;
    const fetcher = vi.fn(async (url: string) => {
      activeFetches += 1;
      maxActiveFetches = Math.max(maxActiveFetches, activeFetches);
      await Promise.resolve();
      activeFetches -= 1;
      return `data:image/png;base64,${url.split('/').pop()?.replace('.jpg', '')}`;
    });
    const content = Array.from(
      { length: 5 },
      (_, index) => `<img src="/images/inline-${index}.jpg">`,
    ).join('');

    const article = await inlineArticleImages(
      articleRecord({ content, leadImageUrl: undefined, siteIconUrl: undefined }),
      { articleDocument: document, fetcher },
    );

    expect(maxActiveFetches).toBe(4);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(article.content).toContain('src="data:image/png;base64,inline-4"');
  });

  it('releases image permits after fetch failures', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (!url.endsWith('/inline-4.jpg')) {
        throw new Error('network failed');
      }
      return 'data:image/png;base64,recovered';
    });
    const content = Array.from(
      { length: 5 },
      (_, index) => `<img src="/images/inline-${index}.jpg">`,
    ).join('');

    const article = await inlineArticleImages(
      articleRecord({ content, leadImageUrl: undefined, siteIconUrl: undefined }),
      { articleDocument: document, fetcher },
    );

    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(article.content).toContain('src="data:image/png;base64,recovered"');
  });

  it('aborts image fetching when the parent signal is canceled', async () => {
    const started = deferredPromise();
    const controller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    let releaseRequest = noop;
    const pending = inlineArticleImages(
      articleRecord({
        content: '<img src="/images/inline.jpg">',
        leadImageUrl: undefined,
        siteIconUrl: undefined,
      }),
      {
        articleDocument: document,
        fetcher: (_url, signal) =>
          new Promise((resolve) => {
            requestSignal = signal;
            releaseRequest = () => resolve(null);
            started.resolve();
          }),
        signal: controller.signal,
      },
    );

    await started.promise;
    controller.abort();
    const aborted = requestSignal?.aborted === true;
    releaseRequest();
    await pending.catch(() => undefined);

    expect(aborted).toBe(true);
  });

  it('dedupes repeated image requests', async () => {
    const fetcher = vi.fn(async () => 'data:image/png;base64,shared');

    const article = await inlineArticleImages(
      articleRecord({
        content: [
          '<img src="/images/shared.jpg">',
          '<img data-src="/images/shared.jpg" src="data:image/gif;base64,placeholder">',
          '<picture><source srcset="/images/shared@2x.jpg 2x"><img src="/images/shared.jpg"></picture>',
        ].join(''),
        leadImageUrl: undefined,
        siteIconUrl: undefined,
      }),
      { articleDocument: document, fetcher },
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.com/images/shared.jpg',
      expect.any(AbortSignal),
    );
    expect(article.content.match(/src="data:image\/png;base64,shared"/g)).toHaveLength(3);
  });
});

function articleRecord(overrides: Partial<ExtractedArticle> = {}): ExtractedArticle {
  return {
    id: 'article-1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    title: 'Article',
    leadImageUrl: 'https://example.com/cover.jpg',
    content:
      '<p>正文</p><img src="/images/inline.jpg" srcset="/images/inline@2x.jpg 2x" loading="lazy">',
    contentHash: 'hash-1',
    ...overrides,
  };
}

function deferredPromise(): { promise: Promise<void>; resolve: () => void } {
  let resolve = noop;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
