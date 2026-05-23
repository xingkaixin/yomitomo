import type React from 'react';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronLeft, ChevronRight, List, LoaderCircle, ZoomIn, ZoomOut } from 'lucide-react';
import {
  GlobalWorkerOptions,
  TextLayer,
  Util,
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {
  createPdfTextAnchor,
  isPdfTextAnchor,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
  type AgentReadingIntent,
  type Annotation,
  type ArticleReadingProgress,
  type ArticleRecord,
  type Comment as AnnotationComment,
  type PdfRect,
  type PublicAgent,
  type UserProfile,
} from '@yomitomo/shared';
import {
  annotationColor,
  annotationPrimaryComment,
  annotationThoughtComments,
  appendAnnotationComment,
  annotationIdsAtHighlightPoint,
  createUserComment,
  createUserAnnotation,
  findMentionedAgents,
  selectionActionPosition,
  type HighlightBox,
  type TocItem,
} from '@yomitomo/core';
import {
  ReaderAppView,
  defaultReaderSettings,
  getShortcutModifier,
  mergeAgentAnnotationAsThought,
  readerConversationStyles,
  readerAnnotationScrollTop,
  readerDesktopEmbeddedStyles,
  readerStyles,
  selectionActionShortcut,
} from '@yomitomo/reader-ui';
import { Button } from './components/ui/button';
import type { PromptArticle } from './app-reading-types';
import {
  agentInstructionFromNote,
  articleWithMergedAgentAnnotation,
  defaultTocOpen,
  mentionDirectivesForAgent,
  planSelectionMentionRoute,
  promptArticle,
  publicAnnotationAgents,
  type SourceBookcaseProps,
} from './app-source-bookcase-shared';
import { useSourceAnnotations } from './use-source-annotations';
import { useSourceActiveConnection } from './use-source-active-connection';
import { useSourceSelectionComposer } from './use-source-selection-composer';
import { usePendingAnnotationAgents } from './use-pending-annotation-agents';
import {
  buildAgentAnnotationRequestInput,
  runSourceAgentAnnotationRequest,
  type SourceAgentAnnotationRequestOptions,
} from './app-source-agent-request';
import { runSourceAgentCommentRequest } from './app-source-agent-comment-request';

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const MIN_SCALE = 0.7;
const MAX_SCALE = 2.2;
const SCALE_STEP = 0.15;
const PAGE_STAGE_MARGIN = 56;
const PdfEmbedPdfSpikeBookcase = lazy(() =>
  import('./app-source-bookcase-pdf-embedpdf-spike').then((module) => ({
    default: module.PdfEmbedPdfSpikeBookcase,
  })),
);

type PdfArticleRecord = ArticleRecord & { pdf: NonNullable<ArticleRecord['pdf']> };

type PdfReaderState =
  | { status: 'loading'; message: string }
  | { status: 'ready'; message: string }
  | { status: 'error'; message: string };

type PdfRenderTask = {
  cancel: () => void;
  promise: Promise<unknown>;
};

type PdfTextContent = {
  items: Array<PdfTextItem | { type: string }>;
};

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

type PdfTextLayerTask = {
  cancel: () => void;
  render: () => Promise<unknown>;
  textDivs: HTMLElement[];
  textContentItemsStr: string[];
};

type PdfPageTextIndex = {
  pageIndex: number;
  pageText: string;
  spans: PdfTextSpan[];
};

type PdfTextSpan = {
  start: number;
  end: number;
  text: string;
  element?: HTMLElement;
  rect: PdfRect;
};

type PdfPageSize = {
  width: number;
  height: number;
};

type PdfPixelRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

type PdfTocItem = TocItem & {
  pageIndex: number;
};

type PdfOutlineItem = {
  title?: string;
  dest?: unknown;
  items?: PdfOutlineItem[];
};

export function PdfBookcase({
  article,
  ...props
}: SourceBookcaseProps & { article: PdfArticleRecord }) {
  return (
    <Suspense fallback={<section className="source-bookcase source-pdf-reader-shell" />}>
      <PdfEmbedPdfSpikeBookcase {...props} article={article} />
    </Suspense>
  );
}

function PdfJsBookcase({
  agents,
  annotations: articleAnnotations,
  article,
  focusAnnotationId,
  messageSendShortcut,
  selectionActionShortcuts,
  selectedAnnotationId,
  userProfile,
  onClose,
  onFocusedAnnotation,
  onOpenAnnotation,
  onSaveArticle,
  onSaveArticleReadingProgress,
  onUpdateArticle,
  onUseEmbedPdf,
}: SourceBookcaseProps & { article: PdfArticleRecord; onUseEmbedPdf: () => void }) {
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const readerCanvasRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const notesRef = useRef<HTMLElement | null>(null);
  const noteRefs = useRef(new Map<string, HTMLElement>());
  const pageFrameRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const pageCacheRef = useRef(new Map<number, Promise<PDFPageProxy>>());
  const pageTextCacheRef = useRef(new Map<number, Promise<PdfPageTextIndex>>());
  const lastSavedPageRef = useRef(normalizeInitialPageIndex(article));
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageTextIndex, setPageTextIndex] = useState<PdfPageTextIndex | null>(null);
  const [pageSize, setPageSize] = useState<PdfPageSize>({ width: 0, height: 0 });
  const [readerState, setReaderState] = useState<PdfReaderState>({
    status: 'loading',
    message: '正在打开 PDF',
  });
  const [pageIndex, setPageIndex] = useState(() => normalizeInitialPageIndex(article));
  const [fitScale, setFitScale] = useState(1);
  const [zoomOffset, setZoomOffset] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [annotatingAgentIds, setAnnotatingAgentIds] = useState<string[]>([]);
  const [commentsCloseKey, setCommentsCloseKey] = useState(0);
  const [pageOffset, setPageOffset] = useState({ left: 0, top: 0 });
  const [tocItems, setTocItems] = useState<PdfTocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(() => defaultTocOpen());
  const selectingRef = useRef(false);
  const pageCount = pdfDocument?.numPages || article.pdf.metadata.pageCount;
  const canUseEmbedPdfSpike = import.meta.env.DEV;
  const pageNumber = pageIndex + 1;
  const progress = pageProgress(pageIndex, pageCount);
  const progressPercent = Math.round(progress * 100);
  const pageLabel = `${pageNumber} / ${pageCount}`;
  const scale = clampScale(Number((fitScale + zoomOffset).toFixed(2)));
  const authorLine = article.byline || article.pdf.metadata.author;
  const annotationAgents = useMemo(() => publicAnnotationAgents(agents), [agents]);
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
    deleteComment,
    deleteAnnotation,
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
    setTemporaryBoxes,
  } = useSourceSelectionComposer({
    canvasRef: readerCanvasRef,
    onOpenComposer: () => setCommentsCloseKey((key) => key + 1),
  });
  const pageAnnotations = useMemo(
    () =>
      annotations.filter(
        (annotation) =>
          isPdfTextAnchor(annotation.anchor) && annotation.anchor.pageIndex === pageIndex,
      ),
    [annotations, pageIndex],
  );
  const boxes = useMemo(
    () =>
      pageSize.width > 0 && pageSize.height > 0
        ? pdfAnnotationBoxes(
            pageAnnotations,
            pageSize,
            pageOffset,
            userProfile,
            annotationAgents,
            pageTextIndex,
            pageFrameRef.current,
          )
        : [],
    [annotationAgents, pageAnnotations, pageOffset, pageSize, pageTextIndex, userProfile],
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
  const tocStats = useMemo(
    () => buildPdfTocAnnotationStats(tocItems, annotations, userProfile, annotationAgents),
    [annotationAgents, annotations, tocItems, userProfile],
  );
  const { activeConnection, recalculateActiveConnection } = useSourceActiveConnection({
    annotationAgents,
    annotations: pageAnnotations,
    boxes,
    canvasRef: readerCanvasRef,
    noteRefs,
    selectedAnnotationId,
    surfaceRef,
    userProfile,
  });

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: PDFDocumentProxy | null = null;
    pageCacheRef.current = new Map();
    pageTextCacheRef.current = new Map();
    setPdfDocument(null);
    setPageTextIndex(null);
    setTocItems([]);
    setTocOpen(defaultTocOpen());
    clearAnnotationUiState();
    setReaderState({ status: 'loading', message: '正在打开 PDF' });

    void window.yomitomoDesktop
      .readPdfFile(article.id)
      .then(async (data) => {
        const bytes = new Uint8Array(data);
        const loadingTask = getDocument({ data: bytes.slice() });
        loadedDocument = await loadingTask.promise;
        if (cancelled) {
          await loadedDocument.destroy();
          return;
        }
        setPdfDocument(loadedDocument);
        setReaderState({ status: 'ready', message: '' });
        setPageIndex((current) => clampPageIndex(current, loadedDocument?.numPages || pageCount));
      })
      .catch((error) => {
        if (cancelled) return;
        setReaderState({
          status: 'error',
          message: error instanceof Error ? error.message : 'PDF 打开失败',
        });
      });

    return () => {
      cancelled = true;
      pageCacheRef.current = new Map();
      if (loadedDocument) void loadedDocument.destroy();
    };
  }, [article.id, article.pdf.metadata.pageCount, clearAnnotationUiState]);

  useEffect(() => {
    setZoomOffset(0);
  }, [article.id]);

  useEffect(() => {
    if (!pdfDocument) return;
    let cancelled = false;

    void pdfOutlineTocItems(pdfDocument)
      .then((items) => {
        if (!cancelled) setTocItems(items);
      })
      .catch(() => {
        if (!cancelled) setTocItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [pdfDocument]);

  useLayoutEffect(() => {
    const pageFrame = pageFrameRef.current;
    const readerCanvas = readerCanvasRef.current;
    if (!pageFrame || !readerCanvas) return;

    let frame = 0;
    const updateOffset = () => {
      frame = 0;
      const pageRect = pageFrame.getBoundingClientRect();
      const canvasRect = readerCanvas.getBoundingClientRect();
      const nextOffset = {
        left: Math.round(pageRect.left - canvasRect.left),
        top: Math.round(pageRect.top - canvasRect.top),
      };
      setPageOffset((current) =>
        current.left === nextOffset.left && current.top === nextOffset.top ? current : nextOffset,
      );
    };
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateOffset);
    };

    scheduleUpdate();
    window.addEventListener('resize', scheduleUpdate);

    if (!('ResizeObserver' in window)) {
      return () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener('resize', scheduleUpdate);
      };
    }

    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(pageFrame);
    observer.observe(readerCanvas);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', scheduleUpdate);
      observer.disconnect();
    };
  }, [pageSize.height, pageSize.width, scale]);

  useEffect(() => {
    if (!pdfDocument) return;
    const document = pdfDocument;
    const stageElement = surfaceRef.current;
    if (!stageElement) return;
    const measuredStage: HTMLDivElement = stageElement;

    let cancelled = false;

    function updateFitScale(page: PDFPageProxy) {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(1, measuredStage.clientWidth - PAGE_STAGE_MARGIN);
      const availableHeight = Math.max(1, measuredStage.clientHeight - PAGE_STAGE_MARGIN);
      const nextScale = clampScale(
        Math.min(availableWidth / viewport.width, availableHeight / viewport.height),
      );
      setFitScale(Number(nextScale.toFixed(2)));
    }

    function scheduleUpdate() {
      void pageForIndex(document, pageCacheRef.current, pageIndex).then(updateFitScale);
    }

    scheduleUpdate();

    if (!('ResizeObserver' in window))
      return () => {
        cancelled = true;
      };

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(measuredStage);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
    };
  }, [pageIndex, pdfDocument]);

  useEffect(() => {
    if (!pdfDocument) return;

    let cancelled = false;
    let renderTask: PdfRenderTask | null = null;

    void pageForIndex(pdfDocument, pageCacheRef.current, pageIndex)
      .then(async (page) => {
        if (cancelled) return;
        const canvas = pdfCanvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;

        const viewport = page.getViewport({ scale });
        const pixelRatio = window.devicePixelRatio || 1;
        setPageSize({ width: viewport.width, height: viewport.height });
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.clearRect(0, 0, viewport.width, viewport.height);

        renderTask = page.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
        if (!cancelled) setReaderState({ status: 'ready', message: '' });
      })
      .catch((error) => {
        if (cancelled || isPdfRenderCancelled(error)) return;
        setReaderState({
          status: 'error',
          message: error instanceof Error ? error.message : 'PDF 页面渲染失败',
        });
      });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pageIndex, pdfDocument, scale]);

  useEffect(() => {
    if (!pdfDocument) return;
    const container = textLayerRef.current;
    if (!container) return;

    let cancelled = false;
    let textLayer: PdfTextLayerTask | null = null;
    container.replaceChildren();
    setPageTextIndex(null);

    void pageForIndex(pdfDocument, pageCacheRef.current, pageIndex)
      .then(async (page) => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const textIndex = await pageTextIndexForPage(page, pageTextCacheRef.current, pageIndex);
        if (cancelled) return;
        const content = await page.getTextContent();
        textLayer = new TextLayer({
          container,
          textContentSource: content,
          viewport,
        }) as PdfTextLayerTask;
        await textLayer.render();
        if (cancelled) return;
        attachTextLayerSpans(textIndex, textLayer.textDivs, textLayer.textContentItemsStr);
        setPageTextIndex(textIndex);
      })
      .catch((error) => {
        if (cancelled || isPdfRenderCancelled(error)) return;
        setStatusMessage(error instanceof Error ? error.message : 'PDF 文本层解析失败');
      });

    return () => {
      cancelled = true;
      textLayer?.cancel();
    };
  }, [pageIndex, pdfDocument, scale]);

  useEffect(() => {
    if (!pdfDocument) return;
    for (const nextIndex of [pageIndex - 1, pageIndex + 1]) {
      if (nextIndex < 0 || nextIndex >= pdfDocument.numPages) continue;
      void pageForIndex(pdfDocument, pageCacheRef.current, nextIndex);
    }
  }, [pageIndex, pdfDocument]);

  useEffect(() => {
    const stopSelecting = () => {
      selectingRef.current = false;
    };
    window.addEventListener('mouseup', stopSelecting);
    return () => window.removeEventListener('mouseup', stopSelecting);
  }, []);

  useEffect(() => {
    if (!pdfDocument || readerState.status !== 'ready') return;
    if (lastSavedPageRef.current === pageIndex) return;
    lastSavedPageRef.current = pageIndex;
    onSaveArticleReadingProgress(article.id, pdfReadingProgress(pageIndex, pdfDocument.numPages));
  }, [article.id, onSaveArticleReadingProgress, pageIndex, pdfDocument, readerState.status]);

  useEffect(() => {
    if (!focusAnnotationId) return;
    const annotation = annotations.find((item) => item.id === focusAnnotationId);
    if (!annotation) {
      onFocusedAnnotation();
      return;
    }
    if (isPdfTextAnchor(annotation.anchor)) {
      goToPage(annotation.anchor.pageIndex);
      onOpenAnnotation(annotation.id);
    }
    onFocusedAnnotation();
  }, [annotations, focusAnnotationId, onFocusedAnnotation, onOpenAnnotation]);

  function goToPage(nextIndex: number) {
    if (readerState.status === 'error') return;
    clearAnnotationUiState();
    setPageIndex(clampPageIndex(nextIndex, pageCount));
  }

  function changeScale(delta: number) {
    const nextScale = clampScale(Number((scale + delta).toFixed(2)));
    setZoomOffset((current) => Number((current + nextScale - scale).toFixed(2)));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, .reader-composer')) return;

    if (selectionAction && !composer) {
      const shortcut = selectionActionShortcut(event, actionShortcuts);
      if (shortcut === 'copy') {
        event.preventDefault();
        void copySelection(selectionAction);
        return;
      }
      if (shortcut === 'annotate') {
        event.preventDefault();
        openComposer(selectionAction);
        return;
      }
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goToPage(pageIndex - 1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goToPage(pageIndex + 1);
    }
  }

  function openAnnotation(annotationId: string) {
    clearAnnotationUiState();
    onOpenAnnotation(annotationId);
  }

  const scrollToAnnotation = useCallback(
    (annotationId: string) => {
      const surfaceElement = surfaceRef.current;
      const canvasElement = readerCanvasRef.current;
      if (!surfaceElement || !canvasElement) return false;

      const top = readerAnnotationScrollTop({
        annotationId,
        boxes,
        canvasOffsetTop: canvasElement.offsetTop,
        scrollHeight: surfaceElement.scrollHeight,
        viewportHeight: surfaceElement.clientHeight,
      });
      if (top === null) return false;

      surfaceElement.scrollTo({ top, behavior: 'smooth' });
      return true;
    },
    [boxes],
  );

  function handleHighlightClick(
    annotationId: string,
    event: React.MouseEvent<HTMLButtonElement>,
    visibleAnnotationIds: string[],
  ) {
    const canvasElement = readerCanvasRef.current;
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

  function handlePageMouseDown(event: React.MouseEvent<HTMLElement>) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.reader-selection-menu, .reader-composer')) return;
    selectingRef.current = true;
    clearSelection();
  }

  function handlePageMouseMove() {
    if (!selectingRef.current) return;
    previewCurrentSelection();
  }

  function handlePageMouseUp(event: React.MouseEvent<HTMLElement>) {
    selectingRef.current = false;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.reader-selection-menu, .reader-composer')) return;

    const pageFrame = pageFrameRef.current;
    const readerCanvas = readerCanvasRef.current;
    const textLayer = textLayerRef.current;
    if (!pageFrame || !readerCanvas || !textLayer || !pageTextIndex) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      clearSelection();
      return;
    }

    const range = selection.getRangeAt(0);
    if (!rangeEndpointsInsideTextLayer(range, textLayer)) {
      clearSelection();
      selection.removeAllRanges();
      return;
    }
    const anchor = anchorFromSelection(range, pageTextIndex, pageFrame);
    if (!anchor?.exact.trim()) {
      clearSelection();
      selection.removeAllRanges();
      return;
    }

    const lastRect = pdfAnchorLastPixelRect(anchor, pageFrame);
    if (!lastRect) {
      clearSelection();
      selection.removeAllRanges();
      return;
    }
    const canvasRect = readerCanvas.getBoundingClientRect();
    openSelectionAction(
      {
        ...selectionActionPosition(pdfPixelRectToDomRect(lastRect), canvasRect),
        anchor,
      },
      pdfTemporaryBoxes(anchor, pageSize, pageOffset, userProfile.id),
    );
    selection.removeAllRanges();
  }

  function previewCurrentSelection() {
    const pageFrame = pageFrameRef.current;
    const textLayer = textLayerRef.current;
    if (!pageFrame || !textLayer || !pageTextIndex) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      setTemporaryBoxes((currentBoxes) => (currentBoxes.length > 0 ? [] : currentBoxes));
      return;
    }

    const range = selection.getRangeAt(0);
    if (!rangeEndpointsInsideTextLayer(range, textLayer)) return;
    const anchor = anchorFromSelection(range, pageTextIndex, pageFrame);
    if (!anchor?.exact.trim()) return;
    setTemporaryBoxes(pdfTemporaryBoxes(anchor, pageSize, pageOffset, userProfile.id));
  }

  function scrollToTocItem(item: TocItem) {
    setTocOpen(false);
    const pdfItem = tocItems.find((tocItem) => tocItem.index === item.index);
    goToPage(pdfItem?.pageIndex ?? item.start);
  }

  async function createAnnotationFromComposer(note: string) {
    if (!composer) return;
    const currentComposer = composer;
    const currentArticle = latestArticleRef.current;
    if (!currentArticle) return;
    const articleContext = pdfPromptArticle(currentArticle, pageTextIndex);
    cancelComposer();
    const annotation = createUserAnnotation(currentComposer.anchor, userProfile, '');
    const mentionedAgents = findMentionedAgents(note, annotationAgents);
    await saveAnnotations([...currentArticle.annotations, annotation]);
    openAnnotation(annotation.id);
    for (const agent of mentionedAgents) addPendingAnnotationAgent(annotation.id, agent);

    if (mentionedAgents.length === 0) {
      const comment = createUserComment(userProfile, note, { now: annotation.createdAt });
      const nextAnnotations = appendAnnotationComment(
        annotationsRef.current,
        annotation.id,
        comment,
        annotation.createdAt,
      );
      if (nextAnnotations) await saveAnnotations(nextAnnotations);
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
      const comment = createUserComment(userProfile, note, { now: annotation.createdAt });
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
        void requestAgentAnnotation(agent, {
          targetAnchor: currentComposer.anchor,
          instruction: directive.instruction || agentInstructionFromNote(note, [agent]),
          readingIntent: directive.readingIntent,
          article: articleContext,
          articleId: currentArticle.id,
          pendingAnnotationId: annotation.id,
        });
        scheduledAgentRequest = true;
      }
      if (!scheduledAgentRequest) {
        removePendingAnnotationAgent(annotation.id, agent.id);
      }
    }
  }

  async function requestAgentAnnotation(
    agent: PublicAgent,
    options: SourceAgentAnnotationRequestOptions,
  ) {
    const desktop = window.yomitomoDesktop;
    const currentArticle = latestArticleRef.current;
    const articleId = options.articleId || currentArticle?.id;
    const textIndex = pageTextIndex;
    const articleContext =
      options.article || (currentArticle ? pdfPromptArticle(currentArticle, textIndex) : null);
    if (!desktop || !articleId || !articleContext || !textIndex || !textIndex.pageText.trim()) {
      if (options.pendingAnnotationId) {
        removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
      }
      return;
    }
    if (annotatingAgentIds.includes(agent.id)) return;

    setAnnotatingAgentIds((ids) => [...ids, agent.id]);
    setStatusMessage(`${agent.nickname} 正在添加想法`);
    try {
      const requestInput = buildAgentAnnotationRequestInput(agent, options, {
        article: articleContext,
        annotations: annotationsRef.current,
      });
      await runSourceAgentAnnotationRequest({
        desktop,
        requestInput,
        onAnnotation: (annotation) => {
          const pdfAnnotation = pdfAnnotationFromAgentAnnotation(annotation, textIndex, pageSize);
          if (!pdfAnnotation) return false;
          void appendAgentAnnotationToArticle(articleId, pdfAnnotation);
          return true;
        },
      });
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'PDF AI 批注失败');
      window.setTimeout(() => setStatusMessage(''), 1800);
    } finally {
      setAnnotatingAgentIds((ids) => ids.filter((id) => id !== agent.id));
      if (options.pendingAnnotationId) {
        removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
      }
      setStatusMessage((message) => (message.includes('正在添加想法') ? '' : message));
    }
  }

  async function appendAgentAnnotationToArticle(articleId: string, annotation: Annotation) {
    let currentMerge: ReturnType<typeof mergeAgentAnnotationAsThought> | null = null;
    if (latestArticleRef.current?.id === articleId) {
      const result = mergeAgentAnnotationAsThought(annotationsRef.current, annotation);
      currentMerge = result;
      applyAnnotations(result.annotations);
      openAnnotation(result.activeId);
    }
    await onUpdateArticle(articleId, (targetArticle) => {
      const result = articleWithMergedAgentAnnotation(targetArticle, annotation, currentMerge);
      return result.article;
    });
  }

  async function requestAgentComment(
    agent: PublicAgent,
    annotation: Annotation,
    userComment: AnnotationComment,
    reviewTargetCommentId?: string,
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
        articleText: pageTextIndex?.pageText || '',
        reviewTargetCommentId,
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

  return (
    <section className="source-bookcase source-pdf-reader-shell" onKeyDown={handleKeyDown}>
      <style>{`${readerStyles}\n${readerConversationStyles}\n${readerDesktopEmbeddedStyles}`}</style>
      <header className="pdf-reader-toolbar">
        <button className="source-reader-back-button" type="button" onClick={onClose}>
          <ChevronLeft size={16} />
          <span>返回阅读库</span>
        </button>
        <div className="pdf-reader-title">
          <strong title={article.title}>{article.title}</strong>
          {authorLine ? <span>{authorLine}</span> : null}
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
          <Button
            aria-label="上一页"
            disabled={readerState.status === 'error' || pageIndex <= 0}
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => goToPage(pageIndex - 1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <label className="pdf-page-field">
            <input
              aria-label="页码"
              disabled={readerState.status === 'error'}
              inputMode="numeric"
              max={pageCount}
              min={1}
              type="number"
              value={pageNumber}
              onChange={(event) => goToPage(Number(event.target.value) - 1)}
            />
            <span>/ {pageCount}</span>
          </label>
          <Button
            aria-label="下一页"
            disabled={readerState.status === 'error' || pageIndex >= pageCount - 1}
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => goToPage(pageIndex + 1)}
          >
            <ChevronRight size={16} />
          </Button>
          <div className="pdf-reader-zoom" aria-label="PDF 缩放控制">
            <Button
              aria-label="缩小"
              disabled={scale <= MIN_SCALE}
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => changeScale(-SCALE_STEP)}
            >
              <ZoomOut size={16} />
            </Button>
            <span>{Math.round(scale * 100)}%</span>
            <Button
              aria-label="放大"
              disabled={scale >= MAX_SCALE}
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => changeScale(SCALE_STEP)}
            >
              <ZoomIn size={16} />
            </Button>
          </div>
          {canUseEmbedPdfSpike ? (
            <Button size="sm" type="button" variant="outline" onClick={onUseEmbedPdf}>
              PDFium 实验
            </Button>
          ) : null}
        </div>
      </header>
      <div className="pdf-reader-main">
        <ReaderAppView
          activeConnection={activeConnection}
          activeId={selectedAnnotationId}
          agentAnnotateOpen={false}
          agentDockCompleting={false}
          agentDockItems={[]}
          agentTheaterBoxes={[]}
          agents={annotationAgents}
          annotatingAgents={annotatingAgentIds}
          annotationTotals={annotationTotals}
          annotations={pageAnnotations}
          articleContent={
            <div
              ref={stageRef}
              className="pdf-page-stage"
              tabIndex={0}
              onMouseDown={handlePageMouseDown}
              onMouseMove={handlePageMouseMove}
            >
              <div
                ref={pageFrameRef}
                className="pdf-page-frame"
                style={{
                  width: pageSize.width || undefined,
                  height: pageSize.height || undefined,
                }}
              >
                <canvas
                  ref={pdfCanvasRef}
                  className="pdf-page-canvas"
                  aria-label={`PDF 第 ${pageLabel} 页`}
                />
                <div ref={textLayerRef} className="pdf-text-layer" />
              </div>
              {readerState.status !== 'ready' ? (
                <div className={`pdf-reader-status is-${readerState.status}`} role="status">
                  {readerState.status === 'loading' ? (
                    <LoaderCircle className="is-spinning" size={18} />
                  ) : null}
                  <span>{readerState.message}</span>
                </div>
              ) : null}
              {statusMessage ? (
                <div className="pdf-reader-status" role="status">
                  {annotatingAgentIds.length > 0 ? (
                    <LoaderCircle className="is-spinning" size={18} />
                  ) : null}
                  <span>{statusMessage}</span>
                </div>
              ) : null}
              {readerState.status === 'ready' && pageTextIndex?.pageText.trim() === '' ? (
                <div className="pdf-reader-text-empty">该页没有可选择文本，暂不支持文字批注。</div>
              ) : null}
            </div>
          }
          articleId={article.id}
          articleRef={articleRef}
          boxes={boxes}
          canvasRef={readerCanvasRef}
          commentsCloseKey={commentsCloseKey}
          composer={composer}
          completionBurstKey={0}
          embedded
          extracted={{ title: article.title, byline: authorLine, content: '' }}
          filteredAnnotations={pageAnnotations}
          highlightChoice={highlightChoice}
          messageSendShortcut={sendShortcut}
          noteRefs={noteRefs}
          notesRef={notesRef}
          pendingAnnotationAgents={pendingAnnotationAgents}
          readerSettings={defaultReaderSettings}
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
          virtualCursors={[]}
          onAddComment={addComment}
          onAnnotationLayoutChange={recalculateActiveConnection}
          onCancelAgentAnnotateMenu={() => undefined}
          onCancelComposer={cancelComposer}
          onClearActiveAnnotation={() => onOpenAnnotation(null)}
          onClose={onClose}
          onCloseFloatingPanels={() => undefined}
          onCloseHighlightChoice={() => setHighlightChoice(null)}
          onCloseResponsivePanels={() => setTocOpen(false)}
          onCopySelection={copySelection}
          onCreateAnnotation={createAnnotationFromComposer}
          onDeleteAnnotation={deleteAnnotation}
          onDeleteComment={deleteComment}
          onFocusAnnotation={openAnnotation}
          onHighlightClick={handleHighlightClick}
          onMouseUp={handlePageMouseUp}
          onOpenComposer={openComposer}
          onPlanFocusCoReading={async (selectedAgentIds) => ({
            id: `pdf_focus_${Date.now()}`,
            articleId: article.id,
            selectedAgentIds,
            sections: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })}
          onSaveFocusCoReadingPlan={async () => undefined}
          onScrollToHeading={scrollToTocItem}
          onScrollToHighlight={(annotationId) => {
            openAnnotation(annotationId);
            scrollToAnnotation(annotationId);
          }}
          onStartAgentReadingPlan={() => undefined}
          onToggleAgentAnnotate={() => undefined}
          onToggleSettings={() => undefined}
          onToggleToc={() => setTocOpen((open) => !open)}
          onUpdateReaderSettings={async () => undefined}
        />
      </div>
      <footer className="pdf-reader-progress ebook-reader-progress">
        <input
          aria-label="快速跳转 PDF 阅读进度"
          className="pdf-progress-slider ebook-progress-slider"
          disabled={readerState.status === 'error'}
          max="1"
          min="0"
          step="any"
          style={{ '--ebook-progress-percent': `${progressPercent}%` } as React.CSSProperties}
          type="range"
          value={progress}
          onChange={(event) => goToPage(Math.round(Number(event.target.value) * (pageCount - 1)))}
        />
      </footer>
    </section>
  );
}

