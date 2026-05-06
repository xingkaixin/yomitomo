// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  articlePreviewFromExtractedArticle,
  extractCurrentArticle,
  fallbackCurrentArticle,
} from '../article-extraction';

vi.mock('defuddle', () => ({
  default: class {
    async parseAsync() {
      return {
        title: 'Defuddle 标题',
        author: 'Defuddle 作者',
        site: 'Defuddle 站点',
        favicon: '/favicon.ico',
        description: 'Defuddle 摘要',
        content:
          '<article><p style="color:red">正文</p><script>bad()</script><custom-card><strong>重点</strong></custom-card></article>',
      };
    }
  },
}));

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('article extraction', () => {
  it('normalizes fallback article html and canonical url', () => {
    document.title = '页面标题';
    document.head.innerHTML = `
      <link rel="canonical" href="https://example.com/post#canonical" />
      <meta property="og:site_name" content="示例站点" />
      <meta property="og:image" content="/images/cover.jpg" />
      <meta name="theme-color" content="#516d4f" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    `;
    document.body.innerHTML = `
      <h1>文章标题</h1>
      <article>
        <p style="color:red" width="320">安全正文</p>
        <script>bad()</script>
        <custom-card><strong>保留文本</strong></custom-card>
      </article>
    `;

    const article = fallbackCurrentArticle();

    expect(article.title).toBe('文章标题');
    expect(article.canonicalUrl).toBe('https://example.com/post#canonical');
    expect(article.siteName).toBe('示例站点');
    expect(article.siteIconUrl).toBe('https://example.com/apple-touch-icon.png');
    expect(article.leadImageUrl).toBe('https://example.com/images/cover.jpg');
    expect(article.themeColor).toBe('#516d4f');
    expect(article.content).toContain('<p>安全正文</p>');
    expect(article.content).toContain('<strong>保留文本</strong>');
    expect(article.content).not.toContain('script');
    expect(article.content).not.toContain('style=');
    expect(article.contentHash).toMatch(/^[a-z0-9]+$/);
  });

  it('uses a mocked Defuddle result before readability fallback', async () => {
    document.title = '页面标题';
    document.head.innerHTML = `
      <link rel="canonical" href="https://example.com/post" />
      <meta property="og:image" content="https://cdn.example.com/cover.jpg" />
    `;
    document.body.innerHTML = '<main><h1>页面标题</h1><p>页面正文</p></main>';

    const article = await extractCurrentArticle();

    expect(article.title).toBe('Defuddle 标题');
    expect(article.byline).toBe('Defuddle 作者');
    expect(article.excerpt).toBe('Defuddle 摘要');
    expect(article.siteName).toBe('Defuddle 站点');
    expect(article.siteIconUrl).toBe('https://example.com/favicon.ico');
    expect(article.leadImageUrl).toBe('https://cdn.example.com/cover.jpg');
    expect(article.content).toContain('<p>正文</p>');
    expect(article.content).toContain('<strong>重点</strong>');
    expect(article.content).not.toContain('custom-card');
    expect(article.contentHash).toMatch(/^[a-z0-9]+$/);
  });

  it('builds article preview metadata', () => {
    const preview = articlePreviewFromExtractedArticle({
      id: 'id',
      url: 'https://www.example.com/post',
      canonicalUrl: 'https://www.example.com/post',
      title: '文章标题',
      content: '<p>中文正文 mixed words 123</p>',
      contentHash: 'hash',
    });

    expect(preview).toEqual({
      title: '文章标题',
      domain: 'example.com',
      wordCount: 7,
      readingMinutes: 1,
    });
  });
});
