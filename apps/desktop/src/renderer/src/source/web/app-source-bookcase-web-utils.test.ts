// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { articleLinkFragment, findArticleAnchorTarget } from './app-source-bookcase-web-utils';

describe('web article anchor link resolution', () => {
  const article = {
    canonicalUrl: 'https://example.com/posts/guide',
    url: 'https://example.com/posts/guide?ref=home',
  };

  it('recognizes hash-only links and same-document URL fragments while ignoring external links', () => {
    expect(articleLinkFragment(article, '#fn-1')).toEqual({
      fragment: 'fn-1',
      isHashOnly: true,
    });
    expect(articleLinkFragment(article, '#')).toEqual({
      fragment: '',
      isHashOnly: true,
    });
    expect(articleLinkFragment(article, 'https://example.com/posts/guide#section-2')).toEqual({
      fragment: 'section-2',
      isHashOnly: false,
    });
    expect(articleLinkFragment(article, 'https://other.example.com/posts/guide#fn-1')).toBeNull();
  });

  it('finds anchor targets by exact id, percent-decoded id, and name attribute within the article', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <h2 id="fn:1">Footnote 1</h2>
      <h2 id="核心结论">Core Conclusion</h2>
      <p><a name="legacy-anchor">Legacy</a></p>
    `;

    expect(findArticleAnchorTarget(container, 'fn:1')?.textContent).toBe('Footnote 1');
    expect(findArticleAnchorTarget(container, encodeURIComponent('核心结论'))?.textContent).toBe(
      'Core Conclusion',
    );
    expect(findArticleAnchorTarget(container, 'legacy-anchor')?.textContent).toBe('Legacy');
    expect(findArticleAnchorTarget(container, 'missing')).toBeNull();
  });
});
