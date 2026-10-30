import { useCallback, useMemo, useReducer, useRef } from 'react';
import type { ReaderSearchOptions } from '@yomitomo/core';
import type { ReaderAppViewProps } from '@yomitomo/reader-ui/reader-app-view';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';

import { READER_SEARCH_DEBOUNCE_MS, useReaderSearchMatches } from './use-reader-search-matches';

type ReaderSearchToolbarState = NonNullable<ReaderAppViewProps['toolbar']>['search'];
type ReaderSearchToolbarMatch = NonNullable<ReaderSearchToolbarState>['matches'][number];

export type ReaderSearchNavigationOptions = ReaderSearchOptions & {
  debounceMs?: number;
  externalPreparing?: boolean;
  onClose?: () => void;
  scopeKey?: string;
};

type ReaderSearchState = {
  activeMatchIndex: number;
  matchedQuery: string;
  open: boolean;
  query: string;
  scopeKey: string | undefined;
};

type ReaderSearchEvent =
  | { type: 'matchNavigated'; direction: 'previous' | 'next'; total: number }
  | { type: 'queryChanged'; query: string }
  | { type: 'queryMatched'; query: string; scopeKey: string | undefined }
  | { type: 'scopeChanged'; scopeKey: string | undefined }
  | { type: 'searchClosed' }
  | { type: 'searchOpened' }
  | { type: 'searchReset' };

function initialReaderSearchState(scopeKey: string | undefined): ReaderSearchState {
  return { activeMatchIndex: 0, matchedQuery: '', open: false, query: '', scopeKey };
}

function withMatchedQuery(state: ReaderSearchState, matchedQuery: string): ReaderSearchState {
  return matchedQuery === state.matchedQuery
    ? state
    : { ...state, activeMatchIndex: 0, matchedQuery };
}

function readerSearchReducer(state: ReaderSearchState, event: ReaderSearchEvent) {
  switch (event.type) {
    case 'matchNavigated': {
      const { activeMatchIndex: index } = state;
      const { total } = event;
      return {
        ...state,
        activeMatchIndex:
          event.direction === 'next' ? (index + 1) % total : (index - 1 + total) % total,
      };
    }
    case 'queryChanged': {
      const next = { ...state, query: event.query };
      return event.query.trim() ? next : withMatchedQuery(next, event.query);
    }
    case 'queryMatched':
      return event.scopeKey === state.scopeKey ? withMatchedQuery(state, event.query) : state;
    case 'scopeChanged':
      return initialReaderSearchState(event.scopeKey);
    case 'searchClosed':
      return { ...state, open: false };
    case 'searchOpened':
      return { ...state, open: true };
    case 'searchReset':
      return initialReaderSearchState(state.scopeKey);
  }
}

export function useReaderSearchNavigation(
  text: string,
  options: ReaderSearchNavigationOptions = {},
): {
  activeMatch: ReaderSearchToolbarMatch | null;
  activeMatchIndex: number;
  closeSearch: () => void;
  limited: boolean;
  matchedQuery: string;
  matches: ReaderSearchToolbarMatch[];
  navigateSearchMatch: (direction: 'previous' | 'next') => void;
  open: boolean;
  openSearch: () => void;
  preparing: boolean;
  query: string;
  resetSearch: () => void;
  search: NonNullable<ReaderSearchToolbarState>;
  setQuery: (query: string) => void;
} {
  const {
    debounceMs = READER_SEARCH_DEBOUNCE_MS,
    externalPreparing = false,
    onClose,
    scopeKey,
    ...searchOptions
  } = options;
  const [state, dispatch] = useReducer(readerSearchReducer, scopeKey, initialReaderSearchState);
  // Ebook and PDF readers keep this hook across articles, so the search resets while rendering.
  if (state.scopeKey !== scopeKey) dispatch({ type: 'scopeChanged', scopeKey });
  const { activeMatchIndex, matchedQuery, open, query } = state;
  const debounceTimerRef = useRef<number | undefined>(undefined);
  const { limited, matches } = useReaderSearchMatches(text, matchedQuery, searchOptions);
  const activeMatch = matches[Math.min(activeMatchIndex, matches.length - 1)] || null;
  const preparing = Boolean(query.trim()) && (externalPreparing || matchedQuery !== query);

  useMountEffect(() => () => window.clearTimeout(debounceTimerRef.current));

  const setQuery = useCallback(
    (nextQuery: string) => {
      window.clearTimeout(debounceTimerRef.current);
      dispatch({ type: 'queryChanged', query: nextQuery });
      if (!nextQuery.trim()) return;
      debounceTimerRef.current = window.setTimeout(() => {
        dispatch({ type: 'queryMatched', query: nextQuery, scopeKey });
      }, debounceMs);
    },
    [debounceMs, scopeKey],
  );

  const openSearch = useCallback(() => {
    dispatch({ type: 'searchOpened' });
  }, []);

  const closeSearch = useCallback(() => {
    dispatch({ type: 'searchClosed' });
    onClose?.();
  }, [onClose]);

  const resetSearch = useCallback(() => {
    window.clearTimeout(debounceTimerRef.current);
    dispatch({ type: 'searchReset' });
    onClose?.();
  }, [onClose]);

  const navigateSearchMatch = useCallback(
    (direction: 'previous' | 'next') => {
      const total = matches.length;
      if (total === 0) return;
      dispatch({ type: 'matchNavigated', direction, total });
    },
    [matches.length],
  );

  const search = useMemo(
    () => ({
      activeMatchIndex,
      limited,
      matches,
      open,
      preparing,
      query,
      onClose: closeSearch,
      onNextMatch: () => navigateSearchMatch('next'),
      onOpen: openSearch,
      onPreviousMatch: () => navigateSearchMatch('previous'),
      onQueryChange: setQuery,
    }),
    [
      activeMatchIndex,
      closeSearch,
      limited,
      matches,
      navigateSearchMatch,
      open,
      openSearch,
      preparing,
      query,
      setQuery,
    ],
  );

  return {
    activeMatch,
    activeMatchIndex,
    closeSearch,
    limited,
    matchedQuery,
    matches,
    navigateSearchMatch,
    open,
    openSearch,
    preparing,
    query,
    resetSearch,
    search,
    setQuery,
  };
}
