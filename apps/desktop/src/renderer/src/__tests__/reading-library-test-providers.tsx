import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ArticleSummaryRecord, ResolvedAppSettings } from '@yomitomo/shared';
import { emptyDesktopStore } from '../../../app-store';
import { bindLibraryQueryEvents } from '../shell/app-desktop-event-bindings';
import { createDesktopStore, DesktopStoreProvider } from '../shell/app-desktop-store';
import { createAppQueryClient } from '../shell/app-query-client';
import { AppSessionStoreProvider, createAppSessionStore } from '../shell/app-session';

export type ReadingLibraryTestStores = ReturnType<typeof createReadingLibraryTestStores>;

export function createReadingLibraryTestStores(
  articles: ArticleSummaryRecord[] = [],
  settings: ResolvedAppSettings = emptyDesktopStore.settings,
) {
  const desktopStore = createDesktopStore();
  const queryClient = createAppQueryClient();
  // A finite gcTime leaves a timer pending, so runOnlyPendingTimers would run every frame before it.
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity },
  });
  const sessionStore = createAppSessionStore(desktopStore);
  bindLibraryQueryEvents({ desktopStore, queryClient, sessionStore });
  desktopStore.getState().applyStore({ ...emptyDesktopStore, articles, settings });
  return {
    desktopStore,
    queryClient,
    sessionStore,
    setArticles: (nextArticles: ArticleSummaryRecord[]) => {
      const store = desktopStore.getState().getStore() || emptyDesktopStore;
      desktopStore.getState().applyStore({ ...store, articles: nextArticles });
    },
  };
}

export function ReadingLibraryTestProviders({
  children,
  stores,
}: {
  children: ReactNode;
  stores: ReadingLibraryTestStores;
}) {
  return (
    <QueryClientProvider client={stores.queryClient}>
      <DesktopStoreProvider store={stores.desktopStore}>
        <AppSessionStoreProvider store={stores.sessionStore}>{children}</AppSessionStoreProvider>
      </DesktopStoreProvider>
    </QueryClientProvider>
  );
}
