// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArticleRecord } from '@yomitomo/shared';
import { usePdfiumReadingProgress } from '../source/pdfium/app-source-bookcase-pdfium-reading-progress';

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
    scopeScrollToPage: vi.fn((options: { pageNumber: number }) => {
      state.currentPage = options.pageNumber;
    }),
    scrollToPage: vi.fn((options: { pageNumber: number }) => {
      state.currentPage = options.pageNumber;
    }),
    reset() {
      state.currentPage = 1;
      state.layoutReadyListeners.clear();
      state.scrollListeners.clear();
      state.scopeScrollToPage.mockClear();
      state.scrollToPage.mockClear();
    },
  };
  return state;
});

vi.mock('@embedpdf/plugin-scroll/react', () => ({
  useScroll: () => ({
    provides: {
      getCurrentPage: () => scrollMocks.currentPage,
      onScroll: (listener: () => void) => {
        scrollMocks.scrollListeners.add(listener);
        return () => scrollMocks.scrollListeners.delete(listener);
      },
      scrollToPage: scrollMocks.scrollToPage,
    },
  }),
  useScrollCapability: () => ({
    provides: {
      forDocument: () => ({
        scrollToPage: scrollMocks.scopeScrollToPage,
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
    },
  }),
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
      pageCount: 10,
      pageIndex: 9,
      progress: 1,
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
    expect(scrollMocks.scopeScrollToPage).toHaveBeenCalledWith({
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
        pageCount: 10,
        pageIndex: 7,
        progress: 7 / 9,
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

    expect(scrollMocks.scopeScrollToPage).not.toHaveBeenCalled();
  });
});
