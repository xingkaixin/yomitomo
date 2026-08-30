// @vitest-environment jsdom

import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPdfTextAnchor, type Annotation, type ArticleRecord } from '@yomitomo/shared';
import { usePdfiumReadingProgress } from '../source/pdfium/app-source-bookcase-pdfium-reading-progress';
import { usePdfiumNavigation } from '../source/pdfium/app-source-bookcase-pdfium-navigation';

type PdfArticleRecord = ArticleRecord & { pdf: NonNullable<ArticleRecord['pdf']> };

const scrollMocks = vi.hoisted(() => {
  const state = {
    currentPage: 1,
    layoutReadyListeners: new Set<
      (event: {
        documentId: string;
        isInitial: boolean;
        pageNumber: number;
        totalPages: number;
      }) => void
    >(),
    scrollListeners: new Set<() => void>(),
    scrollToPage: vi.fn((options: { pageNumber: number }) => {
      state.currentPage = options.pageNumber;
    }),
    reset() {
      state.currentPage = 1;
      state.layoutReadyListeners.clear();
      state.scrollListeners.clear();
      state.scrollToPage.mockClear();
    },
  };
  return state;
});

vi.mock('@embedpdf/plugin-scroll/react', () => {
  const capability = {
    forDocument: () => ({
      getCurrentPage: () => scrollMocks.currentPage,
      onScroll: (listener: () => void) => {
        scrollMocks.scrollListeners.add(listener);
        return () => scrollMocks.scrollListeners.delete(listener);
      },
      scrollToPage: scrollMocks.scrollToPage,
    }),
    onLayoutReady: (
      listener: (event: {
        documentId: string;
        isInitial: boolean;
        pageNumber: number;
        totalPages: number;
      }) => void,
    ) => {
      scrollMocks.layoutReadyListeners.add(listener);
      return () => scrollMocks.layoutReadyListeners.delete(listener);
    },
  };
  return {
    useScroll: () => ({ provides: capability.forDocument() }),
    useScrollCapability: () => ({ provides: capability }),
  };
});

vi.mock('@embedpdf/plugin-bookmark/react', () => ({
  useBookmarkCapability: () => ({ provides: null }),
}));

function pdfArticle(): PdfArticleRecord {
  return {
    id: 'pdf-article',
    pdf: {
      metadata: {
        fileSize: 1,
        pageCount: 10,
        title: 'PDF article',
      },
    },
    readingProgress: {
      kind: 'page',
      pageCount: 10,
      pageIndex: 9,
      updatedAt: '2026-06-25T00:00:00.000Z',
    },
    sourceType: 'pdf',
    title: 'PDF article',
  } as PdfArticleRecord;
}

function emitScroll(pageNumber: number) {
  scrollMocks.currentPage = pageNumber;
  for (const listener of scrollMocks.scrollListeners) listener();
}

function emitLayoutReady(documentId = 'embedpdf-pdf-article') {
  for (const listener of scrollMocks.layoutReadyListeners) {
    listener({
      documentId,
      isInitial: true,
      pageNumber: 1,
      totalPages: 10,
    });
  }
}

