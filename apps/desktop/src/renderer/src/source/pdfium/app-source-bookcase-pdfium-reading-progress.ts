import { useCallback, useEffect, useRef, useState } from 'react';
import { useScroll, useScrollCapability } from '@embedpdf/plugin-scroll/react';
import type { ArticleRecord } from '@yomitomo/shared';
import type { SourceBookcaseProps } from '../bookcase/app-source-bookcase-shared';
import {
  clampPageIndex,
  normalizeInitialPageIndex,
  pdfReadingProgress,
} from './app-source-bookcase-pdfium-utils';
import { recordPdfOpenTiming, type PdfOpenTrace } from './app-source-bookcase-pdfium-open-trace';

type PdfArticleRecord = ArticleRecord & { pdf: NonNullable<ArticleRecord['pdf']> };

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
  onSaveArticleReadingProgress: SourceBookcaseProps['onSaveArticleReadingProgress'];
}) {
  const initialPageIndexRef = useRef(normalizeInitialPageIndex(article));
  const lastSavedPageRef = useRef(initialPageIndexRef.current);
  const restoredInitialPageRef = useRef(false);
  const restoreOverlayHiddenLoggedRef = useRef(false);
  const suppressPageSaveUntilRestoreRef = useRef(initialPageIndexRef.current > 0);
  const { provides: scroll } = useScroll(documentId);
  const { provides: scrollCapability } = useScrollCapability();
  const [restoringInitialPage, setRestoringInitialPage] = useState(
    () => initialPageIndexRef.current > 0,
  );
  const [currentPage, setCurrentPage] = useState(() => initialPageIndexRef.current + 1);

  useEffect(() => {
    initialPageIndexRef.current = normalizeInitialPageIndex(article);
    lastSavedPageRef.current = initialPageIndexRef.current;
    restoredInitialPageRef.current = false;
    restoreOverlayHiddenLoggedRef.current = false;
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
      if (lastSavedPageRef.current === pageIndex) return;
      lastSavedPageRef.current = pageIndex;
      void onSaveArticleReadingProgress(article.id, pdfReadingProgress(pageIndex, pageCount));
    };

    const unsubscribe = scroll.onScroll?.(saveCurrentPage);
    return () => {
      unsubscribe?.();
    };
  }, [article.id, documentReady, onSaveArticleReadingProgress, openTrace, pageCount, scroll]);

  const markInitialPageReady = useCallback(() => {
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
      suppressPageSaveUntilRestoreRef.current = false;
      setCurrentPage(pageNumber);
      scroll?.scrollToPage({ pageNumber, behavior: 'instant' });
    },
    [pageCount, scroll],
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