function normalizeInitialPageIndex(article: PdfArticleRecord) {
  return clampPageIndex(article.readingProgress?.pageIndex ?? 0, article.pdf.metadata.pageCount);
}

function clampPageIndex(pageIndex: number, pageCount: number) {
  if (!Number.isFinite(pageIndex)) return 0;
  return Math.max(0, Math.min(Math.max(0, pageCount - 1), Math.trunc(pageIndex)));
}

function clampScale(scale: number) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
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

function pageForIndex(
  pdfDocument: PDFDocumentProxy,
  pageCache: Map<number, Promise<PDFPageProxy>>,
  pageIndex: number,
) {
  const pageNumber = pageIndex + 1;
  const cached = pageCache.get(pageNumber);
  if (cached) return cached;

  const page = pdfDocument.getPage(pageNumber);
  pageCache.set(pageNumber, page);
  return page;
}

async function pdfOutlineTocItems(pdfDocument: PDFDocumentProxy): Promise<PdfTocItem[]> {
  const outline = (await pdfDocument.getOutline()) as PdfOutlineItem[] | null;
  if (!outline?.length) return [];

  const items: PdfTocItem[] = [];
  let index = 0;

  async function visit(outlineItems: PdfOutlineItem[], depth: number) {
    for (const item of outlineItems) {
      const title = item.title?.trim();
      const pageIndex = await pdfOutlinePageIndex(pdfDocument, item.dest);
      if (title && pageIndex !== null) {
        items.push({
          index,
          text: title,
          depth,
          start: pageIndex,
          end: pdfDocument.numPages,
          pageIndex,
        });
        index += 1;
      }
      if (item.items?.length) await visit(item.items, depth + 1);
    }
  }

  await visit(outline, 0);
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    const nextPageItem = items.slice(itemIndex + 1).find((next) => next.pageIndex > item.pageIndex);
    item.end = nextPageItem?.pageIndex ?? pdfDocument.numPages;
  }
  return items;
}

