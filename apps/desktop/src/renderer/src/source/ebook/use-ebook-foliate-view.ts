import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import i18next from 'i18next';
import type { ArticleReadingProgress, ArticleRecord } from '@yomitomo/shared';
import type { ReaderTheme } from '@yomitomo/reader-ui/reader-theme';
import type { ReaderSettings } from '@yomitomo/reader-ui/reader-types';
import { clampNumber } from '@yomitomo/reader-ui/reader-settings';
import {
  closeFoliateView,
  configureFoliateView,
  flattenFoliateToc,
  recordEbookPageTurnTrace,
  updateKnownSectionPageCount,
  waitForAnimationFrame,
  waitForFoliateIdle,
  waitForFoliatePageInfo,
  type EbookBoxUpdateReason,
  type EbookPageTurnTrace,
  type FoliatePageInfo,
  type FoliatePageInfoWaitTiming,
  type FoliateRelocateDetail,
  type FoliateSectionSource,
  type FoliateViewElement,
} from './app-ebook-reader-utils';
import {
  rendererPerformanceElapsedMs,
  recordRendererPerformanceTiming,
  type EbookBookcaseProps,
} from '../bookcase/app-source-bookcase-shared';

type EbookReaderState = {
  status: 'loading' | 'ready' | 'error';
  message: string;
};

type UseEbookFoliateViewInput = {
  article: EbookBookcaseProps['article'];
  maxColumnCount: number;
  readerTheme: ReaderTheme;
  readerSettings: ReaderSettings;
  onSaveArticleReadingProgress: EbookBookcaseProps['onSaveArticleReadingProgress'];
  onAttachFoliateDocumentListeners: (view: FoliateViewElement | null) => void;
  onBeforePageTurn: (trace: EbookPageTurnTrace) => void;
  onCleanupFoliateDocumentListeners: () => void;
  onScheduleEbookBoxUpdate: (reason: EbookBoxUpdateReason) => void;
  pageTurnTraceRef: React.RefObject<EbookPageTurnTrace | null>;
};

type PageTurnDirection = 'left' | 'right';

const ebookSectionPageCountsCache = new Map<string, Array<number | null>>();
const EBOOK_PAGINATION_RESIZE_SETTLE_DELAY_MS = 240;
const EBOOK_PAGINATION_SECTION_YIELD_INTERVAL = 12;

type EbookPaginationSectionTiming = {
  elapsedMs: number;
  index: number;
  pageCount: number;
  goToMs: number;
  pageInfoWaitMs: number;
  assetWaitMs: number;
  fontWaitMs: number;
  imageWaitMs: number;
  pendingImageCount: number;
  frameWaitMs: number;
  frameWaitCount: number;
  pageInfoMatched: boolean;
  pageInfoMatchedAfterAssets: boolean;
  idleYieldMs: number;
};

type EbookProgressRestoreTarget =
  | {
      kind: 'section-anchor';
      sectionIndex: number;
      anchor: number;
    }
  | {
      kind: 'fraction';
      fraction: number;
    };

export function ebookPaginationCacheKey({
  articleId,
  columns,
  contentWidth,
  fontSize,
  layoutKey,
}: {
  articleId: string;
  columns: number;
  contentWidth: number;
  fontSize: number;
  layoutKey: string;
}) {
  return `${articleId}:${layoutKey}:${fontSize}:${contentWidth}:${columns}`;
}

export function ebookPaginationSectionOrder(sectionCount: number, currentSectionIndex?: number) {
  const indexes: number[] = [];
  const seen = new Set<number>();
  const addIndex = (index: number) => {
    if (index < 0 || index >= sectionCount || seen.has(index)) return;
    seen.add(index);
    indexes.push(index);
  };

  if (typeof currentSectionIndex === 'number' && Number.isInteger(currentSectionIndex)) {
    addIndex(currentSectionIndex);
  }
  for (let index = 0; index < sectionCount; index += 1) {
    addIndex(index);
  }

  return indexes;
}

