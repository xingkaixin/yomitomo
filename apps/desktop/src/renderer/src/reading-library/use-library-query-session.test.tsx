// @vitest-environment jsdom

import type { ReactElement, ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useStore } from 'zustand';
import { ARTICLE_SOURCE_TYPES, type AppSettingsPatch } from '@yomitomo/shared';
import type { LibraryCatalogListInput, LibraryCatalogListResult } from '../../../ipc-contract';
import { emptyDesktopStore } from '../../../app-store';
import { normalizeAppSettings } from '../../../settings/app-settings-normalization';
import { bindLibraryQueryEvents } from '../shell/app-desktop-event-bindings';
import { createDesktopStore, DesktopStoreProvider } from '../shell/app-desktop-store';
import { createAppQueryClient } from '../shell/app-query-client';
import {
  AppSessionStoreProvider,
  createAppSessionStore,
  useAppSessionStoreApi,
  type AppSessionState,
} from '../shell/app-session';
import type { LibraryTypeFilter } from './library-filter-types';
import { useLibraryQuerySession } from './use-library-query-session';
import { weReadLibraryStateQuery } from './use-weread-library-session';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('preserves a saved WeRead filter while the remounted catalog loads', async () => {
  const pending = deferred<LibraryCatalogListResult>();
  let reloading = false;
  const listCatalog = vi.fn((_input: LibraryCatalogListInput) =>
    reloading ? pending.promise : Promise.resolve(catalogResult({ wereadCount: 1 })),
  );
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  const stores = createLibraryStores({ weReadAvailable: false });
  const view = renderWithStores(<RestorableQueryHarness showCatalog />, stores);
  await waitFor(() => expect(screen.getByTestId('catalog-status').textContent).toBe('ready'));
  fireEvent.click(screen.getByRole('button', { name: 'filter WeRead' }));
  await waitFor(() => expect(screen.getByTestId('catalog-status').textContent).toBe('ready'));
  expect(screen.getByTestId('selected-types').textContent).toBe('weread');
  view.rerender(<RestorableQueryHarness showCatalog={false} />);
  reloading = true;
  view.rerender(<RestorableQueryHarness showCatalog />);

  expect(screen.getByTestId('catalog-status').textContent).toBe('loading');
  expect(screen.getByTestId('selected-types').textContent).toBe('weread');
  await act(async () => pending.resolve(catalogResult({ wereadCount: 1 })));
  await waitFor(() => expect(screen.getByTestId('catalog-status').textContent).toBe('ready'));
  expect(screen.getByTestId('selected-types').textContent).toBe('weread');
  expect(listCatalog.mock.calls.at(-1)?.[0]).toMatchObject({ types: ['weread'] });
});

it.each([true, false])(
  'waits for type availability before reconciling an empty catalog (WeRead available: %s)',
  async (wereadAvailable) => {
    const listCatalog = vi.fn(async () => catalogResult());
    vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
    const { result, stores } = renderQuerySession({
      weReadAvailable: null,
      initial: { selectedTypes: ['weread'] },
    });
    await waitFor(() => expect(result.current.catalog.status).toBe('ready'));

    expect(result.current.state.selectedTypes).toEqual(new Set(['weread']));
    act(() => {
      stores.setWeReadAvailable(wereadAvailable);
    });

    expect(result.current.state.selectedTypes).toEqual(new Set(wereadAvailable ? ['weread'] : []));
  },
);

it('keeps the saved WeRead filter when the catalog cannot load', async () => {
  const pending = deferred<LibraryCatalogListResult>();
  vi.stubGlobal('yomitomoDesktop', {
    library: { catalog: { list: () => pending.promise } },
  });
  const { result } = renderQuerySession({
    weReadAvailable: false,
    initial: { selectedTypes: ['weread'] },
  });
  await act(async () => pending.reject(new Error('database busy')));

  await waitFor(() => expect(result.current.catalog.status).toBe('error'));
  expect(result.current.state.selectedTypes).toEqual(new Set(['weread']));
});

