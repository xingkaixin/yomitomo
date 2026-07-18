import React, { useEffect, useMemo, useState } from 'react';
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
  WeReadSettings,
} from '@yomitomo/shared';
import { normalizeUiLanguage } from '@yomitomo/shared';
import { sortAnnotations, sortArticles } from '@yomitomo/core';
import type { ReaderTheme } from '@yomitomo/reader-ui/reader-theme';
import { SourceBookcase } from '../source/bookcase/app-source-bookcase';
import { publicAnnotationAgents } from '../source/bookcase/app-source-bookcase-shared';
import type {
  EbookImportProgressCallback,
  PdfImportProgressCallback,
  ReadingLibraryOpenTarget,
} from '../shell/app-reading-types';
import { LibraryHome } from './app-reading-library-home';
import { WeReadBookcase } from '../shell/app-weread-bookcase';
import { appToast } from '../shell/app-toast';
import type { ArticleImportResult } from './app-reading-library-imports';
import { groupLibraryArticles, type LibrarySort } from './app-reading-library-utils';
import { playAppSoundEffect } from '../sound/app-sound-effects';
import type {
  AnnotationDiscussionWindowState,
  ArticleAgentAnnotationMergeResult,
  WindowAnimationSourceRect,
  SetLibraryPinInput,
} from '../../../ipc-contract';
import type { AppMenuCommandRequest } from '../../../app-menu-types';
import { useReadingLibraryDistillationSync } from './use-reading-library-distillation-sync';
import {
  articleUpdateCanReplace,
  useReadingLibraryNavigation,
} from './use-reading-library-navigation';

export { groupLibraryArticles };
export type { LibrarySort };