export function ebookPendingPaginationSectionIndexes(
  sections: FoliateSectionSource[],
  counts: Array<number | null>,
  currentSectionIndex?: number,
) {
  return ebookPaginationSectionOrder(sections.length, currentSectionIndex).filter((index) => {
    const section = sections[index];
    if (!section) return false;
    if (section.linear === 'no') return false;
    return counts[index] === null;
  });
}

export function ebookReadingProgressPageAnchor(pageInfo: FoliatePageInfo | null) {
  if (!pageInfo) return undefined;
  if (pageInfo.pageCount <= 1) return 0;
  return clampNumber(pageInfo.pageIndex / (pageInfo.pageCount - 1), 0, 1, 0);
}

export function ebookReadingProgressSnapshot(
  detail: FoliateRelocateDetail,
  pageInfo: FoliatePageInfo | null,
  progress: number,
): Omit<ArticleReadingProgress, 'updatedAt'> {
  return {
    pageIndex: Math.max(
      0,
      pageInfo?.pageIndex ?? detail.location?.current ?? Math.round(progress * 1000),
    ),
    pageCount: Math.max(1, pageInfo?.pageCount ?? detail.location?.total ?? 1000),
    chapterIndex: pageInfo?.sectionIndex ?? detail.section?.current,
    chapterProgress: ebookReadingProgressPageAnchor(pageInfo),
    progress,
  };
}

export function ebookReadingProgressRestoreTarget(
  progress: ArticleReadingProgress | undefined,
): EbookProgressRestoreTarget | null {
  if (!progress) return null;
  const chapterIndex = progress.chapterIndex;
  if (
    typeof chapterIndex === 'number' &&
    Number.isInteger(chapterIndex) &&
    typeof progress.chapterProgress === 'number'
  ) {
    return {
      kind: 'section-anchor',
      sectionIndex: Math.max(0, chapterIndex),
      anchor: clampNumber(progress.chapterProgress, 0, 1, 0),
    };
  }

  if (progress.pageCount > 0 && (progress.pageIndex > 0 || progress.progress > 0)) {
    return {
      kind: 'fraction',
      fraction: clampNumber(progress.pageIndex / progress.pageCount, 0, 1, progress.progress),
    };
  }

  if (progress.progress > 0) {
    return {
      kind: 'fraction',
      fraction: clampNumber(progress.progress, 0, 1, 0),
    };
  }

  return null;
}

