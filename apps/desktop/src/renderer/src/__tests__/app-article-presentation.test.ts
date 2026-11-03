// @vitest-environment jsdom

import type { ArticleRecord } from '@yomitomo/shared';
import { describe, expect, it } from 'vitest';

import { articleExternalUrl } from '../shell/app-article-presentation';

const now = '2026-05-04T00:00:00.000Z';

type WebArticleRecord = Extract<ArticleRecord, { sourceType: 'web' }>;

function article(overrides: Partial<WebArticleRecord> = {}): WebArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/canonical',
    sourceType: 'web',
    title: '文章',
    excerpt: '摘要',
    contentHtml: '<article><p>第一段</p><p>第二段</p></article>',
    contentHash: 'hash_1',
    annotations: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('article presentation', () => {
  it('only exposes safe external article urls', () => {
    expect(articleExternalUrl(article({ canonicalUrl: 'file:///tmp/a.html' }))).toBe(
      'https://example.com/post',
    );
    expect(articleExternalUrl(article({ canonicalUrl: 'app://local', url: 'about:blank' }))).toBe(
      '',
    );
  });
});
