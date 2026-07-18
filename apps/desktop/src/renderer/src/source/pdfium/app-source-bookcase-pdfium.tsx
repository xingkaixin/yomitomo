import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import { EmbedPDF, useDocumentState } from '@embedpdf/core/react';
import { DocumentContent } from '@embedpdf/plugin-document-manager/react';
import {
  GlobalPointerProvider,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react';
import { RenderLayer } from '@embedpdf/plugin-render/react';
import { Scroller } from '@embedpdf/plugin-scroll/react';
import { SelectionLayer } from '@embedpdf/plugin-selection/react';
import { Viewport } from '@embedpdf/plugin-viewport/react';
import { useZoom } from '@embedpdf/plugin-zoom/react';
import { ChevronLeft, ChevronRight, LoaderCircle, ZoomIn } from 'lucide-react';
import type { PdfEngine } from '@embedpdf/models';
import {
  createPdfTextAnchor,
  isPdfTextAnchor,
  type AgentReadingPlanItem,
  type Annotation,
  type ArticleRecord,
  type ReaderQuestionContext,
} from '@yomitomo/shared';
import {
  activeTocIndexForOffset,
  createUserAnnotation,
  mergeAgentAnnotationAsThought,
  selectionActionPosition,
  type HighlightBox,
  type TocItem,
} from '@yomitomo/core';
import { ReaderAppView } from '@yomitomo/reader-ui/reader-app-view';
import { ReaderToolbarSliderPopover } from '@yomitomo/reader-ui/reader-toolbar-controls';
import { ReaderTooltip } from '@yomitomo/reader-ui/reader-component-primitives';
import { readerDesktopEmbeddedBundleStyles } from '@yomitomo/reader-ui/reader-styles';
import { animateTheaterHighlight, sleep } from '@yomitomo/reader-ui/reader-animation';
import { selectionActionShortcut } from '@yomitomo/reader-ui/reader-shortcuts';
import type { SourceBookcaseProps } from '../bookcase/app-source-bookcase-shared';
import { useSourceActiveConnection } from '../bookcase/use-source-active-connection';
import { useRecentAnnotationFeedback } from '../bookcase/use-recent-annotation-feedback';
import { buildSourceReaderAppActions } from '../bookcase/source-reader-app-actions';
import { buildSourceReaderAppViewProps } from '../bookcase/source-reader-app-view-props';
import {
  useReaderPageTurnKeys,
  type ReaderPageTurnDirection,
} from '../../shell/use-reader-page-turn-keys';
import { useSourceReaderSession } from '../bookcase/use-source-reader-session';
import { formatPdfHeaderAuthors } from '../../shell/app-article-book';
import {
  pdfiumAnnotationBoxes,
  pdfiumAnnotationIsVisible,
  pdfiumAnnotationNavigationState,
  pdfiumAnnotationTheaterBoxes,
  pdfiumVisibleAnnotations,
  pdfiumAnnotationAgentName,
  pdfiumAnnotationRailLayout,
  computeAutoPdfZoom,
  firstVisiblePdfPageWidth,
  pageProgress,
  pdfiumRailWheelHasLocalScrollTarget,
  pdfPageProgressPercent,
  pdfiumTemporaryBoxes,
  pdfiumTocAnnotationStats,
  pdfiumScrollSnapshotCanConsumeDelta,
  pdfiumRectsForTextRange,
  pdfiumWheelDeltaPixels,
  type PdfTextDocument,
} from './app-source-bookcase-pdfium-utils';
import { createPdfiumSourceReaderController } from './app-source-bookcase-pdfium-controller';
import { EmbedPdfSelectionBridge } from './app-source-bookcase-pdfium-selection-bridge';
import {
  recordPdfOpenTiming,
  recordPdfOpenTimingOnce,
  type PdfOpenTrace,
} from './app-source-bookcase-pdfium-open-trace';
import { usePdfiumPageMetrics } from './app-source-bookcase-pdfium-page-metrics';
import { usePdfiumVirtualReading } from './app-source-bookcase-pdfium-virtual-reading';
import { usePdfiumDocumentText } from './app-source-bookcase-pdfium-document-text';
import { usePdfiumReadingProgress } from './app-source-bookcase-pdfium-reading-progress';
import { usePdfiumNavigation } from './app-source-bookcase-pdfium-navigation';
import { useSourceReaderWorkspace } from '../bookcase/use-source-reader-workspace';
import { useReaderSearchNavigation } from '../bookcase/use-reader-search-navigation';
import { usePdfiumDocumentSource } from './use-pdfium-document-source';
import { usePdfiumPlugins } from './use-pdfium-plugins';
import { usePdfiumSelectionAdjustment } from './use-pdfium-selection-adjustment';
import { usePdfiumHighlightHitTesting } from './use-pdfium-highlight-hit-testing';
import { suppressPdfiumContinuousTextSelectionEvent } from './app-source-bookcase-pdfium-selection-events';
import {
  debugComputedStyle,
  debugPdfLayout,
  debugRect,
  pdfLayoutDebugEnabled,
} from './pdfium-layout-debug';

type PdfArticleRecord = ArticleRecord & { pdf: NonNullable<ArticleRecord['pdf']> };
type PdfiumLoadedDocument = NonNullable<
  NonNullable<ReturnType<typeof useDocumentState>>['document']
>;

export function PdfiumBookcase({
  agents,
  annotations: articleAnnotations,
  article,
  distillationAnimation,
  focusAnnotationId,
  messageSendShortcut,
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
  onMergeArticleAgentAnnotation,
  onSaveArticleAnnotation,
  onSaveArticleComment,
  onSaveArticleReadingProgress,
  onSaveArticleReaderChatState,
}: SourceBookcaseProps & { article: PdfArticleRecord }) {
  const { t } = useTranslation();
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const { buffer, engine, engineError, isLoading, loadError, openTrace } =
    usePdfiumDocumentSource(article);
  const documentId = `embedpdf-${article.id}`;
  const plugins = usePdfiumPlugins({ article, buffer, documentId });

  const status =
    loadError ||
    (engineError ? engineError.message : '') ||
    (isLoading || !engine || !buffer ? t('pdfReader.initializing') : '');

  return (
    <section className="source-bookcase source-pdf-reader-shell source-pdfium-spike-shell">
      <div className="pdf-reader-main pdfium-spike-main">
        {status ? (
          <div
            className={`pdf-reader-status${loadError || engineError ? ' is-error' : ''}`}
            role="status"
          >
            {!loadError && !engineError ? <LoaderCircle className="is-spinning" size={18} /> : null}
            <span>{status}</span>
          </div>
        ) : null}
        {engine && buffer ? (
          <EmbedPDF engine={engine} plugins={plugins}>
            {({ activeDocumentId }) =>
              activeDocumentId ? (
                <DocumentContent documentId={activeDocumentId}>
                  {({ isLoaded, isError, documentState }) =>
                    isLoaded ? (
                      <PdfiumDocument
                        actions={{
                          onClose,
                          onDeleteArticleAnnotation,
                          onDeleteArticleComment,
                          onFocusedAnnotation,
                          onOpenAnnotationDiscussion,
                          onOpenAnnotation,
                          onMergeArticleAgentAnnotation,
                          onSaveArticleAnnotation,
                          onSaveArticleComment,
                          onSaveArticleReadingProgress,
                          onSaveArticleReaderChatState,
                        }}
                        document={{
                          documentId: activeDocumentId,
                          engine,
                          openTrace,
                          pageCount:
                            documentState.document?.pageCount || article.pdf.metadata.pageCount,
                        }}
                        source={{
                          agents,
                          annotations: articleAnnotations,
                          article,
                          distillationAnimation,
                          focusAnnotationId,
                          messageSendShortcut,
                          selectedAnnotationId,
                          settings,
                          selectionActionShortcuts,
                          uiLanguage,
                          userProfile,
                        }}
                        toc={{
                          items: tocItems,
                          open: tocOpen,
                          onClose: () => setTocOpen(false),
                          onSetItems: setTocItems,
                          onToggle: () => setTocOpen((open) => !open),
                        }}
                      />
                    ) : isError ? (
                      <div className="pdf-reader-status is-error" role="status">
                        <span>{t('pdfReader.embedLoadFailed')}</span>
                      </div>
                    ) : null
                  }
                </DocumentContent>
              ) : (
                <div className="pdf-reader-status" role="status">
                  <LoaderCircle className="is-spinning" size={18} />
                  <span>{t('pdfReader.loadingEmbedDocument')}</span>
                </div>
              )
            }
          </EmbedPDF>
        ) : null}
      </div>
    </section>
  );
}

type PdfiumDocumentProps = {
  actions: {
    onClose: SourceBookcaseProps['onClose'];
    onDeleteArticleAnnotation: SourceBookcaseProps['onDeleteArticleAnnotation'];
    onDeleteArticleComment: SourceBookcaseProps['onDeleteArticleComment'];
    onFocusedAnnotation: SourceBookcaseProps['onFocusedAnnotation'];
    onOpenAnnotationDiscussion: SourceBookcaseProps['onOpenAnnotationDiscussion'];
    onOpenAnnotation: SourceBookcaseProps['onOpenAnnotation'];
    onMergeArticleAgentAnnotation: SourceBookcaseProps['onMergeArticleAgentAnnotation'];
    onSaveArticleAnnotation: SourceBookcaseProps['onSaveArticleAnnotation'];
    onSaveArticleComment: SourceBookcaseProps['onSaveArticleComment'];
    onSaveArticleReadingProgress: SourceBookcaseProps['onSaveArticleReadingProgress'];
    onSaveArticleReaderChatState: SourceBookcaseProps['onSaveArticleReaderChatState'];
  };
  document: {
    documentId: string;
    engine: PdfEngine;
    openTrace: PdfOpenTrace;
    pageCount: number;
  };
  source: {
    agents: SourceBookcaseProps['agents'];
    annotations: SourceBookcaseProps['annotations'];
    article: PdfArticleRecord;
    distillationAnimation: SourceBookcaseProps['distillationAnimation'];
    focusAnnotationId: SourceBookcaseProps['focusAnnotationId'];
    messageSendShortcut: SourceBookcaseProps['messageSendShortcut'];
    selectedAnnotationId: SourceBookcaseProps['selectedAnnotationId'];
    settings: SourceBookcaseProps['settings'];
    selectionActionShortcuts: SourceBookcaseProps['selectionActionShortcuts'];
    uiLanguage: SourceBookcaseProps['uiLanguage'];
    userProfile: SourceBookcaseProps['userProfile'];
  };
  toc: {
    items: TocItem[];
    open: boolean;
    onClose: () => void;
    onSetItems: (items: TocItem[]) => void;
    onToggle: () => void;
  };
};

function PdfiumDocument({ actions, document, source, toc }: PdfiumDocumentProps) {
  const {
    agents,
    annotations: articleAnnotations,
    article,
    distillationAnimation,
    focusAnnotationId,
    messageSendShortcut,
    selectedAnnotationId,
    settings,
    selectionActionShortcuts,
    uiLanguage,
    userProfile,
  } = source;
  const { documentId, engine, openTrace, pageCount } = document;
  const {
    onClose,
    onDeleteArticleAnnotation,
    onDeleteArticleComment,
    onFocusedAnnotation,
    onOpenAnnotationDiscussion,
    onOpenAnnotation,
    onMergeArticleAgentAnnotation,
    onSaveArticleAnnotation,
    onSaveArticleComment,
    onSaveArticleReadingProgress,
    onSaveArticleReaderChatState,
  } = actions;
  const {
    items: tocItems,
    open: tocOpen,
    onClose: onCloseToc,
    onSetItems: onSetTocItems,
    onToggle: onToggleToc,
  } = toc;
  const { t } = useTranslation();
  const articleRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const notesRef = useRef<HTMLElement | null>(null);
  const noteRefs = useRef(new Map<string, HTMLElement>());
  const { markAnnotationCreated, newAnnotationIds } = useRecentAnnotationFeedback(
    article.id,
    settings,
  );
  const recordedOpenPhasesRef = useRef(new Set<string>());
  const agentAnnotationPlaybackQueueRef = useRef(Promise.resolve());
  const documentState = useDocumentState(documentId);
  const { provides: zoomControls } = useZoom(documentId);
  const [statusMessage, setStatusMessage] = useState('');
  const [agentTheaterBoxes, setAgentTheaterBoxes] = useState<HighlightBox[]>([]);
  const [layoutPageWidth, setLayoutPageWidth] = useState(0);
  const [searchBoxes, setSearchBoxes] = useState<HighlightBox[]>([]);
  const clearSearchBoxes = useCallback(() => setSearchBoxes([]), []);
  const resetLayoutPageWidthOnNextMetricsRef = useRef(true);
  const {
    annotationRailViewportHeight,
    annotationRailViewportWidth,
    pageMetrics,
    pageMetricsRef,
    schedulePageMetricsUpdate,
    updatePageMetrics,
  } = usePdfiumPageMetrics({ canvasRef, pageCount });
  const zoom = documentState?.scale || 1;
  const loadedDocument = documentState?.document ?? undefined;
  const pdfBaseWidth = useMemo(() => {
    const pages = loadedDocument?.pages;
    if (!pages || pages.length === 0) return 0;
    return pages.reduce((max, page) => Math.max(max, page.size.width), 0);
  }, [loadedDocument]);
  // 自适应初始缩放：手动调缩放后置 false，退出自适应、不再随 resize 回弹。
  const [autoZoomEnabled, setAutoZoomEnabled] = useState(true);
  const appliedAutoZoomRef = useRef<number | null>(null);
  // zoomControls 每次 render 是新引用，放进 effect 依赖会和 requestZoom 形成渲染死循环，故用 ref 旁路。
  const zoomControlsRef = useRef(zoomControls);
  zoomControlsRef.current = zoomControls;
  const {
    currentPage,
    initialPageNumber,
    jumpToPdfiumPage,
    markInitialPageReady,
    restoringInitialPage,
    scroll,
  } = usePdfiumReadingProgress({
    article,
    documentId,
    documentReady: Boolean(loadedDocument),
    openTrace,
    pageCount,
    onSaveArticleReadingProgress,
  });
  const {
    currentArticleText,
    extractPdfiumPageText,
    markPdfiumFirstPageReady,
    pdfTextDocument,
    pdfTextIndexPreparing,
    resetPdfiumTextDocument,
  } = usePdfiumDocumentText({
    articleId: article.id,
    currentPageIndex: currentPage - 1,
    document: loadedDocument,
    engine,
    openTrace,
  });
  const sourceReaderSession = useSourceReaderSession({
    agents,
    agentAnnotationAdapter: createPdfiumSourceReaderController({
      enqueueAgentAnnotationPlayback: (articleId, annotation) =>
        enqueuePdfiumAgentAnnotationPlayback(articleId, annotation),
      extractPageText: (pageIndex) => extractPdfiumPageText(pageIndex),
      finishAgentDock: (agentId, succeeded) => finishPdfiumAgentDock(agentId, succeeded),
      finishVirtualReading: (agentId, suffix) => finishPdfiumVirtualReading(agentId, suffix),
      getDocument: () => documentState?.document ?? undefined,
      getPageGeometry: (pdfDocument, page) =>
        engine
          .getPageGeometry(
            pdfDocument as PdfiumLoadedDocument,
            page as PdfiumLoadedDocument['pages'][number],
          )
          .toPromise(),
      getPdfTextDocument: () => pdfTextDocument,
      isCurrentArticle,
      pageGeometriesForReadingPlan: (pdfDocument, textDocument, readingPlan) =>
        pdfiumPageGeometriesForReadingPlan(
          pdfDocument as PdfiumLoadedDocument,
          textDocument,
          readingPlan,
        ),
      setStatusMessage,
      startAgentDock: (agent) => startPdfiumAgentDock(agent),
      startVirtualReading: (agent, anchor) => startPdfiumVirtualReading(agent, anchor),
    }),
    annotations: articleAnnotations,
    article,
    ignoreStaleArticleUpdates: true,
    uiLanguage,
    getArticleText: currentArticleText,
    onOpenAnnotation,
    onDeleteArticleAnnotation,
    onDeleteArticleComment,
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
    saveAnnotation,
  } = sourceReaderSession;
  const {
    agentDockCompleting,
    agentDockItems,
    clearAgentAnnotationPlayback,
    completionBurstKey,
    finishPdfiumAgentDock,
    finishPdfiumVirtualCursor,
    finishPdfiumVirtualReading,
    pdfiumOffscreenDirection,
    pdfiumReadingFallbackCursor,
    startPdfiumAgentDock,
    startPdfiumVirtualReading,
    stopPdfiumVirtualReading,
    updatePdfiumVirtualCursor,
    virtualCursors,
  } = usePdfiumVirtualReading({
    annotationAgents,
    canvasRef,
    currentPage,
    onClearTheaterBoxes: () => setAgentTheaterBoxes([]),
    pageMetricsRef,
  });
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
    readerChat,
    selection,
    updateReaderSettings: updatePdfReaderSettings,
  } = sourceReaderWorkspace;
  const searchNavigation = useReaderSearchNavigation(pdfTextDocument?.text || '', {
    externalPreparing: pdfTextIndexPreparing,
    onClose: clearSearchBoxes,
  });
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
    cancelComposer,
    copySelection,
    requestSelectionCopy,
    openComposer,
  } = selection;
  const {
    preparePdfiumSelectionAdjustmentSource,
    startPdfiumSelectionAdjustment,
    updatePdfiumSelectionAdjustment,
    finishPdfiumSelectionAdjustment,
  } = usePdfiumSelectionAdjustment({
    articleId: article.id,
    canvasRef,
    contributorId: userProfile.id,
    document: loadedDocument,
    engine,
    extractPageText: extractPdfiumPageText,
    pageMetricsRef,
    selectionAction,
    setSelectionAction,
    setTemporaryBoxes,
  });
  const boxes = useMemo(
    () => pdfiumAnnotationBoxes(annotations, pageMetrics, userProfile, annotationAgents),
    [annotationAgents, annotations, pageMetrics, userProfile],
  );
  const { handleHighlightClick, handlePdfiumCanvasClickCapture } = usePdfiumHighlightHitTesting({
    boxes,
    canvasRef,
    selectionAction,
    composer,
    onOpenAnnotation,
    setHighlightChoice,
  });
  const visiblePdfAnnotations = useMemo(
    () => pdfiumVisibleAnnotations(annotations, boxes),
    [annotations, boxes],
  );
  useEffect(() => {
    const pageWidth = firstVisiblePdfPageWidth(pageMetrics);
    if (!pageWidth) return;
    const shouldReset = resetLayoutPageWidthOnNextMetricsRef.current;
    if (shouldReset) resetLayoutPageWidthOnNextMetricsRef.current = false;
    setLayoutPageWidth((current) => {
      const nextWidth = shouldReset || current <= 0 ? pageWidth : Math.min(current, pageWidth);
      return current === nextWidth ? current : nextWidth;
    });
  }, [pageMetrics]);
  const annotationRailLayout = useMemo(
    () =>
      pdfiumAnnotationRailLayout(
        pageMetrics,
        canvasRef.current,
        annotationRailViewportHeight,
        annotationRailViewportWidth,
        layoutPageWidth || undefined,
      ),
    [annotationRailViewportHeight, annotationRailViewportWidth, layoutPageWidth, pageMetrics],
  );
  useEffect(() => {
    if (!autoZoomEnabled) return;
    const scale = computeAutoPdfZoom({
      viewportWidth: annotationRailViewportWidth,
      baseWidth: pdfBaseWidth,
    });
    if (scale == null || appliedAutoZoomRef.current === scale) return;
    appliedAutoZoomRef.current = scale;
    zoomControlsRef.current?.requestZoom(scale);
  }, [autoZoomEnabled, annotationRailViewportWidth, pdfBaseWidth]);
  useEffect(() => {
    if (!annotationRailLayout) return;
    schedulePageMetricsUpdate();
  }, [annotationRailLayout?.mode, schedulePageMetricsUpdate]);
  useEffect(() => {
    debugPdfLayout('debug-enabled', {
      articleId: article.id,
    });
  }, [article.id]);
  useEffect(() => {
    if (!annotationRailLayout || !pdfLayoutDebugEnabled()) return;
    const pageWidth = firstVisiblePdfPageWidth(pageMetrics);
    const noteWidths = Array.from(noteRefs.current.values())
      .slice(0, 4)
      .map((note) => Math.round(note.getBoundingClientRect().width));
    debugPdfLayout('layout', {
      layoutPageWidth,
      mode: annotationRailLayout.mode,
      noteWidths,
      pageWidth,
      railWidth: annotationRailLayout.railWidth,
      rightRailLeft: annotationRailLayout.rightRailLeft,
      viewportWidth: annotationRailViewportWidth,
      zoom,
    });
  }, [
    annotationRailLayout,
    annotationRailViewportWidth,
    layoutPageWidth,
    noteRefs,
    pageMetrics,
    zoom,
  ]);
  useEffect(() => {
    if (!pdfLayoutDebugEnabled()) return;

    const frame = window.requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const surface = surfaceRef.current;
      const rail = notesRef.current;
      const empty = canvas?.querySelector<HTMLElement>('.reader-empty') ?? null;
      const viewport = canvas?.querySelector<HTMLElement>('.pdfium-spike-viewport') ?? null;
      const firstPage = canvas?.querySelector<HTMLElement>('[data-pdfium-page-index]') ?? null;
      const readerApp = canvas?.closest<HTMLElement>('.reader-app') ?? null;
      const readerMain = canvas?.closest<HTMLElement>('.reader-main') ?? null;
      const pdfReaderMain = canvas?.closest<HTMLElement>('.pdf-reader-main') ?? null;
      const shell = canvas?.closest<HTMLElement>('.source-pdf-reader-shell') ?? null;

      debugPdfLayout('empty-state', {
        annotationCount: annotations.length,
        appClasses: readerApp?.className ?? null,
        canvasRect: debugRect(canvas?.getBoundingClientRect()),
        emptyComputed: debugComputedStyle(empty),
        emptyExists: Boolean(empty),
        emptyRect: debugRect(empty?.getBoundingClientRect()),
        firstPageRect: debugRect(firstPage?.getBoundingClientRect()),
        layout: annotationRailLayout ?? null,
        layoutPageWidth,
        pageMetricKeys: Object.keys(pageMetrics),
        pdfReaderMainComputed: debugComputedStyle(pdfReaderMain),
        pdfReaderMainRect: debugRect(pdfReaderMain?.getBoundingClientRect()),
        railComputed: debugComputedStyle(rail),
        railRect: debugRect(rail?.getBoundingClientRect()),
        readerMainComputed: debugComputedStyle(readerMain),
        readerMainRect: debugRect(readerMain?.getBoundingClientRect()),
        shellComputed: debugComputedStyle(shell),
        shellRect: debugRect(shell?.getBoundingClientRect()),
        surfaceRect: debugRect(surface?.getBoundingClientRect()),
        viewportHeight: annotationRailViewportHeight,
        viewportRect: debugRect(viewport?.getBoundingClientRect()),
        viewportWidth: annotationRailViewportWidth,
        visibleAnnotationCount: visiblePdfAnnotations.length,
        zoom,
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    annotationRailLayout,
    annotationRailViewportHeight,
    annotationRailViewportWidth,
    annotations.length,
    canvasRef,
    layoutPageWidth,
    notesRef,
    pageMetrics,
    surfaceRef,
    visiblePdfAnnotations.length,
    zoom,
  ]);
  useEffect(() => {
    const rail = notesRef.current;
    if (!rail) return;
    const handleWheel = (event: WheelEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const viewport =
        canvasRef.current?.querySelector<HTMLElement>('.pdfium-spike-viewport') ?? null;
      if (!viewport) return;

      const delta = pdfiumWheelDeltaPixels(event, viewport.clientHeight);
      const viewportCanScroll =
        pdfiumScrollSnapshotCanConsumeDelta(
          {
            clientSize: viewport.clientHeight,
            scrollOffset: viewport.scrollTop,
            scrollSize: viewport.scrollHeight,
          },
          delta.y,
        ) ||
        pdfiumScrollSnapshotCanConsumeDelta(
          {
            clientSize: viewport.clientWidth,
            scrollOffset: viewport.scrollLeft,
            scrollSize: viewport.scrollWidth,
          },
          delta.x,
        );
      if (!viewportCanScroll || pdfiumRailWheelHasLocalScrollTarget(target, rail, delta)) return;

      event.preventDefault();
      viewport.scrollBy({ left: delta.x, top: delta.y, behavior: 'auto' });
    };

    rail.addEventListener('wheel', handleWheel, { passive: false });
    return () => rail.removeEventListener('wheel', handleWheel);
  }, [canvasRef, notesRef]);
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
  const { scrollToAnnotation, scrollToTocItem } = usePdfiumNavigation({
    annotations,
    documentId,
    focusAnnotationId,
    pageCount,
    scroll,
    onCloseToc,
    onFocusedAnnotation,
    onOpenAnnotation,
    onSetTocItems,
  });
  const activeTocIndex = useMemo(
    () => activeTocIndexForOffset(tocItems, currentPage - 1),
    [currentPage, tocItems],
  );

  useEffect(() => {
    recordedOpenPhasesRef.current = new Set();
  }, [article.id]);

  const restoreMetricsWaitLoggedRef = useRef(false);

  useEffect(() => {
    restoreMetricsWaitLoggedRef.current = false;
  }, [article.id]);

  useEffect(() => {
    const loadedPdfDocument = documentState?.document;
    if (!loadedPdfDocument) return;
    recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'document_ready', {
      pageCount: loadedPdfDocument.pageCount,
    });
  }, [documentState?.document, openTrace]);

  useEffect(() => {
    resetPdfiumTextDocument();
    clearAgentAnnotationPlayback();
  }, [article.id, article.pdf.metadata.pageCount, resetPdfiumTextDocument]);

  useEffect(() => {
    const visiblePageCount = Object.keys(pageMetrics).length;
    if (visiblePageCount === 0) return;
    const expectedPageIndex = initialPageNumber - 1;
    const waitingForInitialRestorePage = restoringInitialPage && expectedPageIndex > 0;
    if (waitingForInitialRestorePage && !pageMetrics[expectedPageIndex]) {
      if (!restoreMetricsWaitLoggedRef.current) {
        restoreMetricsWaitLoggedRef.current = true;
        recordPdfOpenTiming(openTrace, 'initial_restore_metrics_wait', {
          currentPage,
          targetPage: initialPageNumber,
          visiblePageCount,
          visiblePageIndexes: Object.keys(pageMetrics).map(Number),
        });
      }
      return;
    }
    if (waitingForInitialRestorePage) {
      recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'initial_restore_metrics_ready', {
        currentPage,
        targetPage: initialPageNumber,
        visiblePageCount,
        visiblePageIndexes: Object.keys(pageMetrics).map(Number),
      });
    }
    markInitialPageReady();
    markPdfiumFirstPageReady();
    recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'first_page_ready', {
      visiblePageCount,
    });
    recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'interactive_ready', {
      visiblePageCount,
    });
  }, [
    currentPage,
    initialPageNumber,
    markInitialPageReady,
    markPdfiumFirstPageReady,
    openTrace,
    pageMetrics,
    restoringInitialPage,
  ]);

  useEffect(() => {
    const unsubscribe = scroll?.onScroll?.(() => {
      schedulePageMetricsUpdate();
    });
    return () => {
      unsubscribe?.();
    };
  }, [schedulePageMetricsUpdate, scroll]);

  useEffect(() => {
    if (!documentState?.scale) return;
    resetLayoutPageWidthOnNextMetricsRef.current = true;
    schedulePageMetricsUpdate();
  }, [documentState?.scale, schedulePageMetricsUpdate]);

  useEffect(() => {
    if (boxes.length > 0 || annotations.length === 0) return;
    schedulePageMetricsUpdate();
  }, [annotations.length, boxes.length, schedulePageMetricsUpdate]);

  useEffect(() => {
    return () => {
      clearAgentAnnotationPlayback();
    };
  }, []);

  useEffect(() => {
    clearAnnotationUiState();
  }, [article.id, clearAnnotationUiState]);

  useEffect(() => {
    searchNavigation.resetSearch();
  }, [article.id, searchNavigation.resetSearch]);

  useEffect(() => {
    if (
      searchNavigation.preparing ||
      !searchNavigation.open ||
      !searchNavigation.activeMatch ||
      !pdfTextDocument ||
      !loadedDocument
    ) {
      setSearchBoxes([]);
      return;
    }

    let cancelled = false;
    void revealPdfiumSearchMatch(searchNavigation.activeMatch).then((nextBoxes) => {
      if (!cancelled) setSearchBoxes(nextBoxes);
    });
    return () => {
      cancelled = true;
    };
  }, [
    currentPage,
    loadedDocument,
    pageMetrics,
    pdfTextDocument,
    searchNavigation.activeMatch,
    searchNavigation.open,
    searchNavigation.preparing,
    zoom,
  ]);

  const turnPdfPageFromKeyboard = useCallback(
    (direction: ReaderPageTurnDirection) => {
      if (direction === 'left') {
        if (currentPage > 1) scroll?.scrollToPreviousPage('smooth');
        return;
      }
      if (currentPage < pageCount) scroll?.scrollToNextPage('smooth');
    },
    [currentPage, pageCount, scroll],
  );

  useReaderPageTurnKeys({
    enabled: Boolean(scroll && documentState?.document),
    onTurnPage: turnPdfPageFromKeyboard,
  });

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (!selectionAction || composer) return;
    const shortcut = selectionActionShortcut(event, actionShortcuts);
    if (!shortcut) return;
    event.preventDefault();
    if (shortcut === 'copy') {
      requestSelectionCopy();
      return;
    }
    if (shortcut === 'ask') {
      askSelection(selectionAction);
      return;
    }
    openComposer(selectionAction);
  }

  function handleSelection(anchor: ReturnType<typeof createPdfTextAnchor> | null) {
    if (!anchor?.exact.trim()) {
      // Embedpdf clears its selection on pointerdown/focus changes; while our
      // selection menu or composer owns the highlight, blank-click clearing is
      // handled by the reader shell pointer capture instead.
      if (!selectionAction && !composer) clearSelection();
      return;
    }
    const metric = pageMetrics[anchor.pageIndex];
    const lastRect = anchor.rects[anchor.rects.length - 1];
    const canvas = canvasRef.current;
    if (!metric || !lastRect || !canvas) return;
    const lastDomRect = new DOMRect(
      metric.left + lastRect.x * metric.width,
      metric.top + lastRect.y * metric.height,
      Math.max(1, lastRect.width * metric.width),
      Math.max(2, lastRect.height * metric.height),
    );
    openSelectionAction(
      {
        ...selectionActionPosition(lastDomRect, canvas.getBoundingClientRect()),
        anchor,
        adjustable: true,
      },
      pdfiumTemporaryBoxes(anchor, metric, userProfile.id),
    );
    void preparePdfiumSelectionAdjustmentSource(anchor.pageIndex);
  }

  function askSelection(action: { anchor: Annotation['anchor'] }) {
    readerChat.askSelection(readerQuestionContext(action.anchor));
    clearSelection();
  }

  function readerQuestionContext(anchor: Annotation['anchor']): ReaderQuestionContext {
    return {
      sourceType: 'pdf',
      quote: anchor.exact,
      title: article.title,
      locationLabel: isPdfTextAnchor(anchor)
        ? i18next.t('pdfReader.pageLabel', { page: anchor.pageIndex + 1 })
        : undefined,
      anchor,
      nearbyText: isPdfTextAnchor(anchor)
        ? pdfTextDocument?.pages.find((page) => page.pageIndex === anchor.pageIndex)?.pageText
        : undefined,
    };
  }

  function revealReaderChatContext(context: ReaderQuestionContext) {
    const anchor = context.anchor;
    if (!anchor || !isPdfTextAnchor(anchor)) return;
    scroll?.scrollToPage({
      pageNumber: anchor.pageIndex + 1,
      behavior: 'smooth',
    });
  }

  function handleAnnotationLayoutChange() {
    debugPdfLayout('annotation-layout-change', {
      mode: annotationRailLayout?.mode,
      railWidth: annotationRailLayout?.railWidth,
      zoom,
    });
    recalculateActiveConnection();
  }

  function isCurrentArticle(articleId: string) {
    return latestArticleRef.current?.id === articleId;
  }

  function showStatusMessage(message: string) {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(''), 1800);
  }

  async function revealPdfiumSearchMatch(match: { id: string; start: number; end: number }) {
    if (!pdfTextDocument || !loadedDocument) return [];
    const page = pdfTextDocument.pages.find(
      (item) => match.start >= item.bodyStart && match.end <= item.bodyEnd,
    );
    if (!page) return [];

    if (currentPage !== page.pageIndex + 1) {
      jumpToPdfiumPage(page.pageIndex + 1);
      schedulePageMetricsUpdate();
      return [];
    }

    const metric = pageMetrics[page.pageIndex];
    const pdfPage = loadedDocument.pages[page.pageIndex];
    if (!metric || !pdfPage) {
      schedulePageMetricsUpdate();
      return [];
    }

    const geometry = await engine.getPageGeometry(loadedDocument, pdfPage).toPromise();
    const rects = pdfiumRectsForTextRange(
      geometry,
      match.start - page.bodyStart,
      match.end - page.bodyStart,
      pdfPage.size.width,
      pdfPage.size.height,
    );
    return rects.flatMap((rect, index) => {
      const box = {
        id: `${match.id}-${index}`,
        annotationId: '__search__',
        contributorId: '__search__',
        color: 'var(--reader-search-highlight-active)',
        top: metric.top + rect.y * metric.height,
        left: metric.left + rect.x * metric.width,
        width: Math.max(1, rect.width * metric.width),
        height: Math.max(2, rect.height * metric.height),
      };
      return [box];
    });
  }

  function enqueuePdfiumAgentAnnotationPlayback(articleId: string, annotation: Annotation) {
    agentAnnotationPlaybackQueueRef.current = agentAnnotationPlaybackQueueRef.current
      .catch(() => undefined)
      .then(() => playPdfiumAgentAnnotation(articleId, annotation));
    return agentAnnotationPlaybackQueueRef.current;
  }

  async function playPdfiumAgentAnnotation(articleId: string, annotation: Annotation) {
    if (latestArticleRef.current?.id !== articleId || !isPdfTextAnchor(annotation.anchor)) {
      await appendAgentAnnotationToArticle(articleId, annotation);
      return;
    }

    const cursorAgent = annotationAgents.find(
      (agent) => agent.id === annotation.agentId || agent.username === annotation.agentUsername,
    );
    const cursorId =
      cursorAgent?.id || annotation.agentId || annotation.agentUsername || annotation.id;
    updatePageMetrics();
    let theaterBoxes = pdfiumAnnotationTheaterBoxes(annotation, pageMetricsRef.current);
    const firstBox = theaterBoxes[0];
    const lastBox = theaterBoxes[theaterBoxes.length - 1];
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!firstBox || !lastBox || !canvasRect) {
      const direction = pdfiumOffscreenDirection(
        annotation.anchor.pageIndex,
        pageMetricsRef.current,
      );
      if (direction) {
        const cursor = pdfiumReadingFallbackCursor(
          cursorId,
          cursorAgent,
          annotation.anchor.pageIndex,
          i18next.t('source.agentStatus.addingThought', {
            name: pdfiumAnnotationAgentName(annotation),
          }),
          0,
        );
        if (cursor) {
          updatePdfiumVirtualCursor(cursorId, {
            ...cursor,
            label: i18next.t('source.agentStatus.addingThoughtOffscreen', {
              direction: i18next.t(`source.agentStatus.direction.${direction}`),
              name: pdfiumAnnotationAgentName(annotation),
            }),
            offscreen: direction,
          });
          await sleep(700);
        }
      }
      await appendAgentAnnotationToArticle(articleId, annotation);
      finishPdfiumVirtualReading(cursorId);
      return;
    }

    const label = i18next.t('source.agentStatus.addingThought', {
      name: pdfiumAnnotationAgentName(annotation),
    });
    stopPdfiumVirtualReading(cursorId);
    updatePdfiumVirtualCursor(cursorId, {
      id: cursorId,
      visible: true,
      x: canvasRect.left + firstBox.left,
      y: canvasRect.top + firstBox.top + firstBox.height / 2,
      label,
      offscreen: null,
      agent: cursorAgent,
    });
    await sleep(260);

    await animateTheaterHighlight(theaterBoxes, annotation.anchor.exact.length, (nextBoxes) => {
      const cursorBox = nextBoxes[nextBoxes.length - 1];
      if (cursorBox) {
        updatePdfiumVirtualCursor(cursorId, {
          id: cursorId,
          visible: true,
          x: canvasRect.left + cursorBox.left + cursorBox.width,
          y: canvasRect.top + cursorBox.top + cursorBox.height / 2,
          label,
          offscreen: null,
          agent: cursorAgent,
        });
      }
      setAgentTheaterBoxes(nextBoxes);
    });

    await appendAgentAnnotationToArticle(articleId, annotation);
    setAgentTheaterBoxes([]);
    updatePdfiumVirtualCursor(cursorId, {
      id: cursorId,
      visible: true,
      x: canvasRect.left + lastBox.left + lastBox.width,
      y: canvasRect.top + lastBox.top + lastBox.height / 2,
      label: i18next.t('source.agentStatus.withSuffix', {
        name: pdfiumAnnotationAgentName(annotation),
        suffix: i18next.t('source.agentStatus.thoughtAdded'),
      }),
      offscreen: null,
      agent: cursorAgent,
    });
    await sleep(360);
    finishPdfiumVirtualCursor(cursorId);
  }

  async function createAnnotationFromComposer(note: string) {
    if (!composer) return;
    const currentComposer = composer;
    if (!latestArticleRef.current) return;
    cancelComposer();
    const annotation = createUserAnnotation(currentComposer.anchor, userProfile, note);
    await saveAnnotation(annotation);
    markAnnotationCreated(annotation.id);
    onOpenAnnotation(annotation.id);
  }

  async function appendAgentAnnotationToArticle(articleId: string, annotation: Annotation) {
    let activeId = annotation.id;
    if (latestArticleRef.current?.id === articleId) {
      const result = mergeAgentAnnotationAsThought(annotationsRef.current, annotation);
      activeId = result.activeId;
      applyAnnotations(result.annotations);
      onOpenAnnotation(
        pdfiumAnnotationIsVisible(result.activeId, result.annotations, pageMetricsRef.current)
          ? result.activeId
          : null,
      );
    }
    const persisted = await onMergeArticleAgentAnnotation?.(articleId, annotation);
    if (persisted) activeId = persisted.activeId;
    if (persisted && latestArticleRef.current?.id === articleId) {
      applyAnnotations(persisted.patch.article.annotations, persisted.patch.article.updatedAt);
      onOpenAnnotation(
        pdfiumAnnotationIsVisible(
          persisted.activeId,
          persisted.patch.article.annotations,
          pageMetricsRef.current,
        )
          ? persisted.activeId
          : null,
      );
    }
    return activeId;
  }

  async function pdfiumPageGeometriesForReadingPlan(
    pdfDocument: PdfiumLoadedDocument,
    textDocument: PdfTextDocument,
    readingPlan: AgentReadingPlanItem[],
  ) {
    const pageIndexes = new Set<number>();
    for (const item of readingPlan) {
      for (const page of textDocument.pages) {
        if (page.bodyEnd <= item.sectionStart || page.bodyStart >= item.sectionEnd) continue;
        pageIndexes.add(page.pageIndex);
      }
    }

    const entries = await Promise.all(
      Array.from(pageIndexes).map(async (pageIndex) => {
        const page = pdfDocument.pages[pageIndex];
        if (!page) return null;
        const geometry = await engine.getPageGeometry(pdfDocument, page).toPromise();
        return [pageIndex, { geometry, width: page.size.width, height: page.size.height }] as const;
      }),
    );
    return new Map(entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)));
  }

  const tocStats = useMemo(
    () =>
      pdfiumTocAnnotationStats(
        tocItems,
        annotations,
        userProfile,
        annotationAgents,
        pdfTextDocument,
      ),
    [annotationAgents, annotations, pdfTextDocument, tocItems, userProfile],
  );

  const readerActions = buildSourceReaderAppActions({
    articleId: article.id,
    annotation: {
      onAddComment: addComment,
      onAnnotationLayoutChange: handleAnnotationLayoutChange,
      onClearActiveAnnotation: () => onOpenAnnotation(null),
      onCreateAnnotation: createAnnotationFromComposer,
      onDeleteAnnotation: deleteAnnotation,
      onDeleteComment: deleteComment,
      onFocusAnnotation: onOpenAnnotation,
      onHighlightClick: handleHighlightClick,
      onNavigateAnnotation: (annotationId) => scrollToAnnotation(annotationId),
      onResolveAnnotationNavigation: () =>
        pdfiumAnnotationNavigationState(annotations, selectedAnnotationId, currentPage),
      onScrollToHighlight: scrollToAnnotation,
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
      onSelectionHandleDrag: updatePdfiumSelectionAdjustment,
      onSelectionHandleDragEnd: finishPdfiumSelectionAdjustment,
      onSelectionHandleDragStart: startPdfiumSelectionAdjustment,
    },
    shell: {
      onClose,
      onCloseFloatingPanels: () => {
        onCloseToc();
      },
      onCloseResponsivePanels: onCloseToc,
      onToggleSettings: () => undefined,
      onUpdateReaderSettings: updatePdfReaderSettings,
    },
    toc: {
      onScrollToHeading: scrollToTocItem,
      onToggleToc,
    },
    onOpenAnnotationDiscussion,
    onRevealReaderChatContext: revealReaderChatContext,
  });
  const pdfHeaderByline = formatPdfHeaderAuthors(article.pdf.metadata.author || '');
  const readerAppViewProps = buildSourceReaderAppViewProps({
    actions: readerActions,
    agentPlayback: {
      completionBurstKey,
      dockCompleting: agentDockCompleting,
      dockItems: agentDockItems,
      theaterBoxes: agentTheaterBoxes,
      virtualCursors,
    },
    annotations: {
      activeConnection,
      activeId: selectedAnnotationId,
      annotations,
      boxes,
      distillationAnimation,
      filteredAnnotations: visiblePdfAnnotations,
      newAnnotationIds,
      railLayoutOverride: annotationRailLayout,
      searchBoxes,
      temporaryBoxes,
    },
    article: {
      content: (
        <div
          className="pdfium-spike-canvas"
          onClickCapture={handlePdfiumCanvasClickCapture}
          onDoubleClickCapture={suppressPdfiumContinuousTextSelectionEvent}
          onMouseDownCapture={suppressPdfiumContinuousTextSelectionEvent}
        >
          <GlobalPointerProvider documentId={documentId}>
            <Viewport className="pdfium-spike-viewport" documentId={documentId}>
              <Scroller
                documentId={documentId}
                renderPage={({ pageIndex, rotatedWidth, rotatedHeight }) => (
                  <div
                    className="pdfium-spike-page-shell"
                    data-pdfium-page-index={pageIndex}
                    style={{ width: rotatedWidth, height: rotatedHeight }}
                  >
                    <PagePointerProvider
                      className="pdfium-spike-page"
                      documentId={documentId}
                      pageIndex={pageIndex}
                    >
                      <RenderLayer
                        documentId={documentId}
                        pageIndex={pageIndex}
                        style={{ pointerEvents: 'none' }}
                      />
                      <SelectionLayer
                        documentId={documentId}
                        pageIndex={pageIndex}
                        textStyle={{ background: 'rgb(77 155 114 / 0.18)' }}
                      />
                    </PagePointerProvider>
                  </div>
                )}
              />
            </Viewport>
          </GlobalPointerProvider>
        </div>
      ),
      extracted: {
        title: article.pdf.metadata.title || article.title,
        byline: article.pdf.metadata.author,
        content: '',
      },
      id: article.id,
    },
    refs: {
      articleRef,
      canvasRef,
      noteRefs,
      notesRef,
      surfaceRef,
    },
    session: sourceReaderSession,
    toc: {
      activeIndex: activeTocIndex,
      annotationStats: tocStats,
      items: tocItems,
      open: tocOpen,
    },
    toolbar: {
      controls: (
        <>
          <div className="reader-floating-control-group">
            <ReaderTooltip content={t('readerControls.previousPage')} side="bottom">
              <button
                aria-label={t('readerControls.previousPage')}
                className="reader-icon-button"
                disabled={currentPage <= 1}
                type="button"
                onClick={() => scroll?.scrollToPreviousPage('smooth')}
              >
                <ChevronLeft size={16} />
              </button>
            </ReaderTooltip>
            <span className="reader-floating-value is-wide">
              {currentPage} / {pageCount}
            </span>
            <input
              aria-label={t('readerControls.jumpPdfPage')}
              className="ebook-progress-slider reader-floating-slider pdfium-page-slider"
              max={pageCount}
              min="1"
              step="1"
              style={
                {
                  '--ebook-progress-percent': `${pdfPageProgressPercent(currentPage, pageCount)}%`,
                } as React.CSSProperties
              }
              type="range"
              value={currentPage}
              onChange={(event) => jumpToPdfiumPage(Number(event.currentTarget.value))}
            />
            <ReaderTooltip content={t('readerControls.nextPage')} side="bottom">
              <button
                aria-label={t('readerControls.nextPage')}
                className="reader-icon-button"
                disabled={currentPage >= pageCount}
                type="button"
                onClick={() => scroll?.scrollToNextPage('smooth')}
              >
                <ChevronRight size={16} />
              </button>
            </ReaderTooltip>
          </div>
          <ReaderToolbarSliderPopover
            icon={<ZoomIn size={16} />}
            label={t('readerControls.pdfZoom')}
            max={200}
            min={50}
            step={5}
            unit="%"
            value={Math.round(zoom * 100)}
            onChange={(value) => {
              setAutoZoomEnabled(false);
              zoomControls?.requestZoom(value / 100);
            }}
          />
        </>
      ),
      headerMeta: {
        title: article.pdf.metadata.title || article.title,
        byline: pdfHeaderByline,
      },
      readingProgress: pageProgress(currentPage - 1, pageCount),
      search: searchNavigation.search,
    },
    userProfile,
    workspace: sourceReaderWorkspace,
  });

  return (
    <section
      className={[
        'source-pdfium-spike-reader',
        restoringInitialPage ? 'is-restoring-initial-page' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onKeyDown={handleKeyDown}
    >
      <style>{readerDesktopEmbeddedBundleStyles}</style>
      <EmbedPdfSelectionBridge
        documentId={documentId}
        engine={engine}
        onInvalidSelection={showStatusMessage}
        onSelection={handleSelection}
      />
      {restoringInitialPage ? (
        <div className="pdf-reader-status" role="status">
          <LoaderCircle className="is-spinning" size={18} />
          <span>{t('pdfReader.restoringPage', { page: initialPageNumber })}</span>
        </div>
      ) : null}
      {statusMessage ? (
        <div className="pdf-reader-status" role="status">
          <span>{statusMessage}</span>
        </div>
      ) : null}
      <ReaderAppView {...readerAppViewProps} />
    </section>
  );
}
