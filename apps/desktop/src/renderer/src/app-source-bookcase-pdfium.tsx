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
import {
  Scroller,
  ScrollPluginPackage,
  useScroll,
  useScrollCapability,
} from '@embedpdf/plugin-scroll/react';
import { BookmarkPluginPackage, useBookmarkCapability } from '@embedpdf/plugin-bookmark/react';
import {
  SelectionLayer,
  SelectionPluginPackage,
  useSelectionCapability,
} from '@embedpdf/plugin-selection/react';
import { Viewport, ViewportPluginPackage } from '@embedpdf/plugin-viewport/react';
import { ZoomPluginPackage, useZoom, ZoomMode } from '@embedpdf/plugin-zoom/react';
import {
  Bot,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  List,
  LoaderCircle,
} from 'lucide-react';
import type { PdfEngine } from '@embedpdf/models';
import {
  createPdfTextAnchor,
  isPdfTextAnchor,
  makeId,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
  type AgentReadingPlanItem,
  type ArticleReadingProgress,
  type Comment as AnnotationComment,
  type Annotation,
  type ArticleRecord,
  type FocusCoReadingPlan,
  type PublicAgent,
  type ReadingMemory,
} from '@yomitomo/shared';
import {
  annotationIdsAtHighlightPoint,
  annotationPrimaryComment,
  annotationThoughtComments,
  appendAnnotationComment,
  createUserAnnotation,
  createUserComment,
  findMentionedAgents,
  mergeReadingMemory,
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
import type { VirtualCursorState } from '@yomitomo/reader-ui/reader-types';
import { animateTheaterHighlight, sleep } from '@yomitomo/reader-ui/reader-animation';
import type { AnnotationRailLayout } from '@yomitomo/reader-ui/reader-annotations';
import { defaultReaderSettings } from '@yomitomo/reader-ui/reader-settings';
import { getShortcutModifier, selectionActionShortcut } from '@yomitomo/reader-ui/reader-shortcuts';
import { useAgentReadingDock } from '@yomitomo/reader-ui/use-agent-reading-dock';
import { Button } from './components/ui/button';
import type { PromptArticle } from './app-reading-types';
import {
  agentInstructionFromNote,
  articleWithAnnotations,
  articleWithMergedAgentAnnotation,
  mentionDirectivesForAgent,
  planSelectionMentionRoute,
  promptArticle,
  publicAnnotationAgents,
  recordRendererPerformanceTiming,
  rendererPerformanceElapsedMs,
  type SourceBookcaseProps,
} from './app-source-bookcase-shared';
import { useSourceActiveConnection } from './use-source-active-connection';
import { useSourceSelectionComposer } from './use-source-selection-composer';
import { useReaderPageTurnKeys, type ReaderPageTurnDirection } from './use-reader-page-turn-keys';
import { useSourceReaderSession } from './use-source-reader-session';
import {
  buildPdfTextDocument,
  pdfiumAgentAnnotationRequestOptions,
  pdfReaderReadingSections,
  pdfiumAnchorForReadingPlanStart,
  pdfiumAnchorReadingPosition,
  pdfiumAnnotationBoxes,
  pdfiumAnnotationIsVisible,
  pdfiumAnnotationNavigationState,
  pdfiumMapReadingPlanAgentAnnotation,
  pdfiumMapTargetAgentAnnotation,
  pdfiumAnnotationTheaterBoxes,
  pdfiumVisibleAnnotations,
  pdfiumBookmarkTocItems,
  pdfiumTemporaryBoxes,
  pdfiumTocAnnotationStats,
  rectToPdfRect,
  samePageMetrics,
  type PageMetric,
  type PdfAnnotationNavigationState,
  type PdfTextDocument,
} from './app-source-bookcase-pdfium-utils';

type PdfArticleRecord = ArticleRecord & { pdf: NonNullable<ArticleRecord['pdf']> };
type PdfiumLoadedDocument = NonNullable<
  NonNullable<ReturnType<typeof useDocumentState>>['document']
>;

type PdfOpenTrace = {
  articleId: string;
  startedAt: number;
};

function pdfOpenTrace(articleId: string): PdfOpenTrace {
  return { articleId, startedAt: performance.now() };
}

function recordPdfOpenTiming(
  trace: PdfOpenTrace,
  phase: string,
  data: Record<string, unknown> = {},
) {
  recordRendererPerformanceTiming('pdf.open', {
    articleId: trace.articleId,
    elapsedMs: rendererPerformanceElapsedMs(trace.startedAt),
    phase,
    ...data,
  });
}

function recordPdfOpenTimingOnce(
  recordedPhases: { current: Set<string> },
  trace: PdfOpenTrace,
  phase: string,
  data: Record<string, unknown> = {},
) {
  if (recordedPhases.current.has(phase)) return;
  recordedPhases.current.add(phase);
  recordPdfOpenTiming(trace, phase, data);
}

export function PdfiumBookcase({
  agents,
  annotations: articleAnnotations,
  article,
  messageSendShortcut,
  selectionActionShortcuts,
  selectedAnnotationId,
  userProfile,
  onClose,
  onOpenAnnotation,
  onSaveArticle,
  onSaveArticleReadingProgress,
  onUpdateArticle,
}: SourceBookcaseProps & { article: PdfArticleRecord }) {
  const openTraceRef = useRef<PdfOpenTrace | null>(null);
  const recordedOpenPhasesRef = useRef(new Set<string>());
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState('');
  const [agentAnnotateOpen, setAgentAnnotateOpen] = useState(false);
  const [annotationNavigation, setAnnotationNavigation] = useState<PdfAnnotationNavigationState>({
    previousId: null,
    nextId: null,
  });
  const navigateAnnotationRef = useRef<(annotationId: string) => void>(() => undefined);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const annotationAgents = useMemo(() => publicAnnotationAgents(agents), [agents]);
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
      <header className="pdf-reader-toolbar">
        <button className="source-reader-back-button" type="button" onClick={onClose}>
          <ChevronLeft size={16} />
          <span>返回阅读库</span>
        </button>
        <div className="pdf-reader-title">
          <strong title={article.pdf.metadata.title || article.title}>
            {article.pdf.metadata.title || article.title}
          </strong>
          {article.pdf.metadata.author ? <span>{article.pdf.metadata.author}</span> : null}
        </div>
        <div className="pdf-reader-controls" aria-label="PDF 阅读控制">
          <button
            aria-label="切换目录"
            aria-pressed={tocItems.length > 0 && tocOpen}
            className={
              tocItems.length > 0 && tocOpen
                ? 'reader-icon-button reader-toc-toggle is-active'
                : 'reader-icon-button reader-toc-toggle'
            }
            disabled={tocItems.length === 0}
            type="button"
            onClick={() => setTocOpen((open) => !open)}
          >
            <List size={18} />
          </button>
          <div className="reader-annotation-nav" aria-label="批注快捷选择">
            <button
              aria-label="上一个批注"
              className="reader-icon-button"
              disabled={!annotationNavigation.previousId}
              title="上一个批注"
              type="button"
              onClick={() => {
                if (annotationNavigation.previousId) {
                  navigateAnnotationRef.current(annotationNavigation.previousId);
                }
              }}
            >
              <ChevronUp size={17} />
            </button>
            <button
              aria-label="下一个批注"
              className="reader-icon-button"
              disabled={!annotationNavigation.nextId}
              title="下一个批注"
              type="button"
              onClick={() => {
                if (annotationNavigation.nextId) {
                  navigateAnnotationRef.current(annotationNavigation.nextId);
                }
              }}
            >
              <ChevronDown size={17} />
            </button>
          </div>
          <button
            aria-label="聚焦共读"
            aria-pressed={agentAnnotateOpen}
            className={
              agentAnnotateOpen ? 'reader-agent-annotate is-active' : 'reader-agent-annotate'
            }
            disabled={annotationAgents.length === 0}
            type="button"
            onClick={() => {
              setTocOpen(false);
              setAgentAnnotateOpen((open) => !open);
            }}
          >
            <Bot size={16} />
            <span>聚焦共读</span>
          </button>
        </div>
      </header>
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
                        agentAnnotateOpen={agentAnnotateOpen}
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
                        selectedAnnotationId={selectedAnnotationId}
                        selectionActionShortcuts={selectionActionShortcuts}
                        tocItems={tocItems}
                        tocOpen={tocOpen}
                        userProfile={userProfile}
                        onClose={onClose}
                        onCloseToc={() => setTocOpen(false)}
                        onSetAgentAnnotateOpen={setAgentAnnotateOpen}
                        onSetAnnotationNavigation={setAnnotationNavigation}
                        onSetAnnotationNavigator={(navigator) => {
                          navigateAnnotationRef.current = navigator;
                        }}
                        onSetTocItems={setTocItems}
                        onToggleToc={() => setTocOpen((open) => !open)}
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
  agentAnnotateOpen,
  agents,
  annotations: articleAnnotations,
  article,
  documentId,
  engine,
  openTrace,
  messageSendShortcut,
  pageCount,
  selectedAnnotationId,
  selectionActionShortcuts,
  tocItems,
  tocOpen,
  userProfile,
  onClose,
  onCloseToc,
  onOpenAnnotation,
  onSaveArticle,
  onSaveArticleReadingProgress,
  onSetTocItems,
  onSetAgentAnnotateOpen,
  onSetAnnotationNavigation,
  onSetAnnotationNavigator,
  onToggleToc,
  onUpdateArticle,
}: {
  agentAnnotateOpen: boolean;
  agents: SourceBookcaseProps['agents'];
  annotations: SourceBookcaseProps['annotations'];
  article: PdfArticleRecord;
  documentId: string;
  engine: PdfEngine<Blob>;
  openTrace: PdfOpenTrace;
  messageSendShortcut: SourceBookcaseProps['messageSendShortcut'];
  pageCount: number;
  selectedAnnotationId: SourceBookcaseProps['selectedAnnotationId'];
  selectionActionShortcuts: SourceBookcaseProps['selectionActionShortcuts'];
  tocItems: TocItem[];
  tocOpen: boolean;
  userProfile: SourceBookcaseProps['userProfile'];
  onClose: SourceBookcaseProps['onClose'];
  onCloseToc: () => void;
  onOpenAnnotation: SourceBookcaseProps['onOpenAnnotation'];
  onSaveArticle: SourceBookcaseProps['onSaveArticle'];
  onSaveArticleReadingProgress: SourceBookcaseProps['onSaveArticleReadingProgress'];
  onSetTocItems: (items: TocItem[]) => void;
  onSetAgentAnnotateOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSetAnnotationNavigation: React.Dispatch<React.SetStateAction<PdfAnnotationNavigationState>>;
  onSetAnnotationNavigator: (navigator: (annotationId: string) => void) => void;
  onToggleToc: () => void;
  onUpdateArticle: SourceBookcaseProps['onUpdateArticle'];
}) {
  const articleRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const notesRef = useRef<HTMLElement | null>(null);
  const noteRefs = useRef(new Map<string, HTMLElement>());
  const pageMetricsFrameRef = useRef(0);
  const pageMetricsRef = useRef<Record<number, PageMetric>>({});
  const pageTextCacheRef = useRef(new Map<number, Promise<string>>());
  const recordedOpenPhasesRef = useRef(new Set<string>());
  const agentAnnotationPlaybackQueueRef = useRef(Promise.resolve());
  const virtualCursorRef = useRef(new Map<string, VirtualCursorState>());
  const virtualCursorTimersRef = useRef(new Map<string, number>());
  const virtualReadingTimersRef = useRef(new Map<string, number>());
  const virtualReadingStepRef = useRef(new Map<string, number>());
  const virtualReadingStepSizeRef = useRef(new Map<string, number>());
  const activeDockAgentIdsRef = useRef(new Set<string>());
  const dockHadFailureRef = useRef(false);
  const initialPageIndexRef = useRef(normalizeInitialPageIndex(article));
  const lastSavedPageRef = useRef(initialPageIndexRef.current);
  const restoredInitialPageRef = useRef(false);
  const documentState = useDocumentState(documentId);
  const { provides: scroll } = useScroll(documentId);
  const { provides: scrollCapability } = useScrollCapability();
  const { provides: zoomControls } = useZoom(documentId);
  const { provides: bookmark } = useBookmarkCapability();
  const [pageMetrics, setPageMetrics] = useState<Record<number, PageMetric>>({});
  const [annotationRailViewportHeight, setAnnotationRailViewportHeight] = useState(0);
  const [commentsCloseKey, setCommentsCloseKey] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [pdfTextDocument, setPdfTextDocument] = useState<PdfTextDocument | null>(null);
  const [pdfFirstPageReady, setPdfFirstPageReady] = useState(false);
  const [restoringInitialPage, setRestoringInitialPage] = useState(
    () => initialPageIndexRef.current > 0,
  );
  const [currentPage, setCurrentPage] = useState(() => initialPageIndexRef.current + 1);
  const [agentTheaterBoxes, setAgentTheaterBoxes] = useState<HighlightBox[]>([]);
  const [virtualCursors, setVirtualCursors] = useState<VirtualCursorState[]>([]);
  const zoom = documentState?.scale || 1;
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
    addPendingAnnotationAgent,
    removePendingAnnotationAgent,
    requestAgentComment,
    requestAgentAnnotations,
    requestAnnotationReview,
    reviewAgents,
    saveAnnotations,
  } = useSourceReaderSession({
    agents,
    agentAnnotationAdapter: {
      resolveOptions: ({ options }) => pdfiumAgentAnnotationRequestOptions(options),
      getContext: async ({ currentArticle, options }) => {
        const document = documentState?.document;
        const articleId = options.articleId || currentArticle.id;
        if (!document || !articleId) return null;

        if (options.readingPlan?.length && !options.targetAnchor) {
          const textDocument = pdfTextDocument;
          if (!textDocument) return null;
          return {
            article: promptArticle(currentArticle, textDocument.text),
            articleId,
            articleText: textDocument.text,
            readingMemory: currentArticle.focusCoReadingPlan?.readingMemory,
            source: { document, kind: 'reading-plan' as const, textDocument },
            visibleArticle: isCurrentArticle(articleId),
          };
        }

        const targetAnchor = options.targetAnchor;
        const pageIndex =
          targetAnchor && isPdfTextAnchor(targetAnchor) ? targetAnchor.pageIndex : 0;
        const page = document.pages[pageIndex];
        if (!page) return null;
        const pageText = await extractPdfiumPageText(pageIndex);
        return {
          article: options.article || pdfiumPromptArticle(currentArticle, targetAnchor, pageText),
          articleId,
          articleText: pageText,
          showProgress: latestArticleRef.current?.id === articleId,
          source: { document, kind: 'target' as const, page, pageIndex, pageText, targetAnchor },
          visibleArticle: latestArticleRef.current?.id === articleId,
        };
      },
      start: async ({ agent, context, requestInput }) => {
        if (context.source?.kind === 'reading-plan') {
          const visibleArticle = context.visibleArticle !== false;
          if (visibleArticle) startPdfiumAgentDock(agent);
          const pageGeometryByIndex = await pdfiumPageGeometriesForReadingPlan(
            context.source.document,
            context.source.textDocument,
            requestInput.readingPlan,
          );
          if (visibleArticle) {
            startPdfiumVirtualReading(
              agent,
              pdfiumAnchorForReadingPlanStart(
                requestInput.readingPlan,
                context.source.textDocument,
                pageGeometryByIndex,
              ),
            );
          }
          return {
            acceptedAnnotation: false,
            kind: 'reading-plan' as const,
            pageGeometryByIndex,
            playbackPromise: Promise.resolve(),
          };
        }

        if (context.showProgress !== false) {
          startPdfiumAgentDock(agent);
          startPdfiumVirtualReading(agent, context.source?.targetAnchor);
        }
        const geometry =
          context.source?.kind === 'target'
            ? await engine.getPageGeometry(context.source.document, context.source.page).toPromise()
            : null;
        return {
          acceptedAnnotation: false,
          geometry,
          kind: 'target' as const,
          playbackPromise: Promise.resolve(),
        };
      },
      onAnnotation: ({ annotation, context, playback, requestInput }) => {
        if (context.source?.kind === 'reading-plan' && playback?.kind === 'reading-plan') {
          const pdfAnnotation = pdfiumMapReadingPlanAgentAnnotation(
            annotation,
            requestInput.readingPlan,
            context.source.textDocument,
            playback.pageGeometryByIndex,
          );
          if (!pdfAnnotation) return false;
          playback.acceptedAnnotation = true;
          playback.playbackPromise = enqueuePdfiumAgentAnnotationPlayback(
            context.articleId,
            pdfAnnotation,
          );
          return true;
        }

        if (
          context.source?.kind !== 'target' ||
          playback?.kind !== 'target' ||
          !playback.geometry
        ) {
          return false;
        }
        const pdfAnnotation = pdfiumMapTargetAgentAnnotation({
          annotation,
          geometry: playback.geometry,
          pageHeight: context.source.page.size.height,
          pageIndex: context.source.pageIndex,
          pageText: context.source.pageText,
          pageWidth: context.source.page.size.width,
        });
        if (!pdfAnnotation) return false;
        playback.acceptedAnnotation = true;
        playback.playbackPromise = enqueuePdfiumAgentAnnotationPlayback(
          context.articleId,
          pdfAnnotation,
        );
        return true;
      },
      onReadingMemory: ({ context, readingMemory }) =>
        saveFocusCoReadingReadingMemory(context.articleId, readingMemory),
      onEmpty: ({ agent, context }) => {
        if (context.source?.kind === 'reading-plan' && context.visibleArticle !== false) {
          finishPdfiumVirtualReading(agent.id, '没有新想法');
          setStatusMessage(`${agent.nickname} 暂无新想法`);
          window.setTimeout(() => setStatusMessage(''), 1400);
          return;
        }
        if (context.showProgress !== false) finishPdfiumVirtualReading(agent.id, '没有新想法');
      },
      onSuccess: async ({ playback }) => {
        if (playback?.acceptedAnnotation) await playback.playbackPromise;
      },
      finish: ({ agent, context, requestFailed }) => {
        const showProgress =
          context.source?.kind === 'reading-plan'
            ? context.visibleArticle !== false
            : context.showProgress !== false;
        if (!showProgress) return;
        if (requestFailed) finishPdfiumVirtualReading(agent.id, '想法添加失败');
        finishPdfiumAgentDock(agent.id, !requestFailed);
      },
    },
    annotations: articleAnnotations,
    article,
    ignoreStaleArticleUpdates: true,
    getArticleText: currentArticleText,
    onOpenAnnotation,
    onSaveArticle,
    setStatusMessage,
    userProfile,
  });
  const {
    agentDockCompleting,
    agentDockItems,
    completionBurstKey,
    activateAgentDock,
    markAgentDockDone,
    completeAgentDock,
    clearAgentDock,
  } = useAgentReadingDock(annotationAgents);
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
      comments: annotations.reduce(
        (count, annotation) => count + annotationThoughtComments(annotation).length,
        0,
      ),
    }),
    [annotations],
  );
  const pdfReadingSections = useMemo(
    () => (pdfTextDocument ? pdfReaderReadingSections(pdfTextDocument, tocItems, pageCount) : []),
    [pageCount, pdfTextDocument, tocItems],
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
    if (!bookmark) return;
    let cancelled = false;
    bookmark
      .forDocument(documentId)
      .getBookmarks()
      .toPromise()
      .then(({ bookmarks }) => {
        if (!cancelled) onSetTocItems(pdfiumBookmarkTocItems(bookmarks, pageCount));
      })
      .catch(() => {
        if (!cancelled) onSetTocItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [bookmark, documentId, onSetTocItems, pageCount]);

  useEffect(() => {
    const document = documentState?.document;
    if (!document) {
      setPdfTextDocument(null);
      return;
    }
    if (!pdfFirstPageReady) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const textExtractStartedAt = performance.now();
      recordPdfOpenTiming(openTrace, 'text_extract_start', {
        pageCount: document.pageCount,
      });
      Promise.all(document.pages.map((_page, pageIndex) => extractPdfiumPageText(pageIndex)))
        .then((pageTexts) => {
          if (!cancelled) {
            setPdfTextDocument(buildPdfTextDocument(pageTexts));
            recordPdfOpenTiming(openTrace, 'text_extract_done', {
              durationMs: rendererPerformanceElapsedMs(textExtractStartedAt),
              pageCount: pageTexts.length,
              textChars: pageTexts.reduce((count, text) => count + text.length, 0),
            });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPdfTextDocument(null);
            recordPdfOpenTiming(openTrace, 'text_extract_error', {
              durationMs: rendererPerformanceElapsedMs(textExtractStartedAt),
              pageCount: document.pageCount,
            });
          }
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [article.id, documentState?.document, openTrace, pdfFirstPageReady]);

  useEffect(() => {
    initialPageIndexRef.current = normalizeInitialPageIndex(article);
    lastSavedPageRef.current = initialPageIndexRef.current;
    restoredInitialPageRef.current = false;
    pageTextCacheRef.current = new Map();
    onSetAgentAnnotateOpen(false);
    setCurrentPage(initialPageIndexRef.current + 1);
    setRestoringInitialPage(initialPageIndexRef.current > 0);
    setPdfFirstPageReady(false);
    setPdfTextDocument(null);
    clearAgentAnnotationPlayback();
  }, [article.id, article.pdf.metadata.pageCount, onSetAgentAnnotateOpen]);

  useEffect(() => {
    if (!scrollCapability) return;

    const restoreInitialPage = () => {
      if (restoredInitialPageRef.current) return;
      const initialPageIndex = initialPageIndexRef.current;
      restoredInitialPageRef.current = true;
      if (initialPageIndex <= 0) return;

      scrollCapability.forDocument(documentId).scrollToPage({
        pageNumber: initialPageIndex + 1,
        behavior: 'instant',
      });
      setCurrentPage(initialPageIndex + 1);
    };

    const unsubscribe = scrollCapability.onLayoutReady((event) => {
      if (event.documentId === documentId) restoreInitialPage();
    });

    return () => {
      unsubscribe();
    };
  }, [documentId, scrollCapability]);

  useEffect(() => {
    if (!scroll || !documentState?.document) return;

    const saveCurrentPage = () => {
      const pageIndex = clampPageIndex(scroll.getCurrentPage() - 1, pageCount);
      setCurrentPage(pageIndex + 1);
      if (lastSavedPageRef.current === pageIndex) return;
      lastSavedPageRef.current = pageIndex;
      onSaveArticleReadingProgress(article.id, pdfReadingProgress(pageIndex, pageCount));
    };

    const unsubscribe = scroll.onScroll?.(saveCurrentPage);
    return () => {
      unsubscribe?.();
    };
  }, [article.id, documentState?.document, onSaveArticleReadingProgress, pageCount, scroll]);

  const updatePageMetrics = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const viewportRect = canvas
      .querySelector<HTMLElement>('.pdfium-spike-viewport')
      ?.getBoundingClientRect();
    const nextViewportHeight = Math.max(0, viewportRect?.height ?? canvasRect.height);
    setAnnotationRailViewportHeight((current) =>
      Math.abs(current - nextViewportHeight) < 0.5 ? current : nextViewportHeight,
    );
    const nextMetrics: Record<number, PageMetric> = {};
    for (const page of canvas.querySelectorAll<HTMLElement>('[data-pdfium-page-index]')) {
      const pageIndex = Number(page.dataset.pdfiumPageIndex);
      if (!Number.isInteger(pageIndex)) continue;
      const rect = page.getBoundingClientRect();
      if (
        viewportRect &&
        (rect.bottom < viewportRect.top ||
          rect.top > viewportRect.bottom ||
          rect.right < viewportRect.left ||
          rect.left > viewportRect.right)
      ) {
        continue;
      }
      nextMetrics[pageIndex] = {
        left: rect.left - canvasRect.left,
        top: rect.top - canvasRect.top,
        width: rect.width,
        height: rect.height,
        clipLeft: (viewportRect?.left ?? canvasRect.left) - canvasRect.left,
        clipTop: (viewportRect?.top ?? canvasRect.top) - canvasRect.top,
        clipRight: (viewportRect?.right ?? canvasRect.right) - canvasRect.left,
        clipBottom: (viewportRect?.bottom ?? canvasRect.bottom) - canvasRect.top,
      };
    }
    pageMetricsRef.current = nextMetrics;
    setPageMetrics((current) => (samePageMetrics(current, nextMetrics) ? current : nextMetrics));
  }, []);

  const schedulePageMetricsUpdate = useCallback(() => {
    if (pageMetricsFrameRef.current) return;
    pageMetricsFrameRef.current = window.requestAnimationFrame(() => {
      pageMetricsFrameRef.current = 0;
      updatePageMetrics();
    });
  }, [updatePageMetrics]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    schedulePageMetricsUpdate();

    const viewport = canvas.querySelector<HTMLElement>('.pdfium-spike-viewport');
    viewport?.addEventListener('scroll', schedulePageMetricsUpdate, { passive: true });

    const mutationObserver =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(schedulePageMetricsUpdate);
    mutationObserver?.observe(canvas, { childList: true, subtree: true });

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedulePageMetricsUpdate);
    resizeObserver?.observe(canvas);
    if (viewport) resizeObserver?.observe(viewport);

    return () => {
      if (pageMetricsFrameRef.current) {
        window.cancelAnimationFrame(pageMetricsFrameRef.current);
        pageMetricsFrameRef.current = 0;
      }
      viewport?.removeEventListener('scroll', schedulePageMetricsUpdate);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
    };
  }, [pageCount, schedulePageMetricsUpdate]);

  useEffect(() => {
    const visiblePageCount = Object.keys(pageMetrics).length;
    if (visiblePageCount === 0) return;
    const expectedPageIndex = initialPageIndexRef.current;
    if (expectedPageIndex > 0 && !pageMetrics[expectedPageIndex]) return;
    setRestoringInitialPage(false);
    setPdfFirstPageReady(true);
    recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'first_page_ready', {
      visiblePageCount,
    });
    recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'interactive_ready', {
      visiblePageCount,
    });
  }, [openTrace, pageMetrics]);

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
      if (pageMetricsFrameRef.current) {
        window.cancelAnimationFrame(pageMetricsFrameRef.current);
        pageMetricsFrameRef.current = 0;
      }
      clearAgentAnnotationPlayback();
    };
  }, []);

  useEffect(() => {
    clearAnnotationUiState();
  }, [article.id, clearAnnotationUiState]);

  useEffect(() => {
    onSetAnnotationNavigation(
      pdfiumAnnotationNavigationState(annotations, selectedAnnotationId, currentPage),
    );
  }, [annotations, currentPage, onSetAnnotationNavigation, selectedAnnotationId]);

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

  const scrollToAnnotation = useCallback(
    (annotationId: string) => {
      onOpenAnnotation(annotationId);
      const annotation = annotations.find((item) => item.id === annotationId);
      if (!annotation || !isPdfTextAnchor(annotation.anchor)) return;
      scroll?.scrollToPage({
        pageNumber: annotation.anchor.pageIndex + 1,
        behavior: 'smooth',
      });
    },
    [annotations, onOpenAnnotation, scroll],
  );

  useEffect(() => {
    onSetAnnotationNavigator(scrollToAnnotation);
    return () => onSetAnnotationNavigator(() => undefined);
  }, [onSetAnnotationNavigator, scrollToAnnotation]);

  function scrollToTocItem(item: TocItem) {
    onCloseToc();
    scroll?.scrollToPage({
      pageNumber: item.start + 1,
      behavior: 'smooth',
    });
  }

  function handlePageSliderChange(event: React.ChangeEvent<HTMLInputElement>) {
    const pageNumber = clampPageIndex(Number(event.currentTarget.value) - 1, pageCount) + 1;
    setCurrentPage(pageNumber);
    scroll?.scrollToPage({ pageNumber, behavior: 'instant' });
  }

  async function currentArticleText() {
    if (pdfTextDocument) return pdfTextDocument.text;
    const document = documentState?.document;
    if (!document) return '';
    const texts = await Promise.all(
      document.pages.map((_page, pageIndex) => extractPdfiumPageText(pageIndex)),
    );
    return buildPdfTextDocument(texts).text;
  }

  function isCurrentArticle(articleId: string) {
    return latestArticleRef.current?.id === articleId;
  }

  function showStatusMessage(message: string) {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(''), 1800);
  }

  function updatePdfiumVirtualCursor(cursorId: string, cursor: VirtualCursorState | null) {
    const timerId = virtualCursorTimersRef.current.get(cursorId);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      virtualCursorTimersRef.current.delete(cursorId);
    }
    if (cursor) virtualCursorRef.current.set(cursorId, cursor);
    else virtualCursorRef.current.delete(cursorId);
    setVirtualCursors(Array.from(virtualCursorRef.current.values()));
  }

  function finishPdfiumVirtualCursor(cursorId: string) {
    const cursor = virtualCursorRef.current.get(cursorId);
    if (!cursor) return;
    updatePdfiumVirtualCursor(cursorId, { ...cursor, visible: false, leaving: true });
    const timerId = window.setTimeout(() => {
      updatePdfiumVirtualCursor(cursorId, null);
      virtualCursorTimersRef.current.delete(cursorId);
    }, 320);
    virtualCursorTimersRef.current.set(cursorId, timerId);
  }

  function clearAgentAnnotationPlayback() {
    for (const timerId of virtualCursorTimersRef.current.values()) {
      window.clearTimeout(timerId);
    }
    for (const timerId of virtualReadingTimersRef.current.values()) {
      window.clearInterval(timerId);
    }
    virtualCursorTimersRef.current.clear();
    virtualReadingTimersRef.current.clear();
    virtualReadingStepRef.current.clear();
    virtualReadingStepSizeRef.current.clear();
    activeDockAgentIdsRef.current.clear();
    dockHadFailureRef.current = false;
    clearAgentDock();
    virtualCursorRef.current.clear();
    setVirtualCursors([]);
    setAgentTheaterBoxes([]);
  }

  function startPdfiumAgentDock(agent: PublicAgent) {
    activeDockAgentIdsRef.current.add(agent.id);
    activateAgentDock(agent);
  }

  function finishPdfiumAgentDock(agentId: string, succeeded: boolean) {
    if (!activeDockAgentIdsRef.current.has(agentId)) return;
    markAgentDockDone(agentId);
    activeDockAgentIdsRef.current.delete(agentId);
    if (!succeeded) dockHadFailureRef.current = true;
    if (activeDockAgentIdsRef.current.size > 0) return;

    const shouldCelebrate = !dockHadFailureRef.current;
    dockHadFailureRef.current = false;
    completeAgentDock(shouldCelebrate);
  }

  function startPdfiumVirtualReading(agent: PublicAgent, anchor: Annotation['anchor'] | undefined) {
    stopPdfiumVirtualReading(agent.id);
    const readerIndex = virtualReadingTimersRef.current.size;
    const interval = 170 + Math.floor(Math.random() * 100);
    const stepSize = 3 + readerIndex * 2 + Math.floor(Math.random() * 5);
    virtualReadingStepRef.current.set(agent.id, readerIndex * 11);
    virtualReadingStepSizeRef.current.set(agent.id, stepSize);
    const tick = () => {
      const step = virtualReadingStepRef.current.get(agent.id) || 0;
      virtualReadingStepRef.current.set(
        agent.id,
        step + (virtualReadingStepSizeRef.current.get(agent.id) || 4),
      );
      const cursor = pdfiumReadingCursor(agent, anchor, step);
      if (cursor) updatePdfiumVirtualCursor(agent.id, cursor);
    };
    tick();
    virtualReadingTimersRef.current.set(agent.id, window.setInterval(tick, interval));
  }

  function stopPdfiumVirtualReading(agentId: string) {
    const timerId = virtualReadingTimersRef.current.get(agentId);
    if (timerId !== undefined) window.clearInterval(timerId);
    virtualReadingTimersRef.current.delete(agentId);
    virtualReadingStepRef.current.delete(agentId);
    virtualReadingStepSizeRef.current.delete(agentId);
  }

  function finishPdfiumVirtualReading(agentId: string, suffix = '想法已添加') {
    stopPdfiumVirtualReading(agentId);
    const current = virtualCursorRef.current.get(agentId);
    if (!current) return;
    updatePdfiumVirtualCursor(agentId, {
      ...current,
      x: Math.min(window.innerWidth - 80, current.x + 72),
      y: Math.max(72, current.y - 42),
      label: `${current.agent?.nickname || '助手'} ${suffix}`,
      leaving: true,
    });
    const timerId = window.setTimeout(() => {
      updatePdfiumVirtualCursor(agentId, null);
      virtualCursorTimersRef.current.delete(agentId);
    }, 900);
    virtualCursorTimersRef.current.set(agentId, timerId);
  }

  function pdfiumReadingCursor(
    agent: PublicAgent,
    anchor: Annotation['anchor'] | undefined,
    step: number,
  ): VirtualCursorState | null {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (canvasRect && anchor && isPdfTextAnchor(anchor)) {
      const position = pdfiumAnchorReadingPosition(anchor, pageMetricsRef.current, step);
      if (position) {
        return {
          id: agent.id,
          visible: true,
          x: canvasRect.left + position.x,
          y: canvasRect.top + position.y,
          label: `${agent.nickname} 正在阅读`,
          offscreen: null,
          agent,
        };
      }
    }

    return pdfiumReadingFallbackCursor(
      agent.id,
      agent,
      anchor && isPdfTextAnchor(anchor) ? anchor.pageIndex : undefined,
      `${agent.nickname} 正在阅读`,
      step,
    );
  }

  function pdfiumReadingFallbackCursor(
    cursorId: string,
    agent: PublicAgent | undefined,
    pageIndex: number | undefined,
    visibleLabel: string,
    step: number,
  ): VirtualCursorState | null {
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const viewportRect = pdfiumViewportRect();
    if (!canvasRect || !viewportRect) return null;

    const offscreen =
      pageIndex === undefined ? null : pdfiumOffscreenDirection(pageIndex, pageMetricsRef.current);
    if (offscreen) {
      return {
        id: cursorId,
        visible: true,
        x: viewportRect.left + viewportRect.width / 2,
        y: offscreen === 'above' ? viewportRect.top + 20 : viewportRect.bottom - 20,
        label: `${agent?.nickname || '助手'} 正在${offscreen === 'above' ? '上方' : '下方'}阅读`,
        offscreen,
        agent,
      };
    }

    const metric =
      pageIndex !== undefined ? pageMetricsRef.current[pageIndex] : firstVisiblePdfiumPageMetric();
    const targetMetric = metric || firstVisiblePdfiumPageMetric();
    if (!targetMetric) {
      return {
        id: cursorId,
        visible: true,
        x: viewportRect.left + viewportRect.width / 2,
        y: viewportRect.top + 48,
        label: visibleLabel,
        offscreen: null,
        agent,
      };
    }

    const visibleTop = Math.max(targetMetric.top, targetMetric.clipTop);
    const visibleBottom = Math.min(targetMetric.top + targetMetric.height, targetMetric.clipBottom);
    const travelWidth = Math.max(1, targetMetric.width - 128);
    return {
      id: cursorId,
      visible: true,
      x: canvasRect.left + targetMetric.left + 64 + ((step * 12) % travelWidth),
      y:
        canvasRect.top +
        Math.min(visibleBottom - 24, Math.max(visibleTop + 24, targetMetric.top + 56)),
      label: visibleLabel,
      offscreen: null,
      agent,
    };
  }

  function pdfiumViewportRect() {
    return (
      canvasRef.current
        ?.querySelector<HTMLElement>('.pdfium-spike-viewport')
        ?.getBoundingClientRect() ||
      canvasRef.current?.getBoundingClientRect() ||
      null
    );
  }

  function firstVisiblePdfiumPageMetric() {
    return Object.values(pageMetricsRef.current).toSorted((left, right) => left.top - right.top)[0];
  }

  function pdfiumOffscreenDirection(
    pageIndex: number,
    metrics: Record<number, PageMetric>,
  ): 'above' | 'below' | null {
    if (metrics[pageIndex]) return null;
    const visiblePageIndexes = Object.keys(metrics)
      .map(Number)
      .filter(Number.isFinite)
      .toSorted((left, right) => left - right);
    const firstPageIndex = visiblePageIndexes[0];
    const lastPageIndex = visiblePageIndexes[visiblePageIndexes.length - 1];
    if (firstPageIndex === undefined || lastPageIndex === undefined) {
      return pageIndex + 1 < currentPage ? 'above' : 'below';
    }
    if (pageIndex < firstPageIndex) return 'above';
    if (pageIndex > lastPageIndex) return 'below';
    return pageIndex + 1 < currentPage ? 'above' : 'below';
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
    const articleText = isPdfTextAnchor(currentComposer.anchor)
      ? await extractPdfiumPageText(currentComposer.anchor.pageIndex)
      : currentComposer.anchor.exact;
    const articleContext = promptArticle(currentArticle, await currentArticleText());
    const pageArticleContext = pdfiumPromptArticle(
      currentArticle,
      currentComposer.anchor,
      articleText,
    );
    cancelComposer();
    const annotation = createUserAnnotation(currentComposer.anchor, userProfile, '');
    const mentionedAgents = findMentionedAgents(note, annotationAgents);
    await saveAnnotations([...currentArticle.annotations, annotation]);
    onOpenAnnotation(annotation.id);
    for (const agent of mentionedAgents) addPendingAnnotationAgent(annotation.id, agent);

    const trimmed = note.trim();
    if (!trimmed) {
      for (const agent of mentionedAgents) removePendingAnnotationAgent(annotation.id, agent.id);
      return;
    }

    if (mentionedAgents.length === 0) {
      const comment = createUserComment(userProfile, trimmed, { now: annotation.createdAt });
      const nextAnnotations = appendAnnotationComment(
        annotationsRef.current,
        annotation.id,
        comment,
        annotation.createdAt,
      );
      const nextAnnotation = nextAnnotations?.find((item) => item.id === annotation.id);
      if (!nextAnnotations || !nextAnnotation) return;
      await saveAnnotations(nextAnnotations);
      void inferAnnotationMetadataForAnnotation(currentArticle.id, nextAnnotation, articleContext);
      return;
    }

    const mentionRoute = await planSelectionMentionRoute({
      desktop: window.yomitomoDesktop,
      note,
      targetAnchor: currentComposer.anchor,
      agents: mentionedAgents,
      article: articleContext,
    });
    let primaryComment: AnnotationComment | null = null;
    if (mentionRoute.createUserThought) {
      const comment = createUserComment(userProfile, trimmed, { now: annotation.createdAt });
      const nextAnnotations = appendAnnotationComment(
        annotationsRef.current,
        annotation.id,
        comment,
        annotation.createdAt,
      );
      const nextAnnotation = nextAnnotations?.find((item) => item.id === annotation.id);
      if (nextAnnotations && nextAnnotation) {
        await saveAnnotations(nextAnnotations);
        primaryComment = annotationPrimaryComment(nextAnnotation);
        void inferAnnotationMetadataForAnnotation(
          currentArticle.id,
          nextAnnotation,
          articleContext,
        );
      }
    }

    for (const agent of mentionedAgents) {
      const directives = mentionDirectivesForAgent(mentionRoute, agent);
      const commentDirectives = directives.filter((directive) => directive.action === 'comment');
      const thoughtDirectives = directives.filter(
        (directive) => directive.action === 'create_thought',
      );
      let scheduledAgentRequest = false;
      if (primaryComment) {
        for (const directive of commentDirectives) {
          scheduledAgentRequest = true;
          void requestAgentComment(agent, annotation, primaryComment, undefined, {
            instruction: directive.instruction,
            readingIntent: directive.readingIntent,
            pendingAnnotationId: annotation.id,
          });
        }
      }
      const targetThoughtDirectives =
        thoughtDirectives.length > 0
          ? thoughtDirectives
          : !primaryComment && commentDirectives.length > 0
            ? commentDirectives
            : [];
      for (const directive of targetThoughtDirectives) {
        scheduledAgentRequest = true;
        void requestAgentAnnotations(agent, {
          targetAnchor: currentComposer.anchor,
          instruction: directive.instruction || agentInstructionFromNote(note, [agent]),
          readingIntent: directive.readingIntent,
          article: pageArticleContext,
          articleId: currentArticle.id,
          pendingAnnotationId: annotation.id,
        });
      }
      if (!scheduledAgentRequest) removePendingAnnotationAgent(annotation.id, agent.id);
    }
  }

  async function inferAnnotationMetadataForAnnotation(
    articleId: string,
    annotation: Annotation,
    articleContext: PromptArticle,
  ) {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;
    try {
      const metadata = await desktop.inferAnnotationMetadata({
        article: articleContext,
        anchor: annotation.anchor,
        note: annotationPrimaryComment(annotation)?.content || '',
      });
      await onUpdateArticle(articleId, (targetArticle) => {
        let found = false;
        const nextAnnotations = targetArticle.annotations.map((item) => {
          if (item.id !== annotation.id) return item;
          found = true;
          const primaryCommentId = annotationPrimaryComment(item)?.id;
          return {
            ...item,
            annotationType: metadata.annotationType,
            readingIntent: metadata.readingIntent,
            comments: item.comments.map((comment) =>
              comment.id === primaryCommentId
                ? { ...comment, readingIntent: metadata.readingIntent }
                : comment,
            ),
            updatedAt: new Date().toISOString(),
          };
        });
        return found ? articleWithAnnotations(targetArticle, nextAnnotations) : null;
      });
    } catch (error) {
      if (latestArticleRef.current?.id !== articleId) return;
      showStatusMessage(error instanceof Error ? error.message : '想法标签生成失败');
    }
  }

  async function saveFocusCoReadingPlan(plan: FocusCoReadingPlan) {
    await onUpdateArticle(plan.articleId, (targetArticle) => {
      const nextArticle = {
        ...targetArticle,
        focusCoReadingPlan: plan,
        updatedAt: new Date().toISOString(),
      };
      if (isCurrentArticle(plan.articleId)) latestArticleRef.current = nextArticle;
      return nextArticle;
    });
  }

  async function saveFocusCoReadingReadingMemory(
    articleId: string,
    readingMemory: ReadingMemory | undefined,
  ) {
    if (!readingMemory) return;
    await onUpdateArticle(articleId, (targetArticle) => {
      const plan = targetArticle.focusCoReadingPlan;
      if (!plan) return null;
      const mergedMemory = mergeReadingMemory(plan.readingMemory, readingMemory);
      if (!mergedMemory) return null;
      const now = new Date().toISOString();
      const nextArticle = {
        ...targetArticle,
        focusCoReadingPlan: {
          ...plan,
          readingMemory: mergedMemory,
          updatedAt: now,
        },
        updatedAt: now,
      };
      if (isCurrentArticle(articleId)) latestArticleRef.current = nextArticle;
      return nextArticle;
    });
  }

  async function planFocusCoReading(selectedAgentIds: string[]) {
    const desktop = window.yomitomoDesktop;
    const currentArticle = latestArticleRef.current;
    const textDocument = pdfTextDocument;
    if (!desktop || !currentArticle || !textDocument) throw new Error('无法规划 PDF 聚焦共读');

    setStatusMessage('正在规划聚焦共读');
    try {
      const route = await desktop.planFocusCoReadingRoute({
        selectedAgentIds,
        sections: pdfReadingSections.map((section) => ({
          sectionId: section.id,
          sectionTitle: section.title,
          sectionStart: section.start,
          sectionEnd: section.end,
        })),
        chapterSummaries: currentArticle.focusCoReadingPlan?.sections.flatMap((section) =>
          section.summary || section.tag
            ? [
                {
                  sectionId: section.sectionId,
                  summary: section.summary,
                  tag: section.tag,
                },
              ]
            : [],
        ),
        article: promptArticle(currentArticle, textDocument.text),
      });
      const now = new Date().toISOString();
      const routeBySection = new Map(route.sections.map((section) => [section.sectionId, section]));
      const previousSections = new Map(
        currentArticle.focusCoReadingPlan?.sections.map((section) => [section.sectionId, section]),
      );
      const sections = pdfReadingSections.flatMap((section) => {
        const routed = routeBySection.get(section.id);
        const previous = previousSections.get(section.id);
        const agentIds = (routed?.agentIds || []).filter((agentId) =>
          selectedAgentIds.includes(agentId),
        );
        const messages = previous?.messages || [];
        if (agentIds.length === 0 && messages.length === 0 && !routed?.summary && !routed?.tag) {
          return [];
        }
        return [
          {
            sectionId: section.id,
            sectionTitle: section.title,
            sectionStart: section.start,
            sectionEnd: section.end,
            summary: routed?.summary,
            tag: routed?.tag,
            targetDensity: routed?.targetDensity,
            needsFurtherPlanning: routed?.needsFurtherPlanning,
            agentIds,
            messages,
          },
        ];
      });
      const plan: FocusCoReadingPlan = {
        id: currentArticle.focusCoReadingPlan?.id || makeId('focus_co_reading'),
        articleId: currentArticle.id,
        selectedAgentIds,
        sections,
        readingMemory: currentArticle.focusCoReadingPlan?.readingMemory,
        createdAt: currentArticle.focusCoReadingPlan?.createdAt || now,
        updatedAt: now,
      };
      await saveFocusCoReadingPlan(plan);
      return plan;
    } finally {
      setStatusMessage('');
    }
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

  async function extractPdfiumPageText(pageIndex: number) {
    const document = documentState?.document;
    if (!document) return '';
    const cached = pageTextCacheRef.current.get(pageIndex);
    if (cached) return cached;
    const text = engine.extractText(document, [pageIndex]).toPromise();
    pageTextCacheRef.current.set(pageIndex, text);
    return text;
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
      <div className="pdfium-spike-floating-toolbar">
        <Button
          aria-label="上一页"
          disabled={currentPage <= 1}
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => scroll?.scrollToPreviousPage('smooth')}
        >
          <ChevronLeft size={16} />
        </Button>
        <span>
          {currentPage} / {pageCount}
        </span>
        <input
          aria-label="快速跳转 PDF 页码"
          className="ebook-progress-slider pdfium-page-slider"
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
          onChange={handlePageSliderChange}
        />
        <Button
          aria-label="下一页"
          disabled={currentPage >= pageCount}
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => scroll?.scrollToNextPage('smooth')}
        >
          <ChevronRight size={16} />
        </Button>
        <Button
          aria-label="缩小"
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => zoomControls?.zoomOut()}
        >
          <ZoomOut size={16} />
        </Button>
        <span>{Math.round(zoom * 100)}%</span>
        <Button
          aria-label="放大"
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => zoomControls?.zoomIn()}
        >
          <ZoomIn size={16} />
        </Button>
      </div>
      <EmbedPdfSelectionBridge
        documentId={documentId}
        engine={engine}
        onInvalidSelection={showStatusMessage}
        onSelection={handleSelection}
      />
      {restoringInitialPage ? (
        <div className="pdf-reader-status" role="status">
          <LoaderCircle className="is-spinning" size={18} />
          <span>正在恢复到第 {initialPageIndexRef.current + 1} 页</span>
        </div>
      ) : null}
      {statusMessage ? (
        <div className="pdf-reader-status" role="status">
          <span>{statusMessage}</span>
        </div>
      ) : null}
      <ReaderAppView
        activeConnection={activeConnection}
        activeId={selectedAnnotationId}
        agentAnnotateOpen={agentAnnotateOpen}
        agentDockCompleting={agentDockCompleting}
        agentDockItems={agentDockItems}
        agentTheaterBoxes={agentTheaterBoxes}
        agents={annotationAgents}
        annotatingAgents={[]}
        annotationTotals={annotationTotals}
        annotations={annotations}
        annotationRailLayoutOverride={annotationRailLayout}
        annotationRailViewportHeight={annotationRailViewportHeight}
        articleContent={
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
        }
        articleId={article.id}
        articleRef={articleRef}
        boxes={boxes}
        canvasRef={canvasRef}
        commentsCloseKey={commentsCloseKey}
        composer={composer}
        completionBurstKey={completionBurstKey}
        embedded
        extracted={{
          title: article.pdf.metadata.title || article.title,
          byline: article.pdf.metadata.author,
          content: '',
        }}
        filteredAnnotations={visiblePdfAnnotations}
        highlightChoice={highlightChoice}
        messageSendShortcut={sendShortcut}
        noteRefs={noteRefs}
        notesRef={notesRef}
        pendingAnnotationAgents={pendingAnnotationAgents}
        readerSettings={defaultReaderSettings}
        reviewAgents={reviewAgents}
        focusCoReadingPlan={article.focusCoReadingPlan}
        readingSections={pdfReadingSections}
        selectionAction={selectionAction}
        selectionActionShortcuts={actionShortcuts}
        settingsOpen={false}
        shortcutModifier={shortcutModifier}
        surfaceRef={surfaceRef}
        temporaryBoxes={temporaryBoxes}
        tocAnnotationStats={tocStats}
        tocItems={tocItems}
        tocOpen={tocOpen}
        userProfile={userProfile}
        virtualCursors={virtualCursors}
        onAddComment={addComment}
        onAnnotationLayoutChange={handleAnnotationLayoutChange}
        onCancelAgentAnnotateMenu={() => onSetAgentAnnotateOpen(false)}
        onCancelComposer={cancelComposer}
        onClearActiveAnnotation={() => onOpenAnnotation(null)}
        onClearSelection={clearSelection}
        onClose={onClose}
        onCloseFloatingPanels={() => {
          onSetAgentAnnotateOpen(false);
          onCloseToc();
        }}
        onCloseHighlightChoice={() => setHighlightChoice(null)}
        onCloseResponsivePanels={onCloseToc}
        onCopySelection={copySelection}
        onCreateAnnotation={createAnnotationFromComposer}
        onDeleteAnnotation={deleteAnnotation}
        onDeleteComment={deleteComment}
        onFocusAnnotation={onOpenAnnotation}
        onHighlightClick={handleHighlightClick}
        onMouseUp={() => undefined}
        onOpenComposer={openComposer}
        onPlanFocusCoReading={planFocusCoReading}
        onRequestAnnotationReview={requestAnnotationReview}
        onSaveFocusCoReadingPlan={saveFocusCoReadingPlan}
        onScrollToHeading={scrollToTocItem}
        onScrollToHighlight={scrollToAnnotation}
        onStartAgentReadingPlan={(agent, readingPlan) => {
          onSetAgentAnnotateOpen(false);
          void requestAgentAnnotations(agent, { readingPlan });
        }}
        onToggleAgentAnnotate={() => {
          onSetAgentAnnotateOpen((open) => !open);
          onCloseToc();
        }}
        onToggleSettings={() => undefined}
        onToggleToc={onToggleToc}
        onUpdateReaderSettings={async () => undefined}
      />
    </section>
  );
}

