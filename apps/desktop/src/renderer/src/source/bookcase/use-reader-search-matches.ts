import { useMemo } from 'react';
import { createReaderSearch, type ReaderSearchOptions } from '@yomitomo/core';

export const READER_SEARCH_DEBOUNCE_MS = 220;

export function useReaderSearchMatches(
  text: string,
  matchedQuery: string,
  options: ReaderSearchOptions = {},
) {
  const search = useMemo(
    () => createReaderSearch(text, options.caseSensitive),
    [text, options.caseSensitive],
  );
  return useMemo(
    () => search(matchedQuery, options),
    [matchedQuery, search, options.limit, options.previewRadius],
  );
}
