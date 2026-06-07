import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
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
import { ChevronLeft, ChevronRight, LoaderCircle, ZoomIn } from 'lucide-react';
import type { PdfEngine } from '@embedpdf/models';
import {
  createPdfTextAnchor,
  isPdfTextAnchor,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
  type AgentReadingPlanItem,
  type Annotation,
  type ArticleRecord,
  type ReaderQuestionContext,
} from '@yomitomo/shared';
import {
  annotationIdsAtHighlightPoint,
  articlePublishedDistillationCount,
  createUserAnnotation,
  findReaderSearchMatches,
  selectionActionPosition,
  type HighlightBox,
  type TocItem,
} from '@yomitomo/core';
import { ReaderAppView } from '@yomitomo/reader-ui/reader-app-view';
import { readerUiLabels } from '../../i18n/app-i18n-labels';
import { ReaderToolbarSliderPopover } from '@yomitomo/reader-ui/reader-toolbar-controls';
import { ReaderTooltip } from '@yomitomo/reader-ui/reader-component-primitives';
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
  pdfiumAnnotationNavigationState,
  pdfiumAnnotationTheaterBoxes,
  pdfiumVisibleAnnotations,
  pdfiumAnnotationAgentName,
  pdfiumAnnotationRailLayout,
  pageProgress,
  pdfPageProgressPercent,
  pdfiumTemporaryBoxes,
  pdfiumTocAnnotationStats,
  pdfiumRectsForTextRange,
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
import { usePdfiumPageMetrics } from './app-source-bookcase-pdfium-page-metrics';
import { usePdfiumVirtualReading } from './app-source-bookcase-pdfium-virtual-reading';
import { usePdfiumDocumentText } from './app-source-bookcase-pdfium-document-text';
import { usePdfiumReadingProgress } from './app-source-bookcase-pdfium-reading-progress';
import { usePdfiumNavigation } from './app-source-bookcase-pdfium-navigation';
import { useReaderChatSession } from '../bookcase/use-reader-chat-session';

type PdfArticleRecord = ArticleRecord & { pdf: NonNullable<ArticleRecord['pdf']> };
type PdfiumLoadedDocument = NonNullable<
  NonNullable<ReturnType<typeof useDocumentState>>['document']
>;

function firstVisiblePdfPageWidth(pageMetrics: Record<number, { top: number; width: number }>) {
  const firstPage = Object.values(pageMetrics).toSorted((left, right) => left.top - right.top)[0];
  const width = firstPage?.width ?? 0;
  return Number.isFinite(width) && width > 0 ? Math.round(width) : 0;
}

function pdfLayoutDebugEnabled() {
  try {
    return (
      (window as unknown as { yomitomoPdfLayoutDebug?: boolean }).yomitomoPdfLayoutDebug === true ||
      window.localStorage.getItem('yomitomo:pdf-layout-debug') === '1'
    );
  } catch {
    return false;
  }
}

function debugPdfLayout(event: string, details: Record<string, unknown>) {
  if (!pdfLayoutDebugEnabled()) return;
  console.info(`[yomitomo:pdf-layout] ${event}`, details);
}

function debugRect(rect: DOMRect | undefined) {
  if (!rect) return null;
  return {
    bottom: Math.round(rect.bottom),
    height: Math.round(rect.height),
    left: Math.round(rect.left),
    right: Math.round(rect.right),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
  };
}

function debugComputedStyle(element: Element | null) {
  if (!element) return null;
  const style = window.getComputedStyle(element);
  return {
    display: style.display,
    left: style.left,
    opacity: style.opacity,
    position: style.position,
    top: style.top,
    transform: style.transform,
    visibility: style.visibility,
    zIndex: style.zIndex,
  };
}

