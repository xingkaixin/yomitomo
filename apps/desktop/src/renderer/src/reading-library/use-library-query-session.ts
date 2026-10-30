import { useCallback, useMemo } from 'react';
import { useStore } from 'zustand';
import type { AppSettingsPatch } from '@yomitomo/shared';
import { useAppSessionStoreApi, type AppSessionState } from '../shell/app-session';
import type { LibraryTypeFilter } from './library-filter-types';
import {
  libraryCatalogInput,
  libraryPageCount,
  librarySelectableTypes,
  normalizeLibraryPageSize,
  resolvedLibraryAvailableTypes,
} from './library-query-session';
import { libraryPageSizePersistence } from './library-page-size-persistence';
import { useLibraryCatalog } from './use-library-catalog';
import { libraryCatalogTypes, useWeReadLibraryState } from './use-weread-library-session';

type UseLibraryQuerySessionOptions = {
  onSaveSettings: (settings: AppSettingsPatch) => Promise<void> | void;
  catalogRevision: unknown;
  catalogEnabled?: boolean;
};

export function useLibraryQuerySession({
  catalogRevision,
  catalogEnabled = true,
  onSaveSettings,
}: UseLibraryQuerySessionOptions) {
  const sessionStore = useAppSessionStoreApi();
  const state = useStore(sessionStore, ({ libraryQuery }: AppSessionState) => libraryQuery);
  const { dispatchLibraryQuery } = sessionStore.getState().actions;
  const selectedTypesKey = useMemo(
    () => [...state.selectedTypes].toSorted().join(','),
    [state.selectedTypes],
  );
  const catalogInput = useMemo(
    () => libraryCatalogInput(state),
    [selectedTypesKey, state.page, state.pageSize, state.scope, state.searchQuery],
  );
  const catalog = useLibraryCatalog(catalogInput, catalogRevision, catalogEnabled);
  const availableTypes = libraryCatalogTypes(useWeReadLibraryState());
  const resolvedAvailableTypes = useMemo(
    () => resolvedLibraryAvailableTypes(availableTypes, catalog.result?.itemCounts.weread),
    [availableTypes, catalog.result?.itemCounts.weread],
  );
  const selectableTypes = useMemo(
    () => librarySelectableTypes(state.scope, resolvedAvailableTypes),
    [resolvedAvailableTypes, state.scope],
  );
  const pageCount = libraryPageCount(catalog.result?.totalCount, state.pageSize);

  const updateSearchQuery = useCallback(
    (nextQuery: string) => dispatchLibraryQuery({ type: 'query-changed', query: nextQuery }),
    [dispatchLibraryQuery],
  );
  const toggleType = useCallback(
    (value: LibraryTypeFilter) =>
      dispatchLibraryQuery({ type: 'type-toggled', value, availableCount: selectableTypes.size }),
    [dispatchLibraryQuery, selectableTypes],
  );
  const resetTypes = useCallback(
    () => dispatchLibraryQuery({ type: 'types-reset' }),
    [dispatchLibraryQuery],
  );
  const openCollection = useCallback(
    (collectionId: string) => dispatchLibraryQuery({ type: 'collection-opened', collectionId }),
    [dispatchLibraryQuery],
  );
  const closeCollection = useCallback(
    () => dispatchLibraryQuery({ type: 'collection-closed' }),
    [dispatchLibraryQuery],
  );
  const changePage = useCallback(
    (page: number) => dispatchLibraryQuery({ type: 'page-changed', page }),
    [dispatchLibraryQuery],
  );
  const changePageSize = useCallback(
    (pageSize: number) => {
      const nextPageSize = normalizeLibraryPageSize(pageSize);
      if (nextPageSize === sessionStore.getState().libraryQuery.pageSize) return;
      dispatchLibraryQuery({ type: 'page-size-changed', pageSize: nextPageSize });
      libraryPageSizePersistence.enqueue(
        nextPageSize,
        () => onSaveSettings({ libraryPageSize: nextPageSize }),
        (confirmedPageSize) =>
          dispatchLibraryQuery({ type: 'page-size-changed', pageSize: confirmedPageSize }),
      );
    },
    [dispatchLibraryQuery, onSaveSettings, sessionStore],
  );

  const actions = useMemo(
    () => ({
      changePage,
      changePageSize,
      closeCollection,
      openCollection,
      resetTypes,
      toggleType,
      updateSearchQuery,
    }),
    [
      changePage,
      changePageSize,
      closeCollection,
      openCollection,
      resetTypes,
      toggleType,
      updateSearchQuery,
    ],
  );

  return {
    actions,
    availableTypes: resolvedAvailableTypes,
    catalog,
    input: catalogInput,
    pageCount,
    state,
  };
}

export type LibraryQuerySession = ReturnType<typeof useLibraryQuerySession>;