function EmbedPdfSelectionBridge({
  documentId,
  engine,
  onInvalidSelection,
  onSelection,
}: {
  documentId: string;
  engine: PdfEngine<Blob>;
  onInvalidSelection: (message: string) => void;
  onSelection: (anchor: ReturnType<typeof createPdfTextAnchor> | null) => void;
}) {
  const documentState = useDocumentState(documentId);
  const { provides } = useSelectionCapability();
  const ignoreSelectionClearUntilRef = useRef(0);

  useEffect(() => {
    if (!provides || !documentState?.document) return;
    const scope = provides.forDocument(documentId);
    const document = documentState.document;

    const unsubscribeChange = scope.onSelectionChange((selectionRange) => {
      if (selectionRange) return;
      if (performance.now() < ignoreSelectionClearUntilRef.current) {
        return;
      }
      onSelection(null);
    });
    const unsubscribeEnd = scope.onEndSelection(() => {
      const state = scope.getState();
      const formattedSelections = scope.getFormattedSelection();
      if (formattedSelections.length > 1) {
        clearEmbedPdfSelection(scope);
        onSelection(null);
        onInvalidSelection('暂不支持跨页划线，请选择单页文本');
        return;
      }

      const formatted = formattedSelections[0];
      if (!formatted) return;
      const slice = state.slices[formatted.pageIndex];
      const page = document.pages[formatted.pageIndex];
      if (!slice || !page) return;

      engine
        .extractText(document, [formatted.pageIndex])
        .toPromise()
        .then((pageText) => {
          const anchor = createPdfTextAnchor({
            pageText,
            pageIndex: formatted.pageIndex,
            start: slice.start,
            end: slice.start + slice.count,
            pageWidth: page.size.width,
            pageHeight: page.size.height,
            rects: formatted.segmentRects.map((rect) =>
              rectToPdfRect(rect, page.size.width, page.size.height),
            ),
          });
          ignoreSelectionClearUntilRef.current = performance.now() + 120;
          onSelection(anchor.exact.trim() ? anchor : null);
          clearEmbedPdfSelection(scope);
        })
        .catch(() => {
          onSelection(null);
        });
    });

    return () => {
      unsubscribeChange();
      unsubscribeEnd();
    };
  }, [documentId, documentState?.document, engine, onInvalidSelection, onSelection, provides]);

  return null;
}

