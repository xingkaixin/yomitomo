import { describe, expect, it } from 'vitest';
import { toggleCatalogSelection } from './library-catalog-selection';

describe('toggleCatalogSelection', () => {
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
