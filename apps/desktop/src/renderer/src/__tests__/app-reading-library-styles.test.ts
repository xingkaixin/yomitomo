import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function rulesFor(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(
    styles.matchAll(new RegExp(`${escapedSelector} \\{(?<body>[^}]+)\\}`, 'g')),
  ).map((match) => match.groups?.body || '');
}

function expectRule(selector: string, properties: string[]) {
  expect(
    rulesFor(selector).some((rule) => properties.every((property) => rule.includes(property))),
  ).toBe(true);
}

describe('reading library styles', () => {
  it('keeps long document list text inside the item bounds', () => {
    expectRule('.library-ebook-list-copy', ['min-width: 0;', 'overflow: hidden;']);
    expectRule('.library-ebook-list-source', ['min-width: 0;', 'overflow: hidden;']);
    expectRule('.library-ebook-list-source span', [
      'max-width: 100%;',
      'text-overflow: ellipsis;',
      'white-space: nowrap;',
    ]);
    expectRule('.library-ebook-list-main', ['overflow: hidden;']);
    expectRule('.library-ebook-list-item h3', [
      'overflow-wrap: anywhere;',
      'word-break: break-word;',
    ]);
  });

  it('keeps the weread detail header cover flat', () => {
    expectRule('.weread-book-cover.is-flat-cover', [
      'width: var(--book-cover-width);',
      'height: var(--book-cover-height);',
    ]);
    expect(styles).not.toContain('.weread-bookcase-title:hover .article-book-scene');
    expect(styles).not.toContain('.weread-bookcase-title:hover .article-book-ground-shadow');
  });

  it('shares book hover motion with web article cards', () => {
    expect(styles).toContain('.library-web-item:hover .article-book-scene');
    expect(styles).toContain('.library-web-item:focus-within .article-book-scene');
    expect(styles).toContain('.library-web-item:hover .article-book');
    expect(styles).toContain('.library-web-item:focus-within .article-book');
    expect(styles).toContain('.library-web-item:hover .article-book-ground-shadow');
    expect(styles).toContain('.library-web-item:focus-within .article-book-ground-shadow');
  });
});
