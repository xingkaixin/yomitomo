import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Loading03Icon,
  SearchAddIcon,
} from '@hugeicons/core-free-icons';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { PdfEngine } from '@embedpdf/models';
import {
  createPdfTextAnchor,
  isPdfTextAnchor,
  type Annotation,
  type ArticleRecord,
  type ReaderQuestionContext,
} from '@yomitomo/shared';
import {
  activeTocIndexForOffset,
  selectionActionPosition,
  type HighlightBox,
  type TocItem,
} from '@yomitomo/core';
import { ReaderAppView } from '@yomitomo/reader-ui/reader-app-view';
import { ReaderToolbarSliderPopover } from '@yomitomo/reader-ui/reader-toolbar-controls';
import { ReaderTooltip } from '@yomitomo/reader-ui/reader-component-primitives';
import { readerDesktopEmbeddedBundleStyles } from '@yomitomo/reader-ui/reader-styles';
import { selectionActionShortcut } from '@yomitomo/reader-ui/reader-shortcuts';
import type { SourceBookcaseProps } from '../bookcase/app-source-bookcase';
import { useSourceReaderApp } from '../bookcase/use-source-reader-app';
import {
  useReaderPageTurnKeys,
  type ReaderPageTurnDirection,
} from '../../shell/use-reader-page-turn-keys';
import { formatPdfHeaderAuthors } from '../../shell/app-article-book';
import {
  pdfiumAnnotationBoxes,
  pdfiumAnnotationNavigationState,
  pdfiumVisibleAnnotations,
  pdfiumPendingSelectionPresentation,
  pdfiumTemporaryBoxes,
} from './pdfium-annotation-layout';
import { pdfiumRectsForTextRange } from './pdfium-geometry';
import {
  pageProgress,
  pdfPageProgressPercent,
} from './app-source-bookcase-pdfium-reading-progress';
import { pdfiumTocAnnotationStats } from './pdfium-text-document';
import { createPdfiumSourceReaderController } from './app-source-bookcase-pdfium-controller';
import { EmbedPdfSelectionBridge } from './app-source-bookcase-pdfium-selection-bridge';
import type { PdfOpenTrace } from './app-source-bookcase-pdfium-open-trace';
import { usePdfiumPageMetrics } from './app-source-bookcase-pdfium-page-metrics';
import { usePdfiumVirtualReading } from './app-source-bookcase-pdfium-virtual-reading';
import { usePdfiumDocumentText } from './app-source-bookcase-pdfium-document-text';
import { usePdfiumReadingProgress } from './app-source-bookcase-pdfium-reading-progress';
import { usePdfiumNavigation } from './app-source-bookcase-pdfium-navigation';
import { useSourceReaderAppView } from '../bookcase/use-source-reader-app-view';
import { usePdfiumDocumentSource } from './use-pdfium-document-source';
import { usePdfiumPlugins } from './use-pdfium-plugins';
import { usePdfiumSelectionAdjustment } from './use-pdfium-selection-adjustment';
import { usePdfiumHighlightHitTesting } from './use-pdfium-highlight-hit-testing';
import { usePdfiumAgentAnnotationPlayback } from './use-pdfium-agent-annotation-playback';
import { suppressPdfiumContinuousTextSelectionEvent } from './app-source-bookcase-pdfium-selection-events';
import { debugPdfLayout } from './pdfium-layout-debug';
import { usePdfiumReaderLayout } from './use-pdfium-reader-layout';
import { usePdfiumOpenLifecycle } from './use-pdfium-open-lifecycle';

type PdfArticleRecord = ArticleRecord & { pdf: NonNullable<ArticleRecord['pdf']> };
type PdfiumBookcaseProps = SourceBookcaseProps<PdfArticleRecord>;
type PdfiumLoadedDocument = NonNullable<
  NonNullable<ReturnType<typeof useDocumentState>>['document']
>;

