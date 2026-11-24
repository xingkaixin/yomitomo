import React, { lazy, Suspense, useCallback, useMemo, useReducer, useRef } from 'react';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import { useTranslation } from 'react-i18next';
import type {
  Agent,
  Annotation,
  ArticleRecord,
  ArticleSummaryRecord,
  AppSettingsPatch,
  ResolvedAppSettings,
  Collection,
  CollectionMember,
  ContentRef,
  MessageSendShortcut,
  SelectionActionShortcuts,
  UserProfile,
  WeReadBook,
} from '@yomitomo/shared';
import { errorMessageOrFallback, normalizeUiLanguage } from '@yomitomo/shared';
import { sortAnnotations } from '@yomitomo/core';
import type { ReaderTheme } from '@yomitomo/reader-ui/reader-theme';
import { publicPersonaAgents } from '../source/bookcase/source-public-agents';
import type { ReadingEvidenceSourceTarget } from '../shell/app-reading-types';
import { LibraryHome } from './app-reading-library-home';
import { weReadReaderState } from '../shell/app-weread-reader-pane';
import { appToast } from '../shell/app-toast';
import { groupLibraryArticles, type LibrarySort } from './app-reading-library-utils';
import { playAppSoundEffect } from '../sound/app-sound-effects';
import type { SetLibraryPinInput, WeReadState } from '../../../ipc-contract';
import type { ArticleStore } from '../shell/app-article-store';
import type { ArticleActions } from '../shell/app-article-store-actions';
import { useReadingLibraryDistillationSync } from './use-reading-library-distillation-sync';
import {
  articleUpdateCanReplace,
  useReadingLibraryNavigation,
  type ReadingLibraryNavigationModel,
} from './use-reading-library-navigation';
import { getOptionalDesktopApi } from '../shell/app-desktop-api';
import { useDesktopStoreApi } from '../shell/app-desktop-store';
import { useLibrarySession } from '../shell/app-session';
import { useDesktopEvent } from '../shell/use-desktop-event';
import { emptyDesktopStore } from '../../../app-store';
import { useLibraryQuerySession } from './use-library-query-session';
import { useMinimizedDiscussionWindows } from './use-minimized-discussion-windows';
import { useWeReadLibrarySession } from './use-weread-library-session';
import { recordReadingMemoryUsage } from '../reading-memory/reading-memory-usage';
import { contentRefKey } from './app-reading-library-entities';
import {
  readerTransitionIdle,
  startReaderCloseTransition,
  startReaderOpenTransition,
} from './reader-open-transition';

import type { DiscussionDockCorner } from './discussion-capsule-dock';

const SourceBookcase = lazy(() =>
  import('../source/bookcase/app-source-bookcase').then((module) => ({
    default: module.SourceBookcase,
  })),
);
const WeReadBookcase = lazy(() =>
  import('../shell/app-weread-bookcase').then((module) => ({
    default: module.WeReadBookcase,
  })),
);
const AnnotationDiscussionCapsules = lazy(() =>
  import('./app-annotation-discussion-capsules').then((module) => ({
    default: module.AnnotationDiscussionCapsules,
  })),
);

export { groupLibraryArticles };
export type { LibrarySort };

