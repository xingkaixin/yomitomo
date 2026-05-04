import { describe, expect, it } from 'vitest';
import {
  createTextAnchor,
  isDesktopSocketOriginAllowed,
  renderMarkdown,
  resolveTextAnchor,
} from './index';

describe('shared text anchors', () => {
  it('resolves repeated exact text with prefix and suffix context', () => {
    const text = 'alpha target omega. beta target gamma.';
    const anchor = createTextAnchor(text, 25, 31);

    expect(resolveTextAnchor(text, { ...anchor, start: 0, end: 6 })).toEqual({
      start: 25,
      end: 31,
    });
  });
});

describe('shared markdown rendering', () => {
  it('escapes inline html while rendering simple markdown', () => {
    const html = renderMarkdown('Hello **world** <script>alert(1)</script>');

    expect(html).toContain('<strong>world</strong>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});

describe('desktop socket origin policy', () => {
  it('accepts extension and localhost origins', () => {
    expect(isDesktopSocketOriginAllowed('chrome-extension://abcdefghijklmnop')).toBe(true);
    expect(isDesktopSocketOriginAllowed('moz-extension://abcdefghijklmnop')).toBe(true);
    expect(isDesktopSocketOriginAllowed('http://localhost:3000')).toBe(true);
    expect(isDesktopSocketOriginAllowed('http://127.0.0.1:3000')).toBe(true);
  });

  it('rejects web page and missing origins', () => {
    expect(isDesktopSocketOriginAllowed('https://example.com')).toBe(false);
    expect(isDesktopSocketOriginAllowed('not a url')).toBe(false);
    expect(isDesktopSocketOriginAllowed(undefined)).toBe(false);
  });
});
