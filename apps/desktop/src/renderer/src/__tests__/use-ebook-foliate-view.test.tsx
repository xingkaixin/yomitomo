// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EBOOK_PAGINATION_PAGE_COUNT_CACHE_LIMIT,
  EbookPaginationPageCountCache,
  ebookPaginationCacheKey,
  ebookPendingPaginationSectionIndexes,
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
  FoliatePageInfo,
  FoliateViewElement,
  FoliateSectionSource,
} from '../source/ebook/app-ebook-reader-utils';
import { defaultTheme } from '../theme/app-theme';

vi.mock('../vendor/foliate-js/view.js', () => ({}));

const now = '2026-05-16T08:00:00.000Z';

type FoliateViewState = ReturnType<typeof useEbookFoliateView>;
type MockFoliateView = FoliateViewElement & {
  role: 'measure' | 'visible';
};

let latestViewState: FoliateViewState | null = null;
let mockFoliateViews: MockFoliateView[] = [];
let mockFoliatePageCounts: number[] = [];
let mockFoliateVisibleViewCount = 0;
let onMockMeasureGoTo: ((index: number) => void) | null = null;
let originalCreateElement: typeof document.createElement | null = null;

afterEach(() => {
  cleanup();
  latestViewState = null;
  mockFoliateViews = [];
  mockFoliatePageCounts = [];
  mockFoliateVisibleViewCount = 0;
  MockResizeObserver.instances = [];
  onMockMeasureGoTo = null;
  pageTurnTraceRef.current = null;
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

function MountedFoliateViewProbe({
  articleInput,
  height = 900,
  layoutBox,
  maxColumnCount = 1,
  onBeforePageTurn,
  onScheduleEbookBoxUpdate,
  width = 720,
}: {
  articleInput: EbookArticleRecord;
  height?: number;
  layoutBox?: { height: number; width: number };
  maxColumnCount?: number;
  onBeforePageTurn: (trace: EbookPageTurnTrace) => void;
  onScheduleEbookBoxUpdate: (reason: EbookBoxUpdateReason) => void;
  width?: number;
}) {
  const viewState = useEbookFoliateView({
    article: articleInput,
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
  latestViewState = viewState;

  const setViewHost = (node: HTMLDivElement | null) => {
    if (node) {
      node.getBoundingClientRect = () =>
        ({
          bottom: layoutBox?.height ?? height,
          height: layoutBox?.height ?? height,
          left: 0,
          right: layoutBox?.width ?? width,
          top: 0,
          width: layoutBox?.width ?? width,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect;
    }
    viewState.viewHostRef.current = node;
  };
  const setMeasureHost = (node: HTMLDivElement | null) => {
    viewState.measureHostRef.current = node;
  };

  return (
    <>
      <div ref={setViewHost} />
      <div ref={setMeasureHost} />
    </>
  );
}

function ebookArticleWithId(id: string): EbookArticleRecord {
  const nextArticle = ebookArticle();
  return {
    ...nextArticle,
    canonicalUrl: `file://${id}.epub`,
    id,
    url: `file://${id}.epub`,
  };
}

function installMockFoliateEnvironment(pageCounts: number[], visibleViewCount = 1) {
  vi.useFakeTimers();
  mockFoliatePageCounts = pageCounts;
  mockFoliateVisibleViewCount = visibleViewCount;
  MockResizeObserver.instances = [];
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0),
  );
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: {
      openUrl: vi.fn(),
      readEbookFile: vi.fn().mockResolvedValue(new ArrayBuffer(1)),
      recordPerformanceTiming: vi.fn().mockResolvedValue(undefined),
    },
  });
  originalCreateElement = document.createElement.bind(document);
  const createElement = ((tagName: string, options?: ElementCreationOptions) => {
    if (tagName === 'foliate-view') return createMockFoliateView();
    return originalCreateElement!(tagName, options);
  }) as typeof document.createElement;
  vi.spyOn(document, 'createElement').mockImplementation(createElement);
}

function createMockFoliateView() {
  if (!originalCreateElement) throw new Error('document.createElement mock is not installed');
  let sectionIndex = 0;
  const role = mockFoliateViews.length < mockFoliateVisibleViewCount ? 'visible' : 'measure';
  const view = originalCreateElement('div') as unknown as MockFoliateView;
  const renderer = originalCreateElement('div') as unknown as HTMLElement & {
    getContents: () => Array<{ index: number }>;
    goTo: (target: { index: number }) => Promise<void>;
    setStyles: (styles: string | string[]) => void;
  };
  const sections = mockFoliatePageCounts.map(
    (_, index): FoliateSectionSource => ({
      id: `section-${index}`,
    }),
  );
  renderer.getContents = () => [{ index: sectionIndex }];
  renderer.goTo = vi.fn().mockImplementation(async (target: { index: number }) => {
    sectionIndex = target.index;
    if (role === 'measure') onMockMeasureGoTo?.(target.index);
  });
  renderer.setStyles = vi.fn();
  view.role = role;
  view.book = { sections };
  view.renderer = renderer;
  view.open = vi.fn().mockResolvedValue(undefined);
  view.close = vi.fn();
  view.goLeft = vi.fn().mockResolvedValue(undefined);
  view.goRight = vi.fn().mockResolvedValue(undefined);
  view.goTo = vi.fn().mockImplementation(async (target: string | number) => {
    if (typeof target === 'number') {
      sectionIndex = target;
      onMockMeasureGoTo?.(target);
    }
  });
  view.goToFraction = vi.fn().mockResolvedValue(undefined);
  view.next = vi.fn().mockResolvedValue(undefined);
  view.prev = vi.fn().mockResolvedValue(undefined);
  view.getPageInfo = () => ({
    pageCount: mockFoliatePageCounts[sectionIndex] ?? 1,
    pageIndex: 0,
    sectionIndex,
  });
  view.getSectionFractions = () =>
    mockFoliatePageCounts.map((_, index) => index / mockFoliatePageCounts.length);
  mockFoliateViews.push(view);
  return view;
}

function mockedRendererGoTo(view: MockFoliateView) {
  return vi.mocked(view.renderer?.goTo);
}

function mockRendererGoToCount(view: MockFoliateView) {
  return mockedRendererGoTo(view)?.mock.calls.length ?? 0;
}

async function flushPromises(times = 4) {
  for (let index = 0; index < times; index += 1) await Promise.resolve();
}

async function runPendingEbookPaginationWork() {
  await act(async () => {
    await flushPromises(10);
  });
  await act(async () => {
    await vi.runAllTimersAsync();
    await flushPromises(10);
  });
}

async function settleResizeObserverWork() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(240);
    await flushPromises(2);
    await vi.advanceTimersByTimeAsync(16);
    await flushPromises(2);
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises(2);
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises(10);
  });
}

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];

  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();

  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