it('does not prune against a previous catalog while its revision is refreshing', async () => {
  const pending = deferred<LibraryCatalogListResult>();
  const listCatalog = vi
    .fn()
    .mockResolvedValueOnce(catalogResult())
    .mockReturnValue(pending.promise);
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  const { result, rerender, stores } = renderQuerySession({
    initial: { selectedTypes: ['weread'] },
  });
  await waitFor(() => expect(result.current.catalog.status).toBe('ready'));

  rerender({ revision: 1 });
  act(() => {
    stores.setWeReadAvailable(false);
  });
  expect(result.current.catalog.status).toBe('loading');
  expect(result.current.state.selectedTypes).toEqual(new Set(['weread']));
  await act(async () => pending.resolve(catalogResult({ wereadCount: 1 })));

  await waitFor(() => expect(result.current.catalog.status).toBe('ready'));
  expect(result.current.state.selectedTypes).toEqual(new Set(['weread']));
});

it.each([60, 14, 0])(
  'preserves the saved page while remounting, then clamps against %s resolved items',
  async (totalCount) => {
    const pending = deferred<LibraryCatalogListResult>();
    const listCatalog = vi
      .fn(async (input: LibraryCatalogListInput) => ({
        ...catalogResult(),
        page: input.page || 1,
        totalCount,
      }))
      .mockReturnValueOnce(pending.promise);
    vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
    const stores = createLibraryStores();
    const view = renderWithStores(<RestorableQueryHarness showCatalog={false} />, stores);
    fireEvent.click(screen.getByRole('button', { name: 'page five' }));
    expect(screen.getByTestId('current-page').textContent).toBe('5');

    view.rerender(<RestorableQueryHarness showCatalog />);
    expect(screen.getByTestId('catalog-status').textContent).toBe('loading');
    expect(screen.getByTestId('current-page').textContent).toBe('5');
    expect(listCatalog).toHaveBeenCalledOnce();
    expect(listCatalog.mock.calls[0][0].page).toBe(5);

    await act(async () => pending.resolve({ ...catalogResult(), page: 5, totalCount }));
    const expectedPage = Math.min(5, Math.max(1, Math.ceil(totalCount / 12)));
    await waitFor(() =>
      expect(screen.getByTestId('current-page').textContent).toBe(String(expectedPage)),
    );
    await waitFor(() => expect(screen.getByTestId('catalog-status').textContent).toBe('ready'));
  },
);

it('keeps the saved page when the remounted catalog cannot load', async () => {
  const pending = deferred<LibraryCatalogListResult>();
  vi.stubGlobal('yomitomoDesktop', {
    library: { catalog: { list: vi.fn(() => pending.promise) } },
  });
  const stores = createLibraryStores();
  const view = renderWithStores(<RestorableQueryHarness showCatalog={false} />, stores);
  fireEvent.click(screen.getByRole('button', { name: 'page five' }));
  view.rerender(<RestorableQueryHarness showCatalog />);

  await act(async () => pending.reject(new Error('database busy')));

  await waitFor(() => expect(screen.getByTestId('catalog-status').textContent).toBe('error'));
  expect(screen.getByTestId('current-page').textContent).toBe('5');
});

it('derives the catalog input directly from the owned query state', async () => {
  const listCatalog = vi.fn(async () => catalogResult());
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  const { result } = renderQuerySession({
    initial: { searchQuery: 'saved query', selectedTypes: ['web'] },
  });

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
});

it('prunes unavailable types and exits a removed collection from external facts', async () => {
  const listCatalog = vi.fn(async () => catalogResult());
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  const { result, stores } = renderQuerySession({
    weReadAvailable: false,
    collections: ['collection_available', 'collection_removed'],
    initial: { activeCollectionId: 'collection_removed', selectedTypes: ['collection'] },
  });

  act(() => {
    stores.setCollections(['collection_available']);
  });

  await waitFor(() => {
    expect(result.current.state.scope).toEqual({ kind: 'library' });
    expect(result.current.state.selectedTypes).toEqual(new Set());
  });
});

it('exposes WeRead when the catalog reports available books', async () => {
  const listCatalog = vi.fn(async () => catalogResult({ wereadCount: 1 }));
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  const { result } = renderQuerySession({ weReadAvailable: false });

  await waitFor(() =>
    expect(result.current.availableTypes).toEqual([...ARTICLE_SOURCE_TYPES, 'weread']),
  );
});

