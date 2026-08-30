import { describe, expect, it } from 'vitest';
import { toggleCatalogSelection } from './library-catalog-selection';

describe('toggleCatalogSelection', () => {
  it('retains selections from other pages without changing the previous map', () => {
    const first = { title: 'First page' };
    const second = { title: 'Second page' };
    const pageOne = toggleCatalogSelection(new Map(), { kind: 'article', id: 'first' }, first);
    const pageTwo = toggleCatalogSelection(pageOne, { kind: 'article', id: 'second' }, second);

    expect([...pageOne.values()]).toEqual([first]);
    expect([...pageTwo.values()]).toEqual([first, second]);
    expect([
      ...toggleCatalogSelection(pageTwo, { kind: 'article', id: 'first' }, first).values(),
    ]).toEqual([second]);
    expect([...pageTwo.values()]).toEqual([first, second]);
  });

  it('distinguishes source kinds that share an identifier', () => {
    const article = { title: 'Article' };
    const book = { title: 'WeRead book' };
    const selection = toggleCatalogSelection(
      toggleCatalogSelection(new Map(), { kind: 'article', id: 'shared' }, article),
      { kind: 'weread', id: 'shared' },
      book,
    );

    expect([...selection.values()]).toEqual([article, book]);
    expect([
      ...toggleCatalogSelection(selection, { kind: 'weread', id: 'shared' }, book).values(),
    ]).toEqual([article]);
  });
});
