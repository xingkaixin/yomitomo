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

type ResolvedCatalog = {
  scopeKey: string;
  result: LibraryCatalogListResult | null;
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
  const scopeKey = useMemo(() => JSON.stringify(request.scope), [request.scope]);
  const [resolvedCatalog, setResolvedCatalog] = useState<ResolvedCatalog | null>(null);

  useEffect(() => {
    const listCatalog = window.yomitomoDesktop?.listLibraryCatalog;
    if (!listCatalog) return;
    let cancelled = false;
    void listCatalog(request)
      .then((value) => {
        if (!cancelled) setResolvedCatalog({ scopeKey, result: value });
      })
      .catch(() => {
        if (!cancelled) setResolvedCatalog({ scopeKey, result: null });
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
    scopeKey,
  ]);

  return resolvedCatalog?.scopeKey === scopeKey ? resolvedCatalog.result : null;
}