function Probe({ onSave }: { onSave: (articleId: string, progress: unknown) => void }) {
  const openTraceRef = React.useRef({ articleId: 'pdf-article', startedAt: performance.now() });
  const progress = usePdfiumReadingProgress({
    article: pdfArticle(),
    documentId: 'embedpdf-pdf-article',
    documentReady: true,
    openTrace: openTraceRef.current,
    pageCount: 10,
    onSaveArticleReadingProgress: onSave,
  });

  return (
    <>
      <output data-testid="page">{progress.currentPage}</output>
      <output data-testid="restoring">{String(progress.restoringInitialPage)}</output>
      <button type="button" onClick={() => progress.jumpToPdfiumPage(4)}>
        jump to page 4
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
  scrollMocks.reset();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('usePdfiumReadingProgress', () => {
  it('does not persist transient page events while restoring the saved PDF page', async () => {
    const onSave = vi.fn();
    render(<Probe onSave={onSave} />);

    await waitFor(() => {
      expect(scrollMocks.scrollListeners.size).toBe(1);
      expect(scrollMocks.layoutReadyListeners.size).toBe(1);
    });
    expect(screen.getByTestId('page').textContent).toBe('10');

    act(() => emitScroll(1));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('page').textContent).toBe('10');

    act(() => emitLayoutReady());
    expect(scrollMocks.scrollToPage).toHaveBeenCalledWith({
      behavior: 'instant',
      pageNumber: 10,
    });

    act(() => emitScroll(10));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('page').textContent).toBe('10');

    act(() => emitScroll(8));

    expect(onSave).toHaveBeenCalledWith(
      'pdf-article',
      expect.objectContaining({
        kind: 'page',
        pageCount: 10,
        pageIndex: 7,
      }),
    );
  });

  it('cancels the saved page restore when the user jumps pages before it completes', async () => {
    const onSave = vi.fn();
    render(<Probe onSave={onSave} />);

    await waitFor(() => {
      expect(scrollMocks.layoutReadyListeners.size).toBe(1);
    });

    expect(screen.getByTestId('page').textContent).toBe('10');
    expect(screen.getByTestId('restoring').textContent).toBe('true');

    act(() => {
      screen.getByRole('button', { name: 'jump to page 4' }).click();
    });

    expect(screen.getByTestId('page').textContent).toBe('4');
    expect(screen.getByTestId('restoring').textContent).toBe('false');
    expect(scrollMocks.scrollToPage).toHaveBeenCalledWith({
      behavior: 'instant',
      pageNumber: 4,
    });

    act(() => emitLayoutReady());

    expect(scrollMocks.scrollToPage).toHaveBeenCalledTimes(1);
  });

  it('completes annotation focus once while the same PDF rerenders', async () => {
    vi.useFakeTimers();
    const pageText = 'A saved reading judgment.';
    const annotation: Annotation = {
      id: 'annotation-1',
      anchor: createPdfTextAnchor({
        pageText,
        pageIndex: 1,
        start: 0,
        end: pageText.length,
        pageWidth: 600,
        pageHeight: 800,
        rects: [{ x: 20, y: 40, width: 200, height: 18 }],
      }),
      author: { kind: 'user', username: 'reader' },
      color: '#f4c95d',
      comments: [],
      createdAt: '2026-08-30T00:00:00Z',
      updatedAt: '2026-08-30T00:00:00Z',
    };
    const article = pdfArticle();
    const documentId = 'embedpdf-pdf-article';
    const openTrace = { articleId: article.id, startedAt: performance.now() };
    const onSave = vi.fn();
    const navigation = {
      annotations: [annotation],
      documentId,
      extractPageText: vi.fn(async () => pageText),
      focusAnnotationId: annotation.id,
      pageCount: article.pdf.metadata.pageCount,
      onCloseToc: vi.fn(),
      onFocusedAnnotation: vi.fn(),
      onOpenAnnotation: vi.fn(),
      onSetTocItems: vi.fn(),
    };
    const { rerender } = renderHook(() => {
      const { scroll } = usePdfiumReadingProgress({
        article,
        documentId,
        documentReady: true,
        openTrace,
        pageCount: article.pdf.metadata.pageCount,
        onSaveArticleReadingProgress: onSave,
      });
      usePdfiumNavigation({ ...navigation, scroll });
    });

    await act(() => vi.advanceTimersByTimeAsync(250));
    rerender();
    await act(() => vi.advanceTimersByTimeAsync(250));
    rerender();
    await act(() => vi.advanceTimersByTimeAsync(20));

    expect(navigation.onFocusedAnnotation).toHaveBeenCalledExactlyOnceWith(true);
    expect(navigation.onOpenAnnotation).toHaveBeenCalledExactlyOnceWith(annotation.id);
    expect(scrollMocks.scrollToPage).toHaveBeenCalledExactlyOnceWith({
      pageNumber: 2,
      behavior: 'smooth',
    });
  });
});
