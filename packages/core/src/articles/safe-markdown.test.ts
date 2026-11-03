// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { renderMarkdown, renderSafeMarkdown } from './safe-markdown';

describe('safe markdown', () => {
  it('escapes inline html while rendering simple markdown', () => {
    const html = renderMarkdown('Hello **world** <script>alert(1)</script>');

    expect(html).toContain('<strong>world</strong>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('keeps unsafe markdown links as escaped text', () => {
    const html = renderMarkdown('[click](javascript:alert(1)) [mail](mailto:test@example.com)');

    expect(html).toContain('click');
    expect(html).not.toContain('javascript:alert');
    expect(html).toContain('href="mailto:test@example.com"');
  });

  it('keeps assistant reference links in the app and drops other fragment links', () => {
    const html = renderSafeMarkdown(
      '[序言](#passage:12-40) [讨论](#discussion:annotation_1) [别处](#b12)',
      document,
    );

    expect(html).toContain('<a href="#passage:12-40">序言</a>');
    expect(html).toContain('<a href="#discussion:annotation_1">讨论</a>');
    expect(html).not.toContain('#b12');
  });
});
