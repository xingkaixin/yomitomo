import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, BubbleChatIcon } from '@hugeicons/core-free-icons';
import React, { useCallback, useMemo, useReducer, useRef } from 'react';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import i18next from 'i18next';
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
  Comment,
  ContentRef,
  MessageSendShortcut,
  PublicAgent,
  SelectionActionShortcuts,
  UserProfile,
  WeReadBook,
} from '@yomitomo/shared';
import { errorMessageOrFallback, normalizeUiLanguage } from '@yomitomo/shared';
import { annotationAuthorName, sortAnnotations } from '@yomitomo/core';
import type { ReaderTheme } from '@yomitomo/reader-ui/reader-theme';
import { SourceBookcase } from '../source/bookcase/app-source-bookcase';
import { publicPersonaAgents } from '../source/bookcase/source-public-agents';
import type { ReadingEvidenceSourceTarget } from '../shell/app-reading-types';
import { LibraryHome } from './app-reading-library-home';
import { WeReadBookcase } from '../shell/app-weread-bookcase';
import { appToast } from '../shell/app-toast';
import { groupLibraryArticles, type LibrarySort } from './app-reading-library-utils';
import { playAppSoundEffect } from '../sound/app-sound-effects';
import type {
  AnnotationDiscussionWindowState,
  SetLibraryPinInput,
  WeReadState,
  WindowAnimationSourceRect,
} from '../../../ipc-contract';
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
  } = articleActions;
  const { t } = useTranslation();
  const desktopStore = useDesktopStoreApi();
  const librarySession = useLibrarySession();
  const navigation = useReadingLibraryNavigation({
    onCloseArticleDiscussions: closeArticleDiscussions,
    onReadArticle: readArticle,
  });
  const sourceJumpRef = useRef<ReadingEvidenceSourceTarget | null>(null);
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
    } catch (error) {
      const fallback = t('library.actions.deleteArticleFailed');
      appToast.error(fallback, { description: errorMessageOrFallback(error, fallback) });
    }
  }

  function openLibraryShelf() {
    sourceJumpRef.current = null;
    navigation.actions.returnToLibrary();
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
      onOpenArticle: (article: ArticleRecord | ArticleSummaryRecord) =>
        void openLibraryArticle(article),
      onOpenWeReadBook: (book: WeReadBook) => {
        sourceJumpRef.current = null;
        void weRead.openBook(book);
      },
      onOpenWeReadExternal: (book: WeReadBook) => void weRead.openExternal(book),
      onSetLibraryPin: setLibraryPin,
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
                syncing={weRead.bookSyncing}
                userProfile={userProfile}
                onClose={openLibraryShelf}
                onOpenExternal={(target) =>
                  void weRead.openExternal(selectedWeReadBook.book, target)
                }
                onSync={() => void weRead.syncBook(selectedWeReadBook.book.bookId)}
              />
            ) : selectedArticle ? (
              <SourceBookcase
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
          </div>
        </div>
      )}
      {selectedArticle && activeShelf === 'source' ? (
        <AnnotationDiscussionCapsules
          agents={publicPersonaAgents(agents, normalizeUiLanguage(settings?.uiLanguage))}
          article={selectedArticle}
          windows={currentMinimizedDiscussionWindows}
          onOpen={openArticleDiscussion}
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
    const author = comment.author;
    if (author.kind !== 'agent') continue;
    const key = author.agentId;
    if (assistants.has(key)) continue;
    const agent = agents.find((item) => item.id === author.agentId);
    const name =
      agent?.nickname || annotationAuthorName(author).trim() || i18next.t('common.assistant');
    const avatar = agent?.avatar || author.avatar?.trim() || undefined;
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
  const [expandedByUser, dispatchExpanded] = useReducer(capsulesExpandedReducer, false);
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
          onClick={() => dispatchExpanded({ type: 'expanded' })}
        >
          <HugeiconsIcon icon={BubbleChatIcon} aria-hidden="true" size={16} strokeWidth={1.8} />
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
            onClick={() => dispatchExpanded({ type: 'collapsed' })}
          >
            <HugeiconsIcon icon={ArrowDown01Icon} aria-hidden="true" size={16} strokeWidth={1.8} />
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

function capsulesExpandedReducer(
  _expanded: boolean,
  event: { type: 'expanded' } | { type: 'collapsed' },
) {
  return event.type === 'expanded';
}

function isReadingModeOpen(model: ReadingLibraryNavigationModel) {
  return Boolean((model.article || model.wereadBook) && model.activeShelf === 'source');
}
