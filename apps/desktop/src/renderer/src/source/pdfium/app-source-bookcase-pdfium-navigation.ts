import { createElement, useCallback } from 'react';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import { useBookmarkCapability } from '@embedpdf/plugin-bookmark/react';
import { isPdfTextAnchor, resolveTextAnchor, type Annotation } from '@yomitomo/shared';
import type { TocItem } from '@yomitomo/core';
import { recordRendererPerformanceTiming } from '../../shell/app-renderer-performance';
import type { SourceBookcaseProps } from '../bookcase/source-bookcase-types';
import { pdfiumBookmarkTocItems } from './pdfium-text-document';

type PdfiumScroll = {
  scrollToPage: (options: { pageNumber: number; behavior: 'instant' | 'smooth' }) => void;
};

const completionCallbackIds = new WeakMap<object, number>();
let nextCompletionCallbackId = 0;

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
  const readBookmarkInput = useStableCallback(() => ({
    bookmark,
    documentId,
    onSetTocItems,
    pageCount,
  }));

  const loadBookmarks = useCallback((marker: HTMLElement | null) => {
    const {
      bookmark: bookmarkCapability,
      documentId: bookmarkDocumentId,
      onSetTocItems: setTocItems,
      pageCount: bookmarkPageCount,
    } = readBookmarkInput();
    if (!marker || !bookmarkCapability) return;
    let cancelled = false;
    bookmarkCapability
      .forDocument(bookmarkDocumentId)
      .getBookmarks()
      .toPromise()
      .then(({ bookmarks }) => {
        if (!cancelled) setTocItems(pdfiumBookmarkTocItems(bookmarks, bookmarkPageCount));
      })
      .catch(() => {
        if (!cancelled) setTocItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
  const readFocusRequest = useStableCallback(() => ({
    annotations,
    documentId,
    extractPageText,
    focusAnnotationId,
    onFocusedAnnotation,
    scrollToAnnotation,
  }));

  const attachFocusRequest = useCallback((marker: HTMLElement | null) => {
    const {
      annotations: currentAnnotations,
      documentId: focusDocumentId,
      extractPageText: extractFocusPageText,
      focusAnnotationId: annotationId,
      onFocusedAnnotation: completeFocus,
      scrollToAnnotation: scrollToFocusAnnotation,
    } = readFocusRequest();
    if (!marker || !annotationId) return;
    recordRendererPerformanceTiming('reader_focus', {
      source: 'pdf',
      phase: 'effect_start',
      articleId: focusDocumentId,
      annotationId,
      annotationCount: currentAnnotations.length,
      hasScroll: true,
    });
    const navigated = scrollToFocusAnnotation(annotationId);
    const annotation = currentAnnotations.find((item) => item.id === annotationId);
    recordRendererPerformanceTiming('reader_focus', {
      source: 'pdf',
      phase: 'navigation_requested',
      articleId: focusDocumentId,
      annotationId,
      navigated,
    });
    let cancelled = false;
    let timer: number | null = null;
    const location =
      navigated && annotation && isPdfTextAnchor(annotation.anchor)
        ? extractFocusPageText(annotation.anchor.pageIndex)
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
            articleId: focusDocumentId,
            annotationId,
            located,
          });
          completeFocus(located);
        },
        located ? 520 : 0,
      );
    });
    return () => {
      cancelled = true;
      recordRendererPerformanceTiming('reader_focus', {
        source: 'pdf',
        phase: 'effect_cleanup',
        articleId: focusDocumentId,
        annotationId,
      });
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  function scrollToTocItem(item: TocItem) {
    onCloseToc();
    scroll?.scrollToPage({
      pageNumber: item.start + 1,
      behavior: 'smooth',
    });
  }

  return {
    // Embedpdf exposes its bookmark and scroll capabilities after the registry initializes.
    markers: [
      bookmark
        ? createElement('span', { hidden: true, key: `bookmarks:${pageCount}`, ref: loadBookmarks })
        : null,
      focusAnnotationId && scroll
        ? createElement('span', {
            hidden: true,
            // A new completion callback starts a new focus request, so the request rechecks its target.
            key: `focus:${documentId}\n${focusAnnotationId}\n${completionCallbackId(onFocusedAnnotation)}`,
            ref: attachFocusRequest,
          })
        : null,
    ],
    scrollToAnnotation,
    scrollToTocItem,
  };
}

function completionCallbackId(callback: object) {
  let id = completionCallbackIds.get(callback);
  if (id === undefined) {
    nextCompletionCallbackId += 1;
    id = nextCompletionCallbackId;
    completionCallbackIds.set(callback, id);
  }
  return id;
}
