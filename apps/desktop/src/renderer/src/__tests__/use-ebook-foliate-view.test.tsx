// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ebookReadingProgressPageAnchor,
  ebookReadingProgressRestoreTarget,
  ebookReadingProgressSnapshot,
  useEbookFoliateView,
} from '../source/ebook/use-ebook-foliate-view';
import type { EbookArticleRecord } from '../source/bookcase/app-source-bookcase';
import type { EbookBoxUpdateReason } from '../source/ebook/ebook-annotation-layout';
import type {
  EbookPageTurnTrace,
  FoliatePageInfo,
  FoliateViewElement,
} from '../source/ebook/ebook-foliate-view';
import { defaultReaderSettings } from '@yomitomo/reader-ui/reader-settings';
import { lightTheme } from '../theme/app-theme';

vi.mock('../vendor/foliate-js/view.js', () => ({}));

const now = '2026-05-16T08:00:00.000Z';

type FoliateViewState = ReturnType<typeof useEbookFoliateView>;

let latestViewState: FoliateViewState | null = null;

afterEach(() => {
  cleanup();
  latestViewState = null;
  pageTurnTraceRef.current = null;
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  vi.restoreAllMocks();
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
  fontSize = 18,
  maxColumnCount = 1,
  onBeforePageTurn,
  onScheduleEbookBoxUpdate,
}: {
  fontSize?: number;
  maxColumnCount?: number;
  onBeforePageTurn: (trace: EbookPageTurnTrace) => void;
  onScheduleEbookBoxUpdate: (reason: EbookBoxUpdateReason) => void;
}) {
  latestViewState = useEbookFoliateView({
    article,
    maxColumnCount,
    readerTheme: lightTheme.reader,
    readerSettings: { ...defaultReaderSettings, fontSize, contentWidth: 720 },
    onSaveArticleReadingProgress,
    onAttachFoliateDocumentListeners,
    onBeforePageTurn,
    onCleanupFoliateDocumentListeners,
    onScheduleEbookBoxUpdate,
    pageTurnTraceRef,
  });

  return latestViewState.markers;
}

describe('useEbookFoliateView', () => {
  it('stores the visible ebook page anchor separately from read-through progress', () => {
    expect(ebookReadingProgressPageAnchor({ sectionIndex: 2, pageIndex: 13, pageCount: 20 })).toBe(
      13 / 19,
    );

    expect(
      ebookReadingProgressSnapshot({ sectionIndex: 2, pageIndex: 13, pageCount: 20 }, 0.42),
    ).toEqual({
      kind: 'chapter',
      chapterIndex: 2,
      chapterProgress: 13 / 19,
      bookProgress: 0.42,
    });
    expect(ebookReadingProgressSnapshot(null, 0.42)).toEqual({
      kind: 'scroll',
      progress: 0.42,
    });
  });

  it('restores new ebook progress from section page anchors', () => {
    expect(
      ebookReadingProgressRestoreTarget({
        kind: 'chapter',
        chapterIndex: 2,
        chapterProgress: 13 / 19,
        bookProgress: 0.42,
        updatedAt: now,
      }),
    ).toEqual({
      kind: 'section-anchor',
      sectionIndex: 2,
      anchor: 13 / 19,
    });
  });

  it('restores fallback ebook progress from the saved whole-book fraction', () => {
    expect(
      ebookReadingProgressRestoreTarget({
        kind: 'scroll',
        progress: 0.42,
        updatedAt: now,
      }),
    ).toEqual({
      kind: 'fraction',
      fraction: 0.42,
    });

    expect(
      ebookReadingProgressRestoreTarget({
        kind: 'scroll',
        progress: 0,
        updatedAt: now,
      }),
    ).toBeNull();
  });

  it('keeps the last stable page when foliate clears page info during column changes', async () => {
    const onBeforePageTurn = vi.fn();
    const onScheduleEbookBoxUpdate = vi.fn((_reason: EbookBoxUpdateReason) => undefined);
    const recordPerformanceTiming = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { diagnostics: { recordPerformanceTiming } },
    });
    const rendererGoTo = vi.fn().mockResolvedValue(undefined);
    const stablePageInfo: FoliatePageInfo = { sectionIndex: 2, pageIndex: 4, pageCount: 9 };
    let currentPageInfo: FoliatePageInfo | null = stablePageInfo;

    const { rerender } = render(
      <FoliateViewProbe
        onBeforePageTurn={onBeforePageTurn}
        onScheduleEbookBoxUpdate={onScheduleEbookBoxUpdate}
      />,
    );

    const viewState = requireViewState();
    viewState.viewRef.current = {
      getPageInfo: () => currentPageInfo,
      renderer: {
        goTo: rendererGoTo,
        removeAttribute: vi.fn(),
        setAttribute: vi.fn(),
        setStyles: vi.fn(),
      },
    } as unknown as FoliateViewElement;
    viewState.readerStateStatusRef.current = 'ready';

    await act(async () => {
      rerender(
        <FoliateViewProbe
          fontSize={19}
          onBeforePageTurn={onBeforePageTurn}
          onScheduleEbookBoxUpdate={onScheduleEbookBoxUpdate}
        />,
      );
      await Promise.resolve();
    });

    expect(rendererGoTo).not.toHaveBeenCalled();

    currentPageInfo = null;
    recordPerformanceTiming.mockClear();
    onScheduleEbookBoxUpdate.mockClear();

    await act(async () => {
      rerender(
        <FoliateViewProbe
          fontSize={19}
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
          livePageInfo: null,
          pageInfo: stablePageInfo,
          toColumns: 2,
        }),
      }),
    );
    expect(onScheduleEbookBoxUpdate).toHaveBeenCalledWith('reader_settings');
  });
});
