import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPluginRegistration } from '@embedpdf/core';
import { EmbedPDF, useDocumentState } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import pdfiumWasmUrl from '@embedpdf/pdfium/pdfium.wasm?url';
import {
  DocumentContent,
  DocumentManagerPluginPackage,
} from '@embedpdf/plugin-document-manager/react';
import {
  GlobalPointerProvider,
  InteractionManagerPluginPackage,
  PagePointerProvider,
} from '@embedpdf/plugin-interaction-manager/react';
import { RenderLayer, RenderPluginPackage } from '@embedpdf/plugin-render/react';
import { Scroller, ScrollPluginPackage } from '@embedpdf/plugin-scroll/react';
import { BookmarkPluginPackage } from '@embedpdf/plugin-bookmark/react';
import { SelectionLayer, SelectionPluginPackage } from '@embedpdf/plugin-selection/react';
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { ZoomPluginPackage, useZoom, ZoomMode } from '@embedpdf/plugin-zoom/react';
import { LoaderCircle } from 'lucide-react';
import type { PdfEngine } from '@embedpdf/models';
import {
  createPdfTextAnchor,
  isPdfTextAnchor,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
  type AgentReadingPlanItem,
  type Annotation,
  type ArticleRecord,
} from '@yomitomo/shared';
import {
  annotationIdsAtHighlightPoint,
  articlePublishedDistillationCount,
  createUserAnnotation,
  selectionActionPosition,
  type HighlightBox,
  type TocItem,
} from '@yomitomo/core';
import { ReaderAppView } from '@yomitomo/reader-ui/reader-app-view';
import { mergeAgentAnnotationAsThought } from '@yomitomo/reader-ui/reader-agent-annotation-playback';
import {
  readerConversationStyles,
  readerDesktopEmbeddedStyles,
  readerStyles,
} from '@yomitomo/reader-ui/reader-styles';
import { animateTheaterHighlight, sleep } from '@yomitomo/reader-ui/reader-animation';
import { getShortcutModifier, selectionActionShortcut } from '@yomitomo/reader-ui/reader-shortcuts';
import {
  articleWithMergedAgentAnnotation,
  rendererPerformanceElapsedMs,
  useDesktopReaderSettings,
  type SourceBookcaseProps,
} from '../bookcase/app-source-bookcase-shared';
import { useSourceActiveConnection } from '../bookcase/use-source-active-connection';
import { useSourceSelectionComposer } from '../bookcase/use-source-selection-composer';
import {
  useReaderPageTurnKeys,
  type ReaderPageTurnDirection,
} from '../../shell/use-reader-page-turn-keys';
import { useSourceReaderSession } from '../bookcase/use-source-reader-session';
import {
  pdfiumAnnotationBoxes,
  pdfiumAnnotationIsVisible,
  pdfiumAnnotationTheaterBoxes,
  pdfiumVisibleAnnotations,
  pdfiumAnnotationAgentName,
  pdfiumAnnotationRailLayout,
  pdfiumTemporaryBoxes,
  pdfiumTocAnnotationStats,
  type PdfAnnotationNavigationState,
  type PdfTextDocument,
} from './app-source-bookcase-pdfium-utils';
import { createPdfiumSourceReaderController } from './app-source-bookcase-pdfium-controller';
import { EmbedPdfSelectionBridge } from './app-source-bookcase-pdfium-selection-bridge';
import {
  pdfOpenTrace,
  pdfiumFontFallback,
  recordPdfOpenTiming,
  recordPdfOpenTimingOnce,
  type PdfOpenTrace,
} from './app-source-bookcase-pdfium-open-trace';
import {
  PdfiumBookcaseToolbar,
  PdfiumDocumentFloatingToolbar,
} from './app-source-bookcase-pdfium-shell';
import { usePdfiumPageMetrics } from './app-source-bookcase-pdfium-page-metrics';
import { usePdfiumVirtualReading } from './app-source-bookcase-pdfium-virtual-reading';
import { usePdfiumDocumentText } from './app-source-bookcase-pdfium-document-text';
import { usePdfiumReadingProgress } from './app-source-bookcase-pdfium-reading-progress';
import { usePdfiumNavigation } from './app-source-bookcase-pdfium-navigation';

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
  selectionActionShortcuts,
  selectedAnnotationId,
  userProfile,
  onFocusedAnnotation,
  onClose,
  onDeleteArticleAnnotation,
  onDeleteArticleComment,
  onOpenAnnotationDiscussion,
  onOpenAnnotation,
  onSaveArticle,
  onSaveArticleReadingProgress,
  onUpdateArticle,
}: SourceBookcaseProps & { article: PdfArticleRecord }) {
  const openTraceRef = useRef<PdfOpenTrace | null>(null);
  const recordedOpenPhasesRef = useRef(new Set<string>());
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState('');
  const [annotationNavigation, setAnnotationNavigation] = useState<PdfAnnotationNavigationState>({
    previousId: null,
    nextId: null,
  });
  const navigateAnnotationRef = useRef<(annotationId: string) => void>(() => undefined);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  if (!openTraceRef.current || openTraceRef.current.articleId !== article.id) {
    openTraceRef.current = pdfOpenTrace(article.id);
    recordedOpenPhasesRef.current = new Set();
  }
  const openTrace = openTraceRef.current;
  const {
    engine,
    error: engineError,
    isLoading,
  } = usePdfiumEngine({
    wasmUrl: pdfiumWasmUrl,
    worker: false,
    fontFallback: pdfiumFontFallback,
  });

  useEffect(() => {
    recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'open_requested', {
      fileSize: article.pdf.metadata.fileSize,
      pageCount: article.pdf.metadata.pageCount,
    });
  }, [article.id, article.pdf.metadata.fileSize, article.pdf.metadata.pageCount, openTrace]);

  useEffect(() => {
    if (!engine || isLoading) return;
    recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'engine_init_done');
  }, [engine, isLoading, openTrace]);

  useEffect(() => {
    if (!engineError) return;
    recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'engine_init_error', {
      message: engineError.message,
    });
  }, [engineError, openTrace]);

  useEffect(() => {
    let cancelled = false;
    const fileReadStartedAt = performance.now();
    setBuffer(null);
    setLoadError('');
    recordPdfOpenTiming(openTrace, 'file_read_start', {
      fileSize: article.pdf.metadata.fileSize,
    });

    void window.yomitomoDesktop
      .readPdfFile(article.id)
      .then((data) => {
        const copyStartedAt = performance.now();
        const nextBuffer = data.slice(0);
        if (!cancelled) {
          setBuffer(nextBuffer);
          recordPdfOpenTiming(openTrace, 'file_read_done', {
            byteLength: nextBuffer.byteLength,
            copyDurationMs: rendererPerformanceElapsedMs(copyStartedAt),
            durationMs: rendererPerformanceElapsedMs(fileReadStartedAt),
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'PDF 读取失败';
          setLoadError(message);
          recordPdfOpenTiming(openTrace, 'file_read_error', {
            durationMs: rendererPerformanceElapsedMs(fileReadStartedAt),
            message,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [article.id, article.pdf.metadata.fileSize, openTrace]);

  const documentId = `embedpdf-${article.id}`;
  const plugins = useMemo(() => {
    if (!buffer) return [];
    return [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [
          {
            autoActivate: true,
            buffer,
            documentId,
            name: article.pdf.metadata.title || article.title,
            scale: 1,
          },
        ],
      }),
      createPluginRegistration(ViewportPluginPackage),
      createPluginRegistration(ScrollPluginPackage, { defaultPageGap: 24 }),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(SelectionPluginPackage, { marquee: { enabled: false } }),
      createPluginRegistration(BookmarkPluginPackage),
      createPluginRegistration(ZoomPluginPackage, { defaultZoomLevel: ZoomMode.FitPage }),
    ];
  }, [article.pdf.metadata.title, article.title, buffer, documentId]);

  const status =
    loadError ||
    (engineError ? engineError.message : '') ||
    (isLoading || !engine || !buffer ? '正在初始化 PDFium' : '');

  return (
    <section className="source-bookcase source-pdf-reader-shell source-pdfium-spike-shell">
      <PdfiumBookcaseToolbar
        author={article.pdf.metadata.author}
        navigation={annotationNavigation}
        title={article.pdf.metadata.title || article.title}
        tocCount={tocItems.length}
        tocOpen={tocOpen}
        onClose={onClose}
        onNavigateAnnotation={(annotationId) => navigateAnnotationRef.current(annotationId)}
        onToggleToc={() => setTocOpen((open) => !open)}
      />
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
                        agents={agents}
                        annotations={articleAnnotations}
                        article={article}
                        documentId={activeDocumentId}
                        engine={engine}
                        openTrace={openTrace}
                        messageSendShortcut={messageSendShortcut}
                        pageCount={
                          documentState.document?.pageCount || article.pdf.metadata.pageCount
                        }
                        distillationAnimation={distillationAnimation}
                        focusAnnotationId={focusAnnotationId}
                        selectedAnnotationId={selectedAnnotationId}
                        selectionActionShortcuts={selectionActionShortcuts}
                        tocItems={tocItems}
                        tocOpen={tocOpen}
                        userProfile={userProfile}
                        onClose={onClose}
                        onCloseToc={() => setTocOpen(false)}
                        onDeleteArticleAnnotation={onDeleteArticleAnnotation}
                        onDeleteArticleComment={onDeleteArticleComment}
                        onSetAnnotationNavigation={setAnnotationNavigation}
                        onSetAnnotationNavigator={(navigator) => {
                          navigateAnnotationRef.current = navigator;
                        }}
                        onFocusedAnnotation={onFocusedAnnotation}
                        onSetTocItems={setTocItems}
                        onToggleToc={() => setTocOpen((open) => !open)}
                        onOpenAnnotationDiscussion={onOpenAnnotationDiscussion}
                        onOpenAnnotation={onOpenAnnotation}
                        onSaveArticle={onSaveArticle}
                        onSaveArticleReadingProgress={onSaveArticleReadingProgress}
                        onUpdateArticle={onUpdateArticle}
                      />
                    ) : isError ? (
                      <div className="pdf-reader-status is-error" role="status">
                        <span>EmbedPDF 文档加载失败</span>
                      </div>
                    ) : null
                  }
                </DocumentContent>
              ) : (
                <div className="pdf-reader-status" role="status">
                  <LoaderCircle className="is-spinning" size={18} />
                  <span>正在加载 EmbedPDF 文档</span>
                </div>
              )
            }
          </EmbedPDF>
        ) : null}
      </div>
    </section>
  );
}

