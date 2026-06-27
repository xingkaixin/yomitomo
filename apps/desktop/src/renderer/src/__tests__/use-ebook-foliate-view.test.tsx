// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ebookPaginationCacheKey,
  ebookPaginationSectionOrder,
  ebookReadingProgressPageAnchor,
  ebookReadingProgressRestoreTarget,
  ebookReadingProgressSnapshot,
  ebookSourceFile,
  useEbookFoliateView,
} from '../source/ebook/use-ebook-foliate-view';
import type { EbookArticleRecord } from '../source/bookcase/app-source-bookcase-shared';
import type {
  EbookBoxUpdateReason,
  EbookPageTurnTrace,
  FoliateViewElement,
} from '../source/ebook/app-ebook-reader-utils';
import { defaultTheme } from '../theme/app-theme';

const now = '2026-05-16T08:00:00.000Z';

type FoliateViewState = ReturnType<typeof useEbookFoliateView>;

let latestViewState: FoliateViewState | null = null;

afterEach(() => {
  latestViewState = null;
  pageTurnTraceRef.current = null;
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  cleanup();
  vi.clearAllMocks();
});

function ebookArticle(): EbookArticleRecord {
  return {
    id: 'ebook-1',
    url: 'file://book.epub',
    canonicalUrl: 'file://book.epub',
    sourceType: 'ebook',
    title: '电子书',
    byline: '',
    siteName: '',
    contentHtml: '',
    contentHash: 'hash-1',
    annotations: [],
    createdAt: now,
    updatedAt: now,
    ebook: {
      metadata: {
        format: 'epub',
        fileName: 'book.epub',
        fileSize: 1024,
      },
      chapters: [
        {
          id: 'chapter-1',
          title: '第一章',
          html: '<p>正文</p>',
          textLength: 2,
        },
      ],
    },
  };
}

const article = ebookArticle();
const onSaveArticleReadingProgress = vi.fn();
const onAttachFoliateDocumentListeners = vi.fn();
const onCleanupFoliateDocumentListeners = vi.fn();
const pageTurnTraceRef = { current: null as EbookPageTurnTrace | null };

function requireViewState() {
  if (!latestViewState) throw new Error('ebook foliate view not rendered');
  return latestViewState;
}

function FoliateViewProbe({
  maxColumnCount = 1,
  onBeforePageTurn,
  onScheduleEbookBoxUpdate,
}: {
  maxColumnCount?: number;
  onBeforePageTurn: (trace: EbookPageTurnTrace) => void;
  onScheduleEbookBoxUpdate: (reason: EbookBoxUpdateReason) => void;
}) {
  latestViewState = useEbookFoliateView({
    article,
    maxColumnCount,
    readerTheme: defaultTheme.reader,
    readerSettings: { fontSize: 18, contentWidth: 720, backgroundColor: '#fffdf8' },
    onSaveArticleReadingProgress,
    onAttachFoliateDocumentListeners,
    onBeforePageTurn,
    onCleanupFoliateDocumentListeners,
    onScheduleEbookBoxUpdate,
    pageTurnTraceRef,
  });

  return null;
}

