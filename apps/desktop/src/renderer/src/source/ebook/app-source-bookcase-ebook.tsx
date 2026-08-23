import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Annotation, ReaderQuestionContext } from '@yomitomo/shared';
import {
  activeTocIndexForOffset,
  annotationIdsAtHighlightPoint,
  type HighlightBox,
  type TocItem,
} from '@yomitomo/core';
import { sleep } from '@yomitomo/reader-ui/reader-animation';
import { buildTocAnnotationStats } from '@yomitomo/reader-ui/reader-annotations';
import { ReaderTooltip } from '@yomitomo/reader-ui/reader-component-primitives';
import { ReaderSettingsToolbarControls } from '@yomitomo/reader-ui/reader-toolbar-controls';
import {
  ebookHighlightAnnotationsSignature,
  type EbookBoxUpdateReason,
} from './ebook-annotation-layout';
import { ebookHasStableSectionChapterMapping, ebookTocItemsForReader } from './ebook-content';
import {
  currentFoliateContent,
  formatEbookPageLabel,
  isEbookPageNavigationReady,
  isEbookPaginationReady,
  recordEbookPageTurnTrace,
  type EbookPageTurnTrace,
  type FoliateViewElement,
} from './ebook-foliate-view';
import { ebookArticleText } from './ebook-text-anchor';
import { EbookReaderShell } from './app-source-ebook-reader-shell';
import { playEbookAgentAnnotationPlayback } from './app-source-ebook-agent-playback';
import { recordRendererPerformanceTiming } from '../../shell/app-renderer-performance';
import type { EbookBookcaseProps } from '../bookcase/app-source-bookcase';
import { useEbookAgentVirtualReading } from './use-ebook-agent-virtual-reading';
import { useEbookFoliateView } from './use-ebook-foliate-view';
import { useEbookBilingualTranslation } from './use-ebook-bilingual-translation';
import { useEbookReaderBoxes } from './use-ebook-reader-boxes';
import { useEbookSelection } from './use-ebook-selection';
import { useEbookAnnotationNavigation } from './use-ebook-annotation-navigation';
import {
  useReaderPageTurnKeys,
  type ReaderPageTurnDirection,
} from '../../shell/use-reader-page-turn-keys';
import { ebookSpreadAvailableWidth, ebookSpreadLayout } from './app-source-bookcase-ebook-utils';
import { ArticleBook } from '../../shell/app-article-book';
import { articleDisplayTitle } from '../../reading-library/app-reading-library-utils';
import { createEbookSourceReaderController } from './app-source-bookcase-ebook-controller';
import { useSourceReaderApp } from '../bookcase/use-source-reader-app';
import { useSourceReaderAppView } from '../bookcase/use-source-reader-app-view';
import { appendAgentAnnotationToArticle as appendPersistedAgentAnnotation } from '../bookcase/append-agent-annotation-to-article';

