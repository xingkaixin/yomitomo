import { describe, expect, it } from 'vitest';
import type { ArticleRecord } from '@yomitomo/shared';
import { articleLinkExternalUrl } from '../app-source-bookcase-web-utils';

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