async function pdfOutlinePageIndex(pdfDocument: PDFDocumentProxy, dest: unknown) {
  const explicitDest =
    typeof dest === 'string'
      ? ((await pdfDocument.getDestination(dest)) as unknown)
      : Array.isArray(dest)
        ? dest
        : null;
  if (!Array.isArray(explicitDest) || explicitDest.length === 0) return null;

  const pageRef = explicitDest[0];
  const pageIndex =
    typeof pageRef === 'number' ? pageRef - 1 : await pdfDocument.getPageIndex(pageRef);
  if (!Number.isInteger(pageIndex)) return null;
  return clampPageIndex(pageIndex, pdfDocument.numPages);
}

function pageTextIndexForPage(
  page: PDFPageProxy,
  cache: Map<number, Promise<PdfPageTextIndex>>,
  pageIndex: number,
) {
  const cached = cache.get(pageIndex);
  if (cached) return cached;

  const textIndex = page.getTextContent().then((content) => {
    const viewport = page.getViewport({ scale: 1 });
    let cursor = 0;
    const spans: PdfTextSpan[] = [];
    const pageText = (content as PdfTextContent).items
      .filter(isTextItem)
      .map((item) => {
        const start = cursor;
        const text = item.str;
        cursor += text.length;
        spans.push({
          start,
          end: cursor,
          text,
          rect: textItemRect(item, viewport.transform, viewport.width, viewport.height),
        });
        return text;
      })
      .join('');
    return { pageIndex, pageText, spans };
  });
  cache.set(pageIndex, textIndex);
  return textIndex;
}