export function ReadingLibrary({
  agents,
  articles,
  collectionMembers = [],
  collections = [],
  pins = [],
  messageSendShortcut,
  menuRequest,
  readerTheme,
  settings,
  selectionActionShortcuts,
  openArticleTarget,
  userProfile,
  onArticleOpened,
  onAddCollectionMembers,
  onCloseArticleDiscussions,
  onCreateCollection,
  onDeleteArticle,
  onDeleteArticleAnnotation,
  onDeleteArticleComment,
  onDeleteCollection,
  onOpenArticleDiscussion,
  onImportEbookFile,
  onImportPdfFile,
  onImportArticleUrl,
  onCancelArticleImport,
  onReadingModeChange,
  onReadArticle,
  onRemoveCollectionMember,
  onRenameCollection,
  onMergeArticleAgentAnnotation,
  onSaveArticleAnnotation,
  onSaveArticleComment,
  onSaveArticleReadingProgress,
  onSaveArticleReaderChatState,
  onSaveSettings,
  onSetLibraryPin,
  onOpenDataSources,
}: {
  agents: Agent[];
  articles: ArticleSummaryRecord[];
  collectionMembers?: CollectionMember[];
  collections?: Collection[];
  pins?: LibraryPin[];
  messageSendShortcut?: MessageSendShortcut;
  menuRequest?: AppMenuCommandRequest | null;
  readerTheme: ReaderTheme;
  settings?: AppSettings;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  openArticleTarget?: ReadingLibraryOpenTarget | null;
  userProfile: UserProfile;
  onArticleOpened?: (articleId: string) => void;
  onAddCollectionMembers: (collectionId: string, members: ContentRef[]) => Promise<void>;
  onCloseArticleDiscussions?: (articleId: string) => Promise<void> | void;
  onCreateCollection: (name: string) => Promise<Collection>;
  onDeleteArticle: (articleId: string) => Promise<void> | void;
  onDeleteArticleAnnotation?: (articleId: string, annotationId: string) => Promise<void> | void;
  onDeleteArticleComment?: (
    articleId: string,
    annotationId: string,
    commentId: string,
  ) => Promise<void> | void;
  onDeleteCollection: (collectionId: string) => Promise<void>;
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
  onRemoveCollectionMember: (collectionId: string, member: ContentRef) => Promise<void>;
  onRenameCollection: (collectionId: string, name: string) => Promise<void>;
  onMergeArticleAgentAnnotation?: (
    articleId: string,
    annotation: Annotation,
  ) => Promise<ArticleAgentAnnotationMergeResult | null> | ArticleAgentAnnotationMergeResult | null;
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
  onSetLibraryPin: (input: SetLibraryPinInput) => Promise<void>;
  onOpenDataSources?: () => void;
}) {
  const { t } = useTranslation();
  const navigation = useReadingLibraryNavigation({
    onCloseArticleDiscussions,
    onReadArticle,
  });
  const distillationSync = useReadingLibraryDistillationSync({
    navigation,
    onReadArticle,
    settings,
  });
  const {
    activeShelf,
    article: selectedArticle,
    focusAnnotationId: sourceFocusAnnotationId,
    routeTransition,
    selectedAnnotationId,
    wereadBook: selectedWeReadBook,
  } = navigation.model;
  const selectedArticleId = selectedArticle?.id || null;
  const openArticleTargetId = openArticleTarget?.articleId;
  const openArticleTargetAnnotationId = openArticleTarget?.annotationId;
  const [wereadBooks, setWeReadBooks] = useState<WeReadBook[]>([]);
  const [wereadSettings, setWeReadSettings] = useState<WeReadSettings>({
    configured: false,
    openMethod: 'deeplink',
  });
  const [wereadSyncing, setWeReadSyncing] = useState(false);
  const [wereadBookSyncing, setWeReadBookSyncing] = useState(false);
  const [wereadOpenMessage, setWeReadOpenMessage] = useState('');
  const [minimizedDiscussionWindows, setMinimizedDiscussionWindows] = useState<
    AnnotationDiscussionWindowState[]
  >([]);
  const distillationAnimation = distillationSync.animation;
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
      void distillationSync.onCommitted(event);
    });
  }, [distillationSync.onCommitted]);

  useEffect(() => {
    if (!hasLocalArticleCatalog) return;
    if (selectedArticleId && !sortedArticles.some((article) => article.id === selectedArticleId)) {
      navigation.actions.resetLibrary();
    }
  }, [hasLocalArticleCatalog, navigation.actions, selectedArticleId, sortedArticles]);

  useEffect(() => {
    if (!openArticleTargetId) return;
    void navigation.actions
      .openArticle(openArticleTargetId, openArticleTargetAnnotationId)
      .then((openedArticle) => {
        if (openedArticle) onArticleOpened?.(openedArticle.id);
      });
  }, [navigation.actions, onArticleOpened, openArticleTargetAnnotationId, openArticleTargetId]);

  useEffect(() => {
    if (!selectedArticleId || !selectedArticle) return;
    const summary = sortedArticles.find((article) => article.id === selectedArticleId);
    if (!summary) return;
    if (!articleUpdateCanReplace(selectedArticle, summary)) return;
    let cancelled = false;
    void onReadArticle(summary.id).then((fullArticle) => {
      if (cancelled || !fullArticle || !navigation.actions.isCurrentArticle(summary.id)) return;
      distillationSync.acceptExternalArticle(fullArticle);
    });
    return () => {
      cancelled = true;
    };
  }, [
    distillationSync.acceptExternalArticle,
    navigation.actions,
    onReadArticle,
    selectedArticle,
    selectedArticleId,
    sortedArticles,
  ]);

  useEffect(() => {
    onReadingModeChange?.(
      Boolean((selectedArticle || selectedWeReadBook) && activeShelf === 'source'),
    );
    return () => onReadingModeChange?.(false);
  }, [activeShelf, onReadingModeChange, selectedArticle, selectedWeReadBook]);

  useEffect(() => {
    let cancelled = false;
    const desktop = window.yomitomoDesktop;
    const loadSettings = desktop?.getWeReadSettings
      ? desktop.getWeReadSettings().then((loadedSettings) => ({ settings: loadedSettings }))
      : desktop?.getWeReadState?.();
    void loadSettings
      ?.then((state) => {
        if (cancelled) return;
        setWeReadSettings(state.settings);
        if ('books' in state && Array.isArray(state.books)) {
          setWeReadBooks(state.books as WeReadBook[]);
        }
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

  useEffect(() => {
    if (!menuRequest) return;
    if (menuRequest.command === 'sync-weread') {
      void syncWeReadLibrary({ manual: true });
      return;
    }
    if (!isImportMenuCommand(menuRequest.command)) return;
    navigation.actions.resetLibrary();
  }, [menuRequest?.command, menuRequest?.id, navigation.actions]);

  async function deleteLibraryArticle(articleId: string) {
    await onDeleteArticle(articleId);
    playAppSoundEffect('library.delete_item', settings || {});
    if (selectedArticleId === articleId) {
      navigation.actions.resetLibrary();
    }
  }

  async function openWeReadBook(book: WeReadBook) {
    navigation.actions.resetLibrary();
    const cached = await window.yomitomoDesktop?.getWeReadBook?.(book.bookId);
    const detail =
      cached &&
      (cached.chapters.length > 0 || cached.highlights.length > 0 || cached.thoughts.length > 0)
        ? cached
        : await syncWeReadBook(book.bookId);
    if (!detail) return;
    navigation.actions.showWeReadBook(detail);
  }

  function openLibraryShelf() {
    navigation.actions.returnToLibrary();
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
        setWeReadBooks((books) => books.filter((book) => book.bookId !== bookId));
        navigation.actions.resetLibrary();
        return null;
      }
      navigation.actions.showWeReadBook(detail);
      setWeReadBooks((books) =>
        books.map((book) => (book.bookId === detail.book.bookId ? detail.book : book)),
      );
      return detail;
    } finally {
      setWeReadBookSyncing(false);
    }
  }

  async function saveSelectedArticleReadingProgress(
    articleId: string,
    progress: ArticleReadingProgress,
  ) {
    if (navigation.actions.isCurrentArticle(articleId)) {
      navigation.actions.updateArticle(articleId, (current) => ({
        ...current,
        readingProgress: progress,
        updatedAt: progress.updatedAt,
      }));
    }
    await onSaveArticleReadingProgress(articleId, progress);
  }

  async function saveSelectedArticleReaderChatState(
    articleId: string,
    readerChatState?: ReaderChatState,
  ) {
    if (navigation.actions.isCurrentArticle(articleId)) {
      navigation.actions.updateArticle(articleId, (current) => ({
        ...current,
        readerChatState,
        updatedAt: readerChatState?.updatedAt || current.updatedAt,
      }));
    }
    await onSaveArticleReaderChatState?.(articleId, readerChatState);
  }

  async function deleteSelectedArticleAnnotation(articleId: string, annotationId: string) {
    if (!onDeleteArticleAnnotation) return;
    await onDeleteArticleAnnotation(articleId, annotationId);
    if (!navigation.actions.isCurrentArticle(articleId)) return;
    navigation.actions.updateArticle(articleId, (current) => ({
      ...current,
      annotations: current.annotations.filter((annotation) => annotation.id !== annotationId),
    }));
  }

  async function setLibraryPin(input: SetLibraryPinInput) {
    try {
      await onSetLibraryPin(input);
    } catch (error) {
      const fallback = t('library.collection.pinSaveFailed');
      appToast.error(fallback, { description: errorMessage(error, fallback) });
    }
  }

  const libraryHomeProps = {
    collectionActions: {
      onAddCollectionMembers,
      onCreateCollection,
      onDeleteCollection,
      onRemoveCollectionMember,
      onRenameCollection,
    },
    content: {
      collectionMembers,
      collections,
      pins,
      sortedArticles,
    },
    imports: {
      onCancelArticleImport,
      onImportArticleUrl,
      onImportEbookFile,
      onImportPdfFile,
    },
    itemActions: {
      onDeleteArticle: deleteLibraryArticle,
      onOpenArticle: (article: ArticleSummaryRecord) =>
        void navigation.actions.openArticle(article),
      onOpenWeReadBook: (book: WeReadBook) => void openWeReadBook(book),
      onOpenWeReadExternal: (book: WeReadBook) => void openWeReadExternal(book),
      onSetLibraryPin: setLibraryPin,
    },
    menuRequest,
    settingsControl: {
      settings: settings || {},
      onSaveSettings: onSaveSettings || (() => undefined),
    },
    weRead: {
      books: wereadBooks,
      onOpenDataSources,
      onSync: () => void syncWeReadLibrary({ manual: true }),
      openMessage: wereadOpenMessage,
      settings: wereadSettings,
      syncing: wereadSyncing,
    },
  } satisfies React.ComponentProps<typeof LibraryHome>;

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
                onArticleChange={(article) =>
                  navigation.actions.updateArticle(article.id, () => article)
                }
                onFocusedAnnotation={distillationSync.onFocusedAnnotation}
                onClose={openLibraryShelf}
                onDeleteArticleAnnotation={
                  onDeleteArticleAnnotation ? deleteSelectedArticleAnnotation : undefined
                }
                onDeleteArticleComment={onDeleteArticleComment}
                onOpenAnnotationDiscussion={onOpenArticleDiscussion}
                onOpenAnnotation={navigation.actions.selectAnnotation}
                onMergeArticleAgentAnnotation={onMergeArticleAgentAnnotation}
                onSaveArticleAnnotation={onSaveArticleAnnotation}
                onSaveArticleComment={onSaveArticleComment}
                onSaveArticleReadingProgress={saveSelectedArticleReadingProgress}
                onSaveArticleReaderChatState={saveSelectedArticleReaderChatState}
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

function isImportMenuCommand(command: AppMenuCommandRequest['command']) {
  return command === 'import-web' || command === 'import-ebook' || command === 'import-pdf';
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
