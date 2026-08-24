// @vitest-environment jsdom

import type { ArticleRecord } from '@yomitomo/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { initializeAppI18n } from '../i18n/app-i18n';
import {
  articleExternalUrl,
  articlePlainText,
  articleIdentityLine,
  urlHost,
} from '../shell/app-article-presentation';

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

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

describe('article presentation', () => {
  it('extracts display text and falls back to the excerpt', () => {
    expect(articlePlainText(article())).toBe('第一段第二段');
    expect(articlePlainText(article({ contentHtml: '', excerpt: '备用摘要' }))).toBe('备用摘要');
  });

  it('only exposes safe external article urls', () => {
    expect(articleExternalUrl(article({ canonicalUrl: 'file:///tmp/a.html' }))).toBe(
      'https://example.com/post',
    );
    expect(articleExternalUrl(article({ canonicalUrl: 'app://local', url: 'about:blank' }))).toBe(
      '',
    );
  });

  it('formats article identity values', () => {
    expect(urlHost('https://example.com/post')).toBe('example.com');
    expect(urlHost('not a url')).toBe('not a url');
    expect(articleIdentityLine(article({ byline: '作者' }))).toContain('作者 / ');
  });
});