function isTextItem(item: PdfTextItem | { type: string }): item is PdfTextItem {
  return 'str' in item && typeof item.str === 'string';
}

function pdfPromptArticle(
  article: ArticleRecord,
  textIndex: PdfPageTextIndex | null,
): PromptArticle {
  const articleContext = promptArticle(article, textIndex?.pageText || '');
  return {
    ...articleContext,
    text: textIndex ? `第 ${textIndex.pageIndex + 1} 页\n${textIndex.pageText}` : '',
  };
}

function textItemRect(
  item: PdfTextItem,
  viewportTransform: number[],
  pageWidth: number,
  pageHeight: number,
): PdfRect {
  const [, , , fontHeight, x, y] = Util.transform(viewportTransform, item.transform);
  const height = Math.abs(fontHeight || item.height);
  return {
    x: clampRatio(x / pageWidth),
    y: clampRatio((y - height) / pageHeight),
    width: clampRatio(item.width / pageWidth),
    height: clampRatio(height / pageHeight),
  };
}

function attachTextLayerSpans(
  textIndex: PdfPageTextIndex,
  textDivs: HTMLElement[],
  textContentItemsStr: string[],
) {
  let textItemIndex = 0;
  for (const textDiv of textDivs) {
    const text = textContentItemsStr[textItemIndex] || textDiv.textContent || '';
    while (
      textItemIndex < textIndex.spans.length &&
      textIndex.spans[textItemIndex]?.text !== text
    ) {
      textItemIndex += 1;
    }
    const span = textIndex.spans[textItemIndex];
    if (!span) continue;
    span.element = textDiv;
    textDiv.dataset.pdfTextStart = String(span.start);
    textDiv.dataset.pdfTextEnd = String(span.end);
    textItemIndex += 1;
  }
}