function cssPixelValue(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function EbookBookcase({
  annotationActions: { onArticleChange, onFocusedAnnotation, onOpenAnnotation },
  articleActions,
  content: { agents, annotations: articleAnnotations, article, userProfile },
  presentation: {
    distillationAnimation,
    messageSendShortcut,
    readerTheme,
    settings,
    selectionActionShortcuts,
    uiLanguage,
  },
  readerControl: { focusAnnotationId, onClose, selectedAnnotationId },
}: EbookBookcaseProps) {
  const { mergeArticleAgentAnnotation, saveArticleReadingProgress } = articleActions;
  const { t } = useTranslation();
  const scheduleEbookBoxUpdateRef = useRef<(reason: EbookBoxUpdateReason) => void>(() => {});
  const pageTurnTraceRef = useRef<EbookPageTurnTrace | null>(null);
  const beforeEbookPageTurnRef = useRef<(trace: EbookPageTurnTrace) => void>(() => {});
  const attachFoliateDocumentListenersRef = useRef<(view: FoliateViewElement | null) => void>(
    () => {},
  );
  const cleanupFoliateDocumentListenersRef = useRef<() => void>(() => {});
  const attachFoliateTranslationRef = useRef<(view: FoliateViewElement | null) => void>(() => {});
  const cleanupFoliateTranslationRef = useRef<() => void>(() => {});
  const scheduleEbookBoxUpdate = useCallback((reason: EbookBoxUpdateReason) => {
    scheduleEbookBoxUpdateRef.current(reason);
  }, []);
  const beforeEbookPageTurn = useCallback((trace: EbookPageTurnTrace) => {
    beforeEbookPageTurnRef.current(trace);
  }, []);
  const attachFoliateDocumentListenersBridge = useCallback((view: FoliateViewElement | null) => {
    attachFoliateDocumentListenersRef.current(view);
    attachFoliateTranslationRef.current(view);
  }, []);
  const cleanupFoliateDocumentListenersBridge = useCallback(() => {
    cleanupFoliateDocumentListenersRef.current();
    cleanupFoliateTranslationRef.current();
  }, []);
  const sourceReaderApp = useSourceReaderApp({
    articleActions,
    beforeOpenAnnotation,
    createAgentAnnotationAdapter: ({ isCurrentArticle, setStatusMessage }) =>
      createEbookSourceReaderController({
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
    getArticleText: currentArticleText,
    messageSendShortcut,
    selectionActionShortcuts,
    settings,
    session: {
      agents,
      annotations: articleAnnotations,
      article,
      onArticleChange,
      clearPendingOnArticleChange: true,
      clearPendingOnDeleteAnnotation: true,
      uiLanguage,
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
      onOpenAnnotation,
      userProfile,
    },
  });
  const {
    canvasRef,
    handleRef: readerSurfaceRef,
    viewportRef: surfaceRef,
  } = sourceReaderApp.surface;
  const {
    askSelection,
    closeSettings,
    closeToc,
    isCurrentArticle,
    newAnnotationIds,
    openAnnotation,
    session: sourceReaderSession,
    setStatusMessage,
    statusMessage,
    workspace: sourceReaderWorkspace,
  } = sourceReaderApp;
  const { annotations, annotationsRef, annotationAgents, applyAnnotations } = sourceReaderSession;
  const [annotatingAgentIds, setAnnotatingAgentIds] = useState<string[]>([]);

  const {
    actionShortcuts,
    labels,
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
    setSelectionAction,
    setTemporaryBoxes,
    requestSelectionCopy,
    openComposer,
  } = selection;
  const ebookText = useMemo(() => ebookArticleText(article), [article]);
  const articleAnnotationSignature = useMemo(
    () => ebookHighlightAnnotationsSignature(articleAnnotations, userProfile, annotationAgents),
    [annotationAgents, articleAnnotations, userProfile],
  );
  const ebookBoxesRef = useRef<HighlightBox[]>([]);
  const articleAnnotationSignatureRef = useRef({
    articleId: article.id,
    signature: articleAnnotationSignature,
  });
  const [spreadLayout, setSpreadLayout] = useState(() =>
    ebookSpreadLayout({ canvasWidth: 0, contentWidth: readerSettings.contentWidth }),
  );
  const spreadLayoutTraceRef = useRef('');
  useEffect(() => {
    const layoutElement = surfaceRef.current ?? canvasRef.current;
    if (!layoutElement) return;
    const update = () => {
      const rect = layoutElement.getBoundingClientRect();
      if (rect.width <= 0) return;
      const style = window.getComputedStyle(layoutElement);
      const layoutWidth = ebookSpreadAvailableWidth({
        layoutWidth: rect.width,
        paddingLeft: cssPixelValue(style.paddingLeft),
        paddingRight: cssPixelValue(style.paddingRight),
      });
      const nextSpreadLayout = ebookSpreadLayout({
        canvasWidth: layoutWidth,
        contentWidth: readerSettings.contentWidth,
      });
      const traceKey = [
        readerSettings.contentWidth,
        nextSpreadLayout.columns,
        nextSpreadLayout.railLayout.mode,
        nextSpreadLayout.railLayout.articleWidth,
      ].join(':');
      if (spreadLayoutTraceRef.current !== traceKey) {
        spreadLayoutTraceRef.current = traceKey;
        recordRendererPerformanceTiming('ebook_spread_layout', {
          articleId: article.id,
          columns: nextSpreadLayout.columns,
          contentWidth: readerSettings.contentWidth,
          layoutSource: layoutElement === surfaceRef.current ? 'surface' : 'canvas',
          layoutWidth: Math.round(layoutWidth),
          measuredWidth: Math.round(rect.width),
          railLayout: nextSpreadLayout.railLayout,
        });
      }
      setSpreadLayout(nextSpreadLayout);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(layoutElement);
    return () => observer.disconnect();
  }, [canvasRef, readerSettings.contentWidth, surfaceRef]);
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
    maxColumnCount: spreadLayout.columns,
    readerTheme,
    readerSettings,
    onSaveArticleReadingProgress: saveArticleReadingProgress,
    onAttachFoliateDocumentListeners: attachFoliateDocumentListenersBridge,
    onBeforePageTurn: beforeEbookPageTurn,
    onCleanupFoliateDocumentListeners: cleanupFoliateDocumentListenersBridge,
    onScheduleEbookBoxUpdate: scheduleEbookBoxUpdate,
    pageTurnTraceRef,
  });
  const handleTranslationLayoutChange = useCallback(
    () => scheduleEbookBoxUpdate('translation'),
    [scheduleEbookBoxUpdate],
  );
  const ebookTranslation = useEbookBilingualTranslation({
    article,
    style: settings?.bilingualTranslationStyle || 'dashedLine',
    targetLanguage: settings?.bilingualTranslationTargetLanguage,
    onLayoutChange: handleTranslationLayoutChange,
  });
  attachFoliateTranslationRef.current = ebookTranslation.attachFoliateDocument;
  cleanupFoliateTranslationRef.current = ebookTranslation.cleanupFoliateDocument;
  const turnPageFromKeyboard = useCallback(
    (direction: ReaderPageTurnDirection) => {
      if (direction === 'left') goLeft();
      else goRight();
    },
    [goLeft, goRight],
  );
  const {
    finishEbookSelectionAdjustment,
    handleFoliateSelection,
    handleFoliateSelectionShortcut,
    startEbookSelectionAdjustment,
    updateEbookSelectionAdjustment,
  } = useEbookSelection({
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
    askSelection: (action) => askSelection(action, readerQuestionContext),
    requestSelectionCopy,
    openComposer,
    openSelectionAction,
    setSelectionAction,
    setTemporaryBoxes,
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
    onFoliateClick: handleFoliateClick,
    onFoliatePointerDown: handleFoliatePointerDown,
    onFoliatePageTurnClick: turnPageFromKeyboard,
    onFoliatePageTurnKey: turnPageFromKeyboard,
    onFoliateSelection: handleFoliateSelection,
    onFoliateSelectionShortcut: handleFoliateSelectionShortcut,
  });
  ebookBoxesRef.current = boxes;
  attachFoliateDocumentListenersRef.current = attachFoliateDocumentListeners;
  cleanupFoliateDocumentListenersRef.current = cleanupFoliateDocumentListeners;
  scheduleEbookBoxUpdateRef.current = scheduleEbookBoxUpdateImpl;
  const ebookNavigation = useEbookAnnotationNavigation({
    annotations,
    annotationsRef,
    article,
    boxes,
    canvasRef,
    ebookText,
    focusAnnotationId,
    onFocusedAnnotation,
    openAnnotation,
    pageInfo,
    scheduleEbookBoxUpdate,
    viewRef,
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
    resetEbookBoxState();
    clearAnnotationUiState();
    setAnnotatingAgentIds([]);
    cleanupEbookAgentTheater();
    setStatusMessage('');
  }, [article.id, cleanupEbookAgentTheater, clearAnnotationUiState, resetEbookBoxState]);

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

  useEffect(
    () => () => {
      cleanupEbookAgentTheater();
    },
    [cleanupEbookAgentTheater],
  );

  function goToReaderTocItem(item: TocItem) {
    const tocItem = tocItems[item.index];
    if (!tocItem) return;
    closeToc();
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
    closeSettings();
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

  function beforeOpenAnnotation() {
    sourceReaderApp.workspace.selection.clearAnnotationUiState();
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
    await ebookNavigation.goToEbookAnchor('reader-chat-context', context.anchor);
  }

  async function appendAgentAnnotationToArticle(articleId: string, annotation: Annotation) {
    return appendPersistedAgentAnnotation({
      annotations: () => annotationsRef.current,
      applyAnnotations,
      isCurrentArticle,
      mergeArticleAgentAnnotation,
      onOpenAnnotation: (annotationId) => {
        if (annotationId) openAnnotation(annotationId);
      },
      articleId,
      annotation,
    });
  }

  function handleHighlightClick(
    annotationId: string,
    event: React.MouseEvent<HTMLButtonElement>,
    visibleAnnotationIds: string[],
  ) {
    openHighlightAtClientPoint(event.clientX, event.clientY, visibleAnnotationIds, annotationId);
  }

  function handleFoliateClick(event: MouseEvent, doc: Document) {
    const docSelection = doc.getSelection();
    if (docSelection && docSelection.rangeCount > 0 && !docSelection.isCollapsed) return false;

    const frame = doc.defaultView?.frameElement;
    if (!(frame instanceof HTMLIFrameElement)) return false;

    const frameRect = frame.getBoundingClientRect();
    return openHighlightAtClientPoint(
      frameRect.left + event.clientX,
      frameRect.top + event.clientY,
    );
  }

  function openHighlightAtClientPoint(
    clientX: number,
    clientY: number,
    preferredAnnotationIds: string[] = [],
    fallbackAnnotationId?: string,
  ) {
    const canvasElement = canvasRef.current;
    if (!canvasElement) {
      if (fallbackAnnotationId) openAnnotation(fallbackAnnotationId);
      return Boolean(fallbackAnnotationId);
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const annotationIds =
      preferredAnnotationIds.length > 0
        ? preferredAnnotationIds
        : annotationIdsAtHighlightPoint(
            ebookBoxesRef.current,
            {
              x: clientX - canvasRect.left,
              y: clientY - canvasRect.top,
            },
            1,
          );
    if (annotationIds.length === 0) return false;

    if (annotationIds.length <= 1) {
      const annotationId = annotationIds[0] || fallbackAnnotationId;
      if (!annotationId) return false;
      openAnnotation(annotationId);
      return true;
    }

    const x = clientX - canvasRect.left + 8;
    setHighlightChoice({
      x: Math.max(8, Math.min(Math.max(8, canvasRect.width - 236), x)),
      y: Math.max(8, clientY - canvasRect.top + 8),
      annotationIds,
    });
    return true;
  }

  async function goToAnnotation(annotationId: string) {
    return ebookNavigation.goToAnnotation(annotationId);
  }

  const progressPercent = Math.round(progress * 100);
  const pageNavigationReady = isEbookPageNavigationReady(pageInfo);
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
  const supportsAnnotationNavigation = ebookHasStableSectionChapterMapping(article);
  const { viewProps: readerAppViewProps } = useSourceReaderAppView({
    app: sourceReaderApp,
    adapter: {
      navigation: {
        onNavigateAnnotation: supportsAnnotationNavigation
          ? ebookNavigation.navigateAnnotation
          : undefined,
        onResolveAnnotationNavigation: supportsAnnotationNavigation
          ? ebookNavigation.resolveAnnotationNavigation
          : undefined,
        onScrollToHighlight: ebookNavigation.focusPageAnnotation,
        onScrollToHeading: goToReaderTocItem,
      },
      onHighlightClick: handleHighlightClick,
      onRevealReaderChatContext: revealReaderChatContext,
      questionContext: readerQuestionContext,
      search: {
        revealSearchMatch: ebookNavigation.revealSearchMatch,
        text: ebookText,
      },
      selection: {
        onMouseUp: () => undefined,
        onSelectionHandleDrag: updateEbookSelectionAdjustment,
        onSelectionHandleDragEnd: finishEbookSelectionAdjustment,
        onSelectionHandleDragStart: startEbookSelectionAdjustment,
      },
    },
    agentPlayback: {
      dockCompleting: ebookAgentDockCompleting,
      dockItems: ebookAgentDockItems,
      theaterBoxes: agentTheaterBoxes,
      virtualCursors,
    },
    annotations: {
      activeId: selectedAnnotationId,
      annotations: pageAnnotations,
      boxes,
      distillationAnimation,
      filteredAnnotations: annotations,
      newAnnotationIds,
      railLayoutOverride: spreadLayout.columns === 2 ? spreadLayout.railLayout : undefined,
      showEmptyNotes: annotations.length === 0,
      temporaryBoxes,
    },
    article: {
      extracted: readerArticle,
      id: article.id,
    },
    shell: { onClose },
    toc: {
      activeIndex: activeTocIndex,
      annotationStats: tocStats,
      items: readerTocItems,
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
                disabled={readerState.status !== 'ready' || !pageNavigationReady}
                onClick={goLeft}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={17} />
              </button>
            </ReaderTooltip>
            <span
              className={
                paginationReady
                  ? 'reader-floating-value is-wide'
                  : 'reader-floating-value is-wide is-paginating'
              }
              aria-busy={!paginationReady}
            >
              {pageLabel}
            </span>
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
                disabled={readerState.status !== 'ready' || !pageNavigationReady}
                onClick={goRight}
              >
                <HugeiconsIcon icon={ArrowRight01Icon} size={17} />
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
          {ebookTranslation.toolbar}
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
    },
    userProfile,
  });

  return (
    <>
      <EbookReaderShell
        isSpread={spreadLayout.columns === 2}
        measureHostRef={measureHostRef}
        readerApp={readerAppViewProps}
        readerSurfaceRef={readerSurfaceRef}
        readerState={readerState}
        viewHostRef={viewHostRef}
        onReaderKeyDown={handleReaderKeyDown}
      />
      {ebookTranslation.dialog}
    </>
  );
}
