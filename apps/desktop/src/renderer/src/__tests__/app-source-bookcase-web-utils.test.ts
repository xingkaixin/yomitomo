// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { ArticleRecord } from '@yomitomo/shared';
import {
  articleLinkExternalUrl,
  sourceArticleBodyHtml,
} from '../source/web/app-source-bookcase-web-utils';

const now = '2026-05-16T12:00:00.000Z';

function article(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
  return {
    id: 'article-1',
    url: 'https://example.com/posts/story',
    canonicalUrl: 'https://example.com/canonical/story',
    sourceType: 'web',
    title: '网页文章',
    byline: '',
    siteName: 'Example',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash-1',
    annotations: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('articleLinkExternalUrl', () => {
  it('keeps same-document anchors inside the reader', () => {
    expect(articleLinkExternalUrl(article(), '#footnote-1')).toBe('');
  });

  it('opens absolute http links externally', () => {
    expect(articleLinkExternalUrl(article(), 'https://other.example/path')).toBe(
      'https://other.example/path',
    );
  });

  it('resolves relative links against the article URL', () => {
    expect(articleLinkExternalUrl(article(), '../next')).toBe('https://example.com/next');
  });

  it('falls back to the source URL when canonical URL is not external', () => {
    expect(articleLinkExternalUrl(article({ canonicalUrl: 'about:blank' }), './next')).toBe(
      'https://example.com/posts/next',
    );
  });

  it('ignores non-http links', () => {
    expect(articleLinkExternalUrl(article(), 'mailto:hello@example.com')).toBe('');
  });
});

describe('sourceArticleBodyHtml', () => {
  it('removes unsafe article html before reader rendering', () => {
    const html = sourceArticleBodyHtml(
      article({
        contentHtml: `
          <p>正文</p>
          <img src="https://cdn.example.com/image.jpg" onerror="alert(1)" />
          <a href="javascript:alert(1)">bad link</a>
          <form><button formaction="javascript:alert(1)">bad form</button></form>
          <svg><use xlink:href="javascript:alert(1)"></use></svg>
          <a href="data:text/html,<script>alert(1)</script>">bad data</a>
          <img srcset="javascript:alert(1) 1x, https://cdn.example.com/good.jpg 2x" />
        `,
      }),
    );

    expect(html).toContain('<p>正文</p>');
    expect(html).toContain('src="https://cdn.example.com/image.jpg"');
    expect(html).not.toContain('srcset=');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('formaction');
    expect(html).not.toContain('xlink:href');
    expect(html).not.toContain('data:text/html');
  });

  it('keeps safe article links and images', () => {
    const html = sourceArticleBodyHtml(
      article({
        contentHtml: `
          <p>正文</p>
          <a href="/relative/path">relative</a>
          <a href="https://example.com/path">https</a>
          <img src="data:image/png;base64,abc" />
          <img srcset="/image-small.jpg 1x, https://cdn.example.com/image-large.jpg 2x" />
        `,
      }),
    );

    expect(html).toContain('href="/relative/path"');
    expect(html).toContain('href="https://example.com/path"');
    expect(html).toContain('src="data:image/png;base64,abc"');
    expect(html).toContain('/image-small.jpg 1x');
    expect(html).toContain('https://cdn.example.com/image-large.jpg 2x');
  });
});
