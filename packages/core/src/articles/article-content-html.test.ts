// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { sanitizeArticleContentHtml } from './article-content-html';

describe('article content html', () => {
  it('sanitizes reader html with a narrow URI allowlist', () => {
    const html = sanitizeArticleContentHtml(
      document,
      `
        <p>正文</p>
        <a href="https://example.com/safe">https</a>
        <a href="/relative/path">relative</a>
        <a href="mailto:hello@example.com">mailto</a>
        <a href="data:text/html,<script>alert(1)</script>">data html</a>
        <img src="data:image/png;base64,abc" />
        <img srcset="javascript:alert(1) 1x, /safe.jpg 2x" />
        <form><button formaction="javascript:alert(1)">bad form</button></form>
        <svg><use xlink:href="javascript:alert(1)"></use></svg>
      `,
      'https://example.com/articles/story',
    );

    expect(html).toContain('href="https://example.com/safe"');
    expect(html).toContain('href="/relative/path"');
    expect(html).toContain('src="data:image/png;base64,abc"');
    expect(html).not.toContain('srcset=');
    expect(html).not.toContain('mailto:');
    expect(html).not.toContain('data:text/html');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('formaction');
    expect(html).not.toContain('xlink:href');
  });
});