function PdfiumDocument({
  agents,
  annotations: articleAnnotations,
  article,
  documentId,
  engine,
  openTrace,
  messageSendShortcut,
  pageCount,
  distillationAnimation,
  focusAnnotationId,
  selectedAnnotationId,
  selectionActionShortcuts,
  tocItems,
  tocOpen,
  userProfile,
  onClose,
  onCloseToc,
  onDeleteArticleAnnotation,
  onDeleteArticleComment,
  onOpenAnnotationDiscussion,
  onOpenAnnotation,
  onSaveArticle,
  onSaveArticleReadingProgress,
  onSetTocItems,
  onSetAnnotationNavigation,
  onSetAnnotationNavigator,
  onFocusedAnnotation,
  onToggleToc,
  onUpdateArticle,
}: {
  agents: SourceBookcaseProps['agents'];
  annotations: SourceBookcaseProps['annotations'];
  article: PdfArticleRecord;
  documentId: string;
  engine: PdfEngine;
  openTrace: PdfOpenTrace;
  messageSendShortcut: SourceBookcaseProps['messageSendShortcut'];
  pageCount: number;
  distillationAnimation: SourceBookcaseProps['distillationAnimation'];
  focusAnnotationId: SourceBookcaseProps['focusAnnotationId'];
  selectedAnnotationId: SourceBookcaseProps['selectedAnnotationId'];
  selectionActionShortcuts: SourceBookcaseProps['selectionActionShortcuts'];
  tocItems: TocItem[];
  tocOpen: boolean;
  userProfile: SourceBookcaseProps['userProfile'];
  onClose: SourceBookcaseProps['onClose'];
  onCloseToc: () => void;
  onDeleteArticleAnnotation: SourceBookcaseProps['onDeleteArticleAnnotation'];
  onDeleteArticleComment: SourceBookcaseProps['onDeleteArticleComment'];
  onOpenAnnotationDiscussion: SourceBookcaseProps['onOpenAnnotationDiscussion'];
  onOpenAnnotation: SourceBookcaseProps['onOpenAnnotation'];
  onSaveArticle: SourceBookcaseProps['onSaveArticle'];
  onSaveArticleReadingProgress: SourceBookcaseProps['onSaveArticleReadingProgress'];
  onSetTocItems: (items: TocItem[]) => void;
  onSetAnnotationNavigation: React.Dispatch<React.SetStateAction<PdfAnnotationNavigationState>>;
  onSetAnnotationNavigator: (navigator: (annotationId: string) => void) => void;
  onFocusedAnnotation: SourceBookcaseProps['onFocusedAnnotation'];
  onToggleToc: () => void;
  onUpdateArticle: SourceBookcaseProps['onUpdateArticle'];
}) {
  const articleRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const notesRef = useRef<HTMLElement | null>(null);
  const noteRefs = useRef(new Map<string, HTMLElement>());
  const recordedOpenPhasesRef = useRef(new Set<string>());
  const agentAnnotationPlaybackQueueRef = useRef(Promise.resolve());
  const documentState = useDocumentState(documentId);
  const { provides: zoomControls } = useZoom(documentId);
  const [commentsCloseKey, setCommentsCloseKey] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [readerSettings, updatePdfReaderSettings] = useDesktopReaderSettings();
  const [agentTheaterBoxes, setAgentTheaterBoxes] = useState<HighlightBox[]>([]);
  const {
    annotationRailViewportHeight,
    pageMetrics,
    pageMetricsRef,
    schedulePageMetricsUpdate,
    updatePageMetrics,
  } = usePdfiumPageMetrics({ canvasRef, pageCount });
  const zoom = documentState?.scale || 1;
  const loadedDocument = documentState?.document ?? undefined;
  const {
    currentArticleText,
    extractPdfiumPageText,
    markPdfiumFirstPageReady,
    pdfTextDocument,
    resetPdfiumTextDocument,
  } = usePdfiumDocumentText({
    articleId: article.id,
    document: loadedDocument,
    engine,
    openTrace,
  });
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
    pageCount,
    onSaveArticleReadingProgress,
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
    pendingAnnotationAgents,
    reviewAgents,
    saveAnnotations,
  } = useSourceReaderSession({
    agents,
    agentAnnotationAdapter: createPdfiumSourceReaderController({
      enqueueAgentAnnotationPlayback: (articleId, annotation) =>
        enqueuePdfiumAgentAnnotationPlayback(articleId, annotation),
      extractPageText: (pageIndex) => extractPdfiumPageText(pageIndex),
      finishAgentDock: (agentId, succeeded) => finishPdfiumAgentDock(agentId, succeeded),
      finishVirtualReading: (agentId, suffix) => finishPdfiumVirtualReading(agentId, suffix),
      getDocument: () => documentState?.document ?? undefined,
      getPageGeometry: (document, page) =>
        engine
          .getPageGeometry(
            document as PdfiumLoadedDocument,
            page as PdfiumLoadedDocument['pages'][number],
          )
          .toPromise(),
      getPdfTextDocument: () => pdfTextDocument,
      isCurrentArticle,
      pageGeometriesForReadingPlan: (document, textDocument, readingPlan) =>
        pdfiumPageGeometriesForReadingPlan(
          document as PdfiumLoadedDocument,
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
    getArticleText: currentArticleText,
    onOpenAnnotation,
    onDeleteArticleAnnotation,
    onDeleteArticleComment,
    onSaveArticle,
    setStatusMessage,
    userProfile,
  });
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
  const actionShortcuts = useMemo(
    () => normalizeSelectionActionShortcuts(selectionActionShortcuts),
    [selectionActionShortcuts],
  );
  const sendShortcut = normalizeMessageSendShortcut(messageSendShortcut);
  const shortcutModifier = getShortcutModifier();

  const {
    temporaryBoxes,
    highlightChoice,
    setHighlightChoice,
    selectionAction,
    composer,
    clearSelection,
    clearAnnotationUiState,
    openSelectionAction,
    cancelComposer,
    copySelection,
    openComposer,
  } = useSourceSelectionComposer({
    canvasRef,
    onOpenComposer: () => setCommentsCloseKey((key) => key + 1),
  });
  const boxes = useMemo(
    () => pdfiumAnnotationBoxes(annotations, pageMetrics, userProfile, annotationAgents),
    [annotationAgents, annotations, pageMetrics, userProfile],
  );
  const visiblePdfAnnotations = useMemo(
    () => pdfiumVisibleAnnotations(annotations, boxes),
    [annotations, boxes],
  );
  const annotationRailLayout = useMemo(
    () => pdfiumAnnotationRailLayout(pageMetrics, canvasRef.current, annotationRailViewportHeight),
    [annotationRailViewportHeight, pageMetrics],
  );
  const annotationTotals = useMemo(
    () => ({
      annotations: annotations.length,
      distillations: articlePublishedDistillationCount(annotations),
    }),
    [annotations],
  );
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
    currentPage,
    documentId,
    focusAnnotationId,
    pageCount,
    scroll,
    selectedAnnotationId,
    onCloseToc,
    onFocusedAnnotation,
    onOpenAnnotation,
    onSetAnnotationNavigation,
    onSetAnnotationNavigator,
    onSetTocItems,
  });

  useEffect(() => {
    recordedOpenPhasesRef.current = new Set();
  }, [article.id]);

  useEffect(() => {
    const document = documentState?.document;
    if (!document) return;
    recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'document_ready', {
      pageCount: document.pageCount,
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
    if (expectedPageIndex > 0 && !pageMetrics[expectedPageIndex]) return;
    markInitialPageReady();
    markPdfiumFirstPageReady();
    recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'first_page_ready', {
      visiblePageCount,
    });
    recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'interactive_ready', {
      visiblePageCount,
    });
  }, [initialPageNumber, markInitialPageReady, markPdfiumFirstPageReady, openTrace, pageMetrics]);

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
      void copySelection(selectionAction);
      return;
    }
    openComposer(selectionAction);
  }

  function handleSelection(anchor: ReturnType<typeof createPdfTextAnchor> | null) {
    if (!anchor?.exact.trim()) {
      clearSelection();
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
      },
      pdfiumTemporaryBoxes(anchor, metric, userProfile.id),
    );
  }

  function handleHighlightClick(
    annotationId: string,
    event: React.MouseEvent<HTMLButtonElement>,
    annotationIds: string[],
  ) {
    const ids =
      annotationIds.length > 0
        ? annotationIds
        : annotationIdsAtHighlightPoint(boxes, {
            x: event.currentTarget.offsetLeft + event.nativeEvent.offsetX,
            y: event.currentTarget.offsetTop + event.nativeEvent.offsetY,
          });
    if (ids.length <= 1) {
      onOpenAnnotation(ids[0] || annotationId);
      return;
    }
    setHighlightChoice({
      x: event.clientX,
      y: event.clientY,
      annotationIds: ids,
    });
  }

  function handleAnnotationLayoutChange() {
    schedulePageMetricsUpdate();
    recalculateActiveConnection();
  }

  function isCurrentArticle(articleId: string) {
    return latestArticleRef.current?.id === articleId;
  }

  function showStatusMessage(message: string) {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(''), 1800);
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
          `${pdfiumAnnotationAgentName(annotation)} 正在添加想法`,
          0,
        );
        if (cursor) {
          updatePdfiumVirtualCursor(cursorId, {
            ...cursor,
            label: `${pdfiumAnnotationAgentName(annotation)} 正在${direction === 'above' ? '上方' : '下方'}添加想法`,
            offscreen: direction,
          });
          await sleep(700);
        }
      }
      await appendAgentAnnotationToArticle(articleId, annotation);
      finishPdfiumVirtualReading(cursorId);
      return;
    }

    const label = `${pdfiumAnnotationAgentName(annotation)} 正在添加想法`;
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
      label: `${pdfiumAnnotationAgentName(annotation)} 想法已添加`,
      offscreen: null,
      agent: cursorAgent,
    });
    await sleep(360);
    finishPdfiumVirtualCursor(cursorId);
  }

  async function createAnnotationFromComposer(note: string) {
    if (!composer) return;
    const currentComposer = composer;
    const currentArticle = latestArticleRef.current;
    if (!currentArticle) return;
    cancelComposer();
    const annotation = createUserAnnotation(currentComposer.anchor, userProfile, note);
    await saveAnnotations([...currentArticle.annotations, annotation]);
    onOpenAnnotation(annotation.id);
  }

  async function appendAgentAnnotationToArticle(articleId: string, annotation: Annotation) {
    let currentMerge: ReturnType<typeof mergeAgentAnnotationAsThought> | null = null;
    if (latestArticleRef.current?.id === articleId) {
      const result = mergeAgentAnnotationAsThought(annotationsRef.current, annotation);
      currentMerge = result;
      applyAnnotations(result.annotations);
      onOpenAnnotation(
        pdfiumAnnotationIsVisible(result.activeId, result.annotations, pageMetricsRef.current)
          ? result.activeId
          : null,
      );
    }
    await onUpdateArticle(articleId, (targetArticle) => {
      const result = articleWithMergedAgentAnnotation(targetArticle, annotation, currentMerge);
      return result.article;
    });
  }

  async function pdfiumPageGeometriesForReadingPlan(
    document: PdfiumLoadedDocument,
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
        const page = document.pages[pageIndex];
        if (!page) return null;
        const geometry = await engine.getPageGeometry(document, page).toPromise();
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
      <style>{`${readerStyles}\n${readerConversationStyles}\n${readerDesktopEmbeddedStyles}`}</style>
      <PdfiumDocumentFloatingToolbar
        currentPage={currentPage}
        pageCount={pageCount}
        zoom={zoom}
        onNextPage={() => scroll?.scrollToNextPage('smooth')}
        onPageChange={jumpToPdfiumPage}
        onPreviousPage={() => scroll?.scrollToPreviousPage('smooth')}
        onZoomIn={() => zoomControls?.zoomIn()}
        onZoomOut={() => zoomControls?.zoomOut()}
      />
      <EmbedPdfSelectionBridge
        documentId={documentId}
        engine={engine}
        onInvalidSelection={showStatusMessage}
        onSelection={handleSelection}
      />
      {restoringInitialPage ? (
        <div className="pdf-reader-status" role="status">
          <LoaderCircle className="is-spinning" size={18} />
          <span>正在恢复到第 {initialPageNumber} 页</span>
        </div>
      ) : null}
      {statusMessage ? (
        <div className="pdf-reader-status" role="status">
          <span>{statusMessage}</span>
        </div>
      ) : null}
      <ReaderAppView
        actions={{
          annotation: {
            onAddComment: addComment,
            onAnnotationLayoutChange: handleAnnotationLayoutChange,
            onClearActiveAnnotation: () => onOpenAnnotation(null),
            onCreateAnnotation: createAnnotationFromComposer,
            onDeleteAnnotation: deleteAnnotation,
            onDeleteComment: deleteComment,
            onFocusAnnotation: onOpenAnnotation,
            onHighlightClick: handleHighlightClick,
            onOpenAnnotationDiscussion: (annotationId, sourceRect) =>
              void onOpenAnnotationDiscussion?.(article.id, annotationId, sourceRect),
            onScrollToHighlight: scrollToAnnotation,
          },
          selection: {
            onCancelComposer: cancelComposer,
            onClearSelection: clearSelection,
            onCloseHighlightChoice: () => setHighlightChoice(null),
            onCopySelection: copySelection,
            onMouseUp: () => undefined,
            onOpenComposer: openComposer,
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
        }}
        agents={{
          agents: annotationAgents,
          completionBurstKey,
          dockCompleting: agentDockCompleting,
          dockItems: agentDockItems,
          pendingAnnotationAgents,
          reviewAgents,
          theaterBoxes: agentTheaterBoxes,
          virtualCursors,
        }}
        annotations={{
          activeConnection,
          activeId: selectedAnnotationId,
          annotationTotals,
          annotations,
          boxes,
          commentsCloseKey,
          distillationAnimation,
          filteredAnnotations: visiblePdfAnnotations,
          railLayoutOverride: annotationRailLayout,
          railViewportHeight: annotationRailViewportHeight,
          temporaryBoxes,
        }}
        article={{
          content: (
            <div className="pdfium-spike-canvas">
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
        }}
        options={{ embedded: true }}
        refs={{
          articleRef,
          canvasRef,
          noteRefs,
          notesRef,
          surfaceRef,
        }}
        selection={{ composer, highlightChoice, selectionAction }}
        settings={{
          messageSendShortcut: sendShortcut,
          readerSettings,
          selectionActionShortcuts: actionShortcuts,
          settingsOpen: false,
          shortcutModifier,
          showSettings: false,
        }}
        toc={{
          annotationStats: tocStats,
          items: tocItems,
          open: tocOpen,
        }}
        userProfile={userProfile}
      />
    </section>
  );
}
