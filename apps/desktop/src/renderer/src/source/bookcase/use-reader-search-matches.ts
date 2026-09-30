import { useEffect, useMemo, useState } from 'react';
import { createReaderSearch, type ReaderSearchOptions } from '@yomitomo/core';

const READER_SEARCH_DEBOUNCE_MS = 220;

export function useReaderSearchMatches(
  text: string,
  query: string,
  options: ReaderSearchOptions & { debounceMs?: number } = {},
) {
  const { debounceMs = READER_SEARCH_DEBOUNCE_MS, ...searchOptions } = options;
  const [matchedQuery, setMatchedQuery] = useState(query);

  useEffect(() => {
    if (!query.trim()) {
      setMatchedQuery(query);
      return;
    }

    const timer = window.setTimeout(() => {
      setMatchedQuery(query);
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [debounceMs, query]);

  const search = useMemo(
    () => createReaderSearch(text, searchOptions.caseSensitive),
    [text, searchOptions.caseSensitive],
  );
  const result = useMemo(
    () => search(matchedQuery, searchOptions),
    [matchedQuery, search, searchOptions.limit, searchOptions.previewRadius],
  );

  return {
    matchedQuery,
    preparing: Boolean(query.trim()) && matchedQuery !== query,
    result,
  };
}