export function PdfiumBookcase({
  annotationActions: { onArticleChange, onFocusedAnnotation, onOpenAnnotation },
  articleActions,
  content: { agents, annotations: articleAnnotations, article, userProfile },
  presentation: {
    distillationAnimation,
    messageSendShortcut,
    settings,
    selectionActionShortcuts,
    uiLanguage,
  },
  readerControl: { focusAnnotationId, onClose, selectedAnnotationId },
}: PdfiumBookcaseProps) {
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
            {!loadError && !engineError ? (
              <HugeiconsIcon icon={Loading03Icon} className="is-spinning" size={18} />
            ) : null}
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
                          article: articleActions,
                          onClose,
                          onArticleChange,
                          onFocusedAnnotation,
                          onOpenAnnotation,
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
                  <HugeiconsIcon icon={Loading03Icon} className="is-spinning" size={18} />
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
    article: PdfiumBookcaseProps['articleActions'];
    onClose: PdfiumBookcaseProps['readerControl']['onClose'];
    onArticleChange: PdfiumBookcaseProps['annotationActions']['onArticleChange'];
    onFocusedAnnotation: PdfiumBookcaseProps['annotationActions']['onFocusedAnnotation'];
    onOpenAnnotation: PdfiumBookcaseProps['annotationActions']['onOpenAnnotation'];
  };
  document: {
    documentId: string;
    engine: PdfEngine;
    openTrace: PdfOpenTrace;
    pageCount: number;
  };
  source: {
    agents: PdfiumBookcaseProps['content']['agents'];
    annotations: PdfiumBookcaseProps['content']['annotations'];
    article: PdfArticleRecord;
    distillationAnimation: PdfiumBookcaseProps['presentation']['distillationAnimation'];
    focusAnnotationId: PdfiumBookcaseProps['readerControl']['focusAnnotationId'];
    messageSendShortcut: PdfiumBookcaseProps['presentation']['messageSendShortcut'];
    selectedAnnotationId: PdfiumBookcaseProps['readerControl']['selectedAnnotationId'];
    settings: PdfiumBookcaseProps['presentation']['settings'];
    selectionActionShortcuts: PdfiumBookcaseProps['presentation']['selectionActionShortcuts'];
    uiLanguage: PdfiumBookcaseProps['presentation']['uiLanguage'];
    userProfile: PdfiumBookcaseProps['content']['userProfile'];
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
    article: articleActions,
    onClose,
    onArticleChange,
    onFocusedAnnotation,
    onOpenAnnotation,
  } = actions;
  const { mergeArticleAgentAnnotation, saveArticleReadingProgress } = articleActions;
  const {
    items: tocItems,
    open: tocOpen,
    onClose: onCloseToc,
    onSetItems: onSetTocItems,
    onToggle: onToggleToc,
  } = toc;
  const { t } = useTranslation();
  const documentState = useDocumentState(documentId);
  const { provides: zoomControls } = useZoom(documentId);
  const [agentTheaterBoxes, setAgentTheaterBoxes] = useState<HighlightBox[]>([]);
  const zoom = documentState?.scale || 1;
  const loadedDocument = documentState?.document ?? undefined;
  const pdfBaseWidth = useMemo(() => {
    const pages = loadedDocument?.pages;
    if (!pages || pages.length === 0) return 0;
    return pages.reduce((max, page) => Math.max(max, page.size.width), 0);
  }, [loadedDocument]);
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
    onSaveArticleReadingProgress: saveArticleReadingProgress,
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
  const sourceReaderApp = useSourceReaderApp({
    articleActions,
    createAgentAnnotationAdapter: ({ isCurrentArticle, setStatusMessage }) =>
      createPdfiumSourceReaderController({
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
        setStatusMessage,
        startAgentDock: (agent) => startPdfiumAgentDock(agent),
        startVirtualReading: (agent, anchor) => startPdfiumVirtualReading(agent, anchor),
      }),
    getArticleText: currentArticleText,
    messageSendShortcut,
    selectionActionShortcuts,
    settings,
    session: {
      agents,
      annotations: articleAnnotations,
      article,
      clearPendingOnArticleChange: true,
      clearPendingOnDeleteAnnotation: true,
      onArticleChange,
      uiLanguage,
      onOpenAnnotation,
      userProfile,
    },
  });
  const {
    canvasRef,
    handleRef: readerSurfaceRef,
    railRef: notesRef,
    viewportRef: surfaceRef,
  } = sourceReaderApp.surface;
  const {
    annotationRailViewportHeight,
    annotationRailViewportWidth,
    pageMetrics,
    pageMetricsRef,
    schedulePageMetricsUpdate,
    updatePageMetrics,
  } = usePdfiumPageMetrics({ canvasRef, pageCount });
  const {
    askSelection,
    isCurrentArticle,
    newAnnotationIds,
    session: sourceReaderSession,
    setStatusMessage,
    statusMessage,
    workspace: sourceReaderWorkspace,
  } = sourceReaderApp;
  const { annotations, annotationsRef, annotationAgents, applyAnnotations } = sourceReaderSession;
  const pdfiumVirtualReading = usePdfiumVirtualReading({
    annotationAgents,
    canvasRef,
    currentPage,
    onClearTheaterBoxes: () => setAgentTheaterBoxes([]),
    pageMetricsRef,
  });
  const {
    agentDockCompleting,
    agentDockItems,
    clearAgentAnnotationPlayback,
    finishPdfiumAgentDock,
    finishPdfiumVirtualReading,
    startPdfiumAgentDock,
    startPdfiumVirtualReading,
    virtualCursors,
  } = pdfiumVirtualReading;
  const pdfiumAgentPlayback = usePdfiumAgentAnnotationPlayback({
    annotationAgents,
    annotationsRef,
    applyAnnotations,
    article,
    canvasRef,
    isCurrentArticle,
    mergeArticleAgentAnnotation,
    onOpenAnnotation,
    pageMetricsRef,
    setAgentTheaterBoxes,
    updatePageMetrics,
    virtualReading: pdfiumVirtualReading,
  });
  const { actionShortcuts, selection } = sourceReaderWorkspace;
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
  const pendingSelectionPresentation = useMemo(() => {
    const anchor = selectionAction?.anchor;
    const canvas = canvasRef.current;
    if (!selectionAction || !anchor || !isPdfTextAnchor(anchor) || !canvas) return null;
    return pdfiumPendingSelectionPresentation(
      selectionAction,
      pageMetrics[anchor.pageIndex],
      canvas.getBoundingClientRect(),
      userProfile.id,
    );
  }, [canvasRef, pageMetrics, selectionAction, userProfile.id]);
  const visibleTemporaryBoxes = selectionAction
    ? (pendingSelectionPresentation?.boxes ?? [])
    : temporaryBoxes;
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
  const { annotationRailLayout, disableAutoZoom } = usePdfiumReaderLayout({
    annotationCount: annotations.length,
    articleId: article.id,
    canvasRef,
    documentScale: documentState?.scale,
    notesRef,
    pageMetrics,
    pdfBaseWidth,
    requestZoom: zoomControls ? (scale) => zoomControls.requestZoom(scale) : undefined,
    schedulePageMetricsUpdate,
    surfaceRef,
    viewportHeight: annotationRailViewportHeight,
    viewportWidth: annotationRailViewportWidth,
    visibleAnnotationCount: visiblePdfAnnotations.length,
    zoom,
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

  usePdfiumOpenLifecycle({
    annotationCount: annotations.length,
    articleId: article.id,
    articlePageCount: article.pdf.metadata.pageCount,
    boxCount: boxes.length,
    clearAgentAnnotationPlayback,
    currentPage,
    initialPageNumber,
    loadedDocumentPageCount: documentState?.document?.pageCount,
    markInitialPageReady,
    markPdfiumFirstPageReady,
    openTrace,
    pageMetrics,
    resetPdfiumTextDocument,
    restoringInitialPage,
    schedulePageMetricsUpdate,
    scroll,
  });

  useEffect(() => {
    clearAnnotationUiState();
  }, [article.id, clearAnnotationUiState]);

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
      askSelection(selectionAction, readerQuestionContext);
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
  }

  function showStatusMessage(message: string) {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(''), 1800);
  }

  const revealPdfiumSearchMatch = useCallback(
    async (match: { id: string; start: number; end: number }) => {
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
      return rects.map((rect, index) => {
        return {
          id: `${match.id}-${index}`,
          top: metric.top + rect.y * metric.height,
          left: metric.left + rect.x * metric.width,
          width: Math.max(1, rect.width * metric.width),
          height: Math.max(2, rect.height * metric.height),
        };
      });
    },
    [
      currentPage,
      engine,
      jumpToPdfiumPage,
      loadedDocument,
      pageMetrics,
      pdfTextDocument,
      schedulePageMetricsUpdate,
    ],
  );

  function enqueuePdfiumAgentAnnotationPlayback(articleId: string, annotation: Annotation) {
    return pdfiumAgentPlayback.enqueue(articleId, annotation);
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

  const pdfHeaderByline = formatPdfHeaderAuthors(article.pdf.metadata.author || '');
  const { viewProps: readerAppViewProps } = useSourceReaderAppView({
    app: sourceReaderApp,
    adapter: {
      navigation: {
        onNavigateAnnotation: (annotationId) => scrollToAnnotation(annotationId),
        onResolveAnnotationNavigation: () =>
          pdfiumAnnotationNavigationState(annotations, selectedAnnotationId, currentPage),
        onScrollToHighlight: scrollToAnnotation,
        onScrollToHeading: scrollToTocItem,
      },
      onHighlightClick: handleHighlightClick,
      onAnnotationLayoutChange: handleAnnotationLayoutChange,
      onRevealReaderChatContext: revealReaderChatContext,
      questionContext: readerQuestionContext,
      search: {
        externalPreparing: pdfTextIndexPreparing,
        revealSearchMatch: revealPdfiumSearchMatch,
        text: pdfTextDocument?.text || '',
      },
      selection: {
        onMouseUp: () => undefined,
        onSelectionHandleDrag: updatePdfiumSelectionAdjustment,
        onSelectionHandleDragEnd: finishPdfiumSelectionAdjustment,
        onSelectionHandleDragStart: startPdfiumSelectionAdjustment,
      },
    },
    agentPlayback: {
      dockCompleting: agentDockCompleting,
      dockItems: agentDockItems,
      theaterBoxes: agentTheaterBoxes,
      virtualCursors,
    },
    annotations: {
      activeId: selectedAnnotationId,
      annotations,
      boxes,
      distillationAnimation,
      filteredAnnotations: visiblePdfAnnotations,
      newAnnotationIds,
      railLayoutOverride: annotationRailLayout,
      temporaryBoxes: visibleTemporaryBoxes,
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
    shell: {
      onClose,
      onCloseFloatingPanels: onCloseToc,
      onCloseResponsivePanels: onCloseToc,
      onToggleSettings: () => undefined,
      settingsOpen: false,
      showSettings: false,
    },
    toc: {
      activeIndex: activeTocIndex,
      annotationStats: tocStats,
      items: tocItems,
      open: tocOpen,
      onClose: onCloseToc,
      onToggle: onToggleToc,
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
                <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
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
                <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
              </button>
            </ReaderTooltip>
          </div>
          <ReaderToolbarSliderPopover
            icon={<HugeiconsIcon icon={SearchAddIcon} size={16} />}
            label={t('readerControls.pdfZoom')}
            max={200}
            min={50}
            step={5}
            unit="%"
            value={Math.round(zoom * 100)}
            onChange={(value) => {
              disableAutoZoom();
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
    },
    userProfile,
  });
  const visibleReaderAppViewProps = selectionAction
    ? {
        ...readerAppViewProps,
        selection: {
          ...readerAppViewProps.selection,
          selectionAction: pendingSelectionPresentation?.action ?? null,
        },
      }
    : readerAppViewProps;

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
          <HugeiconsIcon icon={Loading03Icon} className="is-spinning" size={18} />
          <span>{t('pdfReader.restoringPage', { page: initialPageNumber })}</span>
        </div>
      ) : null}
      {statusMessage ? (
        <div className="pdf-reader-status" role="status">
          <span>{statusMessage}</span>
        </div>
      ) : null}
      <ReaderAppView {...visibleReaderAppViewProps} ref={readerSurfaceRef} />
    </section>
  );
}
