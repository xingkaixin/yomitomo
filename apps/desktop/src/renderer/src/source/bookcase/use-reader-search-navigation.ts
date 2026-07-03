import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReaderSearchOptions } from '@yomitomo/core';
import type { ReaderAppViewProps } from '@yomitomo/reader-ui/reader-app-view';

import { useReaderSearchMatches } from './use-reader-search-matches';

type ReaderSearchToolbarState = NonNullable<ReaderAppViewProps['toolbar']>['search'];
type ReaderSearchToolbarMatch = NonNullable<ReaderSearchToolbarState>['matches'][number];

export type ReaderSearchNavigationOptions = ReaderSearchOptions & {
  debounceMs?: number;
  externalPreparing?: boolean;
  onClose?: () => void;
};

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
  const { externalPreparing = false, onClose, ...searchOptions } = options;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const {
    matchedQuery,
    preparing: matchesPreparing,
    result,
  } = useReaderSearchMatches(text, query, searchOptions);
  const { limited, matches } = result;
  const activeMatch = matches[Math.min(activeMatchIndex, matches.length - 1)] || null;
  const preparing = Boolean(query.trim()) && (externalPreparing || matchesPreparing);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [matchedQuery]);

  const openSearch = useCallback(() => {
    setOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  const resetSearch = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveMatchIndex(0);
    onClose?.();
  }, [onClose]);

  const navigateSearchMatch = useCallback(
    (direction: 'previous' | 'next') => {
      const total = matches.length;
      if (total === 0) return;
      setActiveMatchIndex((index) =>
        direction === 'next' ? (index + 1) % total : (index - 1 + total) % total,
      );
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