it('serializes page-size saves as partial settings patches', async () => {
  const firstSave = deferred<void>();
  const secondSave = deferred<void>();
  const onSaveSettings = vi
    .fn()
    .mockReturnValueOnce(firstSave.promise)
    .mockReturnValueOnce(secondSave.promise);
  const listCatalog = vi.fn(async () => catalogResult());
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  const { result } = renderQuerySession({
    onSaveSettings,
    settings: { libraryPageSize: 12, themeId: 'ink-paper' },
  });

  act(() => {
    result.current.actions.changePageSize(18);
    result.current.actions.changePageSize(24);
  });

  expect(result.current.state.pageSize).toBe(24);
  await waitFor(() => expect(onSaveSettings).toHaveBeenCalledOnce());
  expect(onSaveSettings).toHaveBeenCalledWith({ libraryPageSize: 18 });

  await act(async () => {
    firstSave.resolve();
    await firstSave.promise;
  });
  await waitFor(() => expect(onSaveSettings).toHaveBeenCalledTimes(2));
  expect(onSaveSettings).toHaveBeenLastCalledWith({ libraryPageSize: 24 });

  await act(async () => {
    secondSave.resolve();
    await secondSave.promise;
  });
});

it('adopts the configured page size on its first mount', async () => {
  const listCatalog = vi.fn(async () => catalogResult());
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  const { result } = renderQuerySession({ settings: { libraryPageSize: 24 } });

  await waitFor(() => expect(result.current.state.pageSize).toBe(24));
});

it('serializes page-size saves across a remounted home', async () => {
  const firstSave = deferred<void>();
  const secondSave = deferred<void>();
  let persisted = 12;
  const saves = [firstSave, secondSave];
  let saveIndex = 0;
  const onSaveSettings = vi.fn((settings: AppSettingsPatch) => {
    const save = saves[saveIndex++];
    return save.promise.then(() => {
      persisted = settings.libraryPageSize ?? persisted;
    });
  });
  const listCatalog = vi.fn(async () => catalogResult());
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  const first = renderQuerySession({ onSaveSettings, settings: { libraryPageSize: 12 } });

  act(() => first.result.current.actions.changePageSize(18));
  await waitFor(() => expect(onSaveSettings).toHaveBeenCalledOnce());
  first.unmount();

  const second = renderQuerySession({ onSaveSettings, settings: { libraryPageSize: 12 } });
  act(() => second.result.current.actions.changePageSize(24));
  await act(async () => {
    await Promise.resolve();
  });
  expect(onSaveSettings).toHaveBeenCalledOnce();

  await act(async () => {
    firstSave.resolve();
    await firstSave.promise;
  });
  await waitFor(() => expect(onSaveSettings).toHaveBeenCalledTimes(2));
  await act(async () => {
    secondSave.resolve();
    await secondSave.promise;
  });
  await waitFor(() => expect(persisted).toBe(24));
});

it('rolls back the latest remounted save to the globally confirmed page size', async () => {
  const firstSave = deferred<void>();
  const secondSave = deferred<void>();
  const onSaveSettings = vi
    .fn()
    .mockReturnValueOnce(firstSave.promise)
    .mockReturnValueOnce(secondSave.promise);
  const listCatalog = vi.fn(async () => catalogResult());
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  const first = renderQuerySession({ onSaveSettings, settings: { libraryPageSize: 12 } });

  act(() => first.result.current.actions.changePageSize(18));
  await waitFor(() => expect(onSaveSettings).toHaveBeenCalledOnce());
  first.unmount();

  const second = renderQuerySession({ onSaveSettings, settings: { libraryPageSize: 12 } });
  act(() => second.result.current.actions.changePageSize(24));
  expect(second.result.current.state.pageSize).toBe(24);

  await act(async () => {
    firstSave.resolve();
    await firstSave.promise;
  });
  await waitFor(() => expect(onSaveSettings).toHaveBeenCalledTimes(2));

  await act(async () => {
    secondSave.reject(new Error('second save failed'));
    await secondSave.promise.catch(() => undefined);
  });
  await waitFor(() => expect(second.result.current.state.pageSize).toBe(18));
});

