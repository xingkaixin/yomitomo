import React, { useEffect, useMemo, useRef, useState } from 'react';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import { ChevronDown, MessageCircle } from 'lucide-react';
import type {
  Agent,
  Annotation,
  ArticleReadingProgress,
  ArticleRecord,
  ArticleSummaryRecord,
  AppSettings,
  Collection,
  CollectionMember,
  Comment,
  ContentRef,
  LibraryPin,
  MessageSendShortcut,
  PublicAgent,
  ReaderChatState,
  SelectionActionShortcuts,
  UserProfile,
  WeReadBook,
  WeReadBookDetail,
  WeReadSettings,
} from '@yomitomo/shared';
import { normalizeUiLanguage } from '@yomitomo/shared';
import { sortAnnotations, sortArticles } from '@yomitomo/core';
import type { ReaderTheme } from '@yomitomo/reader-ui/reader-theme';
import { SourceBookcase } from '../source/bookcase/app-source-bookcase';
import {
  publicAnnotationAgents,
  recordRendererPerformanceTiming,
} from '../source/bookcase/app-source-bookcase-shared';
import type {
  ArticleUpdater,
  EbookImportProgressCallback,
  PdfImportProgressCallback,
} from '../shell/app-reading-types';
import { LibraryHome } from './app-reading-library-home';
import { WeReadBookcase } from '../shell/app-weread-bookcase';
import { appToast } from '../shell/app-toast';
import type { ArticleImportResult } from './app-reading-library-imports';
import {
  articleAnnotationCount,
  articleDistillationCount,
  articleThoughtCount,
  groupLibraryArticles,
  type LibrarySort,
} from './app-reading-library-utils';
import { playAppSoundEffect } from '../sound/app-sound-effects';
import type {
  AnnotationDiscussionWindowState,
  AnnotationDistillationCommittedEvent,
  WindowAnimationSourceRect,
  SetLibraryPinInput,
} from '../../../ipc-contract';

export { groupLibraryArticles };
export type { LibrarySort };

