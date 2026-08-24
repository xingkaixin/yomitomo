import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import type { WeReadBook, WeReadBookDetail, WeReadSettings } from '@yomitomo/shared';
import { errorMessageOrFallback } from '@yomitomo/shared';
import { getDesktopApi, getOptionalDesktopApi } from '../shell/app-desktop-api';
import { appToast } from '../shell/app-toast';

type UseWeReadLibrarySessionInput = {
  onResetLibrary: () => void;
  onShowBook: (detail: WeReadBookDetail) => void;
};

export function useWeReadLibrarySession({
  onResetLibrary,
  onShowBook,
}: UseWeReadLibrarySessionInput) {
  const { t } = useTranslation();
  const [books, setBooks] = useState<WeReadBook[]>([]);
  const [settings, setSettings] = useState<WeReadSettings>({
    configured: false,
    openMethod: 'deeplink',
  });
  const [librarySyncing, setLibrarySyncing] = useState(false);
  const [bookSyncing, setBookSyncing] = useState(false);
  const [openMessage, setOpenMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    const getState = getOptionalDesktopApi()?.weRead?.getState;
    if (!getState) return;
    void getState()
      .then((state) => {
        if (cancelled) return;
        setSettings(state.settings);
        setBooks(state.books);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const subscribe = getOptionalDesktopApi()?.weRead?.onStateUpdated;
    if (!subscribe) return;
    return subscribe((state) => {
      setSettings(state.settings);
      setBooks(state.books);
    });
  }, []);

  const syncLibrary = useCallback(
    async (options: { manual?: boolean } = {}) => {
      setLibrarySyncing(true);
      try {
        const result = await getDesktopApi().weRead.sync();
        setSettings(result.settings);
        setBooks(result.books);
        if (options.manual) {
          appToast.success(t('library.weReadSyncSuccess'), {
            description: t('library.weReadSyncSuccessDescription', weReadSyncSummary(result.books)),
          });
        }
      } catch (error) {
        if (options.manual) {
          appToast.error(t('library.weReadSyncFailed'), {
            description: errorMessageOrFallback(error, t('library.weReadSyncFailed')),
          });
        }
      } finally {
        setLibrarySyncing(false);
      }
    },
    [t],
  );

  const syncBook = useCallback(
    async (bookId: string) => {
      setBookSyncing(true);
      try {
        const detail = await getDesktopApi().weRead.syncBook(bookId);
        if (!detail) {
          setBooks((current) => current.filter((book) => book.bookId !== bookId));
          onResetLibrary();
          return null;
        }
        onShowBook(detail);
        setBooks((current) =>
          current.map((book) => (book.bookId === detail.book.bookId ? detail.book : book)),
        );
        return detail;
      } finally {
        setBookSyncing(false);
      }
    },
    [onResetLibrary, onShowBook],
  );

  const openBook = useCallback(
    async (book: WeReadBook) => {
      onResetLibrary();
      const cached = await getDesktopApi().weRead.getBook(book.bookId);
      if (
        cached &&
        (cached.chapters.length > 0 || cached.highlights.length > 0 || cached.thoughts.length > 0)
      ) {
        onShowBook(cached);
        return;
      }
      await syncBook(book.bookId);
    },
    [onResetLibrary, onShowBook, syncBook],
  );

  const openExternal = useCallback(
    async (
      book: WeReadBook,
      target: { chapterUid?: number; range?: string; userVid?: number } = {},
    ) => {
      setOpenMessage('');
      try {
        await getDesktopApi().weRead.open({ bookId: book.bookId, ...target });
      } catch (error) {
        setOpenMessage(weReadOpenErrorMessage(error));
      }
    },
    [],
  );

  return {
    books,
    settings,
    librarySyncing,
    bookSyncing,
    openMessage,
    openBook,
    openExternal,
    syncBook,
    syncLibrary,
  };
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
