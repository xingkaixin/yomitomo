import type React from 'react';
import { useCallback, useEffect } from 'react';
import { useBookmarkCapability } from '@embedpdf/plugin-bookmark/react';
import { isPdfTextAnchor, type Annotation } from '@yomitomo/shared';
import type { TocItem } from '@yomitomo/core';
import type { SourceBookcaseProps } from './app-source-bookcase-shared';
import {
  pdfiumAnnotationNavigationState,
  pdfiumBookmarkTocItems,
  type PdfAnnotationNavigationState,
} from './app-source-bookcase-pdfium-utils';

type PdfiumScroll = {
  scrollToPage: (options: { pageNumber: number; behavior: 'instant' | 'smooth' }) => void;
};

export function usePdfiumNavigation({
  annotations,
  currentPage,
  documentId,
  focusAnnotationId,
  pageCount,
  scroll,
  selectedAnnotationId,
  onCloseToc,
  onFocusedAnnotation,
  onOpenAnnotation,
  onSetAnnotationNavigation,
  onSetAnnotationNavigator,
  onSetTocItems,
}: {
  annotations: Annotation[];
  currentPage: number;
  documentId: string;
  focusAnnotationId: SourceBookcaseProps['focusAnnotationId'];
  pageCount: number;
  scroll: PdfiumScroll | null | undefined;
  selectedAnnotationId: SourceBookcaseProps['selectedAnnotationId'];
  onCloseToc: () => void;
  onFocusedAnnotation: SourceBookcaseProps['onFocusedAnnotation'];
  onOpenAnnotation: SourceBookcaseProps['onOpenAnnotation'];
  onSetAnnotationNavigation: React.Dispatch<React.SetStateAction<PdfAnnotationNavigationState>>;
  onSetAnnotationNavigator: (navigator: (annotationId: string) => void) => void;
  onSetTocItems: (items: TocItem[]) => void;
}) {
  const { provides: bookmark } = useBookmarkCapability();

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
    onSetAnnotationNavigation(
      pdfiumAnnotationNavigationState(annotations, selectedAnnotationId, currentPage),
    );
  }, [annotations, currentPage, onSetAnnotationNavigation, selectedAnnotationId]);

  const scrollToAnnotation = useCallback(
    (annotationId: string) => {
      onOpenAnnotation(annotationId);
      const annotation = annotations.find((item) => item.id === annotationId);
      if (!annotation || !isPdfTextAnchor(annotation.anchor)) return;
      scroll?.scrollToPage({
        pageNumber: annotation.anchor.pageIndex + 1,
        behavior: 'smooth',
      });
    },
    [annotations, onOpenAnnotation, scroll],
  );

  useEffect(() => {
    onSetAnnotationNavigator(scrollToAnnotation);
    return () => onSetAnnotationNavigator(() => undefined);
  }, [onSetAnnotationNavigator, scrollToAnnotation]);

  useEffect(() => {
    if (!focusAnnotationId) return;
    scrollToAnnotation(focusAnnotationId);
    const timer = window.setTimeout(onFocusedAnnotation, 520);
    return () => window.clearTimeout(timer);
  }, [focusAnnotationId, onFocusedAnnotation, scrollToAnnotation]);

  function scrollToTocItem(item: TocItem) {
    onCloseToc();
    scroll?.scrollToPage({
      pageNumber: item.start + 1,
      behavior: 'smooth',
    });
  }

  return { scrollToAnnotation, scrollToTocItem };
}