function clearEmbedPdfSelection(scope: unknown) {
  const selectionScope = scope as {
    clear?: () => void;
    clearSelection?: () => void;
  };
  selectionScope.clearSelection?.();
  selectionScope.clear?.();
}

function pdfiumAnnotationAgentName(annotation: Annotation) {
  return annotation.agentNickname || annotation.agentUsername || '助手';
}

function pdfiumAnnotationRailLayout(
  pageMetrics: Record<number, PageMetric>,
  canvas: HTMLDivElement | null,
  viewportHeight: number,
): AnnotationRailLayout | undefined {
  const canvasWidth = canvas?.getBoundingClientRect().width ?? 0;
  if (canvasWidth <= 0) return undefined;

  const pageMetric = Object.values(pageMetrics).toSorted((left, right) => left.top - right.top)[0];
  if (!pageMetric) return undefined;

  const gap = 20;
  const minimumRailWidth = 220;
  const maximumRailWidth = 420;
  const articleLeft = Math.max(0, Math.round(pageMetric.left));
  const articleRight = Math.min(canvasWidth, Math.round(pageMetric.left + pageMetric.width));
  const leftSpace = articleLeft;
  const rightSpace = Math.max(0, Math.round(canvasWidth - articleRight));
  const leftAvailable = leftSpace >= minimumRailWidth + gap;
  const rightAvailable = rightSpace >= minimumRailWidth + gap;

  if (!leftAvailable && !rightAvailable) {
    return {
      articleCenterX: Math.round((articleLeft + articleRight) / 2),
      leftRailLeft: 0,
      mode: 'stacked',
      railWidth: 0,
      rightRailLeft: Math.round(articleRight + gap),
      viewportHeight,
    };
  }

  const mode = leftAvailable && rightAvailable ? 'both' : leftAvailable ? 'left' : 'right';
  const usableSpace =
    mode === 'both' ? Math.min(leftSpace, rightSpace) : mode === 'left' ? leftSpace : rightSpace;
  const railWidth = Math.min(maximumRailWidth, Math.max(minimumRailWidth, usableSpace - gap));
  return {
    articleCenterX: Math.round((articleLeft + articleRight) / 2),
    leftRailLeft: Math.round(articleLeft - gap - railWidth),
    mode,
    railWidth: Math.round(railWidth),
    rightRailLeft: Math.round(articleRight + gap),
    viewportHeight,
  };
}