export function PdfiumBookcase({
  agents,
  annotations: articleAnnotations,
  article,
  distillationAnimation,
  focusAnnotationId,
  messageSendShortcut,
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
  onSaveArticleReadingProgress,
  onSaveArticleReaderChatState,
  onUpdateArticle,
}: SourceBookcaseProps & { article: PdfArticleRecord }) {
  const { t } = useTranslation();
  const openTraceRef = useRef<PdfOpenTrace | null>(null);
  const recordedOpenPhasesRef = useRef(new Set<string>());
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState('');
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
          const message = pdfReadErrorMessage(error);
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
                        uiLanguage={uiLanguage}
                        userProfile={userProfile}
                        onClose={onClose}
                        onCloseToc={() => setTocOpen(false)}
                        onDeleteArticleAnnotation={onDeleteArticleAnnotation}
                        onDeleteArticleComment={onDeleteArticleComment}
                        onFocusedAnnotation={onFocusedAnnotation}
                        onSetTocItems={setTocItems}
                        onToggleToc={() => setTocOpen((open) => !open)}
                        onOpenAnnotationDiscussion={onOpenAnnotationDiscussion}
                        onOpenAnnotation={onOpenAnnotation}
                        onSaveArticle={onSaveArticle}
                        onSaveArticleReadingProgress={onSaveArticleReadingProgress}
                        onSaveArticleReaderChatState={onSaveArticleReaderChatState}
                        onUpdateArticle={onUpdateArticle}
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

function pdfReadErrorMessage(error: unknown) {
  if (!(error instanceof Error) || !error.message) return i18next.t('pdfReader.readFailed');
  if (error.message === 'PDF_SOURCE_FILE_MISSING') return i18next.t('pdfReader.sourceMissing');
  if (error.message === 'PDF_SOURCE_INVALID_ID') return i18next.t('pdfReader.readFailed');
  return error.message;
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
  uiLanguage,
  userProfile,
  onClose,
  onCloseToc,
  onDeleteArticleAnnotation,
  onDeleteArticleComment,
  onOpenAnnotationDiscussion,
  onOpenAnnotation,
  onSaveArticle,
  onSaveArticleReadingProgress,
  onSaveArticleReaderChatState,
  onSetTocItems,
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
  uiLanguage: SourceBookcaseProps['uiLanguage'];
  userProfile: SourceBookcaseProps['userProfile'];
  onClose: SourceBookcaseProps['onClose'];
  onCloseToc: () => void;
  onDeleteArticleAnnotation: SourceBookcaseProps['onDeleteArticleAnnotation'];
  onDeleteArticleComment: SourceBookcaseProps['onDeleteArticleComment'];
  onOpenAnnotationDiscussion: SourceBookcaseProps['onOpenAnnotationDiscussion'];
  onOpenAnnotation: SourceBookcaseProps['onOpenAnnotation'];
  onSaveArticle: SourceBookcaseProps['onSaveArticle'];
  onSaveArticleReadingProgress: SourceBookcaseProps['onSaveArticleReadingProgress'];
  onSaveArticleReaderChatState: SourceBookcaseProps['onSaveArticleReaderChatState'];
  onSetTocItems: (items: TocItem[]) => void;
  onFocusedAnnotation: SourceBookcaseProps['onFocusedAnnotation'];
  onToggleToc: () => void;
  onUpdateArticle: SourceBookcaseProps['onUpdateArticle'];
}) {
  const { t } = useTranslation();
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
  const [layoutPageWidth, setLayoutPageWidth] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(0);
  const [searchBoxes, setSearchBoxes] = useState<HighlightBox[]>([]);
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
    uiLanguage,
    getArticleText: currentArticleText,
    onOpenAnnotation,
    onDeleteArticleAnnotation,
    onDeleteArticleComment,
    onSaveArticle,
    setStatusMessage,
    userProfile,
  });
  const readerChat = useReaderChatSession({
    agents: annotationAgents,
    article,
    getArticleText: currentArticleText,
    uiLanguage,
    onSaveArticleReaderChatState,
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
  const labels = readerUiLabels();
  const searchResult = useMemo(
    () => findReaderSearchMatches(pdfTextDocument?.text || '', searchQuery),
    [pdfTextDocument?.text, searchQuery],
  );
  const activeSearchMatch =
    searchResult.matches[Math.min(activeSearchMatchIndex, searchResult.matches.length - 1)] || null;
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
        railComputed: debugComputedStyle(rail),
        railRect: debugRect(rail?.getBoundingClientRect()),
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
    documentId,
    focusAnnotationId,
    pageCount,
    scroll,
    onCloseToc,
    onFocusedAnnotation,
    onOpenAnnotation,
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
    setSearchOpen(false);
    setSearchQuery('');
    setActiveSearchMatchIndex(0);
    setSearchBoxes([]);
  }, [article.id]);

  useEffect(() => {
    setActiveSearchMatchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (!searchOpen || !activeSearchMatch || !pdfTextDocument || !loadedDocument) {
      setSearchBoxes([]);
      return;
    }

    let cancelled = false;
    void revealPdfiumSearchMatch(activeSearchMatch).then((nextBoxes) => {
      if (!cancelled) setSearchBoxes(nextBoxes);
    });
    return () => {
      cancelled = true;
    };
  }, [
    activeSearchMatch,
    currentPage,
    loadedDocument,
    pageMetrics,
    pdfTextDocument,
    searchOpen,
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
      void copySelection(selectionAction);
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
        color: '#d7a93f',
        top: metric.top + rect.y * metric.height,
        left: metric.left + rect.x * metric.width,
        width: Math.max(1, rect.width * metric.width),
        height: Math.max(2, rect.height * metric.height),
      };
      return [box];
    });
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
            onNavigateAnnotation: (annotationId) => scrollToAnnotation(annotationId),
            onOpenAnnotationDiscussion: (annotationId, sourceRect) =>
              void onOpenAnnotationDiscussion?.(article.id, annotationId, sourceRect),
            onResolveAnnotationNavigation: () =>
              pdfiumAnnotationNavigationState(annotations, selectedAnnotationId, currentPage),
            onScrollToHighlight: scrollToAnnotation,
          },
          chat: { ...readerChat.actions, onRevealContext: revealReaderChatContext },
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
          searchBoxes,
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
        chat={readerChat.model}
        labels={labels}
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
        toolbar={{
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
                onChange={(value) => zoomControls?.requestZoom(value / 100)}
              />
            </>
          ),
          headerMeta: {
            title: article.pdf.metadata.title || article.title,
            byline: article.pdf.metadata.author,
          },
          readingProgress: pageProgress(currentPage - 1, pageCount),
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
        }}
        userProfile={userProfile}
      />
    </section>
  );
}