it('keeps a newer page size when an older queued save fails', async () => {
  const firstSave = deferred<void>();
  const secondSave = deferred<void>();
  const onSaveSettings = vi
    .fn()
    .mockReturnValueOnce(firstSave.promise)
    .mockReturnValueOnce(secondSave.promise);
  const listCatalog = vi.fn(async () => catalogResult());
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  const { result } = renderQuerySession({ onSaveSettings, settings: { libraryPageSize: 12 } });

  act(() => {
    result.current.actions.changePageSize(18);
    result.current.actions.changePageSize(24);
  });

  await act(async () => {
    firstSave.reject(new Error('first save failed'));
    await Promise.resolve();
  });
  await waitFor(() => expect(onSaveSettings).toHaveBeenCalledTimes(2));
  expect(result.current.state.pageSize).toBe(24);

  await act(async () => {
    secondSave.resolve();
    await secondSave.promise;
  });
});

it('continues page-size saves after a synchronous failure', async () => {
  let persisted = 12;
  const onSaveSettings = vi.fn((settings: AppSettingsPatch) => {
    if (settings.libraryPageSize === 18) throw new Error('first save failed');
    return Promise.resolve().then(() => {
      persisted = settings.libraryPageSize ?? persisted;
    });
  });
  const listCatalog = vi.fn(async () => catalogResult());
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  const { result } = renderQuerySession({ onSaveSettings, settings: { libraryPageSize: 12 } });

  act(() => {
    result.current.actions.changePageSize(18);
    result.current.actions.changePageSize(24);
  });

  await waitFor(() => expect(onSaveSettings).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(persisted).toBe(24));
  expect(result.current.state.pageSize).toBe(24);
});

it('rolls back the latest failed page-size save to the last confirmed size', async () => {
  const firstSave = deferred<void>();
  const secondSave = deferred<void>();
  const onSaveSettings = vi
    .fn()
    .mockReturnValueOnce(firstSave.promise)
    .mockReturnValueOnce(secondSave.promise);
  const listCatalog = vi.fn(async () => catalogResult());
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  const { result } = renderQuerySession({ onSaveSettings, settings: { libraryPageSize: 12 } });

  act(() => {
    result.current.actions.changePageSize(18);
    result.current.actions.changePageSize(24);
  });

  await act(async () => {
    firstSave.resolve();
    await firstSave.promise;
  });
  await waitFor(() => expect(onSaveSettings).toHaveBeenCalledTimes(2));

  await act(async () => {
    secondSave.reject(new Error('second save failed'));
    await Promise.resolve();
  });
  await waitFor(() => expect(result.current.state.pageSize).toBe(18));
});

it('adopts external page-size settings without saving them again', async () => {
  const failedSave = deferred<void>();
  const onSaveSettings = vi.fn().mockReturnValue(failedSave.promise);
  const listCatalog = vi.fn(async () => catalogResult());
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  const { result, stores } = renderQuerySession({
    onSaveSettings,
    settings: { libraryPageSize: 12 },
  });

  act(() => {
    stores.setSettings({ libraryPageSize: 24 });
  });

  await waitFor(() => expect(result.current.state.pageSize).toBe(24));
  expect(onSaveSettings).not.toHaveBeenCalled();

  act(() => result.current.actions.changePageSize(18));
  await waitFor(() => expect(onSaveSettings).toHaveBeenCalledOnce());
  await act(async () => {
    failedSave.reject(new Error('save failed'));
    await Promise.resolve();
  });

  await waitFor(() => expect(result.current.state.pageSize).toBe(24));
});

it('keeps an optimistic page size while observing external settings during a save', async () => {
  const failedSave = deferred<void>();
  const onSaveSettings = vi.fn().mockReturnValue(failedSave.promise);
  const listCatalog = vi.fn(async () => catalogResult());
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  const { result, stores } = renderQuerySession({
    onSaveSettings,
    settings: { libraryPageSize: 12 },
  });

  act(() => result.current.actions.changePageSize(18));
  await waitFor(() => expect(onSaveSettings).toHaveBeenCalledOnce());

  act(() => {
    stores.setSettings({ libraryPageSize: 24 });
  });

  expect(result.current.state.pageSize).toBe(18);
  expect(onSaveSettings).toHaveBeenCalledOnce();

  await act(async () => {
    failedSave.reject(new Error('save failed'));
    await failedSave.promise.catch(() => undefined);
  });

  await waitFor(() => expect(result.current.state.pageSize).toBe(24));
});

