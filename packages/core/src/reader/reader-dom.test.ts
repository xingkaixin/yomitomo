// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  extractTocItems,
  findCurrentTocTarget,
  offsetFromArticleStartIgnoringSelector,
  rangeFromOffsetsIgnoringSelector,
} from './reader-dom';

describe('reader DOM toc', () => {
  it('extracts semantic headings with section ranges from article text offsets', () => {
    const article = document.createElement('article');
    article.innerHTML =
      '<p>Lead</p><h1>Intro <em>one</em></h1><p>Opening</p>' +
      '<h2>Chapter One</h2><p>First body</p><h3>Deep <span>Point</span></h3>' +
      '<p>Nested body</p><h2>Chapter Two</h2><p>Second body</p>';

    const items = extractTocItems(article);

    expect(items).toEqual([
      { index: 0, text: 'Intro one', depth: 0, start: 4, end: 20 },
      { index: 1, text: 'Chapter One', depth: 1, start: 20, end: 62 },
      { index: 2, text: 'Deep Point', depth: 2, start: 41, end: 62 },
      { index: 3, text: 'Chapter Two', depth: 1, start: 62, end: 84 },
    ]);
    expect(findCurrentTocTarget(article, items[1])).toBe(article.querySelector('h2'));
  });

  it('infers chapter headings when semantic headings are absent', () => {
    const article = document.createElement('article');
    article.innerHTML = `
      <p>一、开场判断</p>
      <p>正文第一段</p>
      <p>2. Follow up</p>
      <p>正文第二段</p>
    `;

    expect(extractTocItems(article).map((item) => item.text)).toEqual([
      '一、开场判断',
      '2. Follow up',
    ]);
  });
});

describe('reader DOM translated text boundaries', () => {
  it('maps offsets while ignoring bilingual translation nodes', () => {
    const article = document.createElement('article');
    article.innerHTML =
      '<p>Alpha source</p><div data-reader-translation="true">阿尔法译文</div><p>Beta source</p>';

    const betaText = article.querySelectorAll('p')[1]?.firstChild;
    expect(betaText).toBeTruthy();
    expect(
      offsetFromArticleStartIgnoringSelector(
        article,
        betaText as Text,
        4,
        '[data-reader-translation]',
      ),
    ).toBe('Alpha sourceBeta'.length);

    const range = rangeFromOffsetsIgnoringSelector(
      article,
      'Alpha source'.length,
      'Alpha sourceBeta'.length,
      '[data-reader-translation]',
    );

    expect(range?.toString()).toBe('Beta');
  });
});
