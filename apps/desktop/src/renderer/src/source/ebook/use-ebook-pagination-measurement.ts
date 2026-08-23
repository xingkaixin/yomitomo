import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { ReaderTheme } from '@yomitomo/reader-ui/reader-theme';
import type { ReaderSettings } from '@yomitomo/reader-ui/reader-types';
import type { EbookBoxUpdateReason } from './ebook-annotation-layout';
import {
  closeFoliateView,
  configureFoliateView,
  updateKnownSectionPageCount,
  waitForAnimationFrame,
  waitForFoliateIdle,
  waitForFoliatePageInfo,
  type FoliatePageInfo,
  type FoliatePageInfoWaitTiming,
  type FoliateViewElement,
} from './ebook-foliate-view';
import {
  EbookPaginationPageCountCache,
  ebookPaginationCacheKey,
  ebookPendingPaginationSectionIndexes,
} from './ebook-pagination';
import {
  rendererPerformanceElapsedMs,
  recordRendererPerformanceTiming,
} from '../../shell/app-renderer-performance';

const ebookSectionPageCountsCache = new EbookPaginationPageCountCache();
const ebookPaginationMeasurements = new Map<string, Promise<EbookPaginationMeasurementResult>>();
const EBOOK_PAGINATION_MEASURE_DELAY_MS = 360;
const EBOOK_PAGINATION_RESIZE_SETTLE_DELAY_MS = 240;
const EBOOK_PAGINATION_RESIZE_QUIET_MS = 900;
const EBOOK_PAGINATION_SECTION_YIELD_INTERVAL = 12;

type EbookPaginationMeasurementResult = {
  counts: Array<number | null> | null;
  result: 'cancelled' | 'complete' | 'error';
};

type EbookPaginationGoToMethod = 'renderer' | 'view';

type EbookPaginationSectionTiming = {
  elapsedMs: number;
  index: number;
  pageCount: number;
  goToMs: number;
  goToMethod: EbookPaginationGoToMethod;
  pageInfoWaitMs: number;
  assetWaitMs: number;
  fontWaitMs: number;
  imageWaitMs: number;
  pendingImageCount: number;
  frameWaitMs: number;
  frameWaitCount: number;
  pageInfoMatched: boolean;
  pageInfoMatchedAfterAssets: boolean;
  pageInfoSynthesized: boolean;
  observedSectionIndex?: number | null;
  observedPageIndex?: number | null;
  observedPageCount?: number | null;
  contentIndexes?: number[];
  sectionId?: string;
  sectionLinear?: string;
  sectionSize?: number;
  idleYieldMs: number;
};
type UseEbookPaginationMeasurementInput = {
  articleId: string;
  ebookFileRef: RefObject<File | null>;
  maxColumnCount: number;
  maxColumnCountRef: RefObject<number>;
  onPageInfoChange: (pageInfo: FoliatePageInfo | null) => void;
  onScheduleEbookBoxUpdate: (reason: EbookBoxUpdateReason) => void;
  readerSettings: ReaderSettings;
  readerSettingsRef: RefObject<ReaderSettings>;
  readerStateStatus: 'loading' | 'ready' | 'error';
  readerThemeRef: RefObject<ReaderTheme>;
  viewHostRef: RefObject<HTMLDivElement | null>;
  viewRef: RefObject<FoliateViewElement | null>;
};