type LibraryStoresSetup = {
  collections?: string[];
  initial?: {
    activeCollectionId?: string;
    searchQuery?: string;
    selectedTypes?: LibraryTypeFilter[];
  };
  settings?: AppSettingsPatch;
  weReadAvailable?: boolean | null;
};

function createLibraryStores({
  collections = [],
  initial = {},
  settings = {},
  weReadAvailable = true,
}: LibraryStoresSetup = {}) {
  const desktopStore = createDesktopStore();
  const queryClient = createAppQueryClient();
  const sessionStore = createAppSessionStore(desktopStore);
  bindLibraryQueryEvents({ desktopStore, queryClient, sessionStore });
  const applyStore = (patch: Partial<typeof emptyDesktopStore>) =>
    desktopStore.getState().applyStore({
      ...(desktopStore.getState().getStore() || emptyDesktopStore),
      ...patch,
    });
  const setCollections = (ids: string[]) =>
    applyStore({
      collections: ids.map((id) => ({ id, name: id, createdAt: '', updatedAt: '' })),
    });
  const setWeReadAvailable = (configured: boolean) =>
    queryClient.setQueryData(weReadLibraryStateQuery.queryKey, {
      settings: { configured, openMethod: 'deeplink' },
      books: [],
    });
  applyStore({ settings: normalizeAppSettings(settings) });
  setCollections(collections);
  if (weReadAvailable !== null) setWeReadAvailable(weReadAvailable);
  const { dispatchLibraryQuery } = sessionStore.getState().actions;
  for (const value of initial.selectedTypes || []) {
    dispatchLibraryQuery({ type: 'type-toggled', value, availableCount: 6 });
  }
  if (initial.searchQuery) {
    dispatchLibraryQuery({ type: 'query-changed', query: initial.searchQuery });
  }
  if (initial.activeCollectionId) {
    dispatchLibraryQuery({ type: 'collection-opened', collectionId: initial.activeCollectionId });
  }
  return {
    setCollections,
    setSettings: (patch: AppSettingsPatch) => applyStore({ settings: normalizeAppSettings(patch) }),
    setWeReadAvailable,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <DesktopStoreProvider store={desktopStore}>
          <AppSessionStoreProvider store={sessionStore}>{children}</AppSessionStoreProvider>
        </DesktopStoreProvider>
      </QueryClientProvider>
    ),
  };
}

function renderWithStores(ui: ReactElement, stores: ReturnType<typeof createLibraryStores>) {
  return render(ui, { wrapper: stores.wrapper });
}

function renderQuerySession({
  onSaveSettings = vi.fn(),
  ...setup
}: LibraryStoresSetup & {
  onSaveSettings?: (settings: AppSettingsPatch) => Promise<void> | void;
} = {}) {
  const stores = createLibraryStores(setup);
  const view = renderHook(
    ({ revision }: { revision: number }) =>
      useLibraryQuerySession({ catalogRevision: revision, onSaveSettings }),
    { initialProps: { revision: 0 }, wrapper: stores.wrapper },
  );
  return { ...view, stores };
}

function RestorableQueryHarness({ showCatalog }: { showCatalog: boolean }) {
  const sessionStore = useAppSessionStoreApi();
  const state = useStore(sessionStore, ({ libraryQuery }: AppSessionState) => libraryQuery);
  const { dispatchLibraryQuery } = sessionStore.getState().actions;
  return (
    <>
      <button onClick={() => dispatchLibraryQuery({ type: 'page-changed', page: 5 })}>
        page five
      </button>
      <button
        onClick={() =>
          dispatchLibraryQuery({ type: 'type-toggled', value: 'weread', availableCount: 6 })
        }
      >
        filter WeRead
      </button>
      <span data-testid="selected-types">{[...state.selectedTypes].join(',')}</span>
      <span data-testid="current-page">{state.page}</span>
      {showCatalog ? <RestoredCatalog /> : null}
    </>
  );
}

function RestoredCatalog() {
  const { catalog } = useLibraryQuerySession({ catalogRevision: 0, onSaveSettings: vi.fn() });
  return <span data-testid="catalog-status">{catalog.status}</span>;
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

function deferred<T>() {
  let reject!: (cause: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    reject = nextReject;
    resolve = nextResolve;
  });
  return { promise, reject, resolve };
}
