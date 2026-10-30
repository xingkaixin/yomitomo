import { useCallback, useReducer } from 'react';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import i18next from 'i18next';
import type { WeReadBook, WeReadBookDetail, WeReadSettings } from '@yomitomo/shared';
import { ARTICLE_SOURCE_TYPES, errorMessageOrFallback } from '@yomitomo/shared';
import type { LibraryCatalogItemType, WeReadState } from '../../../ipc-contract';
import { getDesktopApi, getOptionalDesktopApi } from '../shell/app-desktop-api';
import { appToast } from '../shell/app-toast';
import { useDesktopEvent } from '../shell/use-desktop-event';
import { libraryCatalogQueryKey } from './use-library-catalog';

type UseWeReadLibrarySessionInput = {
  onOpenBook: (
    bookId: string,
    read: () => Promise<WeReadBookDetail | null>,
  ) => Promise<WeReadBookDetail | null>;
};

type WeReadActivity = { pendingBookSyncs: number; openMessage: string };

type WeReadActivityEvent =
  | { type: 'bookSyncStarted' }
  | { type: 'bookSyncFinished' }
  | { type: 'externalOpenStarted' }
  | { type: 'externalOpenFailed'; message: string };

const DEFAULT_WEREAD_SETTINGS: WeReadSettings = { configured: false, openMethod: 'deeplink' };

const SOURCE_TYPES_WITH_WEREAD: readonly LibraryCatalogItemType[] = [
  ...ARTICLE_SOURCE_TYPES,
  'weread',
];

export const weReadLibraryStateQuery = queryOptions({
  queryKey: ['weread', 'library-state'],
  queryFn: () => getDesktopApi().weRead.getState(),
});

export function useWeReadLibraryState() {
  return useQuery({
    ...weReadLibraryStateQuery,
    enabled: Boolean(getOptionalDesktopApi()?.weRead?.getState),
  }).data;
}

export function libraryCatalogTypes(
  state: WeReadState | undefined,
): readonly LibraryCatalogItemType[] | null {
  const available = weReadAvailable(state);
  if (available === null) return null;
  return available ? SOURCE_TYPES_WITH_WEREAD : ARTICLE_SOURCE_TYPES;
}

export function useWeReadLibrarySession({ onOpenBook }: UseWeReadLibrarySessionInput) {
  const queryClient = useQueryClient();
  const weReadApi = getOptionalDesktopApi()?.weRead;
  const state = useWeReadLibraryState();
  const [{ openMessage, pendingBookSyncs }, dispatch] = useReducer(weReadActivity, {
    pendingBookSyncs: 0,
    openMessage: '',
  });
  const settings = state?.settings ?? null;

  const receiveState = useCallback(
    async (nextState: WeReadState) => {
      await queryClient.cancelQueries({ queryKey: weReadLibraryStateQuery.queryKey });
      queryClient.setQueryData<WeReadState>(weReadLibraryStateQuery.queryKey, {
        settings: nextState.settings,
        books: nextState.books,
      });
      void queryClient.invalidateQueries({ queryKey: libraryCatalogQueryKey });
    },
    [queryClient],
  );

  useDesktopEvent(weReadApi?.onStateUpdated, (nextState) => void receiveState(nextState));

  const readSyncedBook = useCallback(
    async (bookId: string) => {
      dispatch({ type: 'bookSyncStarted' });
      try {
        const detail = await getDesktopApi().weRead.syncBook(bookId);
        void queryClient.invalidateQueries({ queryKey: libraryCatalogQueryKey });
        queryClient.setQueryData<WeReadState>(
          weReadLibraryStateQuery.queryKey,
          (current) =>
            current && {
              ...current,
              books: detail
                ? current.books.map((book) =>
                    book.bookId === detail.book.bookId ? detail.book : book,
                  )
                : current.books.filter((book) => book.bookId !== bookId),
            },
        );
        return detail;
      } finally {
        dispatch({ type: 'bookSyncFinished' });
      }
    },
    [queryClient],
  );

  const syncBook = useCallback(
    (bookId: string) => onOpenBook(bookId, () => readSyncedBook(bookId)),
    [onOpenBook, readSyncedBook],
  );

  const openBook = useCallback(
    async (book: WeReadBook) => {
      await onOpenBook(book.bookId, async () => {
        const cached = await getDesktopApi().weRead.getBook(book.bookId);
        if (
          cached &&
          (cached.chapters.length > 0 || cached.highlights.length > 0 || cached.thoughts.length > 0)
        ) {
          return cached;
        }
        return readSyncedBook(book.bookId);
      });
    },
    [onOpenBook, readSyncedBook],
  );

  const openExternal = useCallback(
    async (
      book: WeReadBook,
      target: { chapterUid?: number; range?: string; userVid?: number } = {},
    ) => {
      dispatch({ type: 'externalOpenStarted' });
      try {
        await getDesktopApi().weRead.open({ bookId: book.bookId, ...target });
      } catch (error) {
        dispatch({ type: 'externalOpenFailed', message: weReadOpenErrorMessage(error) });
      }
    },
    [],
  );

  return {
    settings: settings ?? DEFAULT_WEREAD_SETTINGS,
    available: weReadAvailable(state),
    bookSyncing: pendingBookSyncs > 0,
    openMessage,
    openBook,
    openExternal,
    receiveState,
    syncBook,
  };
}

export async function syncWeReadLibraryState(): Promise<WeReadState | null> {
  try {
    const result = await getDesktopApi().weRead.sync();
    appToast.success(i18next.t('library.weReadSyncSuccess'), {
      description: i18next.t(
        'library.weReadSyncSuccessDescription',
        weReadSyncSummary(result.books),
      ),
    });
    return { settings: result.settings, books: result.books };
  } catch (error) {
    appToast.error(i18next.t('library.weReadSyncFailed'), {
      description: errorMessageOrFallback(error, i18next.t('library.weReadSyncFailed')),
    });
    return null;
  }
}

function weReadAvailable(state: WeReadState | undefined) {
  if (!state) return null;
  return state.books.length > 0 || state.settings.configured;
}

function weReadActivity(activity: WeReadActivity, event: WeReadActivityEvent): WeReadActivity {
  switch (event.type) {
    case 'bookSyncStarted':
      return { ...activity, pendingBookSyncs: activity.pendingBookSyncs + 1 };
    case 'bookSyncFinished':
      return { ...activity, pendingBookSyncs: activity.pendingBookSyncs - 1 };
    case 'externalOpenStarted':
      return activity.openMessage ? { ...activity, openMessage: '' } : activity;
    case 'externalOpenFailed':
      return { ...activity, openMessage: event.message };
  }
}

function weReadOpenErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/No application found|weread:/.test(message)) {
    return i18next.t('wereadBook.nativeAppMissing');
  }
  return message || i18next.t('wereadBook.openFailed');
}

function weReadSyncSummary(books: WeReadBook[]) {
  return books.reduce(
    (summary, book) => ({
      books: summary.books + 1,
      bookmarks: summary.bookmarks + book.bookmarkCount,
      reviews: summary.reviews + book.reviewCount,
    }),
    { books: 0, bookmarks: 0, reviews: 0 },
  );
}
