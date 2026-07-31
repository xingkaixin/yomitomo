// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { AppSettings } from '@yomitomo/shared';
import type { LibraryCatalogItemType, LibraryCatalogListResult } from '../../../ipc-contract';
import { librarySession } from './app-reading-library-session';
import { useLibraryQuerySession } from './use-library-query-session';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  librarySession.searchQuery = '';
  librarySession.selectedTypes = new Set();
  librarySession.activeCollectionId = null;
});

it('derives the catalog input from session state and mirrors it to the library session', async () => {
  const listCatalog = vi.fn(async () => catalogResult());
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  librarySession.searchQuery = 'saved query';
  librarySession.selectedTypes = new Set(['web']);
  const { result } = renderHook(() => useLibraryQuerySession(sessionOptions()));

  await waitFor(() => expect(listCatalog).toHaveBeenCalledOnce());
  expect(result.current.input).toMatchObject({
    scope: { kind: 'library' },
    types: ['web'],
    query: 'saved query',
    page: 1,
    pageSize: 12,
  });

  act(() => result.current.actions.updateSearchQuery('next query'));

  expect(result.current.input).toMatchObject({ query: 'next query', page: 1 });
  await waitFor(() => expect(librarySession.searchQuery).toBe('next query'));
});

it('prunes unavailable types and exits a removed collection from external facts', async () => {
  const listCatalog = vi.fn(async () => catalogResult());
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  librarySession.activeCollectionId = 'collection_missing';
  librarySession.selectedTypes = new Set(['collection']);
  const { result } = renderHook(() =>
    useLibraryQuerySession(
      sessionOptions({ availableTypes: ['web'], collectionIds: ['collection_available'] }),
    ),
  );

  await waitFor(() => {
    expect(result.current.state.scope).toEqual({ kind: 'library' });
    expect(result.current.state.selectedTypes).toEqual(new Set());
  });
});

it('exposes WeRead when the catalog reports available books', async () => {
  const listCatalog = vi.fn(async () => catalogResult({ wereadCount: 1 }));
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  const { result } = renderHook(() =>
    useLibraryQuerySession(sessionOptions({ availableTypes: ['web'] })),
  );

  await waitFor(() => expect(result.current.availableTypes).toEqual(['web', 'weread']));
});

function sessionOptions({
  availableTypes = ['web', 'ebook', 'pdf', 'text', 'weread'],
  collectionIds = [],
  localRevision = 0,
  onSaveSettings = vi.fn(),
  settings = {},
}: {
  availableTypes?: LibraryCatalogItemType[];
  collectionIds?: string[];
  localRevision?: number;
  onSaveSettings?: (settings: AppSettings) => Promise<void> | void;
  settings?: AppSettings;
} = {}) {
  return { availableTypes, collectionIds, localRevision, onSaveSettings, settings };
}

function catalogResult({
  wereadCount = 0,
}: { wereadCount?: number } = {}): LibraryCatalogListResult {
  return {
    entities: [],
    itemCounts: { web: 0, ebook: 0, pdf: 0, text: 0, weread: wereadCount },
    page: 1,
    pageSize: 12,
    query: '',
    totalCount: 0,
    unfilteredCount: 0,
  };
}
