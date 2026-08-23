import { useCallback, useEffect, useState } from 'react';
import type { HighlightBox } from '@yomitomo/core';
import type { SourceReaderAppSurface } from './use-source-reader-app';
import { useReaderSearchNavigation } from './use-reader-search-navigation';
import type { useSourceReaderApp } from './use-source-reader-app';

type SourceReaderApp = ReturnType<typeof useSourceReaderApp>;

type UseSourceReaderAppViewInput = Omit<SourceReaderAppSurface, 'annotations'> & {
  annotations: SourceReaderAppSurface['annotations'];
  app: SourceReaderApp;
};

export function useSourceReaderAppView({
  adapter,
  annotations,
  app,
  article,
  toolbar,
  userProfile,
  ...surface
}: UseSourceReaderAppViewInput) {
  const [searchBoxes, setSearchBoxes] = useState<HighlightBox[]>([]);
  const clearSearchBoxes = useCallback(() => {
    setSearchBoxes((current) => (current.length === 0 ? current : []));
  }, []);
  const searchNavigation = useReaderSearchNavigation(adapter.search.text, {
    externalPreparing: adapter.search.externalPreparing,
    onClose: clearSearchBoxes,
  });

  useEffect(() => {
    searchNavigation.resetSearch();
  }, [article.id, searchNavigation.resetSearch]);

  useEffect(() => {
    if (searchNavigation.preparing || !searchNavigation.open || !searchNavigation.activeMatch) {
      clearSearchBoxes();
    }
  }, [
    clearSearchBoxes,
    searchNavigation.activeMatch,
    searchNavigation.open,
    searchNavigation.preparing,
  ]);

  useEffect(() => {
    if (searchNavigation.preparing || !searchNavigation.open || !searchNavigation.activeMatch) {
      return;
    }

    let cancelled = false;
    void Promise.resolve(adapter.search.revealSearchMatch(searchNavigation.activeMatch)).then(
      (nextBoxes) => {
        if (!cancelled) {
          setSearchBoxes(
            nextBoxes.map((box) => ({
              ...box,
              annotationId: '__search__',
              color: 'var(--reader-search-highlight-active)',
              contributorId: '__search__',
            })),
          );
        }
      },
      () => {
        if (!cancelled) clearSearchBoxes();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [
    adapter.search.revealSearchMatch,
    clearSearchBoxes,
    searchNavigation.activeMatch,
    searchNavigation.open,
    searchNavigation.preparing,
  ]);

  return {
    searchOpen: searchNavigation.open,
    viewProps: app.viewProps(
      {
        ...surface,
        adapter,
        annotations: { ...annotations, searchBoxes },
        article,
        toolbar: { ...toolbar, search: searchNavigation.search },
        userProfile,
      },
      adapter.onAnnotationLayoutChange,
    ),
  };
}