describe('useEbookFoliateView', () => {
  it('prioritizes the current EPUB section when measuring page counts', () => {
    expect(ebookPaginationSectionOrder(4, 2)).toEqual([2, 0, 1, 3]);
    expect(ebookPaginationSectionOrder(3)).toEqual([0, 1, 2]);
  });

  it('separates EPUB pagination caches by book and layout inputs', () => {
    const base = {
      articleId: 'ebook-1',
      columns: 1,
      contentWidth: 720,
      fontSize: 18,
      layoutKey: '800x600',
    };

    expect(ebookPaginationCacheKey(base)).not.toEqual(
      ebookPaginationCacheKey({ ...base, fontSize: 20 }),
    );
    expect(ebookPaginationCacheKey(base)).not.toEqual(
      ebookPaginationCacheKey({ ...base, articleId: 'ebook-2' }),
    );
    expect(ebookPaginationCacheKey(base)).not.toEqual(
      ebookPaginationCacheKey({ ...base, columns: 2 }),
    );
  });

  it('constructs source files with format-specific names and MIME types', () => {
    const azw3Article = {
      ...article,
      title: 'Kindle Book',
      ebook: {
        ...article.ebook,
        metadata: {
          ...article.ebook.metadata,
          format: 'azw3' as const,
          fileName: '',
        },
      },
    };
    const mobiArticle = {
      ...article,
      title: 'Mobi Book',
      ebook: {
        ...article.ebook,
        metadata: {
          ...article.ebook.metadata,
          format: 'mobi' as const,
          fileName: 'sample.mobi',
        },
      },
    };

    const azw3File = ebookSourceFile(azw3Article, new ArrayBuffer(1));
    const mobiFile = ebookSourceFile(mobiArticle, new ArrayBuffer(1));

    expect(azw3File.name).toBe('Kindle Book.azw3');
    expect(azw3File.type).toBe('application/vnd.amazon.ebook');
    expect(mobiFile.name).toBe('sample.mobi');
    expect(mobiFile.type).toBe('application/x-mobipocket-ebook');
  });

  it('stores the visible ebook page anchor separately from read-through progress', () => {
    expect(ebookReadingProgressPageAnchor({ sectionIndex: 2, pageIndex: 13, pageCount: 20 })).toBe(
      13 / 19,
    );

    expect(
      ebookReadingProgressSnapshot(
        {
          fraction: 0.42,
          location: { current: 41, total: 100 },
          section: { current: 2 },
        },
        { sectionIndex: 2, pageIndex: 13, pageCount: 20 },
        0.42,
      ),
    ).toEqual({
      pageIndex: 13,
      pageCount: 20,
      chapterIndex: 2,
      chapterProgress: 13 / 19,
      progress: 0.42,
    });
  });

  it('restores new ebook progress from section page anchors', () => {
    expect(
      ebookReadingProgressRestoreTarget({
        pageIndex: 13,
        pageCount: 20,
        chapterIndex: 2,
        chapterProgress: 13 / 19,
        progress: 0.42,
        updatedAt: now,
      }),
    ).toEqual({
      kind: 'section-anchor',
      sectionIndex: 2,
      anchor: 13 / 19,
    });
  });

  it('restores legacy ebook progress from the saved start location', () => {
    expect(
      ebookReadingProgressRestoreTarget({
        pageIndex: 41,
        pageCount: 100,
        chapterIndex: 2,
        progress: 0.42,
        updatedAt: now,
      }),
    ).toEqual({
      kind: 'fraction',
      fraction: 0.41,
    });

    expect(
      ebookReadingProgressRestoreTarget({
        pageIndex: 0,
        pageCount: 100,
        chapterIndex: 0,
        progress: 0.01,
        updatedAt: now,
      }),
    ).toEqual({
      kind: 'fraction',
      fraction: 0,
    });
  });

  it('queues rapid page turns instead of dropping clicks while foliate is busy', async () => {
    const onBeforePageTurn = vi.fn();
    const onScheduleEbookBoxUpdate = vi.fn((_reason: EbookBoxUpdateReason) => undefined);
    const pageTurnResolvers: Array<() => void> = [];
    const goRight = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          pageTurnResolvers.push(resolve);
        }),
    );

    render(
      <FoliateViewProbe
        onBeforePageTurn={onBeforePageTurn}
        onScheduleEbookBoxUpdate={onScheduleEbookBoxUpdate}
      />,
    );

    const viewState = requireViewState();
    viewState.viewRef.current = { goRight } as unknown as FoliateViewElement;
    viewState.readerStateStatusRef.current = 'ready';
    onScheduleEbookBoxUpdate.mockClear();

    act(() => {
      viewState.goRight();
      viewState.goRight();
    });

    expect(goRight).toHaveBeenCalledTimes(1);
    expect(onBeforePageTurn).toHaveBeenCalledTimes(1);

    await act(async () => {
      pageTurnResolvers.shift()?.();
      await Promise.resolve();
    });

    expect(goRight).toHaveBeenCalledTimes(2);
    expect(onBeforePageTurn).toHaveBeenCalledTimes(2);

    await act(async () => {
      pageTurnResolvers.shift()?.();
      await Promise.resolve();
    });

    expect(onScheduleEbookBoxUpdate).toHaveBeenCalledTimes(2);
    expect(onScheduleEbookBoxUpdate).toHaveBeenLastCalledWith('page_turn');
  });

  it('relocates the visible page when the column count changes', async () => {
    const onBeforePageTurn = vi.fn();
    const onScheduleEbookBoxUpdate = vi.fn((_reason: EbookBoxUpdateReason) => undefined);
    const recordPerformanceTiming = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { recordPerformanceTiming },
    });
    const rendererGoTo = vi.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <FoliateViewProbe
        onBeforePageTurn={onBeforePageTurn}
        onScheduleEbookBoxUpdate={onScheduleEbookBoxUpdate}
      />,
    );

    const viewState = requireViewState();
    viewState.viewRef.current = {
      getPageInfo: () => ({ sectionIndex: 2, pageIndex: 4, pageCount: 9 }),
      renderer: {
        goTo: rendererGoTo,
        removeAttribute: vi.fn(),
        setAttribute: vi.fn(),
        setStyles: vi.fn(),
      },
    } as unknown as FoliateViewElement;
    viewState.readerStateStatusRef.current = 'ready';
    onScheduleEbookBoxUpdate.mockClear();

    await act(async () => {
      rerender(
        <FoliateViewProbe
          maxColumnCount={2}
          onBeforePageTurn={onBeforePageTurn}
          onScheduleEbookBoxUpdate={onScheduleEbookBoxUpdate}
        />,
      );
      await Promise.resolve();
    });

    expect(rendererGoTo).toHaveBeenCalledWith({ index: 2, anchor: 4 / 8 });
    expect(recordPerformanceTiming).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ebook_layout',
        data: expect.objectContaining({
          articleId: 'ebook-1',
          fromColumns: 1,
          toColumns: 2,
        }),
      }),
    );
    expect(onScheduleEbookBoxUpdate).toHaveBeenCalledWith('reader_settings');
  });
});
