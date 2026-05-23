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
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, List, LoaderCircle } from 'lucide-react';
import type { PdfBookmarkObject, PdfEngine, PdfPageGeometry } from '@embedpdf/models';
import {
  createPdfTextAnchor,
  isPdfTextAnchor,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
  type AgentReadingIntent,
  type ArticleReadingProgress,
  type Comment as AnnotationComment,
  type Annotation,
  type ArticleRecord,
  type PdfRect,
  type PublicAgent,
  type UserProfile,
} from '@yomitomo/shared';
import {
  annotationColor,
  annotationIdsAtHighlightPoint,
  annotationPrimaryComment,
  annotationThoughtComments,
  appendAnnotationComment,
  createUserAnnotation,
  createUserComment,
  findMentionedAgents,
  selectionActionPosition,
  type HighlightBox,
  type TocItem,
} from '@yomitomo/core';
import {
  defaultReaderSettings,
  getShortcutModifier,
  ReaderAppView,
  readerConversationStyles,
  readerDesktopEmbeddedStyles,
  readerStyles,
  selectionActionShortcut,
  mergeAgentAnnotationAsThought,
  animateTheaterHighlight,
  sleep,
  useAgentReadingDock,
  type AnnotationRailLayout,
  type VirtualCursorState,
} from '@yomitomo/reader-ui';
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
  publicReviewAgents,
  type SourceBookcaseProps,
} from './app-source-bookcase-shared';
import {
  buildAgentAnnotationRequestInput,
  runSourceAgentAnnotationRequest,
  type SourceAgentAnnotationRequestOptions,
} from './app-source-agent-request';
import { runSourceAgentCommentRequest } from './app-source-agent-comment-request';
import { runSourceAgentReviewRequest } from './app-source-agent-review-request';
import { useSourceAnnotations } from './use-source-annotations';
import { useSourceActiveConnection } from './use-source-active-connection';
import { usePendingAnnotationAgents } from './use-pending-annotation-agents';
import { useSourceSelectionComposer } from './use-source-selection-composer';

type PdfArticleRecord = ArticleRecord & { pdf: NonNullable<ArticleRecord['pdf']> };

