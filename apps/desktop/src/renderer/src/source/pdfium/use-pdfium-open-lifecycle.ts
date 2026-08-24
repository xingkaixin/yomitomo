import { useEffect, useRef } from 'react';
import type { PageMetric } from './pdfium-geometry';
import {
  recordPdfOpenTiming,
  recordPdfOpenTimingOnce,
  type PdfOpenTrace,
} from './app-source-bookcase-pdfium-open-trace';

type PdfiumScrollObserver = {
  onScroll?: (listener: () => void) => (() => void) | void;
};

export function usePdfiumOpenLifecycle({
  articleId,
  articlePageCount,
  annotationCount,
  boxCount,
  clearAgentAnnotationPlayback,
  currentPage,
  initialPageNumber,
  loadedDocumentPageCount,
  markInitialPageReady,
  markPdfiumFirstPageReady,
  openTrace,
  pageMetrics,
  resetPdfiumTextDocument,
  restoringInitialPage,
  schedulePageMetricsUpdate,
  scroll,
}: {
  articleId: string;
  articlePageCount: number;
  annotationCount: number;
  boxCount: number;
  clearAgentAnnotationPlayback: () => void;
  currentPage: number;
  initialPageNumber: number;
  loadedDocumentPageCount: number | undefined;
  markInitialPageReady: () => void;
  markPdfiumFirstPageReady: () => void;
  openTrace: PdfOpenTrace;
  pageMetrics: Record<number, PageMetric>;
  resetPdfiumTextDocument: () => void;
  restoringInitialPage: boolean;
  schedulePageMetricsUpdate: () => void;
  scroll: PdfiumScrollObserver | null | undefined;
}) {
  const recordedPhasesRef = useRef(new Set<string>());
  const restoreMetricsWaitLoggedRef = useRef(false);
  const clearPlaybackRef = useRef(clearAgentAnnotationPlayback);
  clearPlaybackRef.current = clearAgentAnnotationPlayback;

  useEffect(() => {
    recordedPhasesRef.current = new Set();
    restoreMetricsWaitLoggedRef.current = false;
  }, [articleId]);

  useEffect(() => {
    if (!loadedDocumentPageCount) return;
    recordPdfOpenTimingOnce(recordedPhasesRef, openTrace, 'document_ready', {
      pageCount: loadedDocumentPageCount,
    });
  }, [articleId, loadedDocumentPageCount, openTrace]);

  useEffect(() => {
    resetPdfiumTextDocument();
    clearPlaybackRef.current();
  }, [articleId, articlePageCount, resetPdfiumTextDocument]);

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
      recordPdfOpenTimingOnce(recordedPhasesRef, openTrace, 'initial_restore_metrics_ready', {
        currentPage,
        targetPage: initialPageNumber,
        visiblePageCount,
        visiblePageIndexes: Object.keys(pageMetrics).map(Number),
      });
    }
    markInitialPageReady();
    markPdfiumFirstPageReady();
    recordPdfOpenTimingOnce(recordedPhasesRef, openTrace, 'first_page_ready', {
      visiblePageCount,
    });
    recordPdfOpenTimingOnce(recordedPhasesRef, openTrace, 'interactive_ready', {
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
    const unsubscribe = scroll?.onScroll?.(schedulePageMetricsUpdate);
    return () => unsubscribe?.();
  }, [schedulePageMetricsUpdate, scroll]);

  useEffect(() => {
    if (boxCount === 0 && annotationCount > 0) schedulePageMetricsUpdate();
  }, [annotationCount, boxCount, schedulePageMetricsUpdate]);

  useEffect(() => () => clearPlaybackRef.current(), []);
}
