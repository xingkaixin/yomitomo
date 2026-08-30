import { useCallback, useEffect, useRef } from 'react';
import { useBookmarkCapability } from '@embedpdf/plugin-bookmark/react';
import { isPdfTextAnchor, resolveTextAnchor, type Annotation } from '@yomitomo/shared';
import type { TocItem } from '@yomitomo/core';
import { recordRendererPerformanceTiming } from '../../shell/app-renderer-performance';
import type { SourceBookcaseProps } from '../bookcase/source-bookcase-types';
import { pdfiumBookmarkTocItems } from './pdfium-text-document';

type PdfiumScroll = {
  scrollToPage: (options: { pageNumber: number; behavior: 'instant' | 'smooth' }) => void;
};

export function usePdfiumNavigation({
  annotations,
  documentId,
  extractPageText,
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
  extractPageText: (pageIndex: number) => Promise<string>;
  focusAnnotationId: SourceBookcaseProps['readerControl']['focusAnnotationId'];
  pageCount: number;
  scroll: PdfiumScroll | null | undefined;
  onCloseToc: () => void;
  onFocusedAnnotation: SourceBookcaseProps['annotationActions']['onFocusedAnnotation'];
  onOpenAnnotation: SourceBookcaseProps['annotationActions']['onOpenAnnotation'];
  onSetTocItems: (items: TocItem[]) => void;
}) {
  const { provides: bookmark } = useBookmarkCapability();
  const scrollToAnnotationRef = useRef<(annotationId: string) => boolean>(() => false);

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
      if (
        !annotation ||
        !isPdfTextAnchor(annotation.anchor) ||
        !Number.isInteger(annotation.anchor.pageIndex) ||
        annotation.anchor.pageIndex < 0 ||
        annotation.anchor.pageIndex >= pageCount ||
        !scroll
      )
        return false;
      scroll.scrollToPage({
        pageNumber: annotation.anchor.pageIndex + 1,
        behavior: 'smooth',
      });
      return true;
    },
    [annotations, onOpenAnnotation, pageCount, scroll],
  );
  useEffect(() => {
    scrollToAnnotationRef.current = scrollToAnnotation;
  }, [scrollToAnnotation]);

  useEffect(() => {
    if (!focusAnnotationId || !scroll) return;
    recordRendererPerformanceTiming('reader_focus', {
      source: 'pdf',
      phase: 'effect_start',
      articleId: documentId,
      annotationId: focusAnnotationId,
      annotationCount: annotations.length,
      hasScroll: Boolean(scroll),
    });
    const navigated = scrollToAnnotationRef.current(focusAnnotationId);
    const annotation = annotations.find((item) => item.id === focusAnnotationId);
    recordRendererPerformanceTiming('reader_focus', {
      source: 'pdf',
      phase: 'navigation_requested',
      articleId: documentId,
      annotationId: focusAnnotationId,
      navigated,
    });
    let cancelled = false;
    let timer: number | null = null;
    const location =
      navigated && annotation && isPdfTextAnchor(annotation.anchor)
        ? extractPageText(annotation.anchor.pageIndex)
            .then((pageText) => Boolean(resolveTextAnchor(pageText, annotation.anchor)))
            .catch(() => false)
        : Promise.resolve(false);
    void location.then((located) => {
      if (cancelled) return;
      timer = window.setTimeout(
        () => {
          recordRendererPerformanceTiming('reader_focus', {
            source: 'pdf',
            phase: 'complete_timer',
            articleId: documentId,
            annotationId: focusAnnotationId,
            located,
          });
          onFocusedAnnotation(located);
        },
        located ? 520 : 0,
      );
    });
    return () => {
      cancelled = true;
      recordRendererPerformanceTiming('reader_focus', {
        source: 'pdf',
        phase: 'effect_cleanup',
        articleId: documentId,
        annotationId: focusAnnotationId,
      });
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [documentId, extractPageText, focusAnnotationId, onFocusedAnnotation, scroll]);

  function scrollToTocItem(item: TocItem) {
    onCloseToc();
    scroll?.scrollToPage({
      pageNumber: item.start + 1,
      behavior: 'smooth',
    });
  }

  return { scrollToAnnotation, scrollToTocItem };
}
