import { useEffect, useMemo, useState } from 'react';
import type { LibraryCatalogListInput, LibraryCatalogListResult } from '../../../ipc-contract';
import { getOptionalDesktopApi } from '../shell/app-desktop-api';

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
  status: 'loading' | 'ready' | 'error';
  error: Error | null;
};

export type LibraryCatalogState = Pick<ResolvedCatalog, 'result' | 'status' | 'error'>;

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
    const listCatalog = getOptionalDesktopApi()?.library?.catalog?.list;
    if (!listCatalog) {
      setResolvedCatalog({
        scopeKey,
        result: null,
        status: 'error',
        error: new Error('LIBRARY_CATALOG_API_UNAVAILABLE'),
      });
      return;
    }
    let cancelled = false;
    setResolvedCatalog((current) => ({
      scopeKey,
      result: current?.scopeKey === scopeKey ? current.result : null,
      status: 'loading',
      error: null,
    }));
    void listCatalog(request)
      .then((value) => {
        if (!cancelled) {
          setResolvedCatalog({ scopeKey, result: value, status: 'ready', error: null });
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setResolvedCatalog((current) => ({
          scopeKey,
          result: current?.scopeKey === scopeKey ? current.result : null,
          status: 'error',
          error: cause instanceof Error ? cause : new Error('LIBRARY_CATALOG_LOAD_FAILED'),
        }));
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

  if (resolvedCatalog?.scopeKey === scopeKey) return resolvedCatalog;
  return { result: null, status: 'loading', error: null } satisfies LibraryCatalogState;
}
