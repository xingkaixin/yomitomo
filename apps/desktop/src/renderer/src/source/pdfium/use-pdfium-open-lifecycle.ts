import { createElement, useCallback, useEffectEvent, useRef } from 'react';
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
  annotationCount,
  boxCount,
  currentPage,
  initialPageNumber,
  loadedDocumentPageCount,
  markInitialPageReady,
  markPdfiumFirstPageReady,
  openTrace,
  pageMetrics,
  restoringInitialPage,
  schedulePageMetricsUpdate,
  scroll,
}: {
  annotationCount: number;
  boxCount: number;
  currentPage: number;
  initialPageNumber: number;
  loadedDocumentPageCount: number | undefined;
  markInitialPageReady: () => void;
  markPdfiumFirstPageReady: () => void;
  openTrace: PdfOpenTrace;
  pageMetrics: Record<number, PageMetric>;
  restoringInitialPage: boolean;
  schedulePageMetricsUpdate: () => void;
  scroll: PdfiumScrollObserver | null | undefined;
}) {
  const recordedPhasesRef = useRef(new Set<string>());
  const restoreMetricsWaitLoggedRef = useRef(false);
  const readOpenInput = useEffectEvent(() => ({
    currentPage,
    initialPageNumber,
    loadedDocumentPageCount,
    markInitialPageReady,
    markPdfiumFirstPageReady,
    openTrace,
    pageMetrics,
    restoringInitialPage,
    scroll,
  }));

  const recordDocumentReady = useCallback((marker: HTMLElement | null) => {
    const { loadedDocumentPageCount: pageCount, openTrace: trace } = readOpenInput();
    if (!marker || !pageCount) return;
    recordPdfOpenTimingOnce(recordedPhasesRef, trace, 'document_ready', { pageCount });
  }, []);

  const recordFirstPageMetrics = useCallback((marker: HTMLElement | null) => {
    if (!marker) return;
    const input = readOpenInput();
    const visiblePageCount = Object.keys(input.pageMetrics).length;
    const visiblePageIndexes = Object.keys(input.pageMetrics).map(Number);
    if (pdfOpenMetricsPhase(input) === 'waiting') {
      if (!restoreMetricsWaitLoggedRef.current) {
        restoreMetricsWaitLoggedRef.current = true;
        recordPdfOpenTiming(input.openTrace, 'initial_restore_metrics_wait', {
          currentPage: input.currentPage,
          targetPage: input.initialPageNumber,
          visiblePageCount,
          visiblePageIndexes,
        });
      }
      return;
    }
    if (input.restoringInitialPage && input.initialPageNumber > 1) {
      recordPdfOpenTimingOnce(recordedPhasesRef, input.openTrace, 'initial_restore_metrics_ready', {
        currentPage: input.currentPage,
        targetPage: input.initialPageNumber,
        visiblePageCount,
        visiblePageIndexes,
      });
    }
    input.markInitialPageReady();
    input.markPdfiumFirstPageReady();
    recordPdfOpenTimingOnce(recordedPhasesRef, input.openTrace, 'first_page_ready', {
      visiblePageCount,
    });
    recordPdfOpenTimingOnce(recordedPhasesRef, input.openTrace, 'interactive_ready', {
      visiblePageCount,
    });
  }, []);

  const updateMetricsOnScroll = useCallback(
    (marker: HTMLElement | null) => {
      const { scroll: scrollScope } = readOpenInput();
      if (!marker || !scrollScope) return;
      return scrollScope.onScroll?.(schedulePageMetricsUpdate) ?? undefined;
    },
    [schedulePageMetricsUpdate],
  );

  const remeasureMissingBoxes = useCallback(
    (marker: HTMLElement | null) => {
      if (marker) schedulePageMetricsUpdate();
    },
    [schedulePageMetricsUpdate],
  );

  const metricsPhase = pdfOpenMetricsPhase({
    initialPageNumber,
    pageMetrics,
    restoringInitialPage,
  });
  return [
    loadedDocumentPageCount
      ? createElement('span', { hidden: true, key: 'document', ref: recordDocumentReady })
      : null,
    metricsPhase
      ? createElement('span', { hidden: true, key: metricsPhase, ref: recordFirstPageMetrics })
      : null,
    scroll
      ? createElement('span', { hidden: true, key: 'scroll', ref: updateMetricsOnScroll })
      : null,
    boxCount === 0 && annotationCount > 0
      ? createElement('span', {
          hidden: true,
          key: `boxes:${annotationCount}`,
          ref: remeasureMissingBoxes,
        })
      : null,
  ];
}

function pdfOpenMetricsPhase({
  initialPageNumber,
  pageMetrics,
  restoringInitialPage,
}: {
  initialPageNumber: number;
  pageMetrics: Record<number, PageMetric>;
  restoringInitialPage: boolean;
}) {
  if (Object.keys(pageMetrics).length === 0) return null;
  const expectedPageIndex = initialPageNumber - 1;
  const waitingForInitialRestorePage = restoringInitialPage && expectedPageIndex > 0;
  return waitingForInitialRestorePage && !pageMetrics[expectedPageIndex] ? 'waiting' : 'ready';
}
