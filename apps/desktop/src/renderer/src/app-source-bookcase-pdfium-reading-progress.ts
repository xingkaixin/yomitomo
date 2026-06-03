import { useCallback, useEffect, useRef, useState } from 'react';
import { useScroll, useScrollCapability } from '@embedpdf/plugin-scroll/react';
import type { ArticleRecord } from '@yomitomo/shared';
import type { SourceBookcaseProps } from './app-source-bookcase-shared';
import {
  clampPageIndex,
  normalizeInitialPageIndex,
  pdfReadingProgress,
} from './app-source-bookcase-pdfium-utils';

type PdfArticleRecord = ArticleRecord & { pdf: NonNullable<ArticleRecord['pdf']> };

export function usePdfiumReadingProgress({
  article,
  documentId,
  documentReady,
  pageCount,
  onSaveArticleReadingProgress,
}: {
  article: PdfArticleRecord;
  documentId: string;
  documentReady: boolean;
  pageCount: number;
  onSaveArticleReadingProgress: SourceBookcaseProps['onSaveArticleReadingProgress'];
}) {
  const initialPageIndexRef = useRef(normalizeInitialPageIndex(article));
  const lastSavedPageRef = useRef(initialPageIndexRef.current);
  const restoredInitialPageRef = useRef(false);
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
    if (!scroll || !documentReady) return;

    const saveCurrentPage = () => {
      const pageIndex = clampPageIndex(scroll.getCurrentPage() - 1, pageCount);
      setCurrentPage(pageIndex + 1);
      if (lastSavedPageRef.current === pageIndex) return;
      lastSavedPageRef.current = pageIndex;
      void onSaveArticleReadingProgress(article.id, pdfReadingProgress(pageIndex, pageCount));
    };

    const unsubscribe = scroll.onScroll?.(saveCurrentPage);
    return () => {
      unsubscribe?.();
    };
  }, [article.id, documentReady, onSaveArticleReadingProgress, pageCount, scroll]);

  const markInitialPageReady = useCallback(() => {
    setRestoringInitialPage(false);
  }, []);

  const jumpToPdfiumPage = useCallback(
    (value: number) => {
      const pageNumber = clampPageIndex(value - 1, pageCount) + 1;
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
