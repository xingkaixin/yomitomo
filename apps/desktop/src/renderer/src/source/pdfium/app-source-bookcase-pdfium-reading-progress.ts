import { useCallback, useEffect, useRef, useState } from 'react';
import { useScroll, useScrollCapability } from '@embedpdf/plugin-scroll/react';
import type { ArticleRecord } from '@yomitomo/shared';
import type { SourceBookcaseProps } from '../bookcase/app-source-bookcase';
import {
  clampPageIndex,
  normalizeInitialPageIndex,
  pdfReadingProgress,
} from './app-source-bookcase-pdfium-utils';
import { recordPdfOpenTiming, type PdfOpenTrace } from './app-source-bookcase-pdfium-open-trace';
import { useSourceReadingProgressSaver } from '../bookcase/use-source-reading-progress-saver';

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
