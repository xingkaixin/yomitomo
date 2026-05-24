import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Agent,
  Annotation,
  ArticleReadingProgress,
  ArticleRecord,
  ArticleSummaryRecord,
  MessageSendShortcut,
  SelectionActionShortcuts,
  UserProfile,
  WeReadBook,
  WeReadBookDetail,
  WeReadSettings,
} from '@yomitomo/shared';
import { sortAnnotations, sortArticles } from '@yomitomo/core';
import { SourceBookcase } from './app-source-bookcase';
import type {
  ArticleUpdater,
  EbookImportProgressCallback,
  PdfImportProgressCallback,
} from './app-reading-types';
import { LibraryHome } from './app-reading-library-home';
import { WeReadBookcase } from './app-weread-bookcase';
import type { ArticleImportResult } from './app-reading-library-imports';
import {
  groupLibraryArticles,
  librarySourceForArticle,
  type LibrarySort,
  type LibrarySource,
} from './app-reading-library-utils';

export { groupLibraryArticles };
export type { LibrarySort };

export function ReadingLibrary({
  agents,
  articles,
  messageSendShortcut,
  selectionActionShortcuts,
  openArticleId,
  userProfile,
  onArticleOpened,
  onDeleteArticle,
  onImportEbookFile,
  onImportPdfFile,
  onImportArticleUrl,
  onReadingModeChange,
  onReadArticle,
  onSaveArticle,
  onSaveArticleReadingProgress,
  onUpdateArticle,
}: {
  agents: Agent[];
  articles: ArticleSummaryRecord[];
  messageSendShortcut?: MessageSendShortcut;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  openArticleId?: string | null;
  userProfile: UserProfile;
  onArticleOpened?: (articleId: string) => void;
  onDeleteArticle: (articleId: string) => Promise<void> | void;
  onImportEbookFile: (
    file: File,
    onProgress?: EbookImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onImportPdfFile: (
    file: File,
    onProgress?: PdfImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onImportArticleUrl: (url: string) => Promise<ArticleImportResult>;
  onReadingModeChange?: (open: boolean) => void;
  onReadArticle: (articleId: string) => Promise<ArticleRecord | null>;
  onSaveArticle: (article: ArticleRecord) => Promise<void> | void;
  onSaveArticleReadingProgress: (
    articleId: string,
    progress: ArticleReadingProgress,
  ) => Promise<void> | void;
  onUpdateArticle: (articleId: string, update: ArticleUpdater) => Promise<void> | void;
}) {
  const [activeShelf, setActiveShelf] = useState<'library' | 'source'>('library');
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<ArticleRecord | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [sourceFocusAnnotationId, setSourceFocusAnnotationId] = useState<string | null>(null);
  const [librarySource, setLibrarySource] = useState<LibrarySource>('web');
  const [wereadBooks, setWeReadBooks] = useState<WeReadBook[]>([]);
  const [wereadSettings, setWeReadSettings] = useState<WeReadSettings>({
    configured: false,
    openMethod: 'deeplink',
  });
  const [selectedWeReadBook, setSelectedWeReadBook] = useState<WeReadBookDetail | null>(null);
  const [wereadSyncing, setWeReadSyncing] = useState(false);
  const [wereadBookSyncing, setWeReadBookSyncing] = useState(false);
  const [wereadOpenMessage, setWeReadOpenMessage] = useState('');
  const articleLoadRef = useRef(0);
  const didAutoSyncWeReadRef = useRef(false);
  const sortedArticles = useMemo<ArticleSummaryRecord[]>(() => sortArticles(articles), [articles]);
  const annotations = useMemo<Annotation[]>(
    () => (selectedArticle ? sortAnnotations(selectedArticle.annotations) : []),
    [selectedArticle],
  );
  const selectedAnnotation =
    annotations.find((annotation) => annotation.id === selectedAnnotationId) || null;
  useEffect(() => {
    if (!selectedArticle) {
      setSelectedAnnotationId(null);
      return;
    }
    setSelectedAnnotationId(null);
  }, [selectedArticle?.id]);

  useEffect(() => {
    if (selectedArticleId && !sortedArticles.some((article) => article.id === selectedArticleId)) {
      setSelectedArticleId(null);
      setSelectedArticle(null);
    }
  }, [selectedArticleId, sortedArticles]);

  useEffect(() => {
    if (!openArticleId) return;
    const article = sortedArticles.find((item) => item.id === openArticleId);
    if (!article) return;
    void openArticle(article);
    onArticleOpened?.(article.id);
  }, [openArticleId, onArticleOpened, sortedArticles]);

  useEffect(() => {
    if (!selectedArticle || selectedArticle.sourceType !== 'pdf') return;
    let cancelled = false;
    void onReadArticle(selectedArticle.id).then((fullArticle) => {
      if (!cancelled && fullArticle) setSelectedArticle(fullArticle);
    });
    return () => {
      cancelled = true;
    };
  }, [onReadArticle, selectedArticle?.id, selectedArticle?.sourceType]);

  useEffect(() => {
    onReadingModeChange?.(
      Boolean((selectedArticle || selectedWeReadBook) && activeShelf === 'source'),
    );
    return () => onReadingModeChange?.(false);
  }, [activeShelf, onReadingModeChange, selectedArticle, selectedWeReadBook]);

  useEffect(() => {
    let cancelled = false;
    void window.yomitomoDesktop
      ?.getWeReadState?.()
      .then((state) => {
        if (cancelled) return;
        setWeReadSettings(state.settings);
        setWeReadBooks(state.books);
        if (state.settings.configured && !didAutoSyncWeReadRef.current) {
          didAutoSyncWeReadRef.current = true;
          void syncWeReadLibrary();
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function deleteLibraryArticle(articleId: string) {
    await onDeleteArticle(articleId);
    if (selectedArticleId === articleId) {
      setSelectedArticle(null);
      openLibraryShelf();
    }
  }

  async function openArticle(article: ArticleSummaryRecord) {
    const loadId = articleLoadRef.current + 1;
    articleLoadRef.current = loadId;
    setLibrarySource(librarySourceForArticle(article));
    setSelectedArticleId(article.id);
    setSelectedAnnotationId(null);
    setSourceFocusAnnotationId(null);
    setSelectedWeReadBook(null);
    const fullArticle = articleHasReadableBody(article) ? article : await onReadArticle(article.id);
    if (articleLoadRef.current !== loadId || !fullArticle) return;
    setSelectedArticle(fullArticle);
    setActiveShelf('source');
  }

  async function openWeReadBook(book: WeReadBook) {
    setLibrarySource('weread');
    setSelectedArticle(null);
    setSelectedArticleId(null);
    setSelectedAnnotationId(null);
    setSourceFocusAnnotationId(null);
    const cached = await window.yomitomoDesktop?.getWeReadBook?.(book.bookId);
    const detail =
      cached &&
      (cached.chapters.length > 0 || cached.highlights.length > 0 || cached.thoughts.length > 0)
        ? cached
        : await syncWeReadBook(book.bookId);
    if (!detail) return;
    setSelectedWeReadBook(detail);
    setActiveShelf('source');
  }

  function openLibraryShelf() {
    setSelectedAnnotationId(null);
    setSourceFocusAnnotationId(null);
    setSelectedWeReadBook(null);
    setActiveShelf('library');
  }

  async function syncWeReadLibrary() {
    if (!window.yomitomoDesktop) return;
    setWeReadSyncing(true);
    try {
      const result = await window.yomitomoDesktop.syncWeRead();
      setWeReadSettings(result.settings);
      setWeReadBooks(result.books);
    } finally {
      setWeReadSyncing(false);
    }
  }

  async function openWeReadExternal(
    book: WeReadBook,
    target: { chapterUid?: number; range?: string; userVid?: number } = {},
  ) {
    setWeReadOpenMessage('');
    try {
      await window.yomitomoDesktop?.openWeRead?.({ bookId: book.bookId, ...target });
    } catch (error) {
      setWeReadOpenMessage(weReadOpenErrorMessage(error));
    }
  }

  async function syncWeReadBook(bookId: string) {
    if (!window.yomitomoDesktop) return null;
    setWeReadBookSyncing(true);
    try {
      const detail = await window.yomitomoDesktop.syncWeReadBook(bookId);
      if (!detail) {
        setSelectedWeReadBook(null);
        setWeReadBooks((books) => books.filter((book) => book.bookId !== bookId));
        setActiveShelf('library');
        return null;
      }
      setSelectedWeReadBook(detail);
      setWeReadBooks((books) =>
        books.map((book) => (book.bookId === detail.book.bookId ? detail.book : book)),
      );
      return detail;
    } finally {
      setWeReadBookSyncing(false);
    }
  }

  async function saveSelectedArticle(article: ArticleRecord) {
    setSelectedArticle(article);
    await onSaveArticle(article);
  }

  async function saveSelectedArticleReadingProgress(
    articleId: string,
    progress: ArticleReadingProgress,
  ) {
    setSelectedArticle((current) =>
      current?.id === articleId
        ? { ...current, readingProgress: progress, updatedAt: progress.updatedAt }
        : current,
    );
    await onSaveArticleReadingProgress(articleId, progress);
  }

  async function updateSelectedArticle(articleId: string, update: ArticleUpdater) {
    await onUpdateArticle(articleId, (article) => {
      const nextArticle = update(selectedArticle?.id === articleId ? selectedArticle : article);
      if (nextArticle) setSelectedArticle(nextArticle);
      return nextArticle;
    });
  }

  const libraryHomeProps = {
    activeSource: librarySource,
    articles,
    onActiveSourceChange: setLibrarySource,
    sortedArticles,
    onDeleteArticle: deleteLibraryArticle,
    onImportEbookFile,
    onImportPdfFile,
    onImportArticleUrl,
    onOpenArticle: (article: ArticleSummaryRecord) => void openArticle(article),
    onOpenWeReadBook: (book: WeReadBook) => void openWeReadBook(book),
    onOpenWeReadExternal: (book: WeReadBook) => void openWeReadExternal(book),
    onSyncWeRead: () => void syncWeReadLibrary(),
    wereadBooks,
    wereadOpenMessage,
    wereadSettings,
    wereadSyncing,
  };

  if (!selectedArticle && !selectedWeReadBook) {
    return <LibraryHome {...libraryHomeProps} />;
  }

  return (
    <div className={`library-bookcase-screen is-${activeShelf}-expanded`}>
      {activeShelf === 'library' ? (
        <div className="library-shelf is-expanded is-library-bookcase is-drawn-from-bookmark">
          <div className="library-shelf-content">
            <LibraryHome {...libraryHomeProps} />
          </div>
        </div>
      ) : (
        <div className="library-shelf is-expanded">
          <div className="library-shelf-content">
            {selectedWeReadBook ? (
              <WeReadBookcase
                detail={selectedWeReadBook}
                syncing={wereadBookSyncing}
                userProfile={userProfile}
                onClose={openLibraryShelf}
                onOpenExternal={(target) =>
                  void openWeReadExternal(selectedWeReadBook.book, target)
                }
                onSync={() => void syncWeReadBook(selectedWeReadBook.book.bookId)}
              />
            ) : selectedArticle ? (
              <SourceBookcase
                agents={agents}
                annotations={annotations}
                article={selectedArticle}
                focusAnnotationId={sourceFocusAnnotationId}
                messageSendShortcut={messageSendShortcut}
                selectionActionShortcuts={selectionActionShortcuts}
                selectedAnnotationId={selectedAnnotation?.id || null}
                userProfile={userProfile}
                onFocusedAnnotation={() => setSourceFocusAnnotationId(null)}
                onClose={openLibraryShelf}
                onOpenAnnotation={setSelectedAnnotationId}
                onSaveArticle={saveSelectedArticle}
                onSaveArticleReadingProgress={saveSelectedArticleReadingProgress}
                onUpdateArticle={updateSelectedArticle}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function articleHasReadableBody(
  article: ArticleRecord | ArticleSummaryRecord,
): article is ArticleRecord {
  if ((article.annotationCount ?? 0) > article.annotations.length) return false;
  if (article.sourceType === 'ebook')
    return Boolean(article.ebook && 'chapters' in article.ebook && article.ebook.chapters.length);
  if (article.sourceType === 'pdf') return false;
  return Boolean('contentHtml' in article && article.contentHtml);
}

function weReadOpenErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/No application found|weread:/.test(message)) {
    return '没有找到微信读书 App。请在设置 / 微信读书中改为“使用网页版”，或安装微信读书 App 后再试。';
  }
  return message || '打开微信读书失败，请稍后重试。';
}
