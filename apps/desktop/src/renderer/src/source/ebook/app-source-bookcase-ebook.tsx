import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Annotation, ReaderQuestionContext } from '@yomitomo/shared';
import {
  activeTocIndexForOffset,
  annotationIdsAtHighlightPoint,
  createEpubTextAnchor,
  createUserAnnotation,
  findReaderSearchMatches,
  type HighlightBox,
  type TocItem,
} from '@yomitomo/core';
import { sleep } from '@yomitomo/reader-ui/reader-animation';
import { buildTocAnnotationStats } from '@yomitomo/reader-ui/reader-annotations';
import { ReaderTooltip } from '@yomitomo/reader-ui/reader-component-primitives';
import { ReaderSettingsToolbarControls } from '@yomitomo/reader-ui/reader-toolbar-controls';
import {
  currentFoliateContent,
  ebookArticleText,
  ebookHighlightAnnotationsSignature,
  ebookSectionIndexForChapter,
  ebookTocItemsForReader,
  foliateRangeHighlightBoxes,
  formatEbookPageLabel,
  isEbookPaginationReady,
  rangeForEbookAnchorInDocument,
  recordEbookPageTurnTrace,
  waitForAnimationFrame,
  waitForFoliateIdle,
  type EbookBoxUpdateReason,
  type EbookPageTurnTrace,
  type FoliateViewElement,
} from './app-ebook-reader-utils';
import { mergeAgentAnnotationAsThought } from '@yomitomo/reader-ui/reader-agent-annotation-playback';
import { EbookReaderShell } from './app-source-ebook-reader-shell';
import { playEbookAgentAnnotationPlayback } from './app-source-ebook-agent-playback';
import {
  articleWithMergedAgentAnnotation,
  defaultTocOpen,
  usesOverlayToc,
  type EbookBookcaseProps,
} from '../bookcase/app-source-bookcase-shared';
import { useEbookAgentVirtualReading } from './use-ebook-agent-virtual-reading';
import { useEbookFoliateView } from './use-ebook-foliate-view';
import { useEbookReaderBoxes } from './use-ebook-reader-boxes';
import { useEbookSelection } from './use-ebook-selection';
import {
  useReaderPageTurnKeys,
  type ReaderPageTurnDirection,
} from '../../shell/use-reader-page-turn-keys';
import { useSourceActiveConnection } from '../bookcase/use-source-active-connection';
import { useRecentAnnotationFeedback } from '../bookcase/use-recent-annotation-feedback';
import { ebookAnnotationNavigationState } from './app-source-bookcase-ebook-utils';
import { ArticleBook } from '../../shell/app-article-book';
import { articleDisplayTitle } from '../../reading-library/app-reading-library-utils';
import { useSourceReaderSession } from '../bookcase/use-source-reader-session';
import { createEbookSourceReaderController } from './app-source-bookcase-ebook-controller';
import { useSourceReaderWorkspace } from '../bookcase/use-source-reader-workspace';
import { buildSourceReaderAppActions } from '../bookcase/source-reader-app-actions';
import { buildSourceReaderAppViewProps } from '../bookcase/source-reader-app-view-props';