function anchorFromSelection(range: Range, textIndex: PdfPageTextIndex, pageFrame: HTMLElement) {
  const start = textOffsetFromNode(range.startContainer, range.startOffset);
  const end = textOffsetFromNode(range.endContainer, range.endOffset);
  if (!start || !end) return null;

  const safeStart = Math.min(start.offset, end.offset);
  const safeEnd = Math.max(start.offset, end.offset);
  if (safeStart === safeEnd) return null;

  return createPdfTextAnchor({
    pageText: textIndex.pageText,
    pageIndex: textIndex.pageIndex,
    start: safeStart,
    end: safeEnd,
    pageWidth: pageFrame.clientWidth,
    pageHeight: pageFrame.clientHeight,
    rects: rectsForTextRange(textIndex, safeStart, safeEnd, pageFrame),
  });
}

function textOffsetFromNode(node: Node, offset: number) {
  const element =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : node instanceof Element ? node : null;
  const textElement = element?.closest<HTMLElement>('[data-pdf-text-start]');
  if (!textElement) return null;

  const start = Number(textElement.dataset.pdfTextStart);
  const textLength = textElement.textContent?.length || 0;
  const safeOffset = Math.max(0, Math.min(offset, textLength));
  return Number.isFinite(start) ? { offset: start + safeOffset } : null;
}