export function ReadingLibrary({
  agents,
  articles,
  collectionMembers = [],
  collections = [],
  pins = [],
  messageSendShortcut,
  readerTheme,
  settings,
  selectionActionShortcuts,
  openArticleId,
  userProfile,
  onArticleOpened,
  onCloseArticleDiscussions,
  onDeleteArticle,
  onDeleteArticleAnnotation,
  onDeleteArticleComment,
  onOpenArticleDiscussion,
  onImportEbookFile,
  onImportPdfFile,
  onImportArticleUrl,
  onCancelArticleImport,
  onReadingModeChange,
  onReadArticle,
  onSaveArticle,
  onSaveArticleAnnotation,
  onSaveArticleComment,
  onSaveArticleReadingProgress,
  onSaveArticleReaderChatState,
  onSaveSettings,
  onOpenDataSources,
  onUpdateArticle,
}: {
  agents: Agent[];
  articles: ArticleSummaryRecord[];
  collectionMembers?: CollectionMember[];
  collections?: Collection[];
  pins?: LibraryPin[];
  messageSendShortcut?: MessageSendShortcut;
  readerTheme: ReaderTheme;
  settings?: AppSettings;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  openArticleId?: string | null;
  userProfile: UserProfile;
  onArticleOpened?: (articleId: string) => void;
  onCloseArticleDiscussions?: (articleId: string) => Promise<void> | void;
  onDeleteArticle: (articleId: string) => Promise<void> | void;
  onDeleteArticleAnnotation?: (articleId: string, annotationId: string) => Promise<void> | void;
  onDeleteArticleComment?: (
    articleId: string,
    annotationId: string,
    commentId: string,
  ) => Promise<void> | void;
  onOpenArticleDiscussion?: (
    articleId: string,
    annotationId: string,
    sourceRect?: WindowAnimationSourceRect,
  ) => Promise<void> | void;
  onImportEbookFile: (
    file: File,
    onProgress?: EbookImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onImportPdfFile: (
    file: File,
    onProgress?: PdfImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onImportArticleUrl: (url: string, requestId?: string) => Promise<ArticleImportResult>;
  onCancelArticleImport?: (requestId: string) => Promise<boolean> | boolean;
  onReadingModeChange?: (open: boolean) => void;
  onReadArticle: (articleId: string) => Promise<ArticleRecord | null>;
  onSaveArticle: (article: ArticleRecord) => Promise<void> | void;
  onSaveArticleAnnotation?: (
    articleId: string,
    annotation: Annotation,
    updatedAt?: string,
  ) => Promise<void> | void;
  onSaveArticleComment?: (
    articleId: string,
    annotationId: string,
    comment: Comment,
    updatedAt?: string,
  ) => Promise<void> | void;
  onSaveArticleReadingProgress: (
    articleId: string,
    progress: ArticleReadingProgress,
  ) => Promise<void> | void;
  onSaveArticleReaderChatState?: (articleId: string, readerChatState?: ReaderChatState) => unknown;
  onSaveSettings?: (settings: AppSettings) => Promise<void> | void;
  onOpenDataSources?: () => void;
  onUpdateArticle: (articleId: string, update: ArticleUpdater) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [activeShelf, setActiveShelf] = useState<'library' | 'source'>('library');
  const [routeTransition, setRouteTransition] = useState<'enter-library' | 'enter-source' | 'none'>(
    'none',
  );
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<ArticleRecord | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [sourceFocusAnnotationId, setSourceFocusAnnotationId] = useState<string | null>(null);
  const [wereadBooks, setWeReadBooks] = useState<WeReadBook[]>([]);
  const [wereadSettings, setWeReadSettings] = useState<WeReadSettings>({
    configured: false,
    openMethod: 'deeplink',
  });
  const [selectedWeReadBook, setSelectedWeReadBook] = useState<WeReadBookDetail | null>(null);
  const [wereadSyncing, setWeReadSyncing] = useState(false);
  const [wereadBookSyncing, setWeReadBookSyncing] = useState(false);
  const [wereadOpenMessage, setWeReadOpenMessage] = useState('');
  const [minimizedDiscussionWindows, setMinimizedDiscussionWindows] = useState<
    AnnotationDiscussionWindowState[]
  >([]);
  const [distillationAnimation, setDistillationAnimation] = useState<{
    annotationId: string;
    transition: AnnotationDistillationCommittedEvent['transition'];
    phase: 'morph-out' | 'morph-in' | 'update';
    overlayDistillation?: {
      content: string;
      publishedAt?: string;
      updatedAt?: string;
    };
    token: number;
  } | null>(null);
  const articleLoadRef = useRef(0);
  const selectedArticleIdRef = useRef<string | null>(null);
  const pendingDistillationAnimationRef = useRef<AnnotationDistillationCommittedEvent | null>(null);
  const distillationAnimationTimerRef = useRef<number | null>(null);
  const sortedArticles = useMemo<ArticleSummaryRecord[]>(() => sortArticles(articles), [articles]);
  const hasLocalArticleCatalog = articles.length > 0;
  const annotations = useMemo<Annotation[]>(
    () => (selectedArticle ? sortAnnotations(selectedArticle.annotations) : []),
    [selectedArticle],
  );
  const selectedAnnotation =
    annotations.find((annotation) => annotation.id === selectedAnnotationId) || null;
  const currentMinimizedDiscussionWindows = selectedArticle
    ? minimizedDiscussionWindows.filter((item) => item.articleId === selectedArticle.id)
    : [];
  useEffect(() => {
    selectedArticleIdRef.current = selectedArticleId;
  }, [selectedArticleId]);

  useEffect(
    () => () => {
      const articleId = selectedArticleIdRef.current;
      if (articleId) void onCloseArticleDiscussions?.(articleId);
    },
    [onCloseArticleDiscussions],
  );

  useEffect(() => {
    const desktop = window.yomitomoDesktop;
    if (!desktop?.onAnnotationDiscussionWindowState) return;
    return desktop.onAnnotationDiscussionWindowState((event) => {
      setMinimizedDiscussionWindows((current) => {
        if (event.type === 'remove') {
          return current.filter(
            (item) =>
              item.articleId !== event.articleId || item.annotationId !== event.annotationId,
          );
        }
        const next = event.window;
        const rest = current.filter(
          (item) => item.articleId !== next.articleId || item.annotationId !== next.annotationId,
        );
        return next.minimized ? [...rest, next] : rest;
      });
    });
  }, []);

  useEffect(() => {
    const desktop = window.yomitomoDesktop;
    if (!desktop?.onAnnotationDistillationCommitted) return;
    return desktop.onAnnotationDistillationCommitted((event) => {
      recordRendererPerformanceTiming('reader_focus', {
        source: 'library',
        phase: 'distillation_event_received',
        articleId: event.articleId,
        annotationId: event.annotationId,
        transition: event.transition,
      });
      void focusCommittedDistillation(event);
    });
  }, [onReadArticle]);

  useEffect(
    () => () => {
      if (distillationAnimationTimerRef.current !== null) {
        window.clearTimeout(distillationAnimationTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!selectedArticle) {
      setSelectedAnnotationId(null);
      return;
    }
    if (sourceFocusAnnotationId) return;
    setSelectedAnnotationId(null);
  }, [selectedArticle?.id]);

  useEffect(() => {
    if (!hasLocalArticleCatalog) return;
    if (selectedArticleId && !sortedArticles.some((article) => article.id === selectedArticleId)) {
      void onCloseArticleDiscussions?.(selectedArticleId);
      setSelectedArticleId(null);
      setSelectedArticle(null);
    }
  }, [hasLocalArticleCatalog, onCloseArticleDiscussions, selectedArticleId, sortedArticles]);

  useEffect(() => {
    if (!openArticleId) return;
    const article = sortedArticles.find((item) => item.id === openArticleId);
    if (article) {
      void openArticle(article);
      onArticleOpened?.(article.id);
      return;
    }
    void onReadArticle(openArticleId).then((fullArticle) => {
      if (!fullArticle) return;
      void openArticle(fullArticle);
      onArticleOpened?.(fullArticle.id);
    });
  }, [onReadArticle, openArticleId, onArticleOpened, sortedArticles]);

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
    if (!selectedArticleId || !selectedArticle) return;
    const summary = sortedArticles.find((article) => article.id === selectedArticleId);
    if (!summary) return;
    if (!articleSummaryChanged(summary, selectedArticle)) return;
    let cancelled = false;
    void onReadArticle(summary.id).then((fullArticle) => {
      if (cancelled || !fullArticle || selectedArticleIdRef.current !== summary.id) return;
      setSelectedArticle(fullArticle);
    });
    return () => {
      cancelled = true;
    };
  }, [onReadArticle, selectedArticle, selectedArticleId, sortedArticles]);

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
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const desktop = window.yomitomoDesktop;
    if (!desktop?.onWeReadStateUpdated) return;
    return desktop.onWeReadStateUpdated((state) => {
      setWeReadSettings(state.settings);
      setWeReadBooks(state.books);
    });
  }, []);

  async function deleteLibraryArticle(articleId: string) {
    await onDeleteArticle(articleId);
    playAppSoundEffect('library.delete_item', settings || {});
    if (selectedArticleId === articleId) {
      setSelectedArticle(null);
      openLibraryShelf();
    }
  }

  async function openArticle(article: ArticleSummaryRecord) {
    if (selectedArticleId && selectedArticleId !== article.id) {
      void onCloseArticleDiscussions?.(selectedArticleId);
    }
    const loadId = articleLoadRef.current + 1;
    articleLoadRef.current = loadId;
    setSelectedArticleId(article.id);
    setSelectedAnnotationId(null);
    setSourceFocusAnnotationId(null);
    setSelectedWeReadBook(null);
    const fullArticle = articleHasReadableBody(article) ? article : await onReadArticle(article.id);
    if (articleLoadRef.current !== loadId || !fullArticle) return;
    setSelectedArticle(fullArticle);
    setRouteTransition('enter-source');
    setActiveShelf('source');
  }

  async function focusCommittedDistillation(event: AnnotationDistillationCommittedEvent) {
    const startedAt = performance.now();
    const fullArticle = await onReadArticle(event.articleId);
    if (!fullArticle) {
      recordRendererPerformanceTiming('reader_focus', {
        source: 'library',
        phase: 'distillation_article_missing',
        articleId: event.articleId,
        annotationId: event.annotationId,
        transition: event.transition,
        elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
      });
      return;
    }
    setSelectedArticleId(fullArticle.id);
    setSelectedArticle(articleWithDistillationAnimationStart(fullArticle, event));
    setSelectedWeReadBook(null);
    setRouteTransition('enter-source');
    setActiveShelf('source');
    setSelectedAnnotationId(event.annotationId);
    setSourceFocusAnnotationId(event.annotationId);
    pendingDistillationAnimationRef.current = event;
    recordRendererPerformanceTiming('reader_focus', {
      source: 'library',
      phase: 'focus_set',
      articleId: fullArticle.id,
      annotationId: event.annotationId,
      transition: event.transition,
      articleSourceType: fullArticle.sourceType || 'web',
      annotationExists: fullArticle.annotations.some(
        (annotation) => annotation.id === event.annotationId,
      ),
      elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
    });
  }

  function clearDistillationTimer() {
    if (distillationAnimationTimerRef.current !== null) {
      window.clearTimeout(distillationAnimationTimerRef.current);
      distillationAnimationTimerRef.current = null;
    }
  }

  function playDistillationMorph(event: AnnotationDistillationCommittedEvent) {
    const token = Date.now();
    const DUAL_PREPARE_MS = 16;
    const DUAL_MORPH_MS = 620;
    const UPDATE_MS = 850;

    clearDistillationTimer();
    recordRendererPerformanceTiming('reader_focus', {
      source: 'library',
      phase: 'distillation_animation_start',
      articleId: event.articleId,
      annotationId: event.annotationId,
      transition: event.transition,
      token,
    });
    playAppSoundEffect('reader.distillation_committed', settings || {});

    if (event.transition === 'update') {
      setSelectedArticle((current) =>
        current ? articleWithCommittedDistillation(current, event) : current,
      );
      setDistillationAnimation({
        annotationId: event.annotationId,
        transition: 'update',
        phase: 'update',
        token,
      });
      distillationAnimationTimerRef.current = window.setTimeout(() => {
        setDistillationAnimation((current) => (current?.token === token ? null : current));
        distillationAnimationTimerRef.current = null;
      }, UPDATE_MS);
      return;
    }

    const startDualMorph = (
      overlayDistillation = distillationOverlayForAnimation(selectedArticle, event),
    ) => {
      setDistillationAnimation({
        annotationId: event.annotationId,
        transition: event.transition,
        phase: 'morph-out',
        overlayDistillation,
        token,
      });
      distillationAnimationTimerRef.current = window.setTimeout(() => {
        setSelectedArticle((current) =>
          current ? articleWithCommittedDistillation(current, event) : current,
        );
        setDistillationAnimation({
          annotationId: event.annotationId,
          transition: event.transition,
          phase: 'morph-in',
          overlayDistillation,
          token,
        });
        distillationAnimationTimerRef.current = window.setTimeout(() => {
          setDistillationAnimation((current) => (current?.token === token ? null : current));
          distillationAnimationTimerRef.current = null;
        }, DUAL_MORPH_MS);
      }, DUAL_PREPARE_MS);
    };

    if (event.transition === 'unpublish') {
      const overlayDistillation = distillationOverlayForAnimation(selectedArticle, event);
      startDualMorph(overlayDistillation);
      return;
    }

    startDualMorph();
  }

  function handleSourceFocusedAnnotation() {
    const pendingAnimation = pendingDistillationAnimationRef.current;
    recordRendererPerformanceTiming('reader_focus', {
      source: 'library',
      phase: 'focus_consumed',
      articleId: selectedArticleId,
      annotationId: sourceFocusAnnotationId,
      pendingTransition: pendingAnimation?.transition || null,
    });
    pendingDistillationAnimationRef.current = null;
    setSourceFocusAnnotationId(null);
    if (pendingAnimation) playDistillationMorph(pendingAnimation);
  }

  async function openWeReadBook(book: WeReadBook) {
    if (selectedArticleId) void onCloseArticleDiscussions?.(selectedArticleId);
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
    setRouteTransition('enter-source');
    setActiveShelf('source');
  }

  function openLibraryShelf() {
    if (selectedArticleId) void onCloseArticleDiscussions?.(selectedArticleId);
    setSelectedAnnotationId(null);
    setSourceFocusAnnotationId(null);
    setRouteTransition('enter-library');
    setActiveShelf('library');
  }

  async function syncWeReadLibrary(options: { manual?: boolean } = {}) {
    if (!window.yomitomoDesktop) return;
    setWeReadSyncing(true);
    try {
      const result = await window.yomitomoDesktop.syncWeRead();
      setWeReadSettings(result.settings);
      setWeReadBooks(result.books);
      if (options.manual) {
        const summary = weReadLibrarySyncSummary(result.books);
        appToast.success(t('library.weReadSyncSuccess'), {
          description: t('library.weReadSyncSuccessDescription', summary),
        });
      }
    } catch (error) {
      if (options.manual) {
        appToast.error(t('library.weReadSyncFailed'), {
          description: errorMessage(error, t('library.weReadSyncFailed')),
        });
      }
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

  async function saveSelectedArticleReaderChatState(
    articleId: string,
    readerChatState?: ReaderChatState,
  ) {
    setSelectedArticle((current) =>
      current?.id === articleId
        ? {
            ...current,
            readerChatState,
            updatedAt: readerChatState?.updatedAt || current.updatedAt,
          }
        : current,
    );
    await onSaveArticleReaderChatState?.(articleId, readerChatState);
  }

  async function updateSelectedArticle(articleId: string, update: ArticleUpdater) {
    await onUpdateArticle(articleId, (article) => {
      const nextArticle = update(selectedArticle?.id === articleId ? selectedArticle : article);
      if (nextArticle) setSelectedArticle(nextArticle);
      return nextArticle;
    });
  }

  async function deleteSelectedArticleAnnotation(articleId: string, annotationId: string) {
    if (!onDeleteArticleAnnotation) return;
    await onDeleteArticleAnnotation(articleId, annotationId);
    setSelectedArticle((current) =>
      current?.id === articleId
        ? {
            ...current,
            annotations: current.annotations.filter((annotation) => annotation.id !== annotationId),
          }
        : current,
    );
  }

  async function createLibraryCollection(name: string) {
    const desktop = window.yomitomoDesktop;
    if (!desktop?.createCollection) throw new Error(t('library.collection.apiUnavailable'));
    const result = await desktop.createCollection({ name });
    appToast.success(t('library.collection.createdToast'), {
      description: result.collection.name,
    });
    return result.collection;
  }

  async function renameLibraryCollection(collectionId: string, name: string) {
    const desktop = window.yomitomoDesktop;
    if (!desktop?.renameCollection) throw new Error(t('library.collection.apiUnavailable'));
    await desktop.renameCollection({ collectionId, name });
    appToast.success(t('library.collection.renamedToast'), { description: name });
  }

  async function deleteLibraryCollection(collectionId: string) {
    const desktop = window.yomitomoDesktop;
    if (!desktop?.deleteCollection) throw new Error(t('library.collection.apiUnavailable'));
    await desktop.deleteCollection(collectionId);
    appToast.success(t('library.collection.deletedToast'));
  }

  async function addLibraryCollectionMembers(collectionId: string, members: ContentRef[]) {
    const desktop = window.yomitomoDesktop;
    if (!desktop?.addCollectionMembers) throw new Error(t('library.collection.apiUnavailable'));
    await desktop.addCollectionMembers({ collectionId, members });
    appToast.success(t('library.collection.membersAddedToast', { count: members.length }));
  }

  async function removeLibraryCollectionMember(collectionId: string, member: ContentRef) {
    const desktop = window.yomitomoDesktop;
    if (!desktop?.removeCollectionMember) throw new Error(t('library.collection.apiUnavailable'));
    await desktop.removeCollectionMember({ collectionId, member });
    appToast.success(t('library.collection.memberRemovedToast'));
  }

  const libraryHomeProps = {
    collectionMembers,
    collections,
    pins,
    sortedArticles,
    onDeleteArticle: deleteLibraryArticle,
    onImportEbookFile,
    onImportPdfFile,
    onImportArticleUrl,
    onCancelArticleImport,
    onOpenArticle: (article: ArticleSummaryRecord) => void openArticle(article),
    onOpenWeReadBook: (book: WeReadBook) => void openWeReadBook(book),
    onOpenWeReadExternal: (book: WeReadBook) => void openWeReadExternal(book),
    onCreateCollection: createLibraryCollection,
    onRenameCollection: renameLibraryCollection,
    onDeleteCollection: deleteLibraryCollection,
    onAddCollectionMembers: addLibraryCollectionMembers,
    onRemoveCollectionMember: removeLibraryCollectionMember,
    onSaveSettings: onSaveSettings || (() => undefined),
    onOpenDataSources,
    onSetLibraryPin: (input: SetLibraryPinInput) =>
      void window.yomitomoDesktop?.setLibraryPin?.(input),
    onSyncWeRead: () => void syncWeReadLibrary({ manual: true }),
    settings: settings || {},
    wereadBooks,
    wereadOpenMessage,
    wereadSettings,
    wereadSyncing,
  };

  if (!selectedArticle && !selectedWeReadBook) {
    return <LibraryHome {...libraryHomeProps} />;
  }

  return (
    <div
      className={`library-bookcase-screen is-${activeShelf}-expanded`}
      data-route-transition={routeTransition}
    >
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
                distillationAnimation={distillationAnimation}
                focusAnnotationId={sourceFocusAnnotationId}
                messageSendShortcut={messageSendShortcut}
                readerTheme={readerTheme}
                settings={settings}
                selectionActionShortcuts={selectionActionShortcuts}
                selectedAnnotationId={selectedAnnotation?.id || null}
                uiLanguage={normalizeUiLanguage(settings?.uiLanguage)}
                userProfile={userProfile}
                onFocusedAnnotation={handleSourceFocusedAnnotation}
                onClose={openLibraryShelf}
                onDeleteArticleAnnotation={
                  onDeleteArticleAnnotation ? deleteSelectedArticleAnnotation : undefined
                }
                onDeleteArticleComment={onDeleteArticleComment}
                onOpenAnnotationDiscussion={onOpenArticleDiscussion}
                onOpenAnnotation={setSelectedAnnotationId}
                onSaveArticle={saveSelectedArticle}
                onSaveArticleAnnotation={onSaveArticleAnnotation}
                onSaveArticleComment={onSaveArticleComment}
                onSaveArticleReadingProgress={saveSelectedArticleReadingProgress}
                onSaveArticleReaderChatState={saveSelectedArticleReaderChatState}
                onUpdateArticle={updateSelectedArticle}
              />
            ) : null}
          </div>
        </div>
      )}
      {selectedArticle && activeShelf === 'source' ? (
        <AnnotationDiscussionCapsules
          agents={publicAnnotationAgents(agents, normalizeUiLanguage(settings?.uiLanguage))}
          article={selectedArticle}
          windows={currentMinimizedDiscussionWindows}
          onOpen={onOpenArticleDiscussion}
        />
      ) : null}
    </div>
  );
}

