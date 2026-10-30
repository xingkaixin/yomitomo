import {
  hashKey,
  useQuery,
  useQueryClient,
  type Query,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  LibraryCatalogListInput,
  LibraryCatalogListResult,
  LibraryCatalogScope,
} from '../../../ipc-contract';
import { getOptionalDesktopApi } from '../shell/app-desktop-api';

const CATALOG_SEARCH_DEBOUNCE_MS = 180;

export const libraryCatalogQueryKey = ['library', 'catalog'] as const;

export type LibraryCatalogState = {
  result: LibraryCatalogListResult | null;
  status: 'loading' | 'ready' | 'error';
  error: Error | null;
};

export function useLibraryCatalog(
  input: LibraryCatalogListInput,
  revision: unknown,
  enabled = true,
): LibraryCatalogState {
  const queryClient = useQueryClient();
  const latest = latestScopeQuery(queryClient, input.scope);
  const request = catalogRequest(input);
  const debounce = latest !== undefined && latestRequest(latest).query !== request.query;
  const catalog = useQuery({
    queryKey: [...libraryCatalogQueryKey, input.scope, request, revision],
    queryFn: ({ signal }) => listCatalog(request, debounce, signal),
    enabled,
  });

  const result = catalog.data ?? latest?.state.data ?? null;
  if (catalog.isFetching || catalog.isPending) return { result, status: 'loading', error: null };
  if (catalog.isError) {
    return {
      result,
      status: 'error',
      error:
        catalog.error instanceof Error ? catalog.error : new Error('LIBRARY_CATALOG_LOAD_FAILED'),
    };
  }
  return { result: catalog.data, status: 'ready', error: null };
}

// Only the query a mounted library observes counts, so an unmounted library or a refresh of
// another revision never reconciles against an older result.
export function observedLibraryCatalogResult(
  queryClient: QueryClient,
  input: LibraryCatalogListInput,
) {
  const request = hashKey([input.scope, catalogRequest(input)]);
  const query = queryClient
    .getQueryCache()
    .findAll({ queryKey: libraryCatalogQueryKey })
    .find(
      (candidate) =>
        candidate.getObserversCount() > 0 && hashKey(candidate.queryKey.slice(2, 4)) === request,
    );
  if (query?.state.status !== 'success' || query.state.fetchStatus !== 'idle') return null;
  return query.state.data as LibraryCatalogListResult;
}

function catalogRequest(input: LibraryCatalogListInput): LibraryCatalogListInput {
  return { ...input, query: input.query || '' };
}

async function listCatalog(
  request: LibraryCatalogListInput,
  debounce: boolean,
  signal: AbortSignal,
) {
  const list = getOptionalDesktopApi()?.library?.catalog?.list;
  if (!list) throw new Error('LIBRARY_CATALOG_API_UNAVAILABLE');
  // Reading the signal lets Query cancel an abandoned request, so a superseded search never
  // reaches IPC and a late response is discarded.
  if (debounce) await delay(CATALOG_SEARCH_DEBOUNCE_MS, signal);
  return list(request);
}

type CatalogQuery = Query<LibraryCatalogListResult, Error, LibraryCatalogListResult>;

function latestScopeQuery(queryClient: QueryClient, scope: LibraryCatalogScope) {
  let latest: CatalogQuery | undefined;
  for (const query of queryClient
    .getQueryCache()
    .findAll({ queryKey: [...libraryCatalogQueryKey, scope] })) {
    if (query.state.data === undefined) continue;
    if (!latest || query.state.dataUpdatedAt >= latest.state.dataUpdatedAt) {
      latest = query as CatalogQuery;
    }
  }
  return latest;
}

function latestRequest(query: CatalogQuery) {
  return query.queryKey[3] as LibraryCatalogListInput;
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
