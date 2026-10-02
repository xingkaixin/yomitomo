// @vitest-environment jsdom

import { useLayoutEffect } from 'react';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type {
  LibraryCatalogListInput,
  LibraryCatalogListResult,
  LibraryCatalogScope,
} from '../../../ipc-contract';
import { useLibraryCatalog } from './use-library-catalog';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each(['filter', 'revision', 'search'] as const)(
  'never exposes an old ready status after a %s change',
  async (change) => {
    const refresh = deferred<LibraryCatalogListResult>();
    const initialResult = catalogResult('initial');
    const list = vi.fn().mockResolvedValueOnce(initialResult).mockReturnValue(refresh.promise);
    vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list } } });
    const statuses: string[] = [];
    const initialInput: LibraryCatalogListInput = {
      scope: { kind: 'library' },
      query: 'initial',
      page: 1,
      pageSize: 12,
    };
    const { result, rerender } = renderHook(
      ({ input, revision }) => {
        const catalog = useLibraryCatalog(input, revision);
        useLayoutEffect(() => {
          statuses.push(catalog.status);
        });
        return catalog;
      },
      { initialProps: { input: initialInput, revision: 0 } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    statuses.length = 0;

    rerender({
      input: {
        ...initialInput,
        types: change === 'filter' ? ['web'] : undefined,
        query: change === 'search' ? 'next' : 'initial',
      },
      revision: change === 'revision' ? 1 : 0,
    });

    expect(result.current.result).toEqual(initialResult);
    expect(statuses).not.toContain('ready');
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await act(async () => refresh.resolve(catalogResult('next')));
    expect(result.current.status).toBe('ready');
  },
);

it('invalidates the current catalog page when its explicit revision changes', async () => {
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
  const view = render(<Harness revision={0} />);
  await waitFor(() => expect(listLibraryCatalog).toHaveBeenCalledOnce());

  view.rerender(<Harness revision={1} />);

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
  await waitFor(() => expect(listLibraryCatalog).toHaveBeenCalledTimes(2));

  await act(async () => refresh.reject(new Error('database busy')));
  await screen.findByText('first:error:database busy');
});

it('defers hidden catalog revisions and refreshes once when the library returns', async () => {
  const list = vi.fn().mockResolvedValue(catalogResult('current'));
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list } } });
  const { result, rerender } = renderHook(
    ({ revision, enabled }) =>
      useLibraryCatalog({ scope: { kind: 'library' }, page: 1, pageSize: 12 }, revision, enabled),
    { initialProps: { revision: 0, enabled: true } },
  );
  await waitFor(() => expect(result.current.status).toBe('ready'));
  for (let revision = 1; revision <= 20; revision++) rerender({ revision, enabled: false });
  expect(list).toHaveBeenCalledOnce();
  rerender({ revision: 20, enabled: true });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(list).toHaveBeenCalledTimes(2);
  rerender({ revision: 21, enabled: true });
  await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
});

it('discards a response from before suspension and loads the latest request on resume', async () => {
  const stale = deferred<LibraryCatalogListResult>();
  const list = vi
    .fn()
    .mockReturnValueOnce(stale.promise)
    .mockResolvedValue(catalogResult('latest'));
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list } } });
  const { result, rerender } = renderHook(
    ({ page, enabled }) =>
      useLibraryCatalog({ scope: { kind: 'library' }, page, pageSize: 12 }, 0, enabled),
    { initialProps: { page: 1, enabled: true } },
  );
  rerender({ page: 2, enabled: false });
  await act(async () => stale.resolve(catalogResult('stale')));
  expect(result.current.result).toBeNull();
  expect(list).toHaveBeenCalledOnce();
  rerender({ page: 2, enabled: true });
  await waitFor(() => expect(result.current.result?.query).toBe('latest'));
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
});

function Harness({ revision }: { revision: number }) {
  useLibraryCatalog({ scope: { kind: 'library' }, page: 1, pageSize: 12 }, revision);
  return null;
}

function ResultHarness({ scope, query }: { scope: LibraryCatalogScope; query?: string }) {
  const result = useLibraryCatalog({ scope, query, page: 1, pageSize: 12 }, 0);
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
