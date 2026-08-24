// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { AppSettingsPatch } from '@yomitomo/shared';
import type { LibraryCatalogItemType, LibraryCatalogListResult } from '../../../ipc-contract';
import { useLibraryQuerySession as useLibraryQuerySessionRuntime } from './use-library-query-session';
import { useLibraryQueryState } from './use-library-query-state';
import { normalizeAppSettings } from '../../../settings/app-settings-normalization';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('derives the catalog input directly from the owned query state', async () => {
  const listCatalog = vi.fn(async () => catalogResult());
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  const { result } = renderHook(() =>
    useLibraryQuerySession(
      sessionOptions({ initial: { searchQuery: 'saved query', selectedTypes: new Set(['web']) } }),
    ),
  );

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
  const { result } = renderHook(() =>
    useLibraryQuerySession(
      sessionOptions({
        availableTypes: ['web'],
        collectionIds: ['collection_available'],
        initial: {
          activeCollectionId: 'collection_missing',
          selectedTypes: new Set(['collection']),
        },
      }),
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

it('serializes page-size saves as partial settings patches', async () => {
  const firstSave = deferred<void>();
  const secondSave = deferred<void>();
  const onSaveSettings = vi
    .fn()
    .mockReturnValueOnce(firstSave.promise)
    .mockReturnValueOnce(secondSave.promise);
  const listCatalog = vi.fn(async () => catalogResult());
  vi.stubGlobal('yomitomoDesktop', { library: { catalog: { list: listCatalog } } });
  const { result } = renderHook(() =>
    useLibraryQuerySession(
      sessionOptions({ onSaveSettings, settings: { libraryPageSize: 12, themeId: 'ink-paper' } }),
    ),
  );

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
  const { result } = renderHook(() =>
    useLibraryQuerySession(sessionOptions({ settings: { libraryPageSize: 24 } })),
  );

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
  const first = renderHook(() =>
    useLibraryQuerySession(sessionOptions({ onSaveSettings, settings: { libraryPageSize: 12 } })),
  );

  act(() => first.result.current.actions.changePageSize(18));
  await waitFor(() => expect(onSaveSettings).toHaveBeenCalledOnce());
  first.unmount();

  const second = renderHook(() =>
    useLibraryQuerySession(sessionOptions({ onSaveSettings, settings: { libraryPageSize: 12 } })),
  );
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
  const first = renderHook(() =>
    useLibraryQuerySession(sessionOptions({ onSaveSettings, settings: { libraryPageSize: 12 } })),
  );

  act(() => first.result.current.actions.changePageSize(18));
  await waitFor(() => expect(onSaveSettings).toHaveBeenCalledOnce());
  first.unmount();

  const second = renderHook(() =>
    useLibraryQuerySession(sessionOptions({ onSaveSettings, settings: { libraryPageSize: 12 } })),
  );
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
  const { result } = renderHook(() =>
    useLibraryQuerySession(sessionOptions({ onSaveSettings, settings: { libraryPageSize: 12 } })),
  );

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
  const { result } = renderHook(() =>
    useLibraryQuerySession(sessionOptions({ onSaveSettings, settings: { libraryPageSize: 12 } })),
  );

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
  const { result } = renderHook(() =>
    useLibraryQuerySession(sessionOptions({ onSaveSettings, settings: { libraryPageSize: 12 } })),
  );

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
  const { result, rerender } = renderHook(
    ({ settings }) => useLibraryQuerySession(sessionOptions({ onSaveSettings, settings })),
    { initialProps: { settings: { libraryPageSize: 12 } } },
  );

  rerender({ settings: { libraryPageSize: 24 } });

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
  const { result, rerender } = renderHook(
    ({ settings }) => useLibraryQuerySession(sessionOptions({ onSaveSettings, settings })),
    { initialProps: { settings: { libraryPageSize: 12 } } },
  );

  act(() => result.current.actions.changePageSize(18));
  await waitFor(() => expect(onSaveSettings).toHaveBeenCalledOnce());

  rerender({ settings: { libraryPageSize: 24 } });

  expect(result.current.state.pageSize).toBe(18);
  expect(onSaveSettings).toHaveBeenCalledOnce();

  await act(async () => {
    failedSave.reject(new Error('save failed'));
    await failedSave.promise.catch(() => undefined);
  });

  await waitFor(() => expect(result.current.state.pageSize).toBe(24));
});

function sessionOptions({
  availableTypes = ['web', 'ebook', 'pdf', 'text', 'weread'],
  collectionIds = [],
  initial = {},
  localRevision = 0,
  onSaveSettings = vi.fn(),
  settings = {},
}: {
  availableTypes?: LibraryCatalogItemType[];
  collectionIds?: string[];
  initial?: Parameters<typeof useLibraryQueryState>[0];
  localRevision?: number;
  onSaveSettings?: (settings: AppSettingsPatch) => Promise<void> | void;
  settings?: AppSettingsPatch;
} = {}) {
  return {
    availableTypes,
    collectionIds,
    initial,
    localRevision,
    onSaveSettings,
    settings: normalizeAppSettings(settings),
  };
}

function useLibraryQuerySession(options: ReturnType<typeof sessionOptions>) {
  const { initial, localRevision, ...runtimeOptions } = options;
  const query = useLibraryQueryState(initial);
  return useLibraryQuerySessionRuntime({
    ...runtimeOptions,
    catalogRevision: localRevision,
    query,
  });
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
