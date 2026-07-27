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
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listLibraryCatalog } } });
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
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listLibraryCatalog } } });
  const view = render(<ResultHarness scope={{ kind: 'library' }} />);
  await screen.findByText('library:ready');

  view.rerender(<ResultHarness scope={{ kind: 'collection', collectionId: 'collection_1' }} />);

  expect(screen.getByTestId('catalog-result').textContent).toBe('none:loading');

  await act(async () => collectionResult.resolve(catalogResult('collection')));
  await screen.findByText('collection:ready');
});

it('keeps the last good result and exposes an explicit refresh error', async () => {
  const refresh = deferred<LibraryCatalogListResult>();
  const listLibraryCatalog = vi
    .fn()
    .mockResolvedValueOnce(catalogResult('first'))
    .mockReturnValueOnce(refresh.promise);
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listLibraryCatalog } } });
  const view = render(<ResultHarness scope={{ kind: 'library' }} query="first" />);
  await screen.findByText('first:ready');

  view.rerender(<ResultHarness scope={{ kind: 'library' }} query="second" />);
  await screen.findByText('first:loading');

  await act(async () => refresh.reject(new Error('database busy')));
  await screen.findByText('first:error:database busy');
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

function ResultHarness({ scope, query }: { scope: LibraryCatalogScope; query?: string }) {
  const result = useLibraryCatalog(
    { scope, query, page: 1, pageSize: 12 },
    {
      articles: null,
      collectionMembers: null,
      collections: null,
      pins: null,
      wereadBooks: null,
    },
  );
  return (
    <span data-testid="catalog-result">
      {`${result.result?.query || 'none'}:${result.status}${result.error ? `:${result.error.message}` : ''}`}
    </span>
  );
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
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}