function pdfiumPromptArticle(
  article: ArticleRecord,
  anchor: Annotation['anchor'] | undefined,
  pageText: string,
): PromptArticle {
  const articleContext = promptArticle(article, pageText);
  const pageLabel = anchor && isPdfTextAnchor(anchor) ? `第 ${anchor.pageIndex + 1} 页\n` : '';
  return {
    ...articleContext,
    text: `${pageLabel}${pageText}`,
  };
}

function normalizeInitialPageIndex(article: PdfArticleRecord) {
  return clampPageIndex(article.readingProgress?.pageIndex ?? 0, article.pdf.metadata.pageCount);
}

function clampPageIndex(pageIndex: number, pageCount: number) {
  if (!Number.isFinite(pageIndex)) return 0;
  return Math.max(0, Math.min(Math.max(0, pageCount - 1), Math.trunc(pageIndex)));
}

function pageProgress(pageIndex: number, pageCount: number) {
  if (pageCount <= 1) return 1;
  return pageIndex / (pageCount - 1);
}

function pdfPageProgressPercent(pageNumber: number, pageCount: number) {
  return Number(
    (pageProgress(clampPageIndex(pageNumber - 1, pageCount), pageCount) * 100).toFixed(2),
  );
}

function pdfReadingProgress(pageIndex: number, pageCount: number): ArticleReadingProgress {
  return {
    pageIndex,
    pageCount,
    progress: pageProgress(pageIndex, pageCount),
    updatedAt: new Date().toISOString(),
  };
}