describe('useEbookFoliateView', () => {
  it('prioritizes the current EPUB section when measuring page counts', () => {
    expect(ebookPaginationSectionOrder(4, 2)).toEqual([2, 0, 1, 3]);
    expect(ebookPaginationSectionOrder(3)).toEqual([0, 1, 2]);
  });

  it('plans only missing linear EPUB sections for page-count measurement', () => {
    const sections = [{}, { linear: 'no' }, {}, {}];

    expect(ebookPendingPaginationSectionIndexes(sections, [null, 0, null, 8], 2)).toEqual([2, 0]);
    expect(ebookPendingPaginationSectionIndexes(sections, [6, 0, 7, 8], 2)).toEqual([]);
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

  it('bounds EPUB pagination page-count cache entries with LRU eviction', () => {
    const cache = new EbookPaginationPageCountCache(2);

    cache.set('a', [1]);
    cache.set('b', [2]);
    expect(cache.get('a')).toEqual([1]);
    cache.set('c', [3]);

    expect(cache.size).toBe(2);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toEqual([1]);
    expect(cache.get('c')).toEqual([3]);

    const fullCache = new EbookPaginationPageCountCache(EBOOK_PAGINATION_PAGE_COUNT_CACHE_LIMIT);
    for (let index = 0; index < EBOOK_PAGINATION_PAGE_COUNT_CACHE_LIMIT + 3; index += 1) {
      fullCache.set(`key-${index}`, [index]);
    }

    expect(fullCache.size).toBe(EBOOK_PAGINATION_PAGE_COUNT_CACHE_LIMIT);
    expect(fullCache.get('key-0')).toBeUndefined();
  });

  it('joins concurrent EPUB page-count measurements for the same layout', async () => {
    installMockFoliateEnvironment([3, 4, 5, 6], 2);
    const onBeforePageTurn = vi.fn();
    const onScheduleEbookBoxUpdate = vi.fn((_reason: EbookBoxUpdateReason) => undefined);

    render(
      <>
        <MountedFoliateViewProbe
          articleInput={ebookArticleWithId('ebook-single-flight')}
          onBeforePageTurn={onBeforePageTurn}
          onScheduleEbookBoxUpdate={onScheduleEbookBoxUpdate}
        />
        <MountedFoliateViewProbe
          articleInput={ebookArticleWithId('ebook-single-flight')}
          onBeforePageTurn={onBeforePageTurn}
          onScheduleEbookBoxUpdate={onScheduleEbookBoxUpdate}
        />
      </>,
    );

    await runPendingEbookPaginationWork();

    const measureViews = mockFoliateViews.filter((view) => mockRendererGoToCount(view) > 0);
    const measureGoToCount = measureViews.reduce(
      (count, view) => count + mockRendererGoToCount(view),
      0,
    );
    expect(measureViews).toHaveLength(1);
    expect(measureGoToCount).toBe(3);
  });

  it('stops measuring later EPUB sections when the layout becomes stale', async () => {
    installMockFoliateEnvironment([3, 4, 5, 6]);
    const onBeforePageTurn = vi.fn();
    const onScheduleEbookBoxUpdate = vi.fn((_reason: EbookBoxUpdateReason) => undefined);
    onMockMeasureGoTo = () => {
      requireViewState().paginationLayoutKeyRef.current = '721x900';
    };

    render(
      <MountedFoliateViewProbe
        articleInput={ebookArticleWithId('ebook-stale-layout')}
        onBeforePageTurn={onBeforePageTurn}
        onScheduleEbookBoxUpdate={onScheduleEbookBoxUpdate}
      />,
    );

    await runPendingEbookPaginationWork();

    const measureView = mockFoliateViews.find((view) => mockRendererGoToCount(view) > 0);

    expect(measureView).toBeDefined();
    expect(mockedRendererGoTo(measureView!)).toHaveBeenCalledTimes(1);
  });

  it('waits for a quiet resize window before measuring EPUB page counts', async () => {
    installMockFoliateEnvironment([3, 4, 5, 6]);
    const onBeforePageTurn = vi.fn();
    const onScheduleEbookBoxUpdate = vi.fn((_reason: EbookBoxUpdateReason) => undefined);
    const layoutBox = { height: 900, width: 720 };

    render(
      <MountedFoliateViewProbe
        articleInput={ebookArticleWithId('ebook-resize-quiet')}
        layoutBox={layoutBox}
        onBeforePageTurn={onBeforePageTurn}
        onScheduleEbookBoxUpdate={onScheduleEbookBoxUpdate}
      />,
    );
    await runPendingEbookPaginationWork();
    mockFoliateViews.forEach((view) => mockedRendererGoTo(view)?.mockClear());

    layoutBox.height = 901;
    act(() => {
      MockResizeObserver.instances[0]?.trigger();
    });
    await settleResizeObserverWork();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(360);
      await flushPromises(10);
    });

    const measuredBeforeQuiet = mockFoliateViews.some((view) => mockRendererGoToCount(view) > 0);
    expect(measuredBeforeQuiet).toBe(false);

    await act(async () => {
      await vi.runAllTimersAsync();
      await flushPromises(10);
    });

    const measuredAfterQuiet = mockFoliateViews.reduce(
      (count, view) => count + mockRendererGoToCount(view),
      0,
    );
    expect(measuredAfterQuiet).toBe(3);
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

  it('keeps the last stable page when foliate clears page info during column changes', async () => {
    const onBeforePageTurn = vi.fn();
    const onScheduleEbookBoxUpdate = vi.fn((_reason: EbookBoxUpdateReason) => undefined);
    const recordPerformanceTiming = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { recordPerformanceTiming },
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
