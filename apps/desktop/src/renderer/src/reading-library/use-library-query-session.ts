import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { AppSettings } from '@yomitomo/shared';
import type { LibraryCatalogItemType, LibraryCatalogListInput } from '../../../ipc-contract';
import { librarySession } from './app-reading-library-session';
import type { LibraryTypeFilter } from './library-filter-types';
import {
  createLibraryQuerySessionState,
  libraryQuerySessionReducer,
  normalizeLibraryPageSize,
  type LibraryPageSize,
} from './library-query-session';
import { libraryPageSizePersistence } from './library-page-size-persistence';
import { useLibraryCatalog } from './use-library-catalog';

type UseLibraryQuerySessionOptions = {
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => Promise<void> | void;
  localRevision: number;
  availableTypes: readonly LibraryCatalogItemType[];
  collectionIds: readonly string[];
};

export function useLibraryQuerySession({
  availableTypes,
  collectionIds,
  localRevision,
  onSaveSettings,
  settings,
}: UseLibraryQuerySessionOptions) {
  const [state, dispatch] = useReducer(libraryQuerySessionReducer, undefined, () =>
    createLibraryQuerySessionState({
      activeCollectionId: librarySession.activeCollectionId,
      pageSize: settings.libraryPageSize,
      searchQuery: librarySession.searchQuery,
      selectedTypes: librarySession.selectedTypes,
    }),
  );
  const selectedTypesKey = useMemo(
    () => [...state.selectedTypes].toSorted().join(','),
    [state.selectedTypes],
  );
  const catalogInput = useMemo<LibraryCatalogListInput>(
    () => ({
      scope: state.scope,
      types:
        state.selectedTypes.size > 0
          ? ([...state.selectedTypes] as LibraryCatalogListInput['types'])
          : undefined,
      query: state.searchQuery,
      page: state.page,
      pageSize: state.pageSize,
    }),
    [selectedTypesKey, state.page, state.pageSize, state.scope, state.searchQuery],
  );
  const catalog = useLibraryCatalog(catalogInput, localRevision);
  const resolvedAvailableTypes = useMemo<readonly LibraryCatalogItemType[]>(
    () => resolvedLibraryAvailableTypes(availableTypes, catalog.result?.itemCounts.weread),
    [availableTypes, catalog.result?.itemCounts.weread],
  );
  const selectableTypes = useMemo<ReadonlySet<LibraryTypeFilter>>(
    () =>
      new Set<LibraryTypeFilter>(
        state.scope.kind === 'library'
          ? ['collection', ...resolvedAvailableTypes]
          : resolvedAvailableTypes,
      ),
    [resolvedAvailableTypes, state.scope.kind],
  );
  const knownCollectionIds = useMemo(() => new Set(collectionIds), [collectionIds]);
  const pageCount = Math.max(1, Math.ceil((catalog.result?.totalCount || 0) / state.pageSize));
  const externalPageSizeRef = useRef(normalizeLibraryPageSize(settings.libraryPageSize));
  const latestPageSizeRef = useRef(normalizeLibraryPageSize(settings.libraryPageSize));

  useEffect(() => {
    librarySession.searchQuery = state.searchQuery;
    librarySession.selectedTypes = new Set(state.selectedTypes);
    librarySession.activeCollectionId =
      state.scope.kind === 'collection' ? state.scope.collectionId : null;
  }, [state.scope, state.searchQuery, state.selectedTypes]);

  useEffect(() => {
    dispatch({ type: 'types-pruned', available: selectableTypes });
  }, [selectableTypes]);

  useEffect(() => {
    dispatch({ type: 'collection-removed', existingIds: knownCollectionIds });
  }, [knownCollectionIds]);

  useEffect(() => {
    dispatch({ type: 'page-clamped', pageCount });
  }, [pageCount]);

  const externalPageSize = normalizeLibraryPageSize(settings.libraryPageSize);
  useEffect(() => {
    libraryPageSizePersistence.observeConfirmed(externalPageSize);
    if (externalPageSizeRef.current === externalPageSize) return;
    externalPageSizeRef.current = externalPageSize;
    if (libraryPageSizePersistence.hasPendingSave()) return;
    latestPageSizeRef.current = externalPageSize;
    dispatch({ type: 'page-size-changed', pageSize: externalPageSize });
  }, [externalPageSize]);

  const updateSearchQuery = useCallback((query: string) => {
    dispatch({ type: 'query-changed', query });
  }, []);
  const toggleType = useCallback(
    (value: LibraryTypeFilter) => {
      dispatch({ type: 'type-toggled', value, availableCount: selectableTypes.size });
    },
    [selectableTypes],
  );
  const resetTypes = useCallback(() => {
    dispatch({ type: 'types-reset' });
  }, []);
  const openCollection = useCallback((collectionId: string) => {
    dispatch({ type: 'collection-opened', collectionId });
  }, []);
  const closeCollection = useCallback(() => {
    dispatch({ type: 'collection-closed' });
  }, []);
  const changePage = useCallback((page: number) => {
    dispatch({ type: 'page-changed', page });
  }, []);
  const queuePageSizeSave = useCallback(
    (pageSize: LibraryPageSize) => {
      libraryPageSizePersistence.enqueue(
        pageSize,
        () => onSaveSettings({ libraryPageSize: pageSize }),
        (confirmedPageSize) => {
          latestPageSizeRef.current = confirmedPageSize;
          dispatch({ type: 'page-size-changed', pageSize: confirmedPageSize });
        },
      );
    },
    [onSaveSettings],
  );
  const changePageSize = useCallback(
    (pageSize: number) => {
      const nextPageSize = normalizeLibraryPageSize(pageSize);
      if (nextPageSize === latestPageSizeRef.current) return;
      latestPageSizeRef.current = nextPageSize;
      dispatch({ type: 'page-size-changed', pageSize: nextPageSize });
      queuePageSizeSave(nextPageSize);
    },
    [queuePageSizeSave],
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

function resolvedLibraryAvailableTypes(
  availableTypes: readonly LibraryCatalogItemType[],
  wereadCount: number | undefined,
): readonly LibraryCatalogItemType[] {
  if (availableTypes.includes('weread') || !wereadCount) return availableTypes;
  return [...availableTypes, 'weread'];
}
