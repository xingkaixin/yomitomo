import { useMemo, useReducer, type Dispatch } from 'react';
import {
  createLibraryQuerySessionState,
  libraryQuerySessionReducer,
  type LibraryQuerySessionEvent,
  type LibraryQuerySessionState,
} from './library-query-session';

export type LibraryQueryState = {
  dispatch: Dispatch<LibraryQuerySessionEvent>;
  state: LibraryQuerySessionState;
};

type LibraryQueryInitialState = {
  activeCollectionId?: string | null;
  pageSize?: unknown;
  searchQuery?: string;
  selectedTypes?: LibraryQuerySessionState['selectedTypes'];
};

export function useLibraryQueryState(initial: LibraryQueryInitialState = {}): LibraryQueryState {
  const [state, dispatch] = useReducer(
    libraryQuerySessionReducer,
    initial,
    (value): LibraryQuerySessionState =>
      createLibraryQuerySessionState({
        activeCollectionId: value.activeCollectionId || null,
        pageSize: value.pageSize ?? 12,
        searchQuery: value.searchQuery || '',
        selectedTypes: value.selectedTypes || new Set(),
      }),
  );

  return useMemo(() => ({ dispatch, state }), [state]);
}
