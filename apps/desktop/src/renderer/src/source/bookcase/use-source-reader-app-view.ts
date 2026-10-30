import { useMemo, useSyncExternalStore } from 'react';
import type { HighlightBox } from '@yomitomo/core';
import type { SourceReaderAdapter, SourceReaderAppSurface } from './use-source-reader-app';
import { useReaderSearchNavigation } from './use-reader-search-navigation';
import type { useSourceReaderApp } from './use-source-reader-app';

type SourceReaderApp = ReturnType<typeof useSourceReaderApp>;

type UseSourceReaderAppViewInput = Omit<SourceReaderAppSurface, 'annotations'> & {
  annotations: SourceReaderAppSurface['annotations'];
  app: SourceReaderApp;
};

type SearchReveal = () => ReturnType<SourceReaderAdapter['search']['revealSearchMatch']>;

export function useSourceReaderAppView({
  adapter,
  annotations,
  app,
  article,
  toolbar,
  userProfile,
  ...surface
}: UseSourceReaderAppViewInput) {
  const searchNavigation = useReaderSearchNavigation(adapter.search.text, {
    externalPreparing: adapter.search.externalPreparing,
    scopeKey: article.id,
  });
  const { activeMatch } = searchNavigation;
  const revealActive = Boolean(searchNavigation.open && !searchNavigation.preparing && activeMatch);
  const { revealSearchMatch } = adapter.search;
  const searchReveals = useMemo(createSearchRevealStore, []);
  // Each reveal request is its own subscription, so a newer match unsubscribes and cancels the
  // previous one.
  const subscribeSearchReveal = useMemo(
    () =>
      searchReveals.reveal(
        revealActive && activeMatch ? () => revealSearchMatch(activeMatch) : null,
      ),
    [activeMatch, revealActive, revealSearchMatch, searchReveals],
  );
  const revealedBoxes = useSyncExternalStore(subscribeSearchReveal, searchReveals.getBoxes);
  const searchBoxes = revealActive ? revealedBoxes : noSearchBoxes;

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

const noSearchBoxes: HighlightBox[] = [];

function createSearchRevealStore() {
  let boxes = noSearchBoxes;
  return {
    getBoxes: () => boxes,
    reveal: (request: SearchReveal | null) => (listener: () => void) => {
      if (!request) {
        boxes = noSearchBoxes;
        return () => undefined;
      }
      let cancelled = false;
      const show = (nextBoxes: HighlightBox[]) => {
        if (cancelled) return;
        boxes = nextBoxes;
        listener();
      };
      void Promise.resolve(request()).then(
        (nextBoxes) =>
          show(
            nextBoxes.map((box) => ({
              ...box,
              annotationId: '__search__',
              color: 'var(--reader-search-highlight-active)',
              contributorId: '__search__',
            })),
          ),
        () => show(noSearchBoxes),
      );
      return () => {
        cancelled = true;
      };
    },
  };
}
