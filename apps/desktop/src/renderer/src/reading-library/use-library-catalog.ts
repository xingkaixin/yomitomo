import { useEffect, useMemo, useState } from 'react';
import type { LibraryCatalogListInput, LibraryCatalogListResult } from '../../../ipc-contract';

const CATALOG_SEARCH_DEBOUNCE_MS = 180;

export type LibraryCatalogRevision = {
  articles: unknown;
  collectionMembers: unknown;
  collections: unknown;
  pins: unknown;
  wereadBooks: unknown;
};

export function useLibraryCatalog(
  input: LibraryCatalogListInput,
  revision: LibraryCatalogRevision,
) {
  const [query, setQuery] = useState(input.query || '');
  useEffect(() => {
    const nextQuery = input.query || '';
    if (nextQuery === query) return;
    const timer = window.setTimeout(() => setQuery(nextQuery), CATALOG_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [input.query, query]);
  const request = useMemo(() => ({ ...input, query }), [input, query]);
  const requestKey = useMemo(() => JSON.stringify(request), [request]);
  const [result, setResult] = useState<LibraryCatalogListResult | null>(null);

  useEffect(() => {
    const listCatalog = window.yomitomoDesktop?.listLibraryCatalog;
    if (!listCatalog) return;
    let cancelled = false;
    void listCatalog(request)
      .then((value) => {
        if (!cancelled) setResult(value);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    requestKey,
    revision.articles,
    revision.collectionMembers,
    revision.collections,
    revision.pins,
    revision.wereadBooks,
  ]);

  return result;
}