type AnnotationDiscussionCapsuleAssistant = {
  key: string;
  name: string;
  avatar?: string;
};

export type AnnotationDiscussionCapsuleItem = {
  articleId: string;
  annotationId: string;
  quote: string;
  ideaCount: number;
  replyCount: number;
  assistants: AnnotationDiscussionCapsuleAssistant[];
  pending: boolean;
};

export function annotationDiscussionCapsuleItems(
  article: ArticleRecord,
  windows: AnnotationDiscussionWindowState[],
  agents: PublicAgent[] = [],
): AnnotationDiscussionCapsuleItem[] {
  return windows.map((windowState) => {
    const annotation = article.annotations.find((item) => item.id === windowState.annotationId);
    const comments = annotation?.comments || [];
    const ideaCount = comments.filter((comment) => !comment.replyTo).length;
    const replyCount = comments.length - ideaCount;
    return {
      articleId: windowState.articleId,
      annotationId: windowState.annotationId,
      quote: annotation?.anchor.exact.trim() || i18next.t('discussion.fallbackQuote'),
      ideaCount,
      replyCount,
      assistants: assistantParticipants(comments, agents),
      pending: comments.some((comment) => comment.pending),
    };
  });
}

function assistantParticipants(
  comments: Comment[],
  agents: PublicAgent[],
): AnnotationDiscussionCapsuleAssistant[] {
  const assistants = new Map<string, AnnotationDiscussionCapsuleAssistant>();
  for (const comment of comments) {
    if (comment.author !== 'ai') continue;
    const key =
      comment.agentId ||
      comment.agentUsername ||
      comment.agentNickname ||
      comment.agentAvatar ||
      comment.id;
    if (assistants.has(key)) continue;
    const agent = agents.find((item) => item.id === comment.agentId);
    const name =
      agent?.nickname ||
      comment.agentNickname?.trim() ||
      comment.agentUsername?.trim() ||
      i18next.t('common.assistant');
    const avatar = agent?.avatar || comment.agentAvatar?.trim() || undefined;
    assistants.set(key, {
      key,
      name,
      avatar,
    });
  }
  return [...assistants.values()];
}

