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
  Comment,
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
import { publicAnnotationAgents } from '../source/bookcase/app-source-bookcase-shared';
import type {
  ArticleUpdater,
  EbookImportProgressCallback,
  PdfImportProgressCallback,
} from '../shell/app-reading-types';
import { LibraryHome, type LibrarySourceTransitionDirection } from './app-reading-library-home';
import { enabledLibraryContentSources } from './app-library-content-sources';
import { WeReadBookcase } from '../shell/app-weread-bookcase';
import { appToast } from '../shell/app-toast';
import type { ArticleImportResult } from './app-reading-library-imports';
import {
  articleAnnotationCount,
  articleDistillationCount,
  articleThoughtCount,
  groupLibraryArticles,
  librarySourceForArticle,
  type LibrarySort,
  type LibrarySource,
} from './app-reading-library-utils';
import { playAppSoundEffect } from '../sound/app-sound-effects';
import type {
  AnnotationDiscussionWindowState,
  AnnotationDistillationCommittedEvent,
  WindowAnimationSourceRect,
} from '../../../ipc-contract';

export { groupLibraryArticles };
export type { LibrarySort };

export function ReadingLibrary({
  agents,
  articles,
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
  onUpdateArticle,
}: {
  agents: Agent[];
  articles: ArticleSummaryRecord[];
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
  const [librarySource, setLibrarySource] = useState<LibrarySource>(
    () => enabledLibraryContentSources(settings)[0] || 'web',
  );
  const [librarySourceTransitionDirection, setLibrarySourceTransitionDirection] =
    useState<LibrarySourceTransitionDirection>('none');
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
    phase: 'morph-out' | 'morph-in' | 'update' | 'unpublish-wobble';
    token: number;
  } | null>(null);
  const articleLoadRef = useRef(0);
  const selectedArticleIdRef = useRef<string | null>(null);
  const pendingDistillationAnimationRef = useRef<AnnotationDistillationCommittedEvent | null>(null);
  const distillationAnimationTimerRef = useRef<number | null>(null);
  const didAutoSyncWeReadRef = useRef(false);
  const sortedArticles = useMemo<ArticleSummaryRecord[]>(() => sortArticles(articles), [articles]);
  const hasLocalArticleCatalog = articles.length > 0;
  const enabledSources = useMemo(() => enabledLibraryContentSources(settings), [settings]);
  const wereadSourceEnabled = enabledSources.includes('weread');
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
        if (wereadSourceEnabled && state.settings.configured && !didAutoSyncWeReadRef.current) {
          didAutoSyncWeReadRef.current = true;
          void syncWeReadLibrary();
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [wereadSourceEnabled]);

  useEffect(() => {
    if (enabledSources.includes(librarySource)) return;
    setLibrarySource(enabledSources[0] || 'web');
    setLibrarySourceTransitionDirection('none');
  }, [enabledSources, librarySource]);

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
    setLibrarySource(librarySourceForArticle(article));
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
    const fullArticle = await onReadArticle(event.articleId);
    if (!fullArticle) return;
    setLibrarySource(librarySourceForArticle(fullArticle));
    setSelectedArticleId(fullArticle.id);
    setSelectedArticle(fullArticle);
    setSelectedWeReadBook(null);
    setRouteTransition('enter-source');
    setActiveShelf('source');
    setSelectedAnnotationId(event.annotationId);
    setSourceFocusAnnotationId(event.annotationId);
    pendingDistillationAnimationRef.current = event;
  }

  function clearDistillationTimer() {
    if (distillationAnimationTimerRef.current !== null) {
      window.clearTimeout(distillationAnimationTimerRef.current);
      distillationAnimationTimerRef.current = null;
    }
  }

  function playDistillationMorph(event: AnnotationDistillationCommittedEvent) {
    const token = Date.now();
    const MORPH_OUT_MS = 200;
    const MORPH_IN_MS = 300;
    const WOBBLE_MS = 150;

    clearDistillationTimer();
    if (event.transition === 'publish' || event.transition === 'update') {
      playAppSoundEffect('reader.distillation_committed', settings || {});
    }

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
      }, 650);
      return;
    }

    const startMorphOut = () => {
      setDistillationAnimation({
        annotationId: event.annotationId,
        transition: event.transition,
        phase: 'morph-out',
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
          token,
        });
        distillationAnimationTimerRef.current = window.setTimeout(() => {
          setDistillationAnimation((current) => (current?.token === token ? null : current));
          distillationAnimationTimerRef.current = null;
        }, MORPH_IN_MS);
      }, MORPH_OUT_MS);
    };

    if (event.transition === 'unpublish') {
      setDistillationAnimation({
        annotationId: event.annotationId,
        transition: 'unpublish',
        phase: 'unpublish-wobble',
        token,
      });
      distillationAnimationTimerRef.current = window.setTimeout(() => {
        startMorphOut();
      }, WOBBLE_MS);
    } else {
      startMorphOut();
    }
  }

  function handleSourceFocusedAnnotation() {
    const pendingAnimation = pendingDistillationAnimationRef.current;
    pendingDistillationAnimationRef.current = null;
    setSourceFocusAnnotationId(null);
    if (pendingAnimation) playDistillationMorph(pendingAnimation);
  }

  async function openWeReadBook(book: WeReadBook) {
    if (selectedArticleId) void onCloseArticleDiscussions?.(selectedArticleId);
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
    setRouteTransition('enter-source');
    setActiveShelf('source');
  }

  function openLibraryShelf() {
    if (selectedArticleId) void onCloseArticleDiscussions?.(selectedArticleId);
    setSelectedAnnotationId(null);
    setSourceFocusAnnotationId(null);
    setLibrarySourceTransitionDirection('none');
    setRouteTransition('enter-library');
    setActiveShelf('library');
  }

  function changeLibrarySource(nextSource: LibrarySource) {
    setLibrarySourceTransitionDirection(
      librarySourceTransitionDirectionForChange(librarySource, nextSource, enabledSources),
    );
    setLibrarySource(nextSource);
  }

  async function syncWeReadLibrary(options: { manual?: boolean } = {}) {
    if (!window.yomitomoDesktop || !wereadSourceEnabled) return;
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

  const libraryHomeProps = {
    activeSource: librarySource,
    articles,
    sourceTransitionDirection: librarySourceTransitionDirection,
    onActiveSourceChange: changeLibrarySource,
    sortedArticles,
    onDeleteArticle: deleteLibraryArticle,
    onImportEbookFile,
    onImportPdfFile,
    onImportArticleUrl,
    onCancelArticleImport,
    onOpenArticle: (article: ArticleSummaryRecord) => void openArticle(article),
    onOpenWeReadBook: (book: WeReadBook) => void openWeReadBook(book),
    onOpenWeReadExternal: (book: WeReadBook) => void openWeReadExternal(book),
    onSaveSettings: onSaveSettings || (() => undefined),
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

function librarySourceTransitionDirectionForChange(
  currentSource: LibrarySource,
  nextSource: LibrarySource,
  sourceOrder: LibrarySource[],
): LibrarySourceTransitionDirection {
  if (currentSource === nextSource) return 'none';
  const currentIndex = sourceOrder.indexOf(currentSource);
  const nextIndex = sourceOrder.indexOf(nextSource);
  if (currentIndex < 0 || nextIndex < 0) return 'none';
  return nextIndex > currentIndex ? 'forward' : 'backward';
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

function articleWithCommittedDistillation(
  article: ArticleRecord,
  event: AnnotationDistillationCommittedEvent,
): ArticleRecord {
  return {
    ...article,
    annotations: article.annotations.map((annotation) => {
      if (annotation.id !== event.annotationId) return annotation;
      if (event.distillation) return { ...annotation, distillation: event.distillation };
      if (!annotation.distillation) return annotation;
      return {
        ...annotation,
        distillation: {
          ...annotation.distillation,
          status: event.transition === 'unpublish' ? 'unpublished' : 'published',
        },
      };
    }),
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
        count + annotation.comments.filter((comment) => comment.author === 'ai').length,
      0,
    )
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