export function EbookBookcase({
  agents,
  annotations: articleAnnotations,
  article,
  distillationAnimation,
  focusAnnotationId,
  messageSendShortcut,
  readerTheme,
  settings,
  selectionActionShortcuts,
  selectedAnnotationId,
  uiLanguage,
  userProfile,
  onFocusedAnnotation,
  onClose,
  onDeleteArticleAnnotation,
  onDeleteArticleComment,
  onOpenAnnotationDiscussion,
  onOpenAnnotation,
  onSaveArticle,
  onSaveArticleAnnotation,
  onSaveArticleComment,
  onSaveArticleReadingProgress,
  onSaveArticleReaderChatState,
  onUpdateArticle,
}: EbookBookcaseProps) {
  const { t } = useTranslation();
  const articleRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const noteRefs = useRef(new Map<string, HTMLElement>());
  const { markAnnotationCreated, newAnnotationIds } = useRecentAnnotationFeedback(
    article.id,
    settings,
  );
  const scheduleEbookBoxUpdateRef = useRef<(reason: EbookBoxUpdateReason) => void>(() => {});
  const pageTurnTraceRef = useRef<EbookPageTurnTrace | null>(null);
  const beforeEbookPageTurnRef = useRef<(trace: EbookPageTurnTrace) => void>(() => {});
  const attachFoliateDocumentListenersRef = useRef<(view: FoliateViewElement | null) => void>(
    () => {},
  );
  const cleanupFoliateDocumentListenersRef = useRef<() => void>(() => {});
  const scheduleEbookBoxUpdate = useCallback((reason: EbookBoxUpdateReason) => {
    scheduleEbookBoxUpdateRef.current(reason);
  }, []);
  const beforeEbookPageTurn = useCallback((trace: EbookPageTurnTrace) => {
    beforeEbookPageTurnRef.current(trace);
  }, []);
  const attachFoliateDocumentListenersBridge = useCallback((view: FoliateViewElement | null) => {
    attachFoliateDocumentListenersRef.current(view);
  }, []);
  const cleanupFoliateDocumentListenersBridge = useCallback(() => {
    cleanupFoliateDocumentListenersRef.current();
  }, []);
  const [statusMessage, setStatusMessage] = useState('');
  const sourceReaderSession = useSourceReaderSession({
    agents,
    agentAnnotationAdapter: createEbookSourceReaderController({
      appendAgentAnnotationToArticle,
      currentArticleText,
      enqueueAgentAnnotationPlayback: (articleId, annotation, options) =>
        enqueueEbookAgentAnnotationPlayback(articleId, annotation, options),
      finishAgentDock: (agentId, completed) => finishEbookAgentDock(agentId, completed),
      finishVirtualReading: (agentId, message) => finishEbookVirtualReading(agentId, message),
      isAgentAnnotating: (agentId) => annotatingAgentIds.includes(agentId),
      isCurrentArticle,
      setAgentAnnotating: (agentId, annotating) =>
        setAnnotatingAgentIds((ids) => {
          if (annotating) return ids.includes(agentId) ? ids : [...ids, agentId];
          return ids.filter((id) => id !== agentId);
        }),
      setStatusMessage,
      startAgentDock: (agent) => startEbookAgentDock(agent),
      startVirtualReading: (agent, targetAnchor) => startEbookVirtualReading(agent, targetAnchor),
      waitForPlaybackCompletion: async () => {
        await ebookAgentAnimationQueueRef.current;
        await sleep(900);
      },
    }),
    annotations: articleAnnotations,
    article,
    clearPendingOnArticleChange: true,
    clearPendingOnDeleteAnnotation: true,
    ignoreStaleArticleUpdates: true,
    uiLanguage,
    onBeforeDeleteAnnotation: (annotationId) => {
      noteRefs.current.delete(annotationId);
    },
    getArticleText: currentArticleText,
    onAnnotationsApplied: ({ previousAnnotations, nextAnnotations }) => {
      const previousHighlightSignature = ebookHighlightAnnotationsSignature(
        previousAnnotations,
        userProfile,
        sourceReaderSession.annotationAgents,
      );
      const nextHighlightSignature = ebookHighlightAnnotationsSignature(
        nextAnnotations,
        userProfile,
        sourceReaderSession.annotationAgents,
      );
      if (nextHighlightSignature !== previousHighlightSignature) {
        scheduleEbookBoxUpdate('annotations_applied');
      }
    },
    onAnnotationsSaved: ({ previousAnnotations, nextAnnotations }) => {
      const previousHighlightSignature = ebookHighlightAnnotationsSignature(
        previousAnnotations,
        userProfile,
        sourceReaderSession.annotationAgents,
      );
      const nextHighlightSignature = ebookHighlightAnnotationsSignature(
        nextAnnotations,
        userProfile,
        sourceReaderSession.annotationAgents,
      );
      if (nextHighlightSignature !== previousHighlightSignature) {
        scheduleEbookBoxUpdate('annotations_saved');
      }
    },
    onOpenAnnotation: openAnnotation,
    onDeleteArticleAnnotation,
    onDeleteArticleComment,
    onSaveArticle,
    onSaveArticleAnnotation,
    onSaveArticleComment,
    setStatusMessage,
    userProfile,
  });
  const {
    addComment,
    annotations,
    annotationsRef,
    annotationAgents,
    applyAnnotations,
    deleteAnnotation,
    deleteComment,
    latestArticleRef,
    replaceAnnotations,
    saveAnnotations,
  } = sourceReaderSession;
  const [annotatingAgentIds, setAnnotatingAgentIds] = useState<string[]>([]);
  const [tocOpen, setTocOpen] = useState(() => defaultTocOpen());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(0);
  const [searchBoxes, setSearchBoxes] = useState<HighlightBox[]>([]);

  const sourceReaderWorkspace = useSourceReaderWorkspace({
    article,
    canvasRef,
    getArticleText: currentArticleText,
    messageSendShortcut,
    selectionActionShortcuts,
    session: sourceReaderSession,
    uiLanguage,
    onSaveArticleReaderChatState,
  });
  const {
    actionShortcuts,
    closeFloatingComments,
    labels,
    readerChat,
    readerSettings,
    selection,
    updateReaderSettings: updateEbookReaderSettings,
  } = sourceReaderWorkspace;
  const {
    temporaryBoxes,
    setHighlightChoice,
    selectionAction,
    composer,
    clearSelection,
    clearAnnotationUiState,
    openSelectionAction,
    cancelComposer,
    copySelection,
    requestSelectionCopy,
    openComposer,
  } = selection;
  const ebookText = useMemo(() => ebookArticleText(article), [article]);
  const searchResult = useMemo(
    () => findReaderSearchMatches(ebookText, searchQuery),
    [ebookText, searchQuery],
  );
  const activeSearchMatch =
    searchResult.matches[Math.min(activeSearchMatchIndex, searchResult.matches.length - 1)] || null;
  const articleAnnotationSignature = useMemo(
    () => ebookHighlightAnnotationsSignature(articleAnnotations, userProfile, annotationAgents),
    [annotationAgents, articleAnnotations, userProfile],
  );
  const latestArticleAnnotationsRef = useRef(articleAnnotations);
  const articleAnnotationSignatureRef = useRef({
    articleId: article.id,
    signature: articleAnnotationSignature,
  });
  latestArticleAnnotationsRef.current = articleAnnotations;
  const {
    viewHostRef,
    measureHostRef,
    viewRef,
    pageInfoSectionIndexRef,
    paginationLayoutKeyRef,
    readerSettingsRef,
    readerStateStatusRef,
    tocItems,
    sectionFractions,
    pageInfo,
    sectionPageCounts,
    progress,
    readerState,
    goLeft,
    goRight,
    goToProgress,
    goToTocItem,
  } = useEbookFoliateView({
    article,
    readerTheme,
    readerSettings,
    onSaveArticleReadingProgress,
    onAttachFoliateDocumentListeners: attachFoliateDocumentListenersBridge,
    onBeforePageTurn: beforeEbookPageTurn,
    onCleanupFoliateDocumentListeners: cleanupFoliateDocumentListenersBridge,
    onScheduleEbookBoxUpdate: scheduleEbookBoxUpdate,
    pageTurnTraceRef,
  });
  const turnPageFromKeyboard = useCallback(
    (direction: ReaderPageTurnDirection) => {
      if (direction === 'left') goLeft();
      else goRight();
    },
    [goLeft, goRight],
  );
  const { handleFoliateSelection, handleFoliateSelectionShortcut } = useEbookSelection({
    article,
    canvasRef,
    viewRef,
    pageInfo,
    ebookText,
    userProfile,
    actionShortcuts,
    selectionAction,
    composer,
    clearSelection,
    askSelection,
    requestSelectionCopy,
    openComposer,
    openSelectionAction,
    setStatusMessage,
  });
  useReaderPageTurnKeys({
    enabled: readerState.status === 'ready',
    onTurnPage: turnPageFromKeyboard,
  });
  const {
    boxes,
    attachFoliateDocumentListeners,
    cleanupFoliateDocumentListeners,
    hideEbookBoxLayer,
    resetEbookBoxState,
    scheduleEbookBoxUpdate: scheduleEbookBoxUpdateImpl,
  } = useEbookReaderBoxes({
    annotationAgents,
    annotationsRef,
    article,
    canvasRef,
    viewRef,
    pageTurnTraceRef,
    pageInfoSectionIndexRef,
    paginationLayoutKeyRef,
    readerSettingsRef,
    readerStateStatus: readerState.status,
    readerStateStatusRef,
    userProfile,
    onFoliatePointerDown: handleFoliatePointerDown,
    onFoliatePageTurnKey: turnPageFromKeyboard,
    onFoliateSelection: handleFoliateSelection,
    onFoliateSelectionShortcut: handleFoliateSelectionShortcut,
  });
  attachFoliateDocumentListenersRef.current = attachFoliateDocumentListeners;
  cleanupFoliateDocumentListenersRef.current = cleanupFoliateDocumentListeners;
  scheduleEbookBoxUpdateRef.current = scheduleEbookBoxUpdateImpl;
  const { activeConnection, recalculateActiveConnection } = useSourceActiveConnection({
    annotationAgents,
    annotations,
    boxes,
    canvasRef,
    noteRefs,
    selectedAnnotationId,
    surfaceRef,
    userProfile,
  });
  const readerTocItems = useMemo(
    () => ebookTocItemsForReader(tocItems, article),
    [article, tocItems],
  );
  const activeTocIndex = useMemo(() => {
    const textLength = article.ebook.index?.textLength ?? 0;
    if (textLength <= 0) return null;
    return activeTocIndexForOffset(readerTocItems, progress * textLength);
  }, [article.ebook.index?.textLength, progress, readerTocItems]);
  const tocStats = useMemo(
    () => buildTocAnnotationStats(readerTocItems, annotations, userProfile, annotationAgents),
    [annotationAgents, annotations, readerTocItems, userProfile],
  );
  const {
    agentDockCompleting: ebookAgentDockCompleting,
    agentDockItems: ebookAgentDockItems,
    agentTheaterBoxes,
    completionBurstKey: ebookCompletionBurstKey,
    virtualCursors,
    agentAnimationQueueRef: ebookAgentAnimationQueueRef,
    cleanupAgentTheater: cleanupEbookAgentTheater,
    cursorAgent: ebookCursorAgent,
    finishAgentDock: finishEbookAgentDock,
    finishVirtualReading: finishEbookVirtualReading,
    setAgentTheaterBoxes,
    startAgentDock: startEbookAgentDock,
    startVirtualReading: startEbookVirtualReading,
    stopVirtualReadingTimer: stopEbookVirtualReadingTimer,
    updateVirtualCursor: updateEbookVirtualCursor,
  } = useEbookAgentVirtualReading({
    agents: annotationAgents,
    canvasRef,
    viewHostRef,
    viewRef,
  });
  beforeEbookPageTurnRef.current = (trace) => {
    clearAnnotationUiState();
    hideEbookBoxLayer();
    recordEbookPageTurnTrace(trace, 'overlay_hide_requested', {
      boxCount: boxes.length,
      pageAnnotationCount: pageAnnotations.length,
    });
  };

  useLayoutEffect(() => {
    noteRefs.current.clear();
    replaceAnnotations(latestArticleAnnotationsRef.current);
    resetEbookBoxState();
    clearAnnotationUiState();
    setAnnotatingAgentIds([]);
    cleanupEbookAgentTheater();
    closeFloatingComments();
    setStatusMessage('');
    setSettingsOpen(false);
    setTocOpen(defaultTocOpen());
    setSearchOpen(false);
    setSearchQuery('');
    setActiveSearchMatchIndex(0);
    setSearchBoxes([]);
  }, [
    article.id,
    closeFloatingComments,
    cleanupEbookAgentTheater,
    clearAnnotationUiState,
    replaceAnnotations,
    resetEbookBoxState,
  ]);

  useEffect(() => {
    const previous = articleAnnotationSignatureRef.current;
    articleAnnotationSignatureRef.current = {
      articleId: article.id,
      signature: articleAnnotationSignature,
    };
    if (previous.articleId !== article.id || previous.signature === articleAnnotationSignature) {
      return;
    }
    scheduleEbookBoxUpdate('annotations_applied');
  }, [article.id, articleAnnotationSignature, scheduleEbookBoxUpdate]);

  useEffect(() => {
    setActiveSearchMatchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (!searchOpen || !activeSearchMatch) {
      setSearchBoxes([]);
      return;
    }
    let cancelled = false;
    void revealEbookSearchMatch(activeSearchMatch).then((nextBoxes) => {
      if (!cancelled) setSearchBoxes(nextBoxes);
    });
    return () => {
      cancelled = true;
    };
  }, [activeSearchMatch, searchOpen]);

  useEffect(
    () => () => {
      cleanupEbookAgentTheater();
    },
    [cleanupEbookAgentTheater],
  );

  function goToReaderTocItem(item: TocItem) {
    const tocItem = tocItems[item.index];
    if (!tocItem) return;
    if (usesOverlayToc()) setTocOpen(false);
    goToTocItem(tocItem);
  }

  function handleReaderKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      goRight();
    }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      goLeft();
    }
  }

  function handleFoliatePointerDown() {
    clearAnnotationUiState();
    if (settingsOpen) {
      setSettingsOpen(false);
    }
    if (selectedAnnotationId) onOpenAnnotation(null);
  }

  function enqueueEbookAgentAnnotationPlayback(
    articleId: string,
    annotation: Annotation,
    options: { revealMissingRange?: boolean } = {},
  ) {
    const run = async () => {
      try {
        await playEbookAgentAnnotation(articleId, annotation, options);
      } catch (error) {
        console.warn(error);
        await appendAgentAnnotationToArticle(articleId, annotation);
      }
    };
    const next = ebookAgentAnimationQueueRef.current.then(run, run);
    ebookAgentAnimationQueueRef.current = next.then(
      () => undefined,
      () => undefined,
    );
  }

  async function playEbookAgentAnnotation(
    articleId: string,
    annotation: Annotation,
    options: { revealMissingRange?: boolean } = {},
  ) {
    await playEbookAgentAnnotationPlayback({
      articleId,
      annotation,
      revealMissingRange: options.revealMissingRange,
      canvasElement: canvasRef.current,
      surfaceElement: surfaceRef.current,
      document: currentFoliateContent(viewRef.current)?.doc || null,
      cursorAgent: ebookCursorAgent(annotation),
      isCurrentArticle,
      appendAgentAnnotationToArticle,
      goToAnnotation,
      finishEbookVirtualReading,
      stopEbookVirtualReadingTimer,
      updateEbookVirtualCursor,
      setAgentTheaterBoxes,
    });
  }

  function currentArticleText() {
    return ebookText;
  }

  function isCurrentArticle(articleId: string) {
    return latestArticleRef.current?.id === articleId;
  }

  function openAnnotation(annotationId: string) {
    clearAnnotationUiState();
    onOpenAnnotation(annotationId);
  }

  async function createAnnotation(note: string) {
    if (!composer) return;
    const currentComposer = composer;
    const currentArticle = latestArticleRef.current;
    if (!currentArticle) return;
    cancelComposer();
    const annotation = createUserAnnotation(currentComposer.anchor, userProfile, note);
    await saveAnnotations([...currentArticle.annotations, annotation]);
    markAnnotationCreated(annotation.id);
    openAnnotation(annotation.id);
  }

  function askSelection(action: { anchor: Annotation['anchor'] }) {
    readerChat.askSelection(readerQuestionContext(action.anchor));
    clearSelection();
  }

  function readerQuestionContext(anchor: Annotation['anchor']): ReaderQuestionContext {
    const chapter = anchor.chapterId
      ? article.ebook.index?.chapters.find((item) => item.id === anchor.chapterId)
      : null;
    return {
      sourceType: 'ebook',
      quote: anchor.exact,
      title: article.title,
      locationLabel: chapter?.title,
      anchor,
      nearbyText: ebookText.slice(
        Math.max(0, (anchor.textStartInBook ?? anchor.start) - 500),
        Math.min(ebookText.length, (anchor.textEndInBook ?? anchor.end) + 500),
      ),
    };
  }

  async function revealReaderChatContext(context: ReaderQuestionContext) {
    if (!context.anchor) return;
    await goToEbookAnchor(context.anchor);
  }

  async function appendAgentAnnotationToArticle(articleId: string, annotation: Annotation) {
    let activeId = annotation.id;
    let currentMerge: ReturnType<typeof mergeAgentAnnotationAsThought> | null = null;
    if (isCurrentArticle(articleId)) {
      const result = mergeAgentAnnotationAsThought(annotationsRef.current, annotation);
      activeId = result.activeId;
      currentMerge = result;
      applyAnnotations(result.annotations);
      openAnnotation(result.activeId);
    }
    await onUpdateArticle(articleId, (targetArticle) => {
      const result = articleWithMergedAgentAnnotation(targetArticle, annotation, currentMerge);
      activeId = result.activeId;
      return result.article;
    });
    return activeId;
  }

  function handleHighlightClick(
    annotationId: string,
    event: React.MouseEvent<HTMLButtonElement>,
    visibleAnnotationIds: string[],
  ) {
    const canvasElement = canvasRef.current;
    if (!canvasElement) {
      openAnnotation(annotationId);
      return;
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const annotationIds =
      visibleAnnotationIds.length > 0
        ? visibleAnnotationIds
        : annotationIdsAtHighlightPoint(
            boxes,
            {
              x: event.clientX - canvasRect.left,
              y: event.clientY - canvasRect.top,
            },
            1,
          );

    if (annotationIds.length <= 1) {
      openAnnotation(annotationIds[0] || annotationId);
      return;
    }

    const x = event.clientX - canvasRect.left + 8;
    setHighlightChoice({
      x: Math.max(8, Math.min(Math.max(8, canvasRect.width - 236), x)),
      y: Math.max(8, event.clientY - canvasRect.top + 8),
      annotationIds,
    });
  }

  async function goToAnnotation(annotationId: string) {
    const annotation = annotationsRef.current.find((item) => item.id === annotationId);
    if (!annotation) return false;
    return goToEbookAnchor(annotation.anchor);
  }

  async function goToEbookAnchor(anchor: Annotation['anchor']) {
    const view = viewRef.current;
    const index = article.ebook.index;
    if (!view || !index) return false;

    const chapter = anchor.chapterId
      ? index.chapters.find((item) => item.id === anchor.chapterId)
      : null;
    const sectionIndex = chapter ? ebookSectionIndexForChapter(article, view, chapter) : -1;
    if (sectionIndex >= 0) await view.goTo(sectionIndex);
    else if (typeof anchor.textStartInBook === 'number' && index.textLength > 0) {
      await view.goToFraction(anchor.textStartInBook / index.textLength);
    }

    await waitForFoliateIdle();
    await waitForAnimationFrame();
    const doc = currentFoliateContent(view)?.doc;
    const range = doc ? rangeForEbookAnchorInDocument(doc, anchor) : null;
    if (range) await view.renderer?.scrollToAnchor?.(range);
    await waitForAnimationFrame();
    scheduleEbookBoxUpdate('annotation_navigation');
    return true;
  }

  async function revealEbookSearchMatch(match: { id: string; start: number; end: number }) {
    const view = viewRef.current;
    const index = article.ebook.index;
    const canvasElement = canvasRef.current;
    if (!view || !index || !canvasElement) return [];

    const anchor = createEpubTextAnchor(index, ebookText, match.start, match.end);
    const chapter = anchor.chapterId
      ? index.chapters.find((item) => item.id === anchor.chapterId)
      : null;
    const sectionIndex = chapter ? ebookSectionIndexForChapter(article, view, chapter) : -1;
    if (sectionIndex >= 0) await view.goTo(sectionIndex);
    else if (typeof anchor.textStartInBook === 'number' && index.textLength > 0) {
      await view.goToFraction(anchor.textStartInBook / index.textLength);
    }

    await waitForFoliateIdle();
    await waitForAnimationFrame();
    const doc = currentFoliateContent(view)?.doc;
    const range = doc ? rangeForEbookAnchorInDocument(doc, anchor) : null;
    if (!range) return [];
    await view.renderer?.scrollToAnchor?.(range);
    await waitForAnimationFrame();
    return foliateRangeHighlightBoxes(range, canvasElement.getBoundingClientRect(), match.id).map(
      (box) =>
        Object.assign(box, {
          annotationId: '__search__',
          contributorId: '__search__',
          color: '#d7a93f',
        }),
    );
  }

  const resolveAnnotationNavigation = useCallback(
    ({
      activeId,
      annotations: navigationAnnotations,
    }: {
      activeId: string | null;
      annotations: Annotation[];
    }) =>
      ebookAnnotationNavigationState({
        activeId,
        annotations: navigationAnnotations,
        boxes,
        pageInfo,
        article,
        view: viewRef.current,
      }),
    [article, boxes, pageInfo],
  );

  function navigateAnnotation(annotationId: string) {
    openAnnotation(annotationId);
    void goToAnnotation(annotationId);
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchBoxes([]);
  }

  function navigateSearchMatch(direction: 'previous' | 'next') {
    const total = searchResult.matches.length;
    if (total === 0) return;
    setActiveSearchMatchIndex((index) =>
      direction === 'next' ? (index + 1) % total : (index - 1 + total) % total,
    );
  }

  function focusPageAnnotation(annotationId: string) {
    openAnnotation(annotationId);
    if (boxes.some((box) => box.annotationId === annotationId)) return;
    void goToAnnotation(annotationId);
  }

  useEffect(() => {
    if (!focusAnnotationId) return;
    if (!annotations.some((annotation) => annotation.id === focusAnnotationId)) {
      onFocusedAnnotation();
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    void goToAnnotation(focusAnnotationId).then(() => {
      if (cancelled) return;
      timer = window.setTimeout(onFocusedAnnotation, 180);
    });
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [annotations, focusAnnotationId, onFocusedAnnotation]);

  const progressPercent = Math.round(progress * 100);
  const paginationReady = isEbookPaginationReady(pageInfo, sectionPageCounts);
  const pageLabel = paginationReady ? formatEbookPageLabel(pageInfo, sectionPageCounts) : '';
  const progressTickId = `ebook-progress-ticks-${article.id}`;
  const readerArticle = {
    title: articleDisplayTitle(article),
    byline: article.byline || article.ebook.metadata.fileName,
    excerpt: statusMessage,
    content: '',
  };
  const pageAnnotations = useMemo(() => {
    const visibleIds = new Set(boxes.map((box) => box.annotationId).filter(Boolean));
    return annotations.filter((annotation) => visibleIds.has(annotation.id));
  }, [annotations, boxes]);
  const readerActions = buildSourceReaderAppActions({
    articleId: article.id,
    annotation: {
      onAddComment: addComment,
      onAnnotationLayoutChange: recalculateActiveConnection,
      onClearActiveAnnotation: () => onOpenAnnotation(null),
      onCreateAnnotation: createAnnotation,
      onDeleteAnnotation: deleteAnnotation,
      onDeleteComment: deleteComment,
      onFocusAnnotation: openAnnotation,
      onHighlightClick: handleHighlightClick,
      onNavigateAnnotation: navigateAnnotation,
      onResolveAnnotationNavigation: resolveAnnotationNavigation,
      onScrollToHighlight: focusPageAnnotation,
    },
    chat: readerChat.actions,
    selection: {
      onCancelComposer: cancelComposer,
      onClearSelection: clearSelection,
      onCloseHighlightChoice: () => setHighlightChoice(null),
      onCopySelection: copySelection,
      onMouseUp: () => undefined,
      onAskSelection: askSelection,
      onOpenComposer: openComposer,
    },
    shell: {
      onClose,
      onCloseFloatingPanels: () => {
        setSettingsOpen(false);
      },
      onCloseResponsivePanels: () => {
        setTocOpen(false);
      },
      onToggleSettings: () => setSettingsOpen((open) => !open),
      onUpdateReaderSettings: updateEbookReaderSettings,
    },
    toc: {
      onScrollToHeading: goToReaderTocItem,
      onToggleToc: () => setTocOpen((open) => !open),
    },
    onOpenAnnotationDiscussion,
    onRevealReaderChatContext: revealReaderChatContext,
  });
  const readerAppViewProps = buildSourceReaderAppViewProps({
    actions: readerActions,
    agentPlayback: {
      completionBurstKey: ebookCompletionBurstKey,
      dockCompleting: ebookAgentDockCompleting,
      dockItems: ebookAgentDockItems,
      theaterBoxes: agentTheaterBoxes,
      virtualCursors,
    },
    annotations: {
      activeConnection,
      activeId: selectedAnnotationId,
      annotations: pageAnnotations,
      boxes,
      distillationAnimation,
      filteredAnnotations: annotations,
      newAnnotationIds,
      searchBoxes,
      showEmptyNotes: annotations.length === 0,
      temporaryBoxes,
    },
    article: {
      extracted: readerArticle,
      id: article.id,
    },
    refs: {
      articleRef,
      canvasRef,
      noteRefs,
      notesRef: railRef,
      surfaceRef,
    },
    session: sourceReaderSession,
    toc: {
      activeIndex: activeTocIndex,
      annotationStats: tocStats,
      items: readerTocItems,
      open: tocOpen,
    },
    toolbar: {
      articleLeadingVisual: (
        <span className="ebook-toolbar-cover">
          <ArticleBook article={article} />
        </span>
      ),
      controls: (
        <>
          <div
            className={
              paginationReady
                ? 'reader-floating-control-group'
                : 'reader-floating-control-group is-paginating'
            }
          >
            <ReaderTooltip content={t('readerControls.previousPage')} side="bottom">
              <button
                className="reader-icon-button"
                type="button"
                aria-label={t('readerControls.previousPage')}
                disabled={readerState.status !== 'ready' || !paginationReady}
                onClick={goLeft}
              >
                <ChevronLeft size={17} />
              </button>
            </ReaderTooltip>
            <span className="reader-floating-value is-wide">{pageLabel}</span>
            <input
              aria-label={t('readerControls.jumpEbookProgress')}
              className="ebook-progress-slider reader-floating-slider"
              disabled={readerState.status !== 'ready'}
              list={sectionFractions.length > 0 ? progressTickId : undefined}
              max="1"
              min="0"
              step="any"
              style={{ '--ebook-progress-percent': `${progressPercent}%` } as React.CSSProperties}
              type="range"
              value={progress}
              onChange={goToProgress}
            />
            <ReaderTooltip content={t('readerControls.nextPage')} side="bottom">
              <button
                className="reader-icon-button"
                type="button"
                aria-label={t('readerControls.nextPage')}
                disabled={readerState.status !== 'ready' || !paginationReady}
                onClick={goRight}
              >
                <ChevronRight size={17} />
              </button>
            </ReaderTooltip>
            {sectionFractions.length > 0 ? (
              <datalist id={progressTickId}>
                {sectionFractions.map((fraction, index) => (
                  <option value={fraction} key={`${index}-${fraction}`} />
                ))}
              </datalist>
            ) : null}
          </div>
          <ReaderSettingsToolbarControls
            labels={{ articleWidth: labels.articleWidth, fontSize: labels.fontSize }}
            settings={readerSettings}
            onChange={updateEbookReaderSettings}
          />
        </>
      ),
      headerMeta: {
        title: articleDisplayTitle(article),
        byline: article.byline || article.ebook.metadata.fileName,
        hasCover: true,
      },
      readingProgress: progress,
      search: {
        activeMatchIndex: activeSearchMatchIndex,
        limited: searchResult.limited,
        matches: searchResult.matches,
        open: searchOpen,
        query: searchQuery,
        onClose: closeSearch,
        onNextMatch: () => navigateSearchMatch('next'),
        onOpen: () => setSearchOpen(true),
        onPreviousMatch: () => navigateSearchMatch('previous'),
        onQueryChange: setSearchQuery,
      },
    },
    userProfile,
    workspace: sourceReaderWorkspace,
  });

  return (
    <EbookReaderShell
      measureHostRef={measureHostRef}
      readerApp={readerAppViewProps}
      readerState={readerState}
      viewHostRef={viewHostRef}
      onReaderKeyDown={handleReaderKeyDown}
    />
  );
}
