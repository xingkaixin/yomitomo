import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { AppSettingsPatch, ResolvedAppSettings } from '@yomitomo/shared';
import type { LibraryCatalogItemType, LibraryCatalogListInput } from '../../../ipc-contract';
import type { LibraryTypeFilter } from './library-filter-types';
import { normalizeLibraryPageSize, type LibraryPageSize } from './library-query-session';
import { libraryPageSizePersistence } from './library-page-size-persistence';
import { useLibraryCatalog } from './use-library-catalog';
import type { LibraryQueryState } from './use-library-query-state';

type UseLibraryQuerySessionOptions = {
  settings: ResolvedAppSettings;
  onSaveSettings: (settings: AppSettingsPatch) => Promise<void> | void;
  catalogRevision: unknown;
  query: LibraryQueryState;
  availableTypes: readonly LibraryCatalogItemType[];
  collectionIds: readonly string[];
};

export function useLibraryQuerySession({
  availableTypes,
  collectionIds,
  catalogRevision,
  onSaveSettings,
  query,
  settings,
}: UseLibraryQuerySessionOptions) {
  const { dispatch, state } = query;
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
  const catalog = useLibraryCatalog(catalogInput, catalogRevision);
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
  const externalPageSizeRef = useRef(state.pageSize);
  const latestPageSizeRef = useRef(state.pageSize);

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

  const updateSearchQuery = useCallback((nextQuery: string) => {
    dispatch({ type: 'query-changed', query: nextQuery });
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

export type LibraryQuerySession = ReturnType<typeof useLibraryQuerySession>;

function resolvedLibraryAvailableTypes(
  availableTypes: readonly LibraryCatalogItemType[],
  wereadCount: number | undefined,
): readonly LibraryCatalogItemType[] {
  if (availableTypes.includes('weread') || !wereadCount) return availableTypes;
  return [...availableTypes, 'weread'];
}