export function useEbookPaginationMeasurement({
  articleId,
  ebookFileRef,
  maxColumnCount,
  maxColumnCountRef,
  onPageInfoChange,
  onScheduleEbookBoxUpdate,
  readerSettings,
  readerSettingsRef,
  readerStateStatus,
  readerThemeRef,
  viewHostRef,
  viewRef,
}: UseEbookPaginationMeasurementInput) {
  const measureHostRef = useRef<HTMLDivElement | null>(null);
  const paginationLayoutKeyRef = useRef('');
  const committedPaginationLayoutKeyRef = useRef('');
  const paginationResizeObservedAtRef = useRef(0);
  const [paginationLayoutKey, setPaginationLayoutKey] = useState('');
  const [sectionPageCounts, setSectionPageCounts] = useState<Array<number | null>>([]);
  const recordKnownPageInfo = useCallback((pageInfo: FoliatePageInfo) => {
    setSectionPageCounts((counts) => updateKnownSectionPageCount(counts, pageInfo));
  }, []);

  useLayoutEffect(() => {
    setSectionPageCounts([]);
    paginationLayoutKeyRef.current = '';
    committedPaginationLayoutKeyRef.current = '';
    paginationResizeObservedAtRef.current = 0;
    setPaginationLayoutKey('');
  }, [articleId]);

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
    const updateLayoutKeyRefFromResize = () => {
      const previousLayoutKey = paginationLayoutKeyRef.current;
      const nextLayoutKey = updateLayoutKeyRef();
      if (previousLayoutKey && previousLayoutKey !== nextLayoutKey) {
        paginationResizeObservedAtRef.current = performance.now();
      }
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
      updateLayoutKeyRefFromResize();
      scheduleResizeBoxUpdate();
    });
    observer.observe(host);
    return () => {
      window.clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [articleId, onScheduleEbookBoxUpdate]);

  useEffect(() => {
    const measureHost = measureHostRef.current;
    const sourceFile = ebookFileRef.current;
    const visibleView = viewRef.current;
    const sections = visibleView?.book?.sections ?? [];
    const [layoutWidth, layoutHeight] = paginationLayoutKey.split('x').map(Number);
    if (
      readerStateStatus !== 'ready' ||
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
      articleId,
      columns: maxColumnCountRef.current,
      contentWidth: readerSettings.contentWidth,
      fontSize: readerSettings.fontSize,
      layoutKey: paginationLayoutKey,
    });
    const cachedCounts = ebookSectionPageCountsCache.get(cacheKey);

    let cancelled = false;
    let cancelReason: 'effect_cleanup' | 'layout_changed' | undefined;
    let measureView: FoliateViewElement | null = null;
    let timer = 0;
    let counts: Array<number | null> =
      cachedCounts?.length === sections.length
        ? [...cachedCounts]
        : sections.map((section) => (section.linear === 'no' ? 0 : null));
    const isMeasurementStale = () => paginationLayoutKeyRef.current !== paginationLayoutKey;
    const shouldCancelMeasurement = () => {
      if (cancelled) return true;
      if (isMeasurementStale()) {
        cancelReason = 'layout_changed';
        return true;
      }
      return false;
    };
    const refreshCountsFromCache = () => {
      const latestCachedCounts = ebookSectionPageCountsCache.get(cacheKey);
      if (latestCachedCounts?.length === sections.length) counts = [...latestCachedCounts];
      return counts;
    };
    const resizeQuietMs = () =>
      paginationResizeObservedAtRef.current
        ? rendererPerformanceElapsedMs(paginationResizeObservedAtRef.current)
        : null;
    const resizeQuietDelayMs = () => {
      const quietMs = resizeQuietMs();
      if (quietMs === null) return 0;
      return Math.max(0, EBOOK_PAGINATION_RESIZE_QUIET_MS - quietMs);
    };
    const measurementDelayMs = () =>
      Math.max(EBOOK_PAGINATION_MEASURE_DELAY_MS, resizeQuietDelayMs());
    const currentPageInfo = visibleEbookView.getPageInfo?.();
    onPageInfoChange(currentPageInfo ?? null);
    counts = currentPageInfo ? updateKnownSectionPageCount(counts, currentPageInfo) : counts;
    ebookSectionPageCountsCache.set(cacheKey, counts);
    setSectionPageCounts([...counts]);
    const pendingSectionIndexes = ebookPendingPaginationSectionIndexes(
      sections,
      counts,
      currentPageInfo?.sectionIndex,
    );
    const existingMeasurement = ebookPaginationMeasurements.get(cacheKey);
    const scheduledDelayMs = measurementDelayMs();
    recordRendererPerformanceTiming('ebook_pagination', {
      articleId,
      cachedSectionCount: counts.filter((count) => count !== null).length,
      cacheEntryCount: ebookSectionPageCountsCache.size,
      columns: maxColumnCountRef.current,
      elapsedMs: rendererPerformanceElapsedMs(paginationStartedAt),
      hasCacheEntry: cachedCounts?.length === sections.length,
      layoutKey: paginationLayoutKey,
      phase: 'plan',
      pendingSectionCount: pendingSectionIndexes.length,
      result:
        pendingSectionIndexes.length === 0
          ? 'cache_hit'
          : existingMeasurement
            ? 'joined'
            : 'scheduled',
      resizeQuietMs: resizeQuietMs(),
      resizeQuietRequiredMs: EBOOK_PAGINATION_RESIZE_QUIET_MS,
      scheduledDelayMs:
        pendingSectionIndexes.length === 0 || existingMeasurement ? 0 : scheduledDelayMs,
      sectionCount: sections.length,
    });
    if (pendingSectionIndexes.length === 0) return;

    const scheduleMeasurement = (delayMs: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(startOrJoinMeasurement, delayMs);
    };

    const followMeasurement = (measurement: Promise<EbookPaginationMeasurementResult>) => {
      void measurement
        .then((result) => {
          if (shouldCancelMeasurement()) return;
          refreshCountsFromCache();
          if (result.result === 'complete') {
            setSectionPageCounts([...counts]);
            return;
          }
          if (
            ebookPendingPaginationSectionIndexes(sections, counts, currentPageInfo?.sectionIndex)
              .length > 0
          ) {
            scheduleMeasurement(measurementDelayMs());
          }
        })
        .catch((error) => {
          console.warn(error);
        });
    };

    function startOrJoinMeasurement() {
      if (shouldCancelMeasurement()) return;
      const remainingResizeDelayMs = resizeQuietDelayMs();
      if (remainingResizeDelayMs > 0) {
        scheduleMeasurement(remainingResizeDelayMs);
        return;
      }

      const inFlightMeasurement = ebookPaginationMeasurements.get(cacheKey);
      if (inFlightMeasurement) {
        followMeasurement(inFlightMeasurement);
        return;
      }

      const measurement = measureEbookPages();
      ebookPaginationMeasurements.set(cacheKey, measurement);
      void measurement.finally(() => {
        if (ebookPaginationMeasurements.get(cacheKey) === measurement) {
          ebookPaginationMeasurements.delete(cacheKey);
        }
      });
    }

    if (existingMeasurement) followMeasurement(existingMeasurement);
    else scheduleMeasurement(scheduledDelayMs);

    async function measureEbookPages(): Promise<EbookPaginationMeasurementResult> {
      const measureStartedAt = performance.now();
      let importMs = 0;
      let initialIdleMs = 0;
      let openMs = 0;
      let idleYieldMs = 0;
      let measurePendingSectionIndexes = pendingSectionIndexes;
      let measurementResult: EbookPaginationMeasurementResult['result'] = 'complete';
      let errorMessage: string | undefined;
      const sectionTimings: EbookPaginationSectionTiming[] = [];
      try {
        if (shouldCancelMeasurement()) {
          measurementResult = 'cancelled';
          return { counts: null, result: measurementResult };
        }
        refreshCountsFromCache();
        measurePendingSectionIndexes = ebookPendingPaginationSectionIndexes(
          sections,
          counts,
          currentPageInfo?.sectionIndex,
        );
        if (measurePendingSectionIndexes.length === 0) {
          setSectionPageCounts([...counts]);
          return { counts: [...counts], result: measurementResult };
        }

        const initialIdleStartedAt = performance.now();
        await waitForFoliateIdle();
        initialIdleMs = rendererPerformanceElapsedMs(initialIdleStartedAt);
        if (shouldCancelMeasurement()) {
          measurementResult = 'cancelled';
          return { counts: null, result: measurementResult };
        }

        const importStartedAt = performance.now();
        await import('../../vendor/foliate-js/view.js');
        importMs = rendererPerformanceElapsedMs(importStartedAt);
        measureView = document.createElement('foliate-view') as FoliateViewElement;
        measureView.className = 'ebook-foliate-view';
        measureHostElement.replaceChildren(measureView);
        const openStartedAt = performance.now();
        await measureView.open(sourceEbookFile);
        openMs = rendererPerformanceElapsedMs(openStartedAt);
        if (shouldCancelMeasurement()) {
          measurementResult = 'cancelled';
          return { counts: null, result: measurementResult };
        }
        configureFoliateView(
          measureView,
          readerSettingsRef.current,
          readerThemeRef.current,
          maxColumnCountRef.current,
        );

        for (const index of measurePendingSectionIndexes) {
          if (shouldCancelMeasurement()) {
            measurementResult = 'cancelled';
            return { counts: null, result: measurementResult };
          }
          const section = sections[index];
          const sectionStartedAt = performance.now();
          const goToStartedAt = performance.now();

          const goToMethod = await goToFoliateMeasureSection(measureView, index);
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
            synthesized: false,
            observedPageInfo: null,
            contentIndexes: [],
            elapsedMs: 0,
          };
          const nextPageInfo = await waitForFoliatePageInfo(measureView, index, pageInfoTiming);
          if (shouldCancelMeasurement()) {
            measurementResult = 'cancelled';
            return { counts: null, result: measurementResult };
          }

          counts[index] = Math.max(1, nextPageInfo?.pageCount ?? 1);
          const nextCounts = [...counts];
          ebookSectionPageCountsCache.set(cacheKey, nextCounts);
          let sectionIdleYieldMs = 0;
          if ((sectionTimings.length + 1) % EBOOK_PAGINATION_SECTION_YIELD_INTERVAL === 0) {
            const idleStartedAt = performance.now();
            await waitForFoliateIdle();
            sectionIdleYieldMs = rendererPerformanceElapsedMs(idleStartedAt);
            idleYieldMs += sectionIdleYieldMs;
            if (shouldCancelMeasurement()) {
              measurementResult = 'cancelled';
              return { counts: null, result: measurementResult };
            }
          }
          sectionTimings.push({
            elapsedMs: rendererPerformanceElapsedMs(sectionStartedAt),
            index,
            pageCount: counts[index] ?? 1,
            goToMs,
            goToMethod,
            pageInfoWaitMs: pageInfoTiming.elapsedMs,
            assetWaitMs: pageInfoTiming.assetWaitMs,
            fontWaitMs: pageInfoTiming.fontWaitMs,
            imageWaitMs: pageInfoTiming.imageWaitMs,
            pendingImageCount: pageInfoTiming.pendingImageCount,
            frameWaitMs: pageInfoTiming.frameWaitMs,
            frameWaitCount: pageInfoTiming.frameWaitCount,
            pageInfoMatched: pageInfoTiming.matched,
            pageInfoMatchedAfterAssets: pageInfoTiming.matchedAfterAssets,
            pageInfoSynthesized: pageInfoTiming.synthesized,
            observedSectionIndex: pageInfoTiming.matched
              ? undefined
              : (pageInfoTiming.observedPageInfo?.sectionIndex ?? null),
            observedPageIndex: pageInfoTiming.matched
              ? undefined
              : (pageInfoTiming.observedPageInfo?.pageIndex ?? null),
            observedPageCount: pageInfoTiming.matched
              ? undefined
              : (pageInfoTiming.observedPageInfo?.pageCount ?? null),
            contentIndexes: pageInfoTiming.matched ? undefined : pageInfoTiming.contentIndexes,
            sectionId: typeof section?.id === 'string' ? section.id : undefined,
            sectionLinear: section?.linear,
            sectionSize: typeof section?.size === 'number' ? section.size : undefined,
            idleYieldMs: sectionIdleYieldMs,
          });
        }
        if (!shouldCancelMeasurement()) {
          setSectionPageCounts([...counts]);
          return { counts: [...counts], result: measurementResult };
        }
        measurementResult = 'cancelled';
        return { counts: null, result: measurementResult };
      } catch (error) {
        console.warn(error);
        errorMessage = error instanceof Error ? error.message : String(error);
        measurementResult = 'error';
        return { counts: null, result: measurementResult };
      } finally {
        recordRendererPerformanceTiming('ebook_pagination', {
          articleId,
          columns: maxColumnCountRef.current,
          elapsedMs: rendererPerformanceElapsedMs(measureStartedAt),
          hasCacheEntry: cachedCounts?.length === sections.length,
          idleYieldMs,
          importMs,
          initialIdleMs,
          layoutKey: paginationLayoutKey,
          openMs,
          phase: 'measure',
          pendingSectionCount: measurePendingSectionIndexes.length,
          result: measurementResult,
          cancelReason,
          errorMessage,
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
      cancelReason ??= 'effect_cleanup';
      window.clearTimeout(timer);
      closeFoliateView(measureView);
      measureView?.remove();
      if (measureHost.firstChild === measureView) measureHost.replaceChildren();
    };
  }, [
    articleId,
    maxColumnCount,
    paginationLayoutKey,
    readerSettings.contentWidth,
    readerSettings.fontSize,
    readerStateStatus,
  ]);
  return {
    measureHostRef,
    paginationLayoutKeyRef,
    recordKnownPageInfo,
    sectionPageCounts,
  };
}

async function goToFoliateMeasureSection(
  view: FoliateViewElement,
  index: number,
): Promise<EbookPaginationGoToMethod> {
  if (view.renderer?.goTo) {
    await view.renderer.goTo({ index });
    return 'renderer';
  }

  await view.goTo(index);
  return 'view';
}
