import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle, ZoomIn, ZoomOut } from 'lucide-react';
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerSrc from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { ArticleReadingProgress, ArticleRecord } from '@yomitomo/shared';
import { Button } from './components/ui/button';
import type { SourceBookcaseProps } from './app-source-bookcase-shared';

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const MIN_SCALE = 0.7;
const MAX_SCALE = 2.2;
const SCALE_STEP = 0.15;
const PAGE_STAGE_MARGIN = 56;

type PdfArticleRecord = ArticleRecord & { pdf: NonNullable<ArticleRecord['pdf']> };

type PdfReaderState =
  | { status: 'loading'; message: string }
  | { status: 'ready'; message: string }
  | { status: 'error'; message: string };

type PdfRenderTask = {
  cancel: () => void;
  promise: Promise<unknown>;
};

export function PdfBookcase({
  article,
  onClose,
  onSaveArticleReadingProgress,
}: SourceBookcaseProps & { article: PdfArticleRecord }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pageCacheRef = useRef(new Map<number, Promise<PDFPageProxy>>());
  const lastSavedPageRef = useRef(normalizeInitialPageIndex(article));
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [readerState, setReaderState] = useState<PdfReaderState>({
    status: 'loading',
    message: '正在打开 PDF',
  });
  const [pageIndex, setPageIndex] = useState(() => normalizeInitialPageIndex(article));
  const [fitScale, setFitScale] = useState(1);
  const [zoomOffset, setZoomOffset] = useState(0);
  const pageCount = pdfDocument?.numPages || article.pdf.metadata.pageCount;
  const pageNumber = pageIndex + 1;
  const progress = pageProgress(pageIndex, pageCount);
  const progressPercent = Math.round(progress * 100);
  const pageLabel = `${pageNumber} / ${pageCount}`;
  const scale = clampScale(Number((fitScale + zoomOffset).toFixed(2)));
  const authorLine = article.byline || article.pdf.metadata.author;

  useEffect(() => {
    let cancelled = false;
    let loadedDocument: PDFDocumentProxy | null = null;
    pageCacheRef.current = new Map();
    setPdfDocument(null);
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
  }, [article.id, article.pdf.metadata.pageCount]);

  useEffect(() => {
    setZoomOffset(0);
  }, [article.id]);

  useEffect(() => {
    if (!pdfDocument) return;
    const document = pdfDocument;
    const stageElement = stageRef.current;
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
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return;

        const viewport = page.getViewport({ scale });
        const pixelRatio = window.devicePixelRatio || 1;
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
    for (const nextIndex of [pageIndex - 1, pageIndex + 1]) {
      if (nextIndex < 0 || nextIndex >= pdfDocument.numPages) continue;
      void pageForIndex(pdfDocument, pageCacheRef.current, nextIndex);
    }
  }, [pageIndex, pdfDocument]);

  useEffect(() => {
    if (!pdfDocument || readerState.status !== 'ready') return;
    if (lastSavedPageRef.current === pageIndex) return;
    lastSavedPageRef.current = pageIndex;
    onSaveArticleReadingProgress(article.id, pdfReadingProgress(pageIndex, pdfDocument.numPages));
  }, [article.id, onSaveArticleReadingProgress, pageIndex, pdfDocument, readerState.status]);

  function goToPage(nextIndex: number) {
    if (readerState.status === 'error') return;
    setPageIndex(clampPageIndex(nextIndex, pageCount));
  }

  function changeScale(delta: number) {
    const nextScale = clampScale(Number((scale + delta).toFixed(2)));
    setZoomOffset((current) => Number((current + nextScale - scale).toFixed(2)));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goToPage(pageIndex - 1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goToPage(pageIndex + 1);
    }
  }

  return (
    <section className="source-bookcase source-pdf-reader-shell" onKeyDown={handleKeyDown}>
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
        </div>
      </header>
      <div ref={stageRef} className="pdf-page-stage" tabIndex={0}>
        <canvas ref={canvasRef} className="pdf-page-canvas" aria-label={`PDF 第 ${pageLabel} 页`} />
        {readerState.status !== 'ready' ? (
          <div className={`pdf-reader-status is-${readerState.status}`} role="status">
            {readerState.status === 'loading' ? (
              <LoaderCircle className="is-spinning" size={18} />
            ) : null}
            <span>{readerState.message}</span>
          </div>
        ) : null}
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

function isPdfRenderCancelled(error: unknown) {
  return error instanceof Error && error.name === 'RenderingCancelledException';
}
