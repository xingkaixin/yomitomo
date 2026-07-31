import type { LibraryTypeFilter } from './library-filter-types';

export const LIBRARY_PAGE_SIZE_OPTIONS = [6, 12, 18, 24] as const;

export type LibraryPageSize = (typeof LIBRARY_PAGE_SIZE_OPTIONS)[number];

export type LibraryQueryScope = { kind: 'library' } | { kind: 'collection'; collectionId: string };

export type LibraryTransitionDirection = 'backward' | 'forward' | 'none';

export type LibraryQuerySessionState = {
  scope: LibraryQueryScope;
  selectedTypes: ReadonlySet<LibraryTypeFilter>;
  searchQuery: string;
  page: number;
  pageSize: LibraryPageSize;
  listTransition: LibraryTransitionDirection;
  pageTransition: LibraryTransitionDirection;
};

export type LibraryQuerySessionEvent =
  | { type: 'query-changed'; query: string }
  | { type: 'type-toggled'; value: LibraryTypeFilter; availableCount: number }
  | { type: 'types-reset' }
  | { type: 'types-pruned'; available: ReadonlySet<LibraryTypeFilter> }
  | { type: 'collection-opened'; collectionId: string }
  | { type: 'collection-closed' }
  | { type: 'collection-removed'; existingIds: ReadonlySet<string> }
  | { type: 'page-changed'; page: number }
  | { type: 'page-clamped'; pageCount: number }
  | { type: 'page-size-changed'; pageSize: number };

type LibraryQuerySessionInitialState = {
  activeCollectionId: string | null;
  page?: number;
  pageSize: unknown;
  searchQuery: string;
  selectedTypes: ReadonlySet<LibraryTypeFilter>;
};

export function createLibraryQuerySessionState({
  activeCollectionId,
  page = 1,
  pageSize,
  searchQuery,
  selectedTypes,
}: LibraryQuerySessionInitialState): LibraryQuerySessionState {
  return {
    scope: activeCollectionId
      ? { kind: 'collection', collectionId: activeCollectionId }
      : { kind: 'library' },
    selectedTypes: new Set(selectedTypes),
    searchQuery,
    page: normalizePage(page),
    pageSize: normalizeLibraryPageSize(pageSize),
    listTransition: 'none',
    pageTransition: 'none',
  };
}

export function libraryQuerySessionReducer(
  state: LibraryQuerySessionState,
  event: LibraryQuerySessionEvent,
): LibraryQuerySessionState {
  switch (event.type) {
    case 'query-changed':
      return resetList(state, { searchQuery: event.query });
    case 'type-toggled':
      return resetList(state, {
        selectedTypes: toggledTypes(state.selectedTypes, event.value, event.availableCount),
      });
    case 'types-reset':
      return resetList(state, { selectedTypes: new Set<LibraryTypeFilter>() });
    case 'types-pruned':
      return pruneTypes(state, event.available);
    case 'collection-opened':
      if (
        state.scope.kind === 'collection' &&
        state.scope.collectionId === event.collectionId &&
        state.page === 1 &&
        state.listTransition === 'forward' &&
        state.pageTransition === 'none'
      ) {
        return state;
      }
      return {
        ...state,
        scope: { kind: 'collection', collectionId: event.collectionId },
        page: 1,
        listTransition: 'forward',
        pageTransition: 'none',
      };
    case 'collection-closed':
      if (
        state.scope.kind === 'library' &&
        state.page === 1 &&
        state.listTransition === 'backward' &&
        state.pageTransition === 'none'
      ) {
        return state;
      }
      return {
        ...state,
        scope: { kind: 'library' },
        page: 1,
        listTransition: 'backward',
        pageTransition: 'none',
      };
    case 'collection-removed':
      return removeMissingCollection(state, event.existingIds);
    case 'page-changed':
      return changePage(state, event.page);
    case 'page-clamped':
      return clampPage(state, event.pageCount);
    case 'page-size-changed':
      return resetList(state, { pageSize: normalizeLibraryPageSize(event.pageSize) });
  }
}

export function normalizeLibraryPageSize(value: unknown): LibraryPageSize {
  return LIBRARY_PAGE_SIZE_OPTIONS.includes(value as LibraryPageSize)
    ? (value as LibraryPageSize)
    : 12;
}

function resetList(
  state: LibraryQuerySessionState,
  values: Partial<Pick<LibraryQuerySessionState, 'pageSize' | 'searchQuery' | 'selectedTypes'>>,
): LibraryQuerySessionState {
  const selectedTypes = values.selectedTypes || state.selectedTypes;
  const searchQuery = values.searchQuery ?? state.searchQuery;
  const pageSize = values.pageSize ?? state.pageSize;
  if (
    state.page === 1 &&
    state.listTransition === 'none' &&
    state.pageTransition === 'none' &&
    state.searchQuery === searchQuery &&
    state.pageSize === pageSize &&
    sameTypes(state.selectedTypes, selectedTypes)
  ) {
    return state;
  }
  return {
    ...state,
    selectedTypes,
    searchQuery,
    pageSize,
    page: 1,
    listTransition: 'none',
    pageTransition: 'none',
  };
}

function toggledTypes(
  selectedTypes: ReadonlySet<LibraryTypeFilter>,
  value: LibraryTypeFilter,
  availableCount: number,
): ReadonlySet<LibraryTypeFilter> {
  const nextTypes = new Set(selectedTypes);
  if (nextTypes.has(value)) nextTypes.delete(value);
  else nextTypes.add(value);
  return nextTypes.size === normalizeAvailableCount(availableCount)
    ? new Set<LibraryTypeFilter>()
    : nextTypes;
}

function pruneTypes(
  state: LibraryQuerySessionState,
  available: ReadonlySet<LibraryTypeFilter>,
): LibraryQuerySessionState {
  const selectedTypes = new Set([...state.selectedTypes].filter((type) => available.has(type)));
  return sameTypes(state.selectedTypes, selectedTypes) ? state : { ...state, selectedTypes };
}

function removeMissingCollection(
  state: LibraryQuerySessionState,
  existingIds: ReadonlySet<string>,
): LibraryQuerySessionState {
  if (state.scope.kind === 'library' || existingIds.has(state.scope.collectionId)) return state;
  return {
    ...state,
    scope: { kind: 'library' },
    page: 1,
    listTransition: 'none',
    pageTransition: 'none',
  };
}

function changePage(state: LibraryQuerySessionState, page: number): LibraryQuerySessionState {
  const nextPage = normalizePage(page);
  if (nextPage === state.page) {
    return state.pageTransition === 'none' ? state : { ...state, pageTransition: 'none' };
  }
  return {
    ...state,
    page: nextPage,
    pageTransition: nextPage > state.page ? 'forward' : 'backward',
  };
}

function clampPage(state: LibraryQuerySessionState, pageCount: number): LibraryQuerySessionState {
  const page = Math.min(state.page, normalizePage(pageCount));
  return page === state.page ? state : { ...state, page, pageTransition: 'none' };
}

function normalizeAvailableCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizePage(value: number) {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

function sameTypes(left: ReadonlySet<LibraryTypeFilter>, right: ReadonlySet<LibraryTypeFilter>) {
  return left.size === right.size && [...left].every((type) => right.has(type));
}
