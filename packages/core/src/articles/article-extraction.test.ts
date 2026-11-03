// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { fallbackCurrentArticle } from './article-extraction';

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
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
        <img src="/images/inline.jpg" srcset="/images/inline@2x.jpg 2x" />
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
    expect(article.content).toContain('src="https://example.com/images/inline.jpg"');
    expect(article.content).toContain('srcset="https://example.com/images/inline@2x.jpg 2x"');
    expect(article.content).toContain('<strong>保留文本</strong>');
    expect(article.content).not.toContain('script');
    expect(article.content).not.toContain('style=');
    expect(article.contentHash).toMatch(/^[a-z0-9]+$/);
  });
});