function rangeEndpointsInsideTextLayer(range: Range, textLayer: HTMLElement) {
  const start =
    range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : range.startContainer instanceof Element
        ? range.startContainer
        : null;
  const end =
    range.endContainer.nodeType === Node.TEXT_NODE
      ? range.endContainer.parentElement
      : range.endContainer instanceof Element
        ? range.endContainer
        : null;
  return Boolean(start && end && textLayer.contains(start) && textLayer.contains(end));
}

function clippedRect(rect: DOMRect, bounds: DOMRect): PdfPixelRect[] {
  const left = Math.max(rect.left, bounds.left);
  const right = Math.min(rect.right, bounds.right);
  const top = Math.max(rect.top, bounds.top);
  const bottom = Math.min(rect.bottom, bounds.bottom);
  if (right - left < 2 || bottom - top < 2) return [];
  return [{ left, right, top, bottom, width: right - left, height: bottom - top }];
}

function pdfAnchorLastPixelRect(
  anchor: ReturnType<typeof createPdfTextAnchor>,
  pageFrame: HTMLElement,
) {
  const rect = anchor.rects[anchor.rects.length - 1];
  if (!rect) return null;
  const frameRect = pageFrame.getBoundingClientRect();
  const left = frameRect.left + rect.x * frameRect.width;
  const top = frameRect.top + rect.y * frameRect.height;
  const width = rect.width * frameRect.width;
  const height = rect.height * frameRect.height;
  return {
    left,
    right: left + width,
    top,
    bottom: top + height,
    width,
    height,
  };
}