type PageMetric = {
  left: number;
  top: number;
  width: number;
  height: number;
  clipLeft: number;
  clipTop: number;
  clipRight: number;
  clipBottom: number;
};

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
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState('');
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const {
    engine,
    error: engineError,
    isLoading,
  } = usePdfiumEngine({
    wasmUrl: pdfiumWasmUrl,
    worker: false,
  });

  useEffect(() => {
    let cancelled = false;
    setBuffer(null);
    setLoadError('');

    void window.yomitomoDesktop
      .readPdfFile(article.id)
      .then((data) => {
        if (!cancelled) setBuffer(data.slice(0));
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'PDF 读取失败');
      });

    return () => {
      cancelled = true;
    };
  }, [article.id]);

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
                        agents={agents}
                        annotations={articleAnnotations}
                        article={article}
                        documentId={activeDocumentId}
                        engine={engine}
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
  agents,
  annotations: articleAnnotations,
  article,
  documentId,
  engine,
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
  onToggleToc,
  onUpdateArticle,
}: {
  agents: SourceBookcaseProps['agents'];
  annotations: SourceBookcaseProps['annotations'];
  article: PdfArticleRecord;
  documentId: string;
  engine: PdfEngine<Blob>;
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
  onToggleToc: () => void;
  onUpdateArticle: SourceBookcaseProps['onUpdateArticle'];
}) {
  const articleRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const notesRef = useRef<HTMLElement | null>(null);
  const noteRefs = useRef(new Map<string, HTMLElement>());
  const pageMetricsFrameRef = useRef(0);
  const pageTextCacheRef = useRef(new Map<number, Promise<string>>());
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
  const [agentTheaterBoxes, setAgentTheaterBoxes] = useState<HighlightBox[]>([]);
  const [virtualCursors, setVirtualCursors] = useState<VirtualCursorState[]>([]);
  const currentPage = scroll?.getCurrentPage() || 1;
  const zoom = documentState?.scale || 1;
  const annotationAgents = useMemo(() => publicAnnotationAgents(agents), [agents]);
  const reviewAgents = useMemo(() => publicReviewAgents(agents), [agents]);
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
    annotations,
    annotationsRef,
    addComment,
    applyAnnotations,
    deleteAnnotation,
    deleteComment,
    latestArticleRef,
    saveAnnotations,
  } = useSourceAnnotations({
    annotationAgents,
    annotations: articleAnnotations,
    article,
    ignoreStaleArticleUpdates: true,
    onCommentSaved: ({ annotation, comment, mentionedAgents }) => {
      for (const agent of mentionedAgents) {
        void requestAgentComment(agent, annotation, comment);
      }
    },
    onOpenAnnotation,
    onSaveArticle,
    userProfile,
  });
  const { pendingAnnotationAgents, addPendingAnnotationAgent, removePendingAnnotationAgent } =
    usePendingAnnotationAgents();
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
  const annotationRailLayout = useMemo(
    () => pdfiumAnnotationRailLayout(pageMetrics, canvasRef.current, annotationRailViewportHeight),
    [annotationRailViewportHeight, pageMetrics],
  );
  const visiblePdfiumAnnotations = useMemo(() => {
    const visibleAnnotationIds = new Set(boxes.map((box) => box.annotationId));
    return annotations.filter((annotation) => visibleAnnotationIds.has(annotation.id));
  }, [annotations, boxes]);
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
    initialPageIndexRef.current = normalizeInitialPageIndex(article);
    lastSavedPageRef.current = initialPageIndexRef.current;
    restoredInitialPageRef.current = false;
    pageTextCacheRef.current = new Map();
    clearAgentAnnotationPlayback();
  }, [article.id, article.pdf.metadata.pageCount]);

  useEffect(() => {
    if (!scrollCapability) return;

    let frame = 0;
    const restoreInitialPage = () => {
      if (restoredInitialPageRef.current) return;
      const initialPageIndex = initialPageIndexRef.current;
      restoredInitialPageRef.current = true;
      if (initialPageIndex <= 0) return;

      frame = window.requestAnimationFrame(() => {
        scrollCapability.forDocument(documentId).scrollToPage({
          pageNumber: initialPageIndex + 1,
          behavior: 'instant',
        });
      });
    };

    const unsubscribe = scrollCapability.onLayoutReady((event) => {
      if (event.documentId === documentId) restoreInitialPage();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [documentId, scrollCapability]);

  useEffect(() => {
    if (!scroll || !documentState?.document) return;

    const saveCurrentPage = () => {
      const pageIndex = clampPageIndex(scroll.getCurrentPage() - 1, pageCount);
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
    const unsubscribe = scroll?.onScroll?.(() => {
      schedulePageMetricsUpdate();
    });
    return () => {
      unsubscribe?.();
    };
  }, [schedulePageMetricsUpdate, scroll]);

  useEffect(() => {
    if (!selectedAnnotationId) return;
    const annotation = annotations.find((item) => item.id === selectedAnnotationId);
    if (!annotation || !isPdfTextAnchor(annotation.anchor)) return;
    if (pageMetrics[annotation.anchor.pageIndex]) return;
    scroll?.scrollToPage({
      pageNumber: annotation.anchor.pageIndex + 1,
      behavior: 'smooth',
    });
  }, [annotations, pageMetrics, scroll, selectedAnnotationId]);

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

  function scrollToAnnotation(annotationId: string) {
    onOpenAnnotation(annotationId);
    const annotation = annotations.find((item) => item.id === annotationId);
    if (!annotation || !isPdfTextAnchor(annotation.anchor)) return;
    scroll?.scrollToPage({
      pageNumber: annotation.anchor.pageIndex + 1,
      behavior: 'smooth',
    });
  }

  function scrollToTocItem(item: TocItem) {
    onCloseToc();
    scroll?.scrollToPage({
      pageNumber: item.start + 1,
      behavior: 'smooth',
    });
  }

  async function currentArticleText() {
    const document = documentState?.document;
    if (!document) return '';
    const texts = await Promise.all(
      document.pages.map((_page, pageIndex) => extractPdfiumPageText(pageIndex)),
    );
    return texts
      .map((text, index) => `第 ${index + 1} 页\n${text}`)
      .filter((text) => text.trim())
      .join('\n\n');
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
      const position = pdfiumAnchorReadingPosition(anchor, pageMetrics, step);
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

    const fallbackRect = canvasRef.current?.getBoundingClientRect();
    if (!fallbackRect) return null;
    return {
      id: agent.id,
      visible: true,
      x: fallbackRect.left + Math.min(fallbackRect.width - 40, 72 + step * 12),
      y: fallbackRect.top + 56,
      label: `${agent.nickname} 正在阅读`,
      offscreen: null,
      agent,
    };
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
    const theaterBoxes = pdfiumAnnotationTheaterBoxes(annotation, pageMetrics);
    const firstBox = theaterBoxes[0];
    const lastBox = theaterBoxes[theaterBoxes.length - 1];
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!firstBox || !lastBox || !canvasRect) {
      finishPdfiumVirtualReading(cursorId);
      await appendAgentAnnotationToArticle(articleId, annotation);
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
          void requestAgentComment(agent, annotation, primaryComment, {
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
        void requestAgentAnnotation(agent, {
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

  async function requestAgentComment(
    agent: PublicAgent,
    annotation: Annotation,
    userComment: AnnotationComment,
    options: {
      instruction?: string;
      readingIntent?: AgentReadingIntent;
      pendingAnnotationId?: string;
    } = {},
  ) {
    const desktop = window.yomitomoDesktop;
    const currentArticle = latestArticleRef.current;
    if (!desktop || !currentArticle) {
      if (options.pendingAnnotationId) {
        removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
      }
      return;
    }

    try {
      await runSourceAgentCommentRequest({
        agent,
        annotation,
        userComment,
        instruction: options.instruction,
        readingIntent: options.readingIntent,
        desktop,
        currentArticle,
        articleText: await currentArticleText(),
        annotationsRef,
        applyAnnotations,
        saveAnnotations,
        setStatusMessage,
      });
    } finally {
      if (options.pendingAnnotationId) {
        removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
      }
    }
  }

  async function requestAnnotationReview(annotationId: string, selectedAgents: PublicAgent[]) {
    const desktop = window.yomitomoDesktop;
    const currentArticle = latestArticleRef.current;
    const currentAnnotation = annotationsRef.current.find(
      (annotation) => annotation.id === annotationId,
    );
    if (!desktop || !currentArticle || !currentAnnotation || selectedAgents.length === 0) return;

    await runSourceAgentReviewRequest({
      agents: selectedAgents,
      annotation: currentAnnotation,
      desktop,
      currentArticle,
      articleText: await currentArticleText(),
      annotationsRef,
      applyAnnotations,
      saveAnnotations,
      setStatusMessage,
    });
  }

  async function requestAgentAnnotation(
    agent: PublicAgent,
    options: SourceAgentAnnotationRequestOptions,
  ) {
    const desktop = window.yomitomoDesktop;
    const currentArticle = latestArticleRef.current;
    const document = documentState?.document;
    const targetAnchor = options.targetAnchor;
    const pageIndex = targetAnchor && isPdfTextAnchor(targetAnchor) ? targetAnchor.pageIndex : 0;
    const page = document?.pages[pageIndex];
    const articleId = options.articleId || currentArticle?.id;
    if (!desktop || !currentArticle || !document || !page || !articleId) {
      if (options.pendingAnnotationId) {
        removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
      }
      return;
    }
    const showProgress = latestArticleRef.current?.id === articleId;
    if (showProgress) {
      startPdfiumAgentDock(agent);
      startPdfiumVirtualReading(agent, targetAnchor);
    }

    const pageText = await extractPdfiumPageText(pageIndex);
    const geometry = await engine.getPageGeometry(document, page).toPromise();
    const articleContext =
      options.article || pdfiumPromptArticle(currentArticle, targetAnchor, pageText);
    const requestInput = buildAgentAnnotationRequestInput(agent, options, {
      article: articleContext,
      annotations: annotationsRef.current,
    });

    let acceptedAnnotation = false;
    let playbackPromise: Promise<void> = Promise.resolve();
    let requestFailed = true;
    try {
      await runSourceAgentAnnotationRequest({
        desktop,
        requestInput,
        onAnnotation: (annotation) => {
          const pdfAnnotation = pdfiumAnnotationFromAgentAnnotation(
            annotation,
            pageText,
            pageIndex,
            page.size.width,
            page.size.height,
            geometry,
          );
          if (!pdfAnnotation) return false;
          acceptedAnnotation = true;
          playbackPromise = enqueuePdfiumAgentAnnotationPlayback(articleId, pdfAnnotation);
          return true;
        },
      });
      if (showProgress) {
        if (!acceptedAnnotation) {
          finishPdfiumVirtualReading(agent.id, '没有新想法');
        } else {
          await playbackPromise;
        }
      }
      requestFailed = false;
    } finally {
      if (showProgress) {
        if (requestFailed) finishPdfiumVirtualReading(agent.id, '想法添加失败');
        finishPdfiumAgentDock(agent.id, !requestFailed);
      }
      if (options.pendingAnnotationId) {
        removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
      }
    }
  }

  async function appendAgentAnnotationToArticle(articleId: string, annotation: Annotation) {
    let currentMerge: ReturnType<typeof mergeAgentAnnotationAsThought> | null = null;
    if (latestArticleRef.current?.id === articleId) {
      const result = mergeAgentAnnotationAsThought(annotationsRef.current, annotation);
      currentMerge = result;
      applyAnnotations(result.annotations);
      onOpenAnnotation(result.activeId);
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

  const tocStats = useMemo(
    () => pdfiumTocAnnotationStats(tocItems, annotations, userProfile, annotationAgents),
    [annotationAgents, annotations, tocItems, userProfile],
  );

  return (
    <section className="source-pdfium-spike-reader" onKeyDown={handleKeyDown}>
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
      {statusMessage ? (
        <div className="pdf-reader-status" role="status">
          <span>{statusMessage}</span>
        </div>
      ) : null}
      <ReaderAppView
        activeConnection={activeConnection}
        activeId={selectedAnnotationId}
        agentAnnotateOpen={false}
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
                          textStyle={{ background: 'rgb(250 204 21 / 0.42)' }}
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
        autoExpandNewAnnotations={false}
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
        filteredAnnotations={visiblePdfiumAnnotations}
        highlightChoice={highlightChoice}
        messageSendShortcut={sendShortcut}
        noteRefs={noteRefs}
        notesRef={notesRef}
        pendingAnnotationAgents={pendingAnnotationAgents}
        readerSettings={defaultReaderSettings}
        reviewAgents={reviewAgents}
        readingSections={[]}
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
        onCancelAgentAnnotateMenu={() => undefined}
        onCancelComposer={cancelComposer}
        onClearActiveAnnotation={() => onOpenAnnotation(null)}
        onClose={onClose}
        onCloseFloatingPanels={() => undefined}
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
        onPlanFocusCoReading={async (selectedAgentIds) => ({
          id: `pdfium_focus_${Date.now()}`,
          articleId: article.id,
          selectedAgentIds,
          sections: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })}
        onRequestAnnotationReview={requestAnnotationReview}
        onSaveFocusCoReadingPlan={async () => undefined}
        onScrollToHeading={scrollToTocItem}
        onScrollToHighlight={scrollToAnnotation}
        onStartAgentReadingPlan={() => undefined}
        onToggleAgentAnnotate={() => undefined}
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

  useEffect(() => {
    if (!provides || !documentState?.document) return;
    const scope = provides.forDocument(documentId);
    const document = documentState.document;

    const unsubscribeChange = scope.onSelectionChange((selectionRange) => {
      if (!selectionRange) onSelection(null);
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
          onSelection(anchor.exact.trim() ? anchor : null);
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

function pdfiumAnnotationBoxes(
  annotations: Annotation[],
  pageMetrics: Record<number, PageMetric>,
  userProfile: UserProfile,
  agents: PublicAgent[],
): HighlightBox[] {
  return annotations.flatMap((annotation) => {
    if (!isPdfTextAnchor(annotation.anchor)) return [];
    const metric = pageMetrics[annotation.anchor.pageIndex];
    if (!metric) return [];
    return annotation.anchor.rects.flatMap((rect, index) => {
      const box = {
        id: `${annotation.id}-${index}`,
        annotationId: annotation.id,
        contributorId: annotation.agentId || annotation.userId || userProfile.id,
        color: annotationColor(annotation, userProfile, agents),
        top: metric.top + rect.y * metric.height,
        left: metric.left + rect.x * metric.width,
        width: Math.max(1, rect.width * metric.width),
        height: Math.max(2, rect.height * metric.height),
      };
      return pageMetricIntersectsBox(metric, box) ? [box] : [];
    });
  });
}

function pdfiumAnnotationTheaterBoxes(
  annotation: Annotation,
  pageMetrics: Record<number, PageMetric>,
): HighlightBox[] {
  if (!isPdfTextAnchor(annotation.anchor)) return [];
  const metric = pageMetrics[annotation.anchor.pageIndex];
  if (!metric) return [];
  return annotation.anchor.rects.flatMap((rect, index) => {
    const box = {
      id: `theater-${annotation.id}-${index}`,
      annotationId: annotation.id,
      contributorId: annotation.agentId || annotation.userId || annotation.id,
      color: annotation.color,
      top: metric.top + rect.y * metric.height,
      left: metric.left + rect.x * metric.width,
      width: Math.max(1, rect.width * metric.width),
      height: Math.max(2, rect.height * metric.height),
    };
    return pageMetricIntersectsBox(metric, box) ? [box] : [];
  });
}

function pdfiumAnnotationAgentName(annotation: Annotation) {
  return annotation.agentNickname || annotation.agentUsername || '助手';
}

function pdfiumAnchorReadingPosition(
  anchor: Annotation['anchor'],
  pageMetrics: Record<number, PageMetric>,
  step: number,
): { x: number; y: number } | null {
  if (!isPdfTextAnchor(anchor)) return null;
  const metric = pageMetrics[anchor.pageIndex];
  if (!metric) return null;
  const boxes = anchor.rects.flatMap((rect) => {
    const box = {
      top: metric.top + rect.y * metric.height,
      left: metric.left + rect.x * metric.width,
      width: Math.max(1, rect.width * metric.width),
      height: Math.max(2, rect.height * metric.height),
    };
    return pageMetricIntersectsBox(metric, box) ? [box] : [];
  });
  const totalWidth = boxes.reduce((sum, box) => sum + box.width, 0);
  if (totalWidth <= 0) return null;

  let offset = step % totalWidth;
  for (const box of boxes) {
    if (offset <= box.width) {
      return {
        x: box.left + offset,
        y: box.top + box.height / 2,
      };
    }
    offset -= box.width;
  }
  const lastBox = boxes[boxes.length - 1];
  return lastBox
    ? {
        x: lastBox.left + lastBox.width,
        y: lastBox.top + lastBox.height / 2,
      }
    : null;
}

function pdfiumTemporaryBoxes(
  anchor: ReturnType<typeof createPdfTextAnchor>,
  metric: PageMetric,
  contributorId: string,
): HighlightBox[] {
  return anchor.rects.map((rect, index) => ({
    id: `pdfium-selection-${index}`,
    annotationId: 'pdfium-selection',
    contributorId,
    color: 'hsl(var(--foreground))',
    top: metric.top + rect.y * metric.height,
    left: metric.left + rect.x * metric.width,
    width: Math.max(1, rect.width * metric.width),
    height: Math.max(2, rect.height * metric.height),
  }));
}

function pageMetricIntersectsBox(
  metric: PageMetric,
  box: Pick<HighlightBox, 'left' | 'top' | 'width' | 'height'>,
) {
  return (
    box.left + box.width >= metric.clipLeft &&
    box.left <= metric.clipRight &&
    box.top + box.height >= metric.clipTop &&
    box.top <= metric.clipBottom
  );
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

function pdfiumAnnotationFromAgentAnnotation(
  annotation: Annotation,
  pageText: string,
  pageIndex: number,
  pageWidth: number,
  pageHeight: number,
  geometry: PdfPageGeometry,
): Annotation | null {
  const range = pdfiumTextRangeForAgentAnnotation(annotation, pageText, pageIndex);
  if (!range) return null;
  const rects = pdfiumRectsForTextRange(geometry, range.start, range.end, pageWidth, pageHeight);
  if (rects.length === 0) return null;
  return {
    ...annotation,
    anchor: createPdfTextAnchor({
      pageText,
      pageIndex,
      start: range.start,
      end: range.end,
      pageWidth,
      pageHeight,
      rects,
    }),
  };
}

function pdfiumTextRangeForAgentAnnotation(
  annotation: Annotation,
  pageText: string,
  pageIndex: number,
) {
  if (isPdfTextAnchor(annotation.anchor)) {
    return annotation.anchor.pageIndex === pageIndex
      ? { start: annotation.anchor.start, end: annotation.anchor.end }
      : null;
  }
  const direct = pageText.slice(annotation.anchor.start, annotation.anchor.end);
  if (direct === annotation.anchor.exact) {
    return { start: annotation.anchor.start, end: annotation.anchor.end };
  }
  const start = pageText.indexOf(annotation.anchor.exact);
  return start >= 0 ? { start, end: start + annotation.anchor.exact.length } : null;
}

function pdfiumRectsForTextRange(
  geometry: PdfPageGeometry,
  start: number,
  end: number,
  pageWidth: number,
  pageHeight: number,
): PdfRect[] {
  const rects: PdfRect[] = [];
  for (const run of geometry.runs) {
    const runStart = run.charStart;
    const runEnd = runStart + run.glyphs.length;
    if (runEnd <= start || runStart >= end) continue;

    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (let index = Math.max(start, runStart); index < Math.min(end, runEnd); index += 1) {
      const glyph = run.glyphs[index - runStart];
      if (!glyph || glyph.flags === 2) continue;
      left = Math.min(left, glyph.x);
      top = Math.min(top, glyph.y);
      right = Math.max(right, glyph.x + glyph.width);
      bottom = Math.max(bottom, glyph.y + glyph.height);
    }
    if (left === Infinity) continue;
    rects.push({
      x: clampRatio(left / pageWidth),
      y: clampRatio(top / pageHeight),
      width: clampRatio((right - left) / pageWidth),
      height: clampRatio((bottom - top) / pageHeight),
    });
  }
  return rects;
}

function samePageMetrics(left: Record<number, PageMetric>, right: Record<number, PageMetric>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return rightKeys.every((key) => {
    const index = Number(key);
    const leftMetric = left[index];
    const rightMetric = right[index];
    return (
      !!leftMetric &&
      !!rightMetric &&
      Math.abs(leftMetric.left - rightMetric.left) < 0.5 &&
      Math.abs(leftMetric.top - rightMetric.top) < 0.5 &&
      Math.abs(leftMetric.width - rightMetric.width) < 0.5 &&
      Math.abs(leftMetric.height - rightMetric.height) < 0.5 &&
      Math.abs(leftMetric.clipLeft - rightMetric.clipLeft) < 0.5 &&
      Math.abs(leftMetric.clipTop - rightMetric.clipTop) < 0.5 &&
      Math.abs(leftMetric.clipRight - rightMetric.clipRight) < 0.5 &&
      Math.abs(leftMetric.clipBottom - rightMetric.clipBottom) < 0.5
    );
  });
}

function rectToPdfRect(
  rect: { origin: { x: number; y: number }; size: { width: number; height: number } },
  pageWidth: number,
  pageHeight: number,
): PdfRect {
  return {
    x: clampRatio(rect.origin.x / pageWidth),
    y: clampRatio(rect.origin.y / pageHeight),
    width: clampRatio(rect.size.width / pageWidth),
    height: clampRatio(rect.size.height / pageHeight),
  };
}

function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
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

function pdfReadingProgress(pageIndex: number, pageCount: number): ArticleReadingProgress {
  return {
    pageIndex,
    pageCount,
    progress: pageProgress(pageIndex, pageCount),
    updatedAt: new Date().toISOString(),
  };
}

function pdfiumBookmarkTocItems(bookmarks: PdfBookmarkObject[], pageCount: number): TocItem[] {
  const items: TocItem[] = [];

  function visit(bookmarkItems: PdfBookmarkObject[], depth: number) {
    for (const bookmark of bookmarkItems) {
      const title = bookmark.title.trim();
      const pageIndex = pdfiumBookmarkPageIndex(bookmark);
      if (title && pageIndex !== null) {
        items.push({
          index: items.length,
          text: title,
          depth,
          start: pageIndex,
          end: pageCount,
        });
      }
      if (bookmark.children?.length) visit(bookmark.children, depth + 1);
    }
  }

  visit(bookmarks, 0);
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    const nextPageItem = items.slice(itemIndex + 1).find((next) => next.start > item.start);
    item.end = nextPageItem?.start ?? pageCount;
  }
  return items;
}

function pdfiumBookmarkPageIndex(bookmark: PdfBookmarkObject): number | null {
  const target = bookmark.target;
  if (!target) return null;
  if (target.type === 'destination') return target.destination.pageIndex;
  if ('destination' in target.action) return target.action.destination.pageIndex;
  return null;
}

function pdfiumTocAnnotationStats(
  tocItems: TocItem[],
  annotations: Annotation[],
  userProfile: UserProfile,
  agents: PublicAgent[],
) {
  const stats = new Map<number, { count: number; colors: string[] }>();
  for (const item of tocItems) {
    const sectionAnnotations = annotations.filter((annotation) => {
      if (!isPdfTextAnchor(annotation.anchor)) return false;
      return annotation.anchor.pageIndex >= item.start && annotation.anchor.pageIndex < item.end;
    });
    stats.set(item.index, {
      count: sectionAnnotations.length,
      colors: Array.from(
        new Set(
          sectionAnnotations.map((annotation) => annotationColor(annotation, userProfile, agents)),
        ),
      ),
    });
  }
  return stats;
}