export function AnnotationDiscussionCapsules({
  agents,
  article,
  windows,
  onOpen,
}: {
  agents?: PublicAgent[];
  article: ArticleRecord;
  windows: AnnotationDiscussionWindowState[];
  onOpen?: (
    articleId: string,
    annotationId: string,
    sourceRect?: WindowAnimationSourceRect,
  ) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [expandedByUser, setExpandedByUser] = useState(false);
  const items = useMemo(
    () => annotationDiscussionCapsuleItems(article, windows, agents),
    [agents, article, windows],
  );

  if (windows.length === 0) return null;

  const isMany = items.length >= 5;
  const expanded = !isMany || expandedByUser;

  if (!expanded) {
    return (
      <div
        className="annotation-discussion-capsules is-collapsed"
        aria-label={t('discussion.capsules.minimized')}
      >
        <button
          className="annotation-discussion-capsules-toggle"
          type="button"
          aria-expanded="false"
          onClick={() => setExpandedByUser(true)}
        >
          <MessageCircle aria-hidden="true" size={16} strokeWidth={1.8} />
          <span>{t('discussion.capsules.collapsed')}</span>
          <strong>{items.length}</strong>
        </button>
      </div>
    );
  }

  return (
    <section
      className="annotation-discussion-capsules is-expanded"
      aria-label={t('discussion.capsules.minimized')}
    >
      <div className="annotation-discussion-capsules-header">
        <span>{t('discussion.capsules.collapsed')}</span>
        <strong>{items.length}</strong>
        {isMany ? (
          <button
            className="annotation-discussion-capsules-collapse"
            type="button"
            aria-label={t('discussion.capsules.collapse')}
            aria-expanded="true"
            onClick={() => setExpandedByUser(false)}
          >
            <ChevronDown aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
        ) : null}
      </div>
      <div className="annotation-discussion-capsule-list">
        {items.map((item) => (
          <button
            key={`${item.articleId}:${item.annotationId}`}
            className={['annotation-discussion-capsule', item.pending ? 'is-replying' : '']
              .filter(Boolean)
              .join(' ')}
            type="button"
            title={t('discussion.capsules.open', { quote: item.quote })}
            onClick={() => void onOpen?.(item.articleId, item.annotationId)}
          >
            <span className="annotation-discussion-capsule-title">{item.quote}</span>
            <span className="annotation-discussion-capsule-summary">
              <span className="annotation-discussion-capsule-meta">
                {t('discussion.capsules.summary', {
                  ideas: item.ideaCount,
                  replies: item.replyCount,
                })}
              </span>
              {item.assistants.length ? (
                <span
                  className="annotation-discussion-capsule-assistants"
                  aria-label={t('discussion.capsules.assistants')}
                >
                  {item.assistants.slice(0, 4).map((assistant) =>
                    assistant.avatar ? (
                      <img
                        key={assistant.key}
                        src={assistant.avatar}
                        alt={assistant.name}
                        title={assistant.name}
                      />
                    ) : (
                      <span key={assistant.key} title={assistant.name}>
                        {assistant.name.slice(0, 1)}
                      </span>
                    ),
                  )}
                </span>
              ) : null}
              {item.pending ? (
                <span className="annotation-discussion-capsule-replying">
                  {t('discussion.replying')}
                </span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function articleWithCommittedDistillation(
  article: ArticleRecord,
  event: AnnotationDistillationCommittedEvent,
): ArticleRecord {
  let changed = false;
  const annotations = article.annotations.map((annotation) => {
    if (annotation.id !== event.annotationId) return annotation;
    const distillation = event.distillation || annotation.distillation;
    if (!distillation) return annotation;
    changed = true;
    return {
      ...annotation,
      distillation: {
        ...distillation,
        status: committedDistillationStatus(event.transition),
      },
    };
  });
  if (!changed) return article;
  return {
    ...article,
    annotations,
    updatedAt: nextDistillationAnimationArticleUpdatedAt(
      article.updatedAt,
      event.distillation?.updatedAt,
    ),
  };
}

function committedDistillationStatus(
  transition: AnnotationDistillationCommittedEvent['transition'],
): NonNullable<Annotation['distillation']>['status'] {
  return transition === 'unpublish' ? 'unpublished' : 'published';
}

function nextDistillationAnimationArticleUpdatedAt(
  currentUpdatedAt: string | number | undefined,
  distillationUpdatedAt: string | undefined,
) {
  const currentTime = timestampValue(currentUpdatedAt);
  const distillationTime = timestampValue(distillationUpdatedAt);
  return new Date(Math.max(Date.now(), currentTime + 1, distillationTime)).toISOString();
}

function timestampValue(value: string | number | undefined) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

export function articleWithDistillationAnimationStart(
  article: ArticleRecord,
  event: AnnotationDistillationCommittedEvent,
): ArticleRecord {
  if (event.transition === 'update') return article;
  return {
    ...article,
    annotations: article.annotations.map((annotation) => {
      if (annotation.id !== event.annotationId) return annotation;
      const distillation = event.distillation || annotation.distillation;
      if (!distillation) return annotation;
      return {
        ...annotation,
        distillation: {
          ...distillation,
          status: event.transition === 'unpublish' ? 'published' : 'unpublished',
        },
      };
    }),
  };
}

function distillationOverlayForAnimation(
  article: ArticleRecord | null,
  event: AnnotationDistillationCommittedEvent,
) {
  const annotation = article?.annotations.find((item) => item.id === event.annotationId);
  const distillation = event.distillation || annotation?.distillation;
  const content = distillation?.content.trim();
  if (!content) return undefined;
  return {
    content,
    publishedAt: distillation?.publishedAt,
    updatedAt: distillation?.updatedAt,
  };
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

function articleSummaryChanged(summary: ArticleSummaryRecord, article: ArticleRecord) {
  return (
    summary.updatedAt !== article.updatedAt ||
    articleAnnotationCount(summary) !== articleAnnotationCount(article) ||
    articleThoughtCount(summary) !== articleThoughtCount(article) ||
    articleAiCommentCount(summary) !== articleAiCommentCount(article) ||
    articleDistillationCount(summary) !== articleDistillationCount(article)
  );
}

function articleAiCommentCount(article: ArticleSummaryRecord) {
  return (
    article.aiCommentCount ??
    article.annotations.reduce(
      (count, annotation) =>
        count +
        annotation.comments.filter((comment) => comment.author === 'ai').length +
        annotationDistillationReviewAiMessageCount(annotation),
      0,
    )
  );
}

function annotationDistillationReviewAiMessageCount(annotation: Annotation) {
  return (
    annotation.distillation?.reviewSessions?.reduce(
      (count, session) =>
        count + session.messages.filter((message) => message.author === 'ai').length,
      0,
    ) ?? 0
  );
}

function weReadOpenErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/No application found|weread:/.test(message)) {
    return i18next.t('wereadBook.nativeAppMissing');
  }
  return message || i18next.t('wereadBook.openFailed');
}

function weReadLibrarySyncSummary(books: WeReadBook[]) {
  return books.reduce(
    (summary, book) => ({
      books: summary.books + 1,
      bookmarks: summary.bookmarks + book.bookmarkCount,
      reviews: summary.reviews + book.reviewCount,
    }),
    { books: 0, bookmarks: 0, reviews: 0 },
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