function pdfPixelRectToDomRect(rect: PdfPixelRect): DOMRect {
  return {
    x: rect.left,
    y: rect.top,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    toJSON: () => ({}),
  };
}

function pdfAnnotationFromAgentAnnotation(
  annotation: Annotation,
  textIndex: PdfPageTextIndex,
  pageSize: PdfPageSize,
): Annotation | null {
  const range = textRangeForAgentAnnotation(annotation, textIndex);
  if (!range) return null;
  const rects = rectsForTextRange(textIndex, range.start, range.end);
  if (rects.length === 0) return null;
  return {
    ...annotation,
    anchor: createPdfTextAnchor({
      pageText: textIndex.pageText,
      pageIndex: textIndex.pageIndex,
      start: range.start,
      end: range.end,
      pageWidth: pageSize.width,
      pageHeight: pageSize.height,
      rects,
    }),
  };
}

function textRangeForAgentAnnotation(annotation: Annotation, textIndex: PdfPageTextIndex) {
  if (isPdfTextAnchor(annotation.anchor)) {
    return annotation.anchor.pageIndex === textIndex.pageIndex
      ? { start: annotation.anchor.start, end: annotation.anchor.end }
      : null;
  }
  const direct = textIndex.pageText.slice(annotation.anchor.start, annotation.anchor.end);
  if (direct === annotation.anchor.exact) {
    return { start: annotation.anchor.start, end: annotation.anchor.end };
  }
  const start = textIndex.pageText.indexOf(annotation.anchor.exact);
  return start >= 0 ? { start, end: start + annotation.anchor.exact.length } : null;
}

