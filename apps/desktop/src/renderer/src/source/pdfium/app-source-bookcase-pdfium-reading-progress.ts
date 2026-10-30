import { createElement, useCallback, useMemo, useReducer, useRef } from 'react';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import { useScrollCapability } from '@embedpdf/plugin-scroll/react';
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

type PdfReadingPositionState = { currentPage: number; restoringInitialPage: boolean };

type PdfReadingPositionEvent =
  | { type: 'initialPageRestored'; pageNumber: number }
  | { type: 'initialPageShown' }
  | { type: 'pageScrolled'; pageNumber: number }
  | { type: 'pageJumped'; pageNumber: number };

function pdfReadingPositionReducer(
  state: PdfReadingPositionState,
  event: PdfReadingPositionEvent,
): PdfReadingPositionState {
  switch (event.type) {
    case 'initialPageRestored':
    case 'pageScrolled':
      return { ...state, currentPage: event.pageNumber };
    case 'initialPageShown':
      return state.restoringInitialPage ? { ...state, restoringInitialPage: false } : state;
    case 'pageJumped':
      return { currentPage: event.pageNumber, restoringInitialPage: false };
  }
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
  const initialPageIndex = useMemo(() => normalizeInitialPageIndex(article), []);
  const restoredInitialPageRef = useRef(false);
  const restoreOverlayHiddenLoggedRef = useRef(false);
  const restoringInitialPageRef = useRef(initialPageIndex > 0);
  const suppressPageSaveUntilRestoreRef = useRef(initialPageIndex > 0);
  const { provides: scrollCapability } = useScrollCapability();
  const scroll = useMemo(
    () => scrollCapability?.forDocument(documentId) ?? null,
    [documentId, scrollCapability],
  );
  const [{ currentPage, restoringInitialPage }, dispatch] = useReducer(pdfReadingPositionReducer, {
    currentPage: initialPageIndex + 1,
    restoringInitialPage: initialPageIndex > 0,
  });
  const { saveNow: savePdfProgressNow } = useSourceReadingProgressSaver({
    articleId: article.id,
    debounceMs: 0,
    initialProgress: article.readingProgress,
    onSaveArticleReadingProgress,
  });
  const readScrollInput = useStableCallback(() => ({
    documentId,
    openTrace,
    pageCount,
    savePdfProgressNow,
    scroll,
    scrollCapability,
  }));

  const restoreInitialPageOnLayout = useCallback(
    (marker: HTMLElement | null) => {
      const { documentId: restoreDocumentId, scrollCapability: capability } = readScrollInput();
      if (!marker || !capability) return;

      const restoreInitialPage = () => {
        if (restoredInitialPageRef.current) return;
        restoredInitialPageRef.current = true;
        if (initialPageIndex <= 0) return;

        const { openTrace: trace, pageCount: restorePageCount } = readScrollInput();
        const startedAt = performance.now();
        recordPdfOpenTiming(trace, 'initial_restore_layout_ready', {
          pageCount: restorePageCount,
          targetPage: initialPageIndex + 1,
        });
        capability.forDocument(restoreDocumentId).scrollToPage({
          pageNumber: initialPageIndex + 1,
          behavior: 'instant',
        });
        recordPdfOpenTiming(trace, 'initial_restore_scroll_to_page', {
          durationMs: Number((performance.now() - startedAt).toFixed(2)),
          pageCount: restorePageCount,
          targetPage: initialPageIndex + 1,
        });
        dispatch({ type: 'initialPageRestored', pageNumber: initialPageIndex + 1 });
      };

      return capability.onLayoutReady((event) => {
        if (event.documentId === restoreDocumentId) restoreInitialPage();
      });
    },
    [initialPageIndex],
  );

  const saveScrolledPage = useCallback(
    (marker: HTMLElement | null) => {
      const { scroll: scrollScope } = readScrollInput();
      if (!marker || !scrollScope) return;

      const saveCurrentPage = () => {
        const { pageCount: currentPageCount, savePdfProgressNow: saveNow } = readScrollInput();
        const pageIndex = clampPageIndex(scrollScope.getCurrentPage() - 1, currentPageCount);
        if (suppressPageSaveUntilRestoreRef.current) {
          if (pageIndex !== initialPageIndex) return;
          suppressPageSaveUntilRestoreRef.current = false;
        }
        dispatch({ type: 'pageScrolled', pageNumber: pageIndex + 1 });
        void saveNow(pdfReadingProgress(pageIndex, currentPageCount));
      };

      return scrollScope.onScroll?.(saveCurrentPage) ?? undefined;
    },
    [initialPageIndex],
  );

  const markInitialPageReady = useCallback(() => {
    restoringInitialPageRef.current = false;
    suppressPageSaveUntilRestoreRef.current = false;
    if (initialPageIndex > 0 && !restoreOverlayHiddenLoggedRef.current) {
      restoreOverlayHiddenLoggedRef.current = true;
      recordPdfOpenTiming(openTrace, 'initial_restore_overlay_hidden', {
        pageCount,
        targetPage: initialPageIndex + 1,
      });
    }
    dispatch({ type: 'initialPageShown' });
  }, [initialPageIndex, openTrace, pageCount]);

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
          initialRestoreTargetPage: initialPageIndex + 1,
        });
      }
      suppressPageSaveUntilRestoreRef.current = false;
      dispatch({ type: 'pageJumped', pageNumber });
      scroll?.scrollToPage({ pageNumber, behavior: 'instant' });
    },
    [currentPage, initialPageIndex, openTrace, pageCount, scroll],
  );

  return {
    currentPage,
    initialPageNumber: initialPageIndex + 1,
    jumpToPdfiumPage,
    markInitialPageReady,
    // Embedpdf exposes its scroll capability after the registry initializes.
    markers: [
      scrollCapability
        ? createElement('span', { hidden: true, key: 'layout', ref: restoreInitialPageOnLayout })
        : null,
      scroll && documentReady
        ? createElement('span', { hidden: true, key: 'scroll', ref: saveScrolledPage })
        : null,
    ],
    restoringInitialPage,
    scroll,
  };
}