export function ReadingLibrary({
  agents,
  articleActions,
  articleStore,
  catalogRevision,
  collectionMembers = [],
  collections = [],
  messageSendShortcut,
  readerTheme,
  settings,
  selectionActionShortcuts,
  openArticleTarget,
  userProfile,
  weReadObscured = false,
  onArticleOpened,
  onAddCollectionMembers,
  onCreateCollection,
  onDeleteCollection,
  onReadingModeChange,
  onRemoveCollectionMember,
  onRenameCollection,
  onSaveSettings,
  onSetLibraryPin,
  onOpenDataSources,
}: {
  agents: Agent[];
  articleActions: ArticleActions;
  articleStore: Pick<ArticleStore, 'registerCurrentArticleSink'>;
  catalogRevision: number;
  collectionMembers?: CollectionMember[];
  collections?: Collection[];
  messageSendShortcut?: MessageSendShortcut;
  readerTheme: ReaderTheme;
  settings?: ResolvedAppSettings;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  openArticleTarget?: ReadingEvidenceSourceTarget | null;
  userProfile: UserProfile;
  weReadObscured?: boolean;
  onArticleOpened?: (articleId: string) => void;
  onAddCollectionMembers: (collectionId: string, members: ContentRef[]) => Promise<void>;
  onCreateCollection: (name: string) => Promise<Collection>;
  onDeleteCollection: (collectionId: string) => Promise<void>;
  onReadingModeChange?: (open: boolean) => void;
  onRemoveCollectionMember: (collectionId: string, member: ContentRef) => Promise<void>;
  onRenameCollection: (collectionId: string, name: string) => Promise<void>;
  onSaveSettings?: (settings: AppSettingsPatch) => Promise<void> | void;
  onSetLibraryPin: (input: SetLibraryPinInput) => Promise<void>;
  onOpenDataSources?: () => void;
}) {
  const {
    cancelArticleUrlImport,
    closeArticleDiscussions,
    commitTextImport,
    deleteArticle,
    importArticleUrl,
    importEbookFile,
    importPdfFile,
    openArticleDiscussion,
    readArticle,
    updateArticleMetadata,
  } = articleActions;
  const { t } = useTranslation();
  const desktopStore = useDesktopStoreApi();
  const librarySession = useLibrarySession();
  const navigation = useReadingLibraryNavigation({
    onCloseArticleDiscussions: closeArticleDiscussions,
    onReadArticle: readArticle,
  });
  const sourceJumpRef = useRef<ReadingEvidenceSourceTarget | null>(null);
  const [weReadReader, dispatchWeReadReader] = useReducer(weReadReaderState, null);
  const reportArticleLoadError = useCallback(() => {
    appToast.error(t('library.articleLoadFailed'));
  }, [t]);
  const openLibraryArticle = useCallback(
    async (article: ArticleRecord | ArticleSummaryRecord | string, focusAnnotationId?: string) => {
      sourceJumpRef.current = null;
      try {
        return await navigation.actions.openArticle(article, focusAnnotationId);
      } catch {
        reportArticleLoadError();
        return null;
      }
    },
    [navigation.actions, reportArticleLoadError],
  );
  useMountEffect(() => articleStore.registerCurrentArticleSink(navigation.currentArticleSink));
  const distillationSync = useReadingLibraryDistillationSync({
    navigation,
    onReadArticle: readArticle,
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
  const [discussionCorner, dockDiscussion] = useReducer(
    (_corner: DiscussionDockCorner, event: { type: 'docked'; corner: DiscussionDockCorner }) =>
      event.corner,
    'bottom-left',
  );
  const readingModeOpen = isReadingModeOpen(navigation.model);
  const selectedArticleId = selectedArticle?.id || null;
  const sourceJump = sourceJumpRef.current;
  const openEvidenceSource = useCallback(
    async (target: ReadingEvidenceSourceTarget) => {
      const opening = openLibraryArticle(target.articleId, target.annotationId);
      const jump = target.readingMemoryJump ? { ...target } : null;
      sourceJumpRef.current = jump;
      const openedArticle = await opening;
      if (!openedArticle || !navigation.actions.isCurrentArticle(openedArticle.id)) {
        if (sourceJumpRef.current === jump) sourceJumpRef.current = null;
        return null;
      }
      if (jump && sourceJumpRef.current !== jump) return openedArticle;
      if (target.view === 'discussion') {
        const annotation = openedArticle.annotations.find(
          (item) => item.id === target.annotationId,
        );
        if (!annotation) {
          if (sourceJumpRef.current === jump) sourceJumpRef.current = null;
          appToast.error(t('readingEvidence.sourceUnavailable'));
          return openedArticle;
        }
        try {
          await openArticleDiscussion(openedArticle.id, annotation.id);
        } catch {
          if (sourceJumpRef.current === jump) sourceJumpRef.current = null;
          appToast.error(t('readingEvidence.sourceUnavailable'));
          return openedArticle;
        }
      }
      if (
        jump &&
        sourceJumpRef.current === jump &&
        (target.view === 'discussion' || !target.annotationId) &&
        navigation.actions.isCurrentArticle(openedArticle.id)
      ) {
        recordReadingMemoryUsage('source_jump');
      }
      return openedArticle;
    },
    [navigation.actions, openArticleDiscussion, openLibraryArticle, t],
  );
  const weRead = useWeReadLibrarySession({
    onOpenBook: navigation.actions.openWeReadBook,
  });
  const distillationAnimation = distillationSync.animation;
  const resolvedSettings = settings || emptyDesktopStore.settings;
  const libraryQuerySession = useLibraryQuerySession({
    catalogEnabled: !readingModeOpen,
    catalogRevision,
    onSaveSettings: onSaveSettings || (() => undefined),
  });
  const annotations = useMemo<Annotation[]>(
    () => sortAnnotations(selectedArticle?.annotations ?? []),
    [selectedArticle?.annotations],
  );
  const selectedAnnotation =
    annotations.find((annotation) => annotation.id === selectedAnnotationId) || null;
  const focusAnnotationAnchor = annotations.find(
    (item) => item.id === sourceFocusAnnotationId,
  )?.anchor;
  const onFocusedAnnotation = useCallback(
    (located: boolean) => {
      if (sourceJumpRef.current !== sourceJump) return;
      if (
        sourceJump &&
        sourceJump.view !== 'discussion' &&
        sourceJump.articleId === selectedArticleId &&
        sourceJump.annotationId === sourceFocusAnnotationId
      ) {
        sourceJumpRef.current = null;
        if (located && selectedArticleId && navigation.actions.isCurrentArticle(selectedArticleId))
          recordReadingMemoryUsage('source_jump');
      }
      distillationSync.onFocusedAnnotation();
      if (!located) {
        appToast.error(t('readingEvidence.locationUnavailable'), {
          description: focusAnnotationAnchor?.exact,
        });
      }
    },
    [
      distillationSync.onFocusedAnnotation,
      focusAnnotationAnchor,
      navigation.actions,
      selectedArticleId,
      sourceFocusAnnotationId,
      sourceJump,
      t,
    ],
  );
  const currentMinimizedDiscussionWindows = useMinimizedDiscussionWindows(selectedArticleId);

  useDesktopEvent(
    getOptionalDesktopApi()?.annotations?.onDistillationCommitted,
    (event) => void distillationSync.onCommitted(event),
  );

  const rehydrateRequestRef = useRef(0);
  const rehydrateCurrentArticle = useStableCallback(() => {
    rehydrateRequestRef.current += 1;
    const request = rehydrateRequestRef.current;
    const currentArticle = navigation.actions.getCurrentArticle();
    if (!currentArticle) return;
    const summary = desktopStore
      .getState()
      .store?.articles.find((article) => article.id === currentArticle.id);
    if (!summary || !articleUpdateCanReplace(currentArticle, summary)) return;
    void readArticle(summary.id)
      .then((fullArticle) => {
        if (request !== rehydrateRequestRef.current) return;
        if (!fullArticle || !navigation.actions.isCurrentArticle(summary.id)) return;
        distillationSync.acceptExternalArticle(fullArticle);
      })
      .catch(() => {
        if (request === rehydrateRequestRef.current) reportArticleLoadError();
      });
  });
  const notifyReadingModeChange = useStableCallback((open: boolean) => {
    onReadingModeChange?.(open);
  });
  const showLibraryHome = useStableCallback(() => {
    sourceJumpRef.current = null;
    navigation.actions.resetLibrary();
  });
  const isReadingArticle = useStableCallback(
    (articleId: string) => activeShelf === 'source' && selectedArticleId === articleId,
  );
  const openArticleById = useStableCallback((articleId: string) => {
    void openLibraryArticle(articleId);
  });
  const receiveWeReadState = useStableCallback((state: WeReadState) => {
    void weRead.receiveState(state);
  });

  useMountEffect(() => {
    const unsubscribeRoute = navigation.actions.subscribeRoute((model, previous) => {
      const open = isReadingModeOpen(model);
      if (open !== isReadingModeOpen(previous)) notifyReadingModeChange(open);
      if (model.article !== previous.article) rehydrateCurrentArticle();
    });
    const unsubscribeStore = desktopStore.subscribe((state, previous) => {
      if (state.store?.articles !== previous.store?.articles) rehydrateCurrentArticle();
    });
    const unregisterView = librarySession.actions.registerLibraryView({
      isReadingArticle: (articleId) => isReadingArticle(articleId),
      openArticle: (articleId) => openArticleById(articleId),
      showHome: () => showLibraryHome(),
      receiveWeReadState: (state) => receiveWeReadState(state),
    });
    return () => {
      unsubscribeRoute();
      unsubscribeStore();
      unregisterView();
      rehydrateRequestRef.current += 1;
      sourceJumpRef.current = null;
      notifyReadingModeChange(false);
    };
  });

  useMountEffect(() => {
    if (!openArticleTarget) return;
    void openEvidenceSource(openArticleTarget).then((openedArticle) => {
      if (openedArticle) onArticleOpened?.(openedArticle.id);
    });
  });

  async function deleteLibraryArticle(articleId: string) {
    try {
      await deleteArticle(articleId);
      playAppSoundEffect('library.delete_item', settings);
      return true;
    } catch (error) {
      const fallback = t('library.actions.deleteArticleFailed');
      appToast.error(fallback, { description: errorMessageOrFallback(error, fallback) });
      return false;
    }
  }

  function openWeReadReaderView(
    book: WeReadBook,
    target?: Parameters<typeof weRead.openExternal>[1],
  ) {
    void weRead
      .openExternal(book, target)
      .then(readerTransitionIdle)
      .then(() => dispatchWeReadReader({ type: 'readerShown', bookId: book.bookId }));
  }

  function openLibraryShelf() {
    sourceJumpRef.current = null;
    const ref: ContentRef | null = selectedArticle
      ? { kind: 'article', id: selectedArticle.id }
      : selectedWeReadBook
        ? { kind: 'weread', id: selectedWeReadBook.book.bookId }
        : null;
    startReaderCloseTransition(ref && contentRefKey(ref), navigation.actions.returnToLibrary);
  }

  async function setLibraryPin(input: SetLibraryPinInput) {
    try {
      await onSetLibraryPin(input);
    } catch (error) {
      const fallback = t('library.collection.pinSaveFailed');
      appToast.error(fallback, { description: errorMessageOrFallback(error, fallback) });
    }
  }

  const libraryHomeProps = {
    catalogRevision,
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
    },
    imports: {
      onCancelArticleImport: cancelArticleUrlImport,
      onCommitTextImport: commitTextImport,
      onImportArticleUrl: importArticleUrl,
      onImportEbookFile: importEbookFile,
      onImportPdfFile: importPdfFile,
    },
    itemActions: {
      onDeleteArticle: deleteLibraryArticle,
      onOpenArticle: (article: ArticleRecord | ArticleSummaryRecord) => {
        const transition = startReaderOpenTransition(
          contentRefKey({ kind: 'article', id: article.id }),
        );
        void openLibraryArticle(article).then((opened) => transition?.settle(Boolean(opened)));
      },
      onOpenWeReadBook: (book: WeReadBook) => {
        sourceJumpRef.current = null;
        const transition = startReaderOpenTransition(
          contentRefKey({ kind: 'weread', id: book.bookId }),
        );
        void weRead.openBook(book).then((detail) => transition?.settle(Boolean(detail)));
        if (weRead.settings.openMethod !== 'in-app' || weReadReader?.bookId === book.bookId) return;
        dispatchWeReadReader({
          type: 'readerOpened',
          bookId: book.bookId,
          mode: 'compact',
          noteKey: null,
        });
        openWeReadReaderView(book);
      },
      onOpenWeReadExternal: (book: WeReadBook) => {
        if (weRead.settings.openMethod !== 'in-app') return void weRead.openExternal(book);
        sourceJumpRef.current = null;
        dispatchWeReadReader({
          type: 'readerOpened',
          bookId: book.bookId,
          mode: 'full',
          noteKey: null,
        });
        void weRead.openBook(book);
        openWeReadReaderView(book);
      },
      onSetLibraryPin: setLibraryPin,
      onUpdateArticleMetadata: async (input: {
        articleId: string;
        title: string;
        byline?: string;
      }) => {
        await updateArticleMetadata(input);
      },
    },
    querySession: libraryQuerySession,
    settingsControl: {
      settings: resolvedSettings,
    },
    weRead: {
      onOpenDataSources,
      onSync: () => void librarySession.actions.syncWeReadLibrary(),
      openMessage: weRead.openMessage,
      settings: weRead.settings,
      syncing: librarySession.weReadSyncing,
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
        <div className="library-shelf is-expanded is-library-bookcase">
          <div className="library-shelf-content">
            <LibraryHome {...libraryHomeProps} />
          </div>
        </div>
      ) : (
        <div className="library-shelf is-expanded">
          <div className="library-shelf-content">
            <Suspense fallback={null}>
              {selectedWeReadBook ? (
                <WeReadBookcase
                  currentNoteKey={
                    weReadReader?.bookId === selectedWeReadBook.book.bookId
                      ? weReadReader.noteKey
                      : null
                  }
                  detail={selectedWeReadBook}
                  inAppReader={weRead.settings.openMethod === 'in-app'}
                  readerMode={
                    weReadReader?.bookId === selectedWeReadBook.book.bookId
                      ? weReadReader.mode
                      : null
                  }
                  readerObscured={weReadObscured}
                  readerShown={
                    weReadReader?.bookId === selectedWeReadBook.book.bookId && weReadReader.shown
                  }
                  syncing={weRead.bookSyncing}
                  onClose={openLibraryShelf}
                  onOpenExternal={(target) => openWeReadReaderView(selectedWeReadBook.book, target)}
                  onReaderEvent={dispatchWeReadReader}
                  onSync={() => void weRead.syncBook(selectedWeReadBook.book.bookId)}
                />
              ) : selectedArticle ? (
                <SourceBookcase
                  viewportOverlay={
                    <Suspense fallback={null}>
                      <AnnotationDiscussionCapsules
                        agents={publicPersonaAgents(
                          agents,
                          normalizeUiLanguage(settings?.uiLanguage),
                        )}
                        article={selectedArticle}
                        userProfile={userProfile}
                        windows={currentMinimizedDiscussionWindows}
                        corner={discussionCorner}
                        onDock={(position) => dockDiscussion({ type: 'docked', corner: position })}
                        onOpen={openArticleDiscussion}
                      />
                    </Suspense>
                  }
                  annotationActions={{
                    onArticleChange: (article) =>
                      navigation.actions.updateArticle(article.id, () => article),
                    onFocusedAnnotation,
                    onOpenAnnotation: navigation.actions.selectAnnotation,
                  }}
                  articleActions={articleActions}
                  content={{
                    agents,
                    annotations,
                    article: selectedArticle,
                    userProfile,
                  }}
                  presentation={{
                    distillationAnimation,
                    messageSendShortcut,
                    readerTheme,
                    settings,
                    selectionActionShortcuts,
                    uiLanguage: normalizeUiLanguage(settings?.uiLanguage),
                  }}
                  readerControl={{
                    focusAnnotationId: sourceFocusAnnotationId,
                    onClose: openLibraryShelf,
                    onOpenEvidenceSource: (target) => void openEvidenceSource(target),
                    selectedAnnotationId: selectedAnnotation?.id || null,
                  }}
                />
              ) : null}
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}

function isReadingModeOpen(model: ReadingLibraryNavigationModel) {
  return Boolean((model.article || model.wereadBook) && model.activeShelf === 'source');
}