function rectsForTextRange(
  textIndex: PdfPageTextIndex,
  start: number,
  end: number,
  pageFrame?: HTMLElement,
) {
  const spans = textIndex.spans.filter((span) => span.end > start && span.start < end);
  if (pageFrame) {
    const frameRect = pageFrame.getBoundingClientRect();
    const rects = spans.flatMap((span) =>
      textSpanRangeRects(span, start, end, frameRect).map((rect) => ({
        x: clampRatio((rect.left - frameRect.left) / frameRect.width),
        y: clampRatio((rect.top - frameRect.top) / frameRect.height),
        width: clampRatio(rect.width / frameRect.width),
        height: clampRatio(rect.height / frameRect.height),
      })),
    );
    if (rects.length > 0) return mergePdfRatioLineRects(rects);
  }

  return mergePdfRatioLineRects(
    spans.flatMap((span) => (selectedSpanText(span, start, end).trim() ? [span.rect] : [])),
  );
}

function textSpanRangeRects(
  span: PdfTextSpan,
  start: number,
  end: number,
  frameRect: DOMRect,
): PdfPixelRect[] {
  const localStart = Math.max(0, start - span.start);
  const localEnd = Math.min(span.text.length, end - span.start);
  const trimmed = trimSpanSelection(span.text, localStart, localEnd);
  if (!trimmed) return [];

  const textNode = Array.from(span.element?.childNodes || []).find(
    (node) => node.nodeType === Node.TEXT_NODE,
  );
  if (!textNode) return [];

  const range = document.createRange();
  range.setStart(textNode, trimmed.start);
  range.setEnd(textNode, trimmed.end);
  const rects = Array.from(range.getClientRects()).flatMap((rect) => clippedRect(rect, frameRect));
  range.detach();
  return rects;
}

function selectedSpanText(span: PdfTextSpan, start: number, end: number) {
  return span.text.slice(
    Math.max(0, start - span.start),
    Math.min(span.text.length, end - span.start),
  );
}

function trimSpanSelection(text: string, start: number, end: number) {
  let trimmedStart = start;
  let trimmedEnd = end;
  while (trimmedStart < trimmedEnd && /\s/.test(text[trimmedStart] || '')) trimmedStart += 1;
  while (trimmedEnd > trimmedStart && /\s/.test(text[trimmedEnd - 1] || '')) trimmedEnd -= 1;
  return trimmedStart < trimmedEnd ? { start: trimmedStart, end: trimmedEnd } : null;
}

function mergePdfRatioLineRects(rects: PdfRect[]): PdfRect[] {
  const lines: PdfRect[] = [];
  for (const rect of rects.toSorted((left, right) => left.y - right.y || left.x - right.x)) {
    const line = lines.find((item) => samePdfRatioLine(item, rect));
    if (!line) {
      lines.push({ ...rect });
      continue;
    }
    const left = Math.min(line.x, rect.x);
    const right = Math.max(line.x + line.width, rect.x + rect.width);
    const top = Math.min(line.y, rect.y);
    const bottom = Math.max(line.y + line.height, rect.y + rect.height);
    line.x = left;
    line.y = top;
    line.width = right - left;
    line.height = bottom - top;
  }
  return lines;
}

function samePdfRatioLine(left: PdfRect, right: PdfRect) {
  return Math.abs(ratioRectCenterY(left) - ratioRectCenterY(right)) <= 0.004;
}

function ratioRectCenterY(rect: PdfRect) {
  return rect.y + rect.height / 2;
}

function pdfAnnotationBoxes(
  annotations: Annotation[],
  pageSize: PdfPageSize,
  pageOffset: { left: number; top: number },
  userProfile: UserProfile,
  agents: PublicAgent[],
  textIndex: PdfPageTextIndex | null,
  pageFrame: HTMLElement | null,
): HighlightBox[] {
  return annotations.flatMap((annotation) => {
    if (!isPdfTextAnchor(annotation.anchor)) return [];
    const color = annotationColor(annotation, userProfile, agents);
    const rects =
      textIndex?.pageIndex === annotation.anchor.pageIndex
        ? rectsForTextRange(
            textIndex,
            annotation.anchor.start,
            annotation.anchor.end,
            pageFrame || undefined,
          )
        : [];
    return mergePdfRatioLineRects(rects.length > 0 ? rects : annotation.anchor.rects).map(
      (rect, index) => ({
        id: `${annotation.id}-${index}`,
        annotationId: annotation.id,
        contributorId: annotation.agentId || annotation.userId || userProfile.id,
        color,
        top: pageOffset.top + rect.y * pageSize.height,
        left: pageOffset.left + rect.x * pageSize.width,
        width: Math.max(1, rect.width * pageSize.width),
        height: Math.max(2, rect.height * pageSize.height),
      }),
    );
  });
}

function buildPdfTocAnnotationStats(
  tocItems: PdfTocItem[],
  annotations: Annotation[],
  userProfile: UserProfile,
  agents: PublicAgent[],
) {
  const stats = new Map<number, { count: number; colors: string[] }>();

  for (const item of tocItems) {
    const sectionAnnotations = annotations.filter(
      (annotation) =>
        isPdfTextAnchor(annotation.anchor) &&
        annotation.anchor.pageIndex >= item.start &&
        annotation.anchor.pageIndex < item.end,
    );
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

function pdfTemporaryBoxes(
  anchor: ReturnType<typeof createPdfTextAnchor>,
  pageSize: PdfPageSize,
  pageOffset: { left: number; top: number },
  contributorId: string,
): HighlightBox[] {
  return anchor.rects.map((rect, index) => ({
    id: `pdf-selection-${index}`,
    annotationId: 'pdf-selection',
    contributorId,
    color: 'hsl(var(--foreground))',
    top: pageOffset.top + rect.y * pageSize.height,
    left: pageOffset.left + rect.x * pageSize.width,
    width: Math.max(1, rect.width * pageSize.width),
    height: Math.max(2, rect.height * pageSize.height),
  }));
}

function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function isPdfRenderCancelled(error: unknown) {
  return error instanceof Error && error.name === 'RenderingCancelledException';
}
