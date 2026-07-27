import { useCallback, useEffect, useRef, useState } from 'react';
import { useScroll, useScrollCapability } from '@embedpdf/plugin-scroll/react';
import type { ArticleReadingProgress, ArticleRecord } from '@yomitomo/shared';
import { recordPdfOpenTiming, type PdfOpenTrace } from './app-source-bookcase-pdfium-open-trace';
import {
  useSourceReadingProgressSaver,
  type SourceReadingProgressSave,
} from '../bookcase/use-source-reading-progress-saver';

type PdfArticleRecord = ArticleRecord & { pdf: NonNullable<ArticleRecord['pdf']> };

export function normalizeInitialPageIndex(article: PdfArticleRecord) {
  const pageIndex =
    article.readingProgress?.kind === 'page' ? article.readingProgress.pageIndex : 0;
  return clampPageIndex(pageIndex, article.pdf.metadata.pageCount);
}

export function clampPageIndex(pageIndex: number, pageCount: number) {
  if (!Number.isFinite(pageIndex)) return 0;
  return Math.max(0, Math.min(Math.max(0, pageCount - 1), Math.trunc(pageIndex)));
}

export function pageProgress(pageIndex: number, pageCount: number) {
  if (pageCount <= 1) return 1;
  return pageIndex / (pageCount - 1);
}

export function pdfPageProgressPercent(pageNumber: number, pageCount: number) {
  return Number(
    (pageProgress(clampPageIndex(pageNumber - 1, pageCount), pageCount) * 100).toFixed(2),
  );
}

export function pdfReadingProgress(pageIndex: number, pageCount: number): ArticleReadingProgress {
  return {
    kind: 'page',
    pageIndex,
    pageCount,
    updatedAt: new Date().toISOString(),
  };
}

export function usePdfiumReadingProgress({
  article,
  documentId,
  documentReady,
  openTrace,
  pageCount,
  onSaveArticleReadingProgress,
}: {
  article: PdfArticleRecord;
  documentId: string;
  documentReady: boolean;
  openTrace: PdfOpenTrace;
  pageCount: number;
  onSaveArticleReadingProgress: SourceReadingProgressSave;
}) {
  const initialPageIndexRef = useRef(normalizeInitialPageIndex(article));
  const restoredInitialPageRef = useRef(false);
  const restoreOverlayHiddenLoggedRef = useRef(false);
  const restoringInitialPageRef = useRef(initialPageIndexRef.current > 0);
  const suppressPageSaveUntilRestoreRef = useRef(initialPageIndexRef.current > 0);
  const { provides: scroll } = useScroll(documentId);
  const { provides: scrollCapability } = useScrollCapability();
  const [restoringInitialPage, setRestoringInitialPage] = useState(
    () => initialPageIndexRef.current > 0,
  );
  const [currentPage, setCurrentPage] = useState(() => initialPageIndexRef.current + 1);
  const { saveNow: savePdfProgressNow } = useSourceReadingProgressSaver({
    articleId: article.id,
    debounceMs: 0,
    initialProgress: article.readingProgress,
    onSaveArticleReadingProgress,
  });

  useEffect(() => {
    initialPageIndexRef.current = normalizeInitialPageIndex(article);
    restoredInitialPageRef.current = false;
    restoreOverlayHiddenLoggedRef.current = false;
    restoringInitialPageRef.current = initialPageIndexRef.current > 0;
    suppressPageSaveUntilRestoreRef.current = initialPageIndexRef.current > 0;
    setCurrentPage(initialPageIndexRef.current + 1);
    setRestoringInitialPage(initialPageIndexRef.current > 0);
  }, [article.id, article.pdf.metadata.pageCount]);

  useEffect(() => {
    if (!scrollCapability) return;

    const restoreInitialPage = () => {
      if (restoredInitialPageRef.current) return;
      const initialPageIndex = initialPageIndexRef.current;
      restoredInitialPageRef.current = true;
      if (initialPageIndex <= 0) return;

      const startedAt = performance.now();
      recordPdfOpenTiming(openTrace, 'initial_restore_layout_ready', {
        pageCount,
        targetPage: initialPageIndex + 1,
      });
      scrollCapability.forDocument(documentId).scrollToPage({
        pageNumber: initialPageIndex + 1,
        behavior: 'instant',
      });
      recordPdfOpenTiming(openTrace, 'initial_restore_scroll_to_page', {
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
        pageCount,
        targetPage: initialPageIndex + 1,
      });
      setCurrentPage(initialPageIndex + 1);
    };

    const unsubscribe = scrollCapability.onLayoutReady((event) => {
      if (event.documentId === documentId) restoreInitialPage();
    });

    return () => {
      unsubscribe();
    };
  }, [documentId, openTrace, pageCount, scrollCapability]);

  useEffect(() => {
    if (!scroll || !documentReady) return;

    const saveCurrentPage = () => {
      const pageIndex = clampPageIndex(scroll.getCurrentPage() - 1, pageCount);
      if (suppressPageSaveUntilRestoreRef.current) {
        if (pageIndex !== initialPageIndexRef.current) return;
        suppressPageSaveUntilRestoreRef.current = false;
      }
      setCurrentPage(pageIndex + 1);
      void savePdfProgressNow(pdfReadingProgress(pageIndex, pageCount));
    };

    const unsubscribe = scroll.onScroll?.(saveCurrentPage);
    return () => {
      unsubscribe?.();
    };
  }, [documentReady, pageCount, savePdfProgressNow, scroll]);

  const markInitialPageReady = useCallback(() => {
    restoringInitialPageRef.current = false;
    suppressPageSaveUntilRestoreRef.current = false;
    if (initialPageIndexRef.current > 0 && !restoreOverlayHiddenLoggedRef.current) {
      restoreOverlayHiddenLoggedRef.current = true;
      recordPdfOpenTiming(openTrace, 'initial_restore_overlay_hidden', {
        pageCount,
        targetPage: initialPageIndexRef.current + 1,
      });
    }
    setRestoringInitialPage(false);
  }, [openTrace, pageCount]);

  const jumpToPdfiumPage = useCallback(
    (value: number) => {
      const pageNumber = clampPageIndex(value - 1, pageCount) + 1;
      if (restoringInitialPageRef.current) {
        restoringInitialPageRef.current = false;
        restoredInitialPageRef.current = true;
        restoreOverlayHiddenLoggedRef.current = true;
        recordPdfOpenTiming(openTrace, 'initial_restore_cancelled_by_user_jump', {
          currentPage,
          pageCount,
          targetPage: pageNumber,
          initialRestoreTargetPage: initialPageIndexRef.current + 1,
        });
        setRestoringInitialPage(false);
      }
      suppressPageSaveUntilRestoreRef.current = false;
      setCurrentPage(pageNumber);
      scroll?.scrollToPage({ pageNumber, behavior: 'instant' });
    },
    [currentPage, openTrace, pageCount, scroll],
  );

  return {
    currentPage,
    initialPageNumber: initialPageIndexRef.current + 1,
    jumpToPdfiumPage,
    markInitialPageReady,
    restoringInitialPage,
    scroll,
  };
}
