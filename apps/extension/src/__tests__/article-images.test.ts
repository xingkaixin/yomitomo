// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { ExtractedArticle } from '../article-extraction';
import { inlineArticleImages } from '../article-images';

describe('inlineArticleImages', () => {
  it('rewrites article images to data urls', async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith('/cover.jpg') ? 'data:image/jpeg;base64,cover' : 'data:image/png;base64,inline',
    );

    const article = await inlineArticleImages(articleRecord(), fetcher);

    expect(article.leadImageUrl).toBe('data:image/jpeg;base64,cover');
    expect(article.content).toContain('src="data:image/png;base64,inline"');
    expect(article.content).not.toContain('srcset=');
    expect(fetcher).toHaveBeenCalledWith('https://example.com/cover.jpg');
    expect(fetcher).toHaveBeenCalledWith('https://example.com/images/inline.jpg');
  });

  it('keeps the original image url when fetching fails', async () => {
    const article = await inlineArticleImages(articleRecord(), async () => null);

    expect(article.leadImageUrl).toBe('https://example.com/cover.jpg');
    expect(article.content).toContain('src="https://example.com/images/inline.jpg"');
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
