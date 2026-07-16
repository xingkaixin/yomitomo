// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { LibraryCatalogListResult, LibraryCatalogScope } from '../../../ipc-contract';
import { useLibraryCatalog } from './use-library-catalog';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('invalidates the current catalog page when an article patch changes the shell revision', async () => {
  const listLibraryCatalog = vi.fn(async () => ({
    entities: [],
    itemCounts: { web: 0, ebook: 0, pdf: 0, text: 0, weread: 0 },
    page: 1,
    pageSize: 12,
    query: '',
    totalCount: 0,
    unfilteredCount: 0,
  }));
  vi.stubGlobal('yomitomoDesktop', { listLibraryCatalog });
  const view = render(<Harness articles={[]} />);
  await waitFor(() => expect(listLibraryCatalog).toHaveBeenCalledOnce());

  view.rerender(<Harness articles={[{ id: 'article_1', updatedAt: '2026-07-15' }]} />);

  await waitFor(() => expect(listLibraryCatalog).toHaveBeenCalledTimes(2));
});

it('does not expose the previous catalog while a new scope is loading', async () => {
  const collectionResult = deferred<LibraryCatalogListResult>();
  const listLibraryCatalog = vi
    .fn()
    .mockResolvedValueOnce(catalogResult('library'))
    .mockReturnValueOnce(collectionResult.promise);
  vi.stubGlobal('yomitomoDesktop', { listLibraryCatalog });
  const view = render(<ResultHarness scope={{ kind: 'library' }} />);
  await screen.findByText('library');

  view.rerender(<ResultHarness scope={{ kind: 'collection', collectionId: 'collection_1' }} />);

  expect(screen.getByTestId('catalog-result').textContent).toBe('pending');

  await act(async () => collectionResult.resolve(catalogResult('collection')));
  await screen.findByText('collection');
});

function Harness({ articles }: { articles: unknown }) {
  useLibraryCatalog(
    { scope: { kind: 'library' }, page: 1, pageSize: 12 },
    {
      articles,
      collectionMembers: null,
      collections: null,
      pins: null,
      wereadBooks: null,
    },
  );
  return null;
}

function ResultHarness({ scope }: { scope: LibraryCatalogScope }) {
  const result = useLibraryCatalog(
    { scope, page: 1, pageSize: 12 },
    {
      articles: null,
      collectionMembers: null,
      collections: null,
      pins: null,
      wereadBooks: null,
    },
  );
  return <span data-testid="catalog-result">{result?.query || 'pending'}</span>;
}

function catalogResult(query: string): LibraryCatalogListResult {
  return {
    entities: [],
    itemCounts: { web: 0, ebook: 0, pdf: 0, text: 0, weread: 0 },
    page: 1,
    pageSize: 12,
    query,
    totalCount: 0,
    unfilteredCount: 0,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