export function useEbookFoliateView({
  article,
  maxColumnCount,
  readerTheme,
  readerSettings,
  onSaveArticleReadingProgress,
  onAttachFoliateDocumentListeners,
  onBeforePageTurn,
  onCleanupFoliateDocumentListeners,
  onScheduleEbookBoxUpdate,
  pageTurnTraceRef,
}: UseEbookFoliateViewInput) {
  const viewHostRef = useRef<HTMLDivElement | null>(null);
  const measureHostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<FoliateViewElement | null>(null);
  const ebookFileRef = useRef<File | null>(null);
  const pageInfoSectionIndexRef = useRef<number | undefined>(undefined);
  const lastStablePageInfoRef = useRef<FoliatePageInfo | null>(null);
  const paginationLayoutKeyRef = useRef('');
  const committedPaginationLayoutKeyRef = useRef('');
  const readerSettingsRef = useRef<ReaderSettings>(readerSettings);
  const readerThemeRef = useRef<ReaderTheme>(readerTheme);
  const maxColumnCountRef = useRef(1);
  const progressRef = useRef(article.readingProgress?.progress ?? 0);
  const onSaveArticleReadingProgressRef = useRef(onSaveArticleReadingProgress);
  const onBeforePageTurnRef = useRef(onBeforePageTurn);
  const pageTurnQueueRef = useRef<PageTurnDirection[]>([]);
  const pageTurnRunningRef = useRef(false);
  const pageTurnSequenceRef = useRef(0);
  const [tocItems, setTocItems] = useState<ReturnType<typeof flattenFoliateToc>>([]);
  const [sectionFractions, setSectionFractions] = useState<number[]>([]);
  const [pageInfo, setPageInfo] = useState<FoliatePageInfo | null>(null);
  const [sectionPageCounts, setSectionPageCounts] = useState<Array<number | null>>([]);
  const [paginationLayoutKey, setPaginationLayoutKey] = useState('');
  const [progress, setProgress] = useState(() => article.readingProgress?.progress ?? 0);
  const [readerState, setReaderState] = useState<EbookReaderState>({
    status: 'loading',
    message: i18next.t('ebookReader.opening'),
  });
  const readerStateStatusRef = useRef<EbookReaderState['status']>(readerState.status);

  useEffect(() => {
    onSaveArticleReadingProgressRef.current = onSaveArticleReadingProgress;
  }, [onSaveArticleReadingProgress]);

  useEffect(() => {
    onBeforePageTurnRef.current = onBeforePageTurn;
  }, [onBeforePageTurn]);

  useLayoutEffect(() => {
    onCleanupFoliateDocumentListeners();
    pageTurnQueueRef.current = [];
    pageTurnRunningRef.current = false;
    pageTurnTraceRef.current = null;
    setTocItems([]);
    setSectionFractions([]);
    pageInfoSectionIndexRef.current = undefined;
    lastStablePageInfoRef.current = null;
    setPageInfo(null);
    setSectionPageCounts([]);
    paginationLayoutKeyRef.current = '';
    committedPaginationLayoutKeyRef.current = '';
    setPaginationLayoutKey('');
    progressRef.current = article.readingProgress?.progress ?? 0;
    setProgress(article.readingProgress?.progress ?? 0);
    readerStateStatusRef.current = 'loading';
    setReaderState({ status: 'loading', message: i18next.t('ebookReader.opening') });
  }, [article.id, onCleanupFoliateDocumentListeners, pageTurnTraceRef]);

  const beginPageTurnTrace = useCallback(
    (source: EbookPageTurnTrace['source'], direction: EbookPageTurnTrace['direction']) => {
      const trace: EbookPageTurnTrace = {
        articleId: article.id,
        direction,
        source,
        startedAt: performance.now(),
        turnId: `${article.id}:${Date.now().toString(36)}:${++pageTurnSequenceRef.current}`,
      };
      pageTurnTraceRef.current = trace;
      recordEbookPageTurnTrace(trace, 'start', {
        pageInfo: viewRef.current?.getPageInfo?.() ?? null,
        queueLength: pageTurnQueueRef.current.length,
      });
      return trace;
    },
    [article.id, pageTurnTraceRef],
  );

  useEffect(() => {
    const previousMaxColumnCount = maxColumnCountRef.current;
    maxColumnCountRef.current = maxColumnCount;
    readerSettingsRef.current = readerSettings;
    readerThemeRef.current = readerTheme;
    const view = viewRef.current;
    const pageInfoBeforeLayout = view?.getPageInfo?.() ?? lastStablePageInfoRef.current;
    if (pageInfoBeforeLayout) lastStablePageInfoRef.current = pageInfoBeforeLayout;
    configureFoliateView(view, readerSettings, readerTheme, maxColumnCount);
    if (
      view &&
      readerStateStatusRef.current === 'ready' &&
      previousMaxColumnCount !== maxColumnCount
    ) {
      const livePageInfo = view.getPageInfo?.() ?? null;
      const restorePageInfo = pageInfoBeforeLayout ?? livePageInfo;
      if (restorePageInfo) lastStablePageInfoRef.current = restorePageInfo;
      const restoreProgress = restorePageInfo
        ? {
            chapterIndex: restorePageInfo.sectionIndex,
            chapterProgress: ebookReadingProgressPageAnchor(restorePageInfo),
            pageCount: restorePageInfo.pageCount,
            pageIndex: restorePageInfo.pageIndex,
            progress: progressRef.current,
            updatedAt: new Date().toISOString(),
          }
        : {
            pageCount: 1000,
            pageIndex: Math.round(clampNumber(progressRef.current, 0, 1, 0) * 1000),
            progress: clampNumber(progressRef.current, 0, 1, 0),
            updatedAt: new Date().toISOString(),
          };
      recordRendererPerformanceTiming('ebook_layout', {
        articleId: article.id,
        fromColumns: previousMaxColumnCount,
        livePageInfo,
        pageInfo: restorePageInfo,
        progress: progressRef.current,
        toColumns: maxColumnCount,
      });
      void restoreEbookReadingProgress(view, restoreProgress);
    }
    onScheduleEbookBoxUpdate('reader_settings');
  }, [article.id, maxColumnCount, onScheduleEbookBoxUpdate, readerSettings, readerTheme]);

  useEffect(() => {
    readerStateStatusRef.current = readerState.status;
  }, [readerState.status]);

  useEffect(() => {
    const host = viewHostRef.current;
    if (!host) return;
    const hostElement = host;

    let cancelled = false;
    let view: FoliateViewElement | null = null;

    const handleRelocate = (event: Event) => {
      const detail = (event as CustomEvent<FoliateRelocateDetail>).detail;
      const nextProgress = clampNumber(detail.fraction, 0, 1, 0);
      const nextPageInfo =
        (event.currentTarget as FoliateViewElement | null)?.getPageInfo?.() ?? null;
      const progressSnapshot = ebookReadingProgressSnapshot(detail, nextPageInfo, nextProgress);
      recordEbookPageTurnTrace(pageTurnTraceRef.current, 'relocate', {
        pageIndex: nextPageInfo?.pageIndex,
        pageCount: nextPageInfo?.pageCount,
        reason: detail.reason,
        sectionIndex: nextPageInfo?.sectionIndex,
      });

      setProgress(nextProgress);
      progressRef.current = nextProgress;
      pageInfoSectionIndexRef.current = nextPageInfo?.sectionIndex;
      if (nextPageInfo) lastStablePageInfoRef.current = nextPageInfo;
      setPageInfo(nextPageInfo);
      if (nextPageInfo) {
        setSectionPageCounts((counts) => updateKnownSectionPageCount(counts, nextPageInfo));
      }
      onAttachFoliateDocumentListeners(event.currentTarget as FoliateViewElement);
      onScheduleEbookBoxUpdate('relocate');
      void onSaveArticleReadingProgressRef.current(article.id, {
        ...progressSnapshot,
        updatedAt: new Date().toISOString(),
      });
    };

    const handleExternalLink = (event: Event) => {
      const customEvent = event as CustomEvent<Record<string, string | undefined>>;
      const href = customEvent.detail['href_'] || customEvent.detail.href;
      if (!href) return;
      event.preventDefault();
      void window.yomitomoDesktop.openUrl(href);
    };

    const handleLoad = (event: Event) => {
      const detail = (event as CustomEvent<{ index?: number }>).detail;
      recordEbookPageTurnTrace(pageTurnTraceRef.current, 'load', {
        sectionIndex: detail.index,
      });
    };

    const handlePageTurnStart = (event: Event) => {
      const detail = (event as CustomEvent<{ direction?: number; reason?: string }>).detail;
      const trace =
        pageTurnTraceRef.current ?? beginPageTurnTrace('foliate', detail.direction ?? 0);
      recordEbookPageTurnTrace(trace, 'foliate_page_turn_start', {
        pageInfo: viewRef.current?.getPageInfo?.() ?? null,
        reason: detail.reason,
      });
      onBeforePageTurnRef.current(trace);
    };

    async function openEbook() {
      try {
        await import('../../vendor/foliate-js/view.js');
        const data = await window.yomitomoDesktop.readEbookFile(article.id);
        if (cancelled) return;

        const file = ebookSourceFile(article, data);
        ebookFileRef.current = file;
        view = document.createElement('foliate-view') as FoliateViewElement;
        view.className = 'ebook-foliate-view';
        view.addEventListener('relocate', handleRelocate);
        view.addEventListener('external-link', handleExternalLink);
        view.addEventListener('load', handleLoad);
        view.addEventListener('page-turn-start', handlePageTurnStart);
        hostElement.replaceChildren(view);
        await view.open(file);
        if (cancelled) return;

        viewRef.current = view;
        configureFoliateView(
          view,
          readerSettingsRef.current,
          readerThemeRef.current,
          maxColumnCountRef.current,
        );
        setTocItems(flattenFoliateToc(view.book?.toc ?? []));
        setSectionFractions(view.getSectionFractions?.() ?? []);
        readerStateStatusRef.current = 'ready';
        setReaderState({ status: 'ready', message: '' });

        if (!(await restoreEbookReadingProgress(view, article.readingProgress))) {
          await view.next();
        }
        onAttachFoliateDocumentListeners(view);
        onScheduleEbookBoxUpdate('open_ebook');
      } catch (error) {
        if (cancelled) return;
        readerStateStatusRef.current = 'error';
        setReaderState({
          status: 'error',
          message: ebookOpenErrorMessage(error),
        });
      }
    }

    void openEbook();

    return () => {
      cancelled = true;
      view?.removeEventListener('relocate', handleRelocate);
      view?.removeEventListener('external-link', handleExternalLink);
      view?.removeEventListener('load', handleLoad);
      view?.removeEventListener('page-turn-start', handlePageTurnStart);
      onCleanupFoliateDocumentListeners();
      closeFoliateView(view);
      view?.remove();
      if (viewRef.current === view) viewRef.current = null;
      if (viewRef.current === null) ebookFileRef.current = null;
      hostElement.replaceChildren();
    };
  }, [
    article.id,
    article.ebook.metadata.fileName,
    article.ebook.metadata.format,
    article.title,
    onAttachFoliateDocumentListeners,
    beginPageTurnTrace,
    onCleanupFoliateDocumentListeners,
    onScheduleEbookBoxUpdate,
    pageTurnTraceRef,
  ]);

  useLayoutEffect(() => {
    const host = viewHostRef.current;
    if (!host) return;
    let resizeTimer = 0;

    const readLayoutKey = () => {
      const rect = host.getBoundingClientRect();
      return `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    };
    const updateLayoutKeyRef = () => {
      const nextLayoutKey = readLayoutKey();
      paginationLayoutKeyRef.current = nextLayoutKey;
      return nextLayoutKey;
    };
    const commitPaginationLayoutKey = (nextLayoutKey: string) => {
      if (committedPaginationLayoutKeyRef.current === nextLayoutKey) return;
      committedPaginationLayoutKeyRef.current = nextLayoutKey;
      setPaginationLayoutKey(nextLayoutKey);
    };
    const updateLayoutKey = (reason: EbookBoxUpdateReason, scheduleBoxUpdate = true) => {
      const nextLayoutKey = updateLayoutKeyRef();
      commitPaginationLayoutKey(nextLayoutKey);
      if (!scheduleBoxUpdate) return;
      onScheduleEbookBoxUpdate(reason);
    };

    updateLayoutKey('layout_measure');
    const scheduleResizeBoxUpdate = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        void (async () => {
          await waitForFoliateIdle();
          await waitForAnimationFrame();
          await waitForAnimationFrame();
          updateLayoutKey('resize_observer');
        })();
      }, EBOOK_PAGINATION_RESIZE_SETTLE_DELAY_MS);
    };

    const observer = new ResizeObserver(() => {
      updateLayoutKeyRef();
      scheduleResizeBoxUpdate();
    });
    observer.observe(host);
    return () => {
      window.clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [article.id, onScheduleEbookBoxUpdate]);

  useEffect(() => {
    const measureHost = measureHostRef.current;
    const sourceFile = ebookFileRef.current;
    const visibleView = viewRef.current;
    const sections = visibleView?.book?.sections ?? [];
    const [layoutWidth, layoutHeight] = paginationLayoutKey.split('x').map(Number);
    if (
      readerState.status !== 'ready' ||
      !measureHost ||
      !sourceFile ||
      !visibleView ||
      sections.length === 0 ||
      !layoutWidth ||
      !layoutHeight
    ) {
      return;
    }
    const measureHostElement = measureHost;
    const sourceEbookFile = sourceFile;
    const visibleEbookView = visibleView;
    const paginationStartedAt = performance.now();
    const cacheKey = ebookPaginationCacheKey({
      articleId: article.id,
      columns: maxColumnCountRef.current,
      contentWidth: readerSettings.contentWidth,
      fontSize: readerSettings.fontSize,
      layoutKey: paginationLayoutKey,
    });
    const cachedCounts = ebookSectionPageCountsCache.get(cacheKey);

    let cancelled = false;
    let measureView: FoliateViewElement | null = null;
    let counts: Array<number | null> =
      cachedCounts?.length === sections.length
        ? [...cachedCounts]
        : sections.map((section) => (section.linear === 'no' ? 0 : null));
    const currentPageInfo = visibleEbookView.getPageInfo?.();
    pageInfoSectionIndexRef.current = currentPageInfo?.sectionIndex;
    if (currentPageInfo) lastStablePageInfoRef.current = currentPageInfo;
    setPageInfo(currentPageInfo ?? null);
    counts = currentPageInfo ? updateKnownSectionPageCount(counts, currentPageInfo) : counts;
    ebookSectionPageCountsCache.set(cacheKey, [...counts]);
    setSectionPageCounts([...counts]);
    const pendingSectionIndexes = ebookPendingPaginationSectionIndexes(
      sections,
      counts,
      currentPageInfo?.sectionIndex,
    );
    recordRendererPerformanceTiming('ebook_pagination', {
      articleId: article.id,
      cachedSectionCount: counts.filter((count) => count !== null).length,
      columns: maxColumnCountRef.current,
      elapsedMs: rendererPerformanceElapsedMs(paginationStartedAt),
      hasCacheEntry: cachedCounts?.length === sections.length,
      layoutKey: paginationLayoutKey,
      phase: 'plan',
      pendingSectionCount: pendingSectionIndexes.length,
      result: pendingSectionIndexes.length === 0 ? 'cache_hit' : 'scheduled',
      sectionCount: sections.length,
    });
    if (pendingSectionIndexes.length === 0) return;

    const timer = window.setTimeout(() => {
      void measureEbookPages();
    }, 360);

    async function measureEbookPages() {
      const measureStartedAt = performance.now();
      let importMs = 0;
      let initialIdleMs = 0;
      let openMs = 0;
      let idleYieldMs = 0;
      const sectionTimings: EbookPaginationSectionTiming[] = [];
      try {
        const initialIdleStartedAt = performance.now();
        await waitForFoliateIdle();
        initialIdleMs = rendererPerformanceElapsedMs(initialIdleStartedAt);
        if (cancelled) return;

        const importStartedAt = performance.now();
        await import('../../vendor/foliate-js/view.js');
        importMs = rendererPerformanceElapsedMs(importStartedAt);
        measureView = document.createElement('foliate-view') as FoliateViewElement;
        measureView.className = 'ebook-foliate-view';
        measureHostElement.replaceChildren(measureView);
        const openStartedAt = performance.now();
        await measureView.open(sourceEbookFile);
        openMs = rendererPerformanceElapsedMs(openStartedAt);
        configureFoliateView(
          measureView,
          readerSettingsRef.current,
          readerThemeRef.current,
          maxColumnCountRef.current,
        );

        for (const index of pendingSectionIndexes) {
          if (cancelled) return;
          const sectionStartedAt = performance.now();
          const goToStartedAt = performance.now();

          await measureView.goTo(index);
          const goToMs = rendererPerformanceElapsedMs(goToStartedAt);
          const pageInfoTiming: FoliatePageInfoWaitTiming = {
            assetWaitMs: 0,
            fontWaitMs: 0,
            imageWaitMs: 0,
            pendingImageCount: 0,
            frameWaitMs: 0,
            frameWaitCount: 0,
            matched: false,
            matchedAfterAssets: false,
            elapsedMs: 0,
          };
          const nextPageInfo = await waitForFoliatePageInfo(measureView, index, pageInfoTiming);
          if (cancelled) return;

          counts[index] = Math.max(1, nextPageInfo?.pageCount ?? 1);
          const nextCounts = [...counts];
          ebookSectionPageCountsCache.set(cacheKey, nextCounts);
          let sectionIdleYieldMs = 0;
          if ((sectionTimings.length + 1) % EBOOK_PAGINATION_SECTION_YIELD_INTERVAL === 0) {
            const idleStartedAt = performance.now();
            await waitForFoliateIdle();
            sectionIdleYieldMs = rendererPerformanceElapsedMs(idleStartedAt);
            idleYieldMs += sectionIdleYieldMs;
            if (cancelled) return;
          }
          sectionTimings.push({
            elapsedMs: rendererPerformanceElapsedMs(sectionStartedAt),
            index,
            pageCount: counts[index] ?? 1,
            goToMs,
            pageInfoWaitMs: pageInfoTiming.elapsedMs,
            assetWaitMs: pageInfoTiming.assetWaitMs,
            fontWaitMs: pageInfoTiming.fontWaitMs,
            imageWaitMs: pageInfoTiming.imageWaitMs,
            pendingImageCount: pageInfoTiming.pendingImageCount,
            frameWaitMs: pageInfoTiming.frameWaitMs,
            frameWaitCount: pageInfoTiming.frameWaitCount,
            pageInfoMatched: pageInfoTiming.matched,
            pageInfoMatchedAfterAssets: pageInfoTiming.matchedAfterAssets,
            idleYieldMs: sectionIdleYieldMs,
          });
        }
        if (!cancelled) setSectionPageCounts([...counts]);
      } catch (error) {
        console.warn(error);
      } finally {
        recordRendererPerformanceTiming('ebook_pagination', {
          articleId: article.id,
          columns: maxColumnCountRef.current,
          elapsedMs: rendererPerformanceElapsedMs(measureStartedAt),
          hasCacheEntry: cachedCounts?.length === sections.length,
          idleYieldMs,
          importMs,
          initialIdleMs,
          layoutKey: paginationLayoutKey,
          openMs,
          phase: 'measure',
          pendingSectionCount: pendingSectionIndexes.length,
          result: cancelled ? 'cancelled' : 'complete',
          sectionCount: sections.length,
          sectionTimings,
        });
        closeFoliateView(measureView);
        measureView?.remove();
        if (measureHostElement.firstChild === measureView) measureHostElement.replaceChildren();
      }
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      closeFoliateView(measureView);
      measureView?.remove();
      if (measureHost.firstChild === measureView) measureHost.replaceChildren();
    };
  }, [
    article.id,
    maxColumnCount,
    paginationLayoutKey,
    readerSettings.contentWidth,
    readerSettings.fontSize,
    readerState.status,
  ]);

  const drainPageTurnQueue = useCallback(() => {
    if (pageTurnRunningRef.current) return;
    pageTurnRunningRef.current = true;

    void (async () => {
      try {
        while (pageTurnQueueRef.current.length > 0) {
          const direction = pageTurnQueueRef.current.shift()!;
          const view = viewRef.current;
          if (!view || readerStateStatusRef.current !== 'ready') continue;

          const trace = beginPageTurnTrace('control', direction);
          onBeforePageTurnRef.current(trace);
          recordEbookPageTurnTrace(trace, 'view_go_start');
          if (direction === 'left') await view.goLeft();
          else await view.goRight();
          recordEbookPageTurnTrace(trace, 'view_go_done', {
            pageInfo: view.getPageInfo?.() ?? null,
          });
          onScheduleEbookBoxUpdate('page_turn');
        }
      } finally {
        pageTurnRunningRef.current = false;
      }
    })();
  }, [article.id, article.ebook.metadata.format, beginPageTurnTrace, onScheduleEbookBoxUpdate]);

  const turnPage = useCallback(
    (direction: PageTurnDirection) => {
      pageTurnQueueRef.current.push(direction);
      drainPageTurnQueue();
    },
    [drainPageTurnQueue],
  );

  const goLeft = useCallback(() => {
    turnPage('left');
  }, [turnPage]);

  const goRight = useCallback(() => {
    turnPage('right');
  }, [turnPage]);

  const goToTocItem = useCallback((item: { href: string }) => {
    void viewRef.current?.goTo(item.href);
  }, []);

  const goToProgress = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextProgress = clampNumber(Number(event.currentTarget.value), 0, 1, progress);
      setProgress(nextProgress);
      progressRef.current = nextProgress;
      void viewRef.current?.goToFraction(nextProgress);
    },
    [progress],
  );

  return {
    viewHostRef,
    measureHostRef,
    viewRef,
    pageInfoSectionIndexRef,
    paginationLayoutKeyRef,
    readerSettingsRef,
    readerStateStatusRef,
    tocItems,
    sectionFractions,
    pageInfo,
    sectionPageCounts,
    progress,
    readerState,
    goLeft,
    goRight,
    goToProgress,
    goToTocItem,
  };
}

export function ebookSourceFile(
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> },
  data: ArrayBuffer,
) {
  const format = article.ebook.metadata.format;
  return new File([data], article.ebook.metadata.fileName || `${article.title}.${format}`, {
    type: ebookSourceMimeType(format),
  });
}

function ebookSourceMimeType(format: NonNullable<ArticleRecord['ebook']>['metadata']['format']) {
  if (format === 'azw3') return 'application/vnd.amazon.ebook';
  if (format === 'mobi') return 'application/x-mobipocket-ebook';
  return 'application/epub+zip';
}

function ebookOpenErrorMessage(error: unknown) {
  if (!(error instanceof Error) || !error.message) return i18next.t('ebookReader.openFailed');
  if (error.message === 'EBOOK_SOURCE_FILE_MISSING') return i18next.t('ebookReader.sourceMissing');
  if (error.message === 'EBOOK_SOURCE_INVALID_ID') return i18next.t('ebookReader.openFailed');
  return error.message;
}

async function restoreEbookReadingProgress(
  view: FoliateViewElement,
  progress: ArticleReadingProgress | undefined,
) {
  const target = ebookReadingProgressRestoreTarget(progress);
  if (!target) return false;

  if (target.kind === 'fraction') {
    await view.goToFraction(target.fraction);
    return true;
  }

  if (view.renderer?.goTo) {
    await view.renderer.goTo({ index: target.sectionIndex, anchor: target.anchor });
    return true;
  }

  const fractions = view.getSectionFractions?.() ?? [];
  const start = fractions[target.sectionIndex];
  const end = fractions[target.sectionIndex + 1];
  if (typeof start === 'number' && typeof end === 'number' && end >= start) {
    await view.goToFraction(clampNumber(start + (end - start) * target.anchor, 0, 1, 0));
    return true;
  }

  await view.goTo(target.sectionIndex);
  return true;
}
