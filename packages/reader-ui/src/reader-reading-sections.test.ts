// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { extractTocItems, type ExtractTocOptions } from '@yomitomo/core';
import { buildReaderReadingSections } from './reader-reading-sections';

const sourceTocOptions: ExtractTocOptions = {
  headingSelector:
    '.reader-article-body h1, .reader-article-body h2, .reader-article-body h3, .reader-article-body h4',
  inferredSelector:
    '.reader-article-body p, .reader-article-body div, .reader-article-body section',
};

function articleElement(bodyHtml: string, title = '测试文章') {
  const article = document.createElement('article');
  article.innerHTML = `
    <header><h1>${title}</h1></header>
    <div class="reader-article-body">${bodyHtml}</div>
  `;
  return article;
}

function sectionText(article: HTMLElement, start: number, end: number) {
  return (article.textContent || '').slice(start, end).replace(/\s+/g, ' ').trim();
}

describe('buildReaderReadingSections', () => {
  it('adds the text before the first chapter as 引文', () => {
    const article = articleElement(`
      <p>导语第一段。</p>
      <p>导语第二段。</p>
      <h2>第一章</h2>
      <p>第一章正文。</p>
      <h2>第二章</h2>
      <p>第二章正文。</p>
    `);
    const tocItems = extractTocItems(article, sourceTocOptions);

    const sections = buildReaderReadingSections(article, tocItems, '测试文章');

    expect(sections.map((section) => section.title)).toEqual(['引文', '第一章', '第二章']);
    expect(sectionText(article, sections[0].start, sections[0].end)).toBe(
      '导语第一段。 导语第二段。',
    );
  });

  it('uses the opening body heading depth for assistant reading sections', () => {
    const article = articleElement(`
      <p>发布日期、作者和正文导语。</p>
      <h4>拥抱布鲁克斯定律：保持灵活，快速行动</h4>
      <p>第一段正文。</p>
      <h4>为新任高级工程师提供引导</h4>
      <p>第二段正文。</p>
      <h2>继续阅读</h2>
      <p>相关文章。</p>
    `);
    const tocItems = extractTocItems(article, sourceTocOptions);

    const sections = buildReaderReadingSections(article, tocItems, '测试文章');

    expect(sections.map((section) => section.title)).toEqual([
      '引文',
      '拥抱布鲁克斯定律：保持灵活，快速行动',
      '为新任高级工程师提供引导',
    ]);
  });
});
