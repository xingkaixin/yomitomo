import { describe, expect, it } from 'vitest';
import { createTextAnchor, renderMarkdown, resolveTextAnchor } from './index';

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
