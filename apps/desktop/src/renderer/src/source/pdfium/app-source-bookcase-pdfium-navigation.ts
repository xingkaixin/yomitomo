import { useCallback, useEffect, useRef } from 'react';
import { useBookmarkCapability } from '@embedpdf/plugin-bookmark/react';
import { isPdfTextAnchor, type Annotation } from '@yomitomo/shared';
import type { TocItem } from '@yomitomo/core';
import { recordRendererPerformanceTiming } from '../../shell/app-renderer-performance';
import type { SourceBookcaseProps } from '../bookcase/app-source-bookcase';
import { pdfiumBookmarkTocItems } from './app-source-bookcase-pdfium-utils';

type PdfiumScroll = {
  scrollToPage: (options: { pageNumber: number; behavior: 'instant' | 'smooth' }) => void;
};

export function usePdfiumNavigation({
  annotations,
  documentId,
  focusAnnotationId,
  pageCount,
  scroll,
  onCloseToc,
  onFocusedAnnotation,
  onOpenAnnotation,
  onSetTocItems,
}: {
  annotations: Annotation[];
  documentId: string;
  focusAnnotationId: SourceBookcaseProps['focusAnnotationId'];
  pageCount: number;
  scroll: PdfiumScroll | null | undefined;
  onCloseToc: () => void;
  onFocusedAnnotation: SourceBookcaseProps['onFocusedAnnotation'];
  onOpenAnnotation: SourceBookcaseProps['onOpenAnnotation'];
  onSetTocItems: (items: TocItem[]) => void;
}) {
  const { provides: bookmark } = useBookmarkCapability();
  const onFocusedAnnotationRef = useRef(onFocusedAnnotation);
  const scrollToAnnotationRef = useRef<(annotationId: string) => void>(() => {});

  useEffect(() => {
    onFocusedAnnotationRef.current = onFocusedAnnotation;
  }, [onFocusedAnnotation]);

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
    scrollToAnnotationRef.current = scrollToAnnotation;
  }, [scrollToAnnotation]);

  useEffect(() => {
    if (!focusAnnotationId) return;
    recordRendererPerformanceTiming('reader_focus', {
      source: 'pdf',
      phase: 'effect_start',
      articleId: documentId,
      annotationId: focusAnnotationId,
      annotationCount: annotations.length,
      hasScroll: Boolean(scroll),
    });
    scrollToAnnotationRef.current(focusAnnotationId);
    recordRendererPerformanceTiming('reader_focus', {
      source: 'pdf',
      phase: 'navigation_requested',
      articleId: documentId,
      annotationId: focusAnnotationId,
    });
    const timer = window.setTimeout(() => {
      recordRendererPerformanceTiming('reader_focus', {
        source: 'pdf',
        phase: 'complete_timer',
        articleId: documentId,
        annotationId: focusAnnotationId,
      });
      onFocusedAnnotationRef.current();
    }, 520);
    return () => {
      recordRendererPerformanceTiming('reader_focus', {
        source: 'pdf',
        phase: 'effect_cleanup',
        articleId: documentId,
        annotationId: focusAnnotationId,
      });
      window.clearTimeout(timer);
    };
  }, [documentId, focusAnnotationId]);

  function scrollToTocItem(item: TocItem) {
    onCloseToc();
    scroll?.scrollToPage({
      pageNumber: item.start + 1,
      behavior: 'smooth',
    });
  }

  return { scrollToAnnotation, scrollToTocItem };
}
