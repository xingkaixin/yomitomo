// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { ExtractedArticle } from './article-extraction';
import { inlineArticleImages } from './article-images';

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
    expect(fetcher).toHaveBeenCalledWith('https://example.com/cover.jpg');
    expect(fetcher).toHaveBeenCalledWith('https://example.com/images/inline.jpg');
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
    expect(fetcher).toHaveBeenCalledWith('https://example.com/images/lazy.jpg');
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
    expect(fetcher).toHaveBeenCalledWith('https://example.com/images/shared.jpg');
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
