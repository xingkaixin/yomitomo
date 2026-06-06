import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import { hashText } from '@yomitomo/shared';
import { annotationColor, type HighlightBox } from '@yomitomo/core';
import type { ReaderSettings } from '@yomitomo/reader-ui/reader-types';
import {
  currentFoliateContent,
  createEbookAnchorResolver,
  ebookChapterForFoliateSection,
  ebookHighlightAnnotationsSignature,
  foliateRangeHighlightBoxes,
  recordEbookPageTurnTrace,
  type DomTextIndexTiming,
  type EbookBoxScheduleSnapshot,
  type EbookBoxScheduleState,
  type EbookBoxUpdateReason,
  type EbookPageTurnTrace,
  type FoliateViewElement,
} from './app-ebook-reader-utils';
import {
  rendererPerformanceElapsedMs,
  recordRendererPerformanceTiming,
  type EbookBookcaseProps,
} from '../bookcase/app-source-bookcase-shared';
import {
  readerPageTurnDirectionFromKeyboardEvent,
  type ReaderPageTurnDirection,
} from '../../shell/use-reader-page-turn-keys';

type UseEbookReaderBoxesInput = {
  annotationAgents: PublicAgent[];
  annotationsRef: RefObject<Annotation[]>;
  article: EbookBookcaseProps['article'];
  canvasRef: RefObject<HTMLDivElement | null>;
  viewRef: RefObject<FoliateViewElement | null>;
  pageTurnTraceRef: RefObject<EbookPageTurnTrace | null>;
  pageInfoSectionIndexRef: RefObject<number | undefined>;
  paginationLayoutKeyRef: RefObject<string>;
  readerSettingsRef: RefObject<ReaderSettings>;
  readerStateStatus: 'loading' | 'ready' | 'error';
  readerStateStatusRef: RefObject<'loading' | 'ready' | 'error'>;
  userProfile: UserProfile;
  onFoliatePointerDown: () => void;
  onFoliatePageTurnKey: (direction: ReaderPageTurnDirection) => void;
  onFoliateSelection: (doc: Document) => void;
  onFoliateSelectionShortcut: (event: KeyboardEvent) => void;
};

function ebookLayoutDebugEnabled() {
  try {
    return (
      (window as unknown as { yomitomoEbookLayoutDebug?: boolean }).yomitomoEbookLayoutDebug ===
        true || window.localStorage.getItem('yomitomo:ebook-layout-debug') === '1'
    );
  } catch {
    return false;
  }
}

function debugEbookLayout(event: string, details: Record<string, unknown>) {
  if (!ebookLayoutDebugEnabled()) return;
  console.info(`[yomitomo:ebook-layout] ${event}`, details);
}

export function useEbookReaderBoxes({
  annotationAgents,
  annotationsRef,
  article,
  canvasRef,
  viewRef,
  pageTurnTraceRef,
  pageInfoSectionIndexRef,
  paginationLayoutKeyRef,
  readerSettingsRef,
  readerStateStatus,
  readerStateStatusRef,
  userProfile,
  onFoliatePointerDown,
  onFoliatePageTurnKey,
  onFoliateSelection,
  onFoliateSelectionShortcut,
}: UseEbookReaderBoxesInput) {
  const [boxes, setBoxes] = useState<HighlightBox[]>([]);
  const updateBoxesFrameRef = useRef(0);
  const ebookBoxScheduleRef = useRef<EbookBoxScheduleState>({
    count: 0,
    cancelledFrameCount: 0,
    reasons: [],
    firstScheduledAt: 0,
  });
  const lastEbookBoxInputFingerprintRef = useRef('');
  const lastEbookBoxMetricsRef = useRef({
    boxCount: 0,
    rangeCount: 0,
    resolvedAnchorCount: 0,
  });
  const observedFoliateDocsRef = useRef(new WeakSet<Document>());
  const foliateDocCleanupsRef = useRef<Array<() => void>>([]);
  const handleFoliateSelectionRef = useRef(onFoliateSelection);
  const handleFoliatePageTurnKeyRef = useRef(onFoliatePageTurnKey);
  const handleFoliatePointerDownRef = useRef(onFoliatePointerDown);
  const handleFoliateSelectionShortcutRef = useRef(onFoliateSelectionShortcut);

  handleFoliateSelectionRef.current = onFoliateSelection;
  handleFoliatePageTurnKeyRef.current = onFoliatePageTurnKey;
  handleFoliatePointerDownRef.current = onFoliatePointerDown;
  handleFoliateSelectionShortcutRef.current = onFoliateSelectionShortcut;

  const resetEbookBoxState = useCallback(() => {
    if (updateBoxesFrameRef.current) {
      window.cancelAnimationFrame(updateBoxesFrameRef.current);
      updateBoxesFrameRef.current = 0;
    }
    ebookBoxScheduleRef.current = {
      count: 0,
      cancelledFrameCount: 0,
      reasons: [],
      firstScheduledAt: 0,
    };
    lastEbookBoxInputFingerprintRef.current = '';
    lastEbookBoxMetricsRef.current = { boxCount: 0, rangeCount: 0, resolvedAnchorCount: 0 };
    canvasRef.current?.classList.remove('is-ebook-page-turning');
    setBoxes([]);
  }, [canvasRef]);

  const setEbookBoxLayerHidden = useCallback(
    (hidden: boolean) => {
      canvasRef.current?.classList.toggle('is-ebook-page-turning', hidden);
    },
    [canvasRef],
  );

  const hideEbookBoxLayer = useCallback(() => {
    if (updateBoxesFrameRef.current) {
      window.cancelAnimationFrame(updateBoxesFrameRef.current);
      updateBoxesFrameRef.current = 0;
    }
    ebookBoxScheduleRef.current = {
      count: 0,
      cancelledFrameCount: 0,
      reasons: [],
      firstScheduledAt: 0,
    };
    setEbookBoxLayerHidden(true);
    recordEbookPageTurnTrace(pageTurnTraceRef.current, 'highlight_layer_hidden', {
      previousBoxCount: boxes.length,
    });
  }, [boxes.length, pageTurnTraceRef, setEbookBoxLayerHidden]);

  const updateEbookBoxes = useCallback(
    (reason: EbookBoxUpdateReason, schedule?: EbookBoxScheduleSnapshot) => {
      const pageTurnTrace = pageTurnTraceRef.current;
      const finishPageTurnTrace = () => {
        if (pageTurnTraceRef.current === pageTurnTrace) pageTurnTraceRef.current = null;
      };
      recordEbookPageTurnTrace(pageTurnTrace, 'boxes_update_start', { reason });
      const view = viewRef.current;
      const canvasElement = canvasRef.current;
      const content = currentFoliateContent(view);
      const doc = content?.doc;
      if (!article.ebook || !view || !canvasElement || !doc) {
        setBoxes([]);
        setEbookBoxLayerHidden(false);
        recordEbookPageTurnTrace(pageTurnTrace, 'boxes_update_empty', {
          reason,
          hasCanvas: Boolean(canvasElement),
          hasDoc: Boolean(doc),
          hasView: Boolean(view),
        });
        finishPageTurnTrace();
        return;
      }

      const startedAt = performance.now();
      const currentPageInfo = view.getPageInfo?.() ?? null;
      const sectionIndex =
        content.index ?? currentPageInfo?.sectionIndex ?? pageInfoSectionIndexRef.current ?? 0;
      const pageInfoKey = currentPageInfo
        ? `${currentPageInfo.sectionIndex}:${currentPageInfo.pageIndex}:${currentPageInfo.pageCount}`
        : '';
      const chapter = ebookChapterForFoliateSection(article, view, sectionIndex);
      const canvasRect = canvasElement.getBoundingClientRect();
      const firstFrameRect = canvasElement
        .querySelector<HTMLIFrameElement>('iframe')
        ?.getBoundingClientRect();
      const readerSettingsSnapshot = readerSettingsRef.current;
      const layoutKey = paginationLayoutKeyRef.current;
      const visibleAnnotations = annotationsRef.current ?? [];
      const annotationSignature = ebookHighlightAnnotationsSignature(
        visibleAnnotations,
        userProfile,
        annotationAgents,
      );
      const inputFingerprint = hashText(
        [
          article.id,
          sectionIndex,
          chapter?.id || '',
          annotationSignature,
          pageInfoKey,
          layoutKey,
          readerStateStatusRef.current,
          readerSettingsSnapshot?.fontSize,
          readerSettingsSnapshot?.contentWidth,
          Math.round(canvasRect.width),
          Math.round(canvasRect.height),
        ].join('|'),
      );
      const sameInputAsPrevious = lastEbookBoxInputFingerprintRef.current === inputFingerprint;
      const forceUpdate =
        schedule?.reasons.includes('resize_observer') || reason === 'resize_observer';
      let skippedChapterCount = 0;
      const searchableAnnotations = visibleAnnotations.filter((annotation) => {
        if (chapter && annotation.anchor.chapterId && annotation.anchor.chapterId !== chapter.id) {
          skippedChapterCount += 1;
          return false;
        }
        return true;
      });
      if (sameInputAsPrevious && !forceUpdate) {
        const previousMetrics = lastEbookBoxMetricsRef.current;
        setEbookBoxLayerHidden(false);
        debugEbookLayout('boxes-skip', {
          canvas: {
            height: Math.round(canvasRect.height),
            left: Math.round(canvasRect.left),
            width: Math.round(canvasRect.width),
          },
          frame: firstFrameRect
            ? {
                height: Math.round(firstFrameRect.height),
                left: Math.round(firstFrameRect.left),
                width: Math.round(firstFrameRect.width),
              }
            : null,
          pageInfoKey,
          reason,
        });
        recordEbookPageTurnTrace(pageTurnTrace, 'boxes_update_skipped_same_input', {
          boxCount: previousMetrics.boxCount,
          pageInfoKey,
          reason,
          sectionIndex,
        });
        finishPageTurnTrace();
        recordRendererPerformanceTiming('reader_highlight_boxes', {
          source: 'ebook-foliate',
          result: 'skipped_same_input',
          reason,
          scheduleCount: schedule?.count || 0,
          scheduleReasons: schedule?.reasons || [],
          cancelledFrameCount: schedule?.cancelledFrameCount || 0,
          scheduleDelayMs: schedule?.delayMs,
          inputFingerprint,
          sameInputAsPrevious,
          annotationSignature,
          pageInfoKey,
          paginationLayoutKey: layoutKey,
          readerStateStatus: readerStateStatusRef.current,
          readerFontSize: readerSettingsSnapshot?.fontSize,
          readerContentWidth: readerSettingsSnapshot?.contentWidth,
          elapsedMs: rendererPerformanceElapsedMs(startedAt),
          articleId: article.id,
          sectionIndex,
          pageIndex: currentPageInfo?.pageIndex,
          pageCount: currentPageInfo?.pageCount,
          chapterId: chapter?.id,
          annotationCount: visibleAnnotations.length,
          skippedChapterCount,
          anchorLookupCount: searchableAnnotations.length,
          resolvedAnchorCount: previousMetrics.resolvedAnchorCount,
          rangeCount: previousMetrics.rangeCount,
          boxCount: previousMetrics.boxCount,
          domTextIndexBuildCount: 0,
          domTextIndexBuildMs: 0,
          domTextIndexTextChars: 0,
          chapterTextChars:
            chapter?.textEnd !== undefined ? chapter.textEnd - chapter.textStart : undefined,
        });
        return;
      }
      lastEbookBoxInputFingerprintRef.current = inputFingerprint;
      let resolvedAnchorCount = 0;
      let rangeCount = 0;
      let anchorLookupCount = 0;
      const domTextIndexTiming: DomTextIndexTiming = {
        buildCount: 0,
        buildMs: 0,
        textChars: 0,
      };
      const anchorResolver =
        searchableAnnotations.length > 0
          ? createEbookAnchorResolver(doc, domTextIndexTiming)
          : null;
      const nextBoxes = searchableAnnotations.flatMap((annotation) => {
        anchorLookupCount += 1;
        const range = anchorResolver?.rangeForAnchor(annotation.anchor) ?? null;
        if (!range) return [];
        resolvedAnchorCount += 1;
        rangeCount += 1;
        return foliateRangeHighlightBoxes(range, canvasRect, annotation.id).map((box) =>
          Object.assign(box, {
            annotationId: annotation.id,
            contributorId:
              annotation.agentId ||
              annotation.agentUsername ||
              annotation.userId ||
              annotation.userUsername ||
              annotation.author,
            color: annotationColor(annotation, userProfile, annotationAgents),
          }),
        );
      });
      lastEbookBoxMetricsRef.current = {
        boxCount: nextBoxes.length,
        rangeCount,
        resolvedAnchorCount,
      };
      setBoxes(nextBoxes);
      setEbookBoxLayerHidden(false);
      debugEbookLayout('boxes-update', {
        boxCount: nextBoxes.length,
        canvas: {
          height: Math.round(canvasRect.height),
          left: Math.round(canvasRect.left),
          width: Math.round(canvasRect.width),
        },
        firstBox: nextBoxes[0]
          ? {
              height: Math.round(nextBoxes[0].height),
              left: Math.round(nextBoxes[0].left),
              top: Math.round(nextBoxes[0].top),
              width: Math.round(nextBoxes[0].width),
            }
          : null,
        frame: firstFrameRect
          ? {
              height: Math.round(firstFrameRect.height),
              left: Math.round(firstFrameRect.left),
              width: Math.round(firstFrameRect.width),
            }
          : null,
        pageInfoKey,
        reason,
      });
      recordEbookPageTurnTrace(pageTurnTrace, 'boxes_update_done', {
        anchorLookupCount,
        boxCount: nextBoxes.length,
        pageIndex: currentPageInfo?.pageIndex,
        reason,
        resolvedAnchorCount,
        sectionIndex,
      });
      finishPageTurnTrace();
      recordRendererPerformanceTiming('reader_highlight_boxes', {
        source: 'ebook-foliate',
        result: 'updated',
        reason,
        scheduleCount: schedule?.count || 0,
        scheduleReasons: schedule?.reasons || [],
        cancelledFrameCount: schedule?.cancelledFrameCount || 0,
        scheduleDelayMs: schedule?.delayMs,
        inputFingerprint,
        sameInputAsPrevious,
        annotationSignature,
        pageInfoKey,
        paginationLayoutKey: layoutKey,
        readerStateStatus: readerStateStatusRef.current,
        readerFontSize: readerSettingsSnapshot?.fontSize,
        readerContentWidth: readerSettingsSnapshot?.contentWidth,
        elapsedMs: rendererPerformanceElapsedMs(startedAt),
        articleId: article.id,
        sectionIndex,
        pageIndex: currentPageInfo?.pageIndex,
        pageCount: currentPageInfo?.pageCount,
        chapterId: chapter?.id,
        annotationCount: visibleAnnotations.length,
        skippedChapterCount,
        anchorLookupCount,
        resolvedAnchorCount,
        rangeCount,
        boxCount: nextBoxes.length,
        domTextIndexBuildCount: domTextIndexTiming.buildCount,
        domTextIndexBuildMs: Number(domTextIndexTiming.buildMs.toFixed(2)),
        domTextIndexTextChars: domTextIndexTiming.textChars,
        chapterTextChars:
          chapter?.textEnd !== undefined ? chapter.textEnd - chapter.textStart : undefined,
      });
    },
    [
      annotationAgents,
      annotationsRef,
      article,
      canvasRef,
      pageInfoSectionIndexRef,
      pageTurnTraceRef,
      paginationLayoutKeyRef,
      readerSettingsRef,
      readerStateStatusRef,
      setEbookBoxLayerHidden,
      userProfile,
      viewRef,
    ],
  );

  const scheduleEbookBoxUpdate = useCallback(
    (reason: EbookBoxUpdateReason) => {
      const schedule = ebookBoxScheduleRef.current;
      schedule.count += 1;
      schedule.reasons.push(reason);
      if (schedule.firstScheduledAt === 0) schedule.firstScheduledAt = performance.now();
      if (updateBoxesFrameRef.current) {
        schedule.cancelledFrameCount += 1;
        window.cancelAnimationFrame(updateBoxesFrameRef.current);
      }
      updateBoxesFrameRef.current = window.requestAnimationFrame(() => {
        const snapshot: EbookBoxScheduleSnapshot = {
          count: schedule.count,
          cancelledFrameCount: schedule.cancelledFrameCount,
          reasons: Array.from(new Set(schedule.reasons)),
          delayMs: rendererPerformanceElapsedMs(schedule.firstScheduledAt),
        };
        schedule.count = 0;
        schedule.cancelledFrameCount = 0;
        schedule.reasons = [];
        schedule.firstScheduledAt = 0;
        updateBoxesFrameRef.current = 0;
        updateEbookBoxes(reason, snapshot);
      });
    },
    [updateEbookBoxes],
  );

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let resizeTimer = 0;
    const scheduleCanvasResizeUpdate = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        scheduleEbookBoxUpdate('resize_observer');
      }, 80);
    };

    window.addEventListener('resize', scheduleCanvasResizeUpdate);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleCanvasResizeUpdate);
    observer?.observe(canvas);
    return () => {
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', scheduleCanvasResizeUpdate);
      observer?.disconnect();
    };
  }, [article.id, canvasRef, scheduleEbookBoxUpdate]);

  const cleanupFoliateDocumentListeners = useCallback(() => {
    for (const cleanup of foliateDocCleanupsRef.current) cleanup();
    foliateDocCleanupsRef.current = [];
    observedFoliateDocsRef.current = new WeakSet<Document>();
  }, []);

  const attachFoliateDocumentListeners = useCallback((view: FoliateViewElement | null) => {
    const doc = currentFoliateContent(view)?.doc;
    if (!doc || observedFoliateDocsRef.current.has(doc)) return;
    observedFoliateDocsRef.current.add(doc);

    const handleSelection = () => {
      window.setTimeout(() => {
        const selection = doc.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
        handleFoliateSelectionRef.current(doc);
      }, 0);
    };
    const handlePointerDown = () => handleFoliatePointerDownRef.current();
    const handleKeyDown = (event: KeyboardEvent) => {
      handleFoliateSelectionShortcutRef.current(event);
      const direction = readerPageTurnDirectionFromKeyboardEvent(event);
      if (!direction) return;
      event.preventDefault();
      handleFoliatePageTurnKeyRef.current(direction);
    };

    doc.addEventListener('mouseup', handleSelection);
    doc.addEventListener('keyup', handleSelection);
    doc.addEventListener('keydown', handleKeyDown);
    doc.addEventListener('pointerdown', handlePointerDown, true);
    foliateDocCleanupsRef.current.push(() => {
      doc.removeEventListener('mouseup', handleSelection);
      doc.removeEventListener('keyup', handleSelection);
      doc.removeEventListener('keydown', handleKeyDown);
      doc.removeEventListener('pointerdown', handlePointerDown, true);
    });
  }, []);

  useLayoutEffect(() => {
    updateEbookBoxes('layout_effect');
  }, [readerStateStatus, updateEbookBoxes]);

  useEffect(
    () => () => {
      cleanupFoliateDocumentListeners();
      if (updateBoxesFrameRef.current) window.cancelAnimationFrame(updateBoxesFrameRef.current);
    },
    [cleanupFoliateDocumentListeners],
  );

  return {
    boxes,
    attachFoliateDocumentListeners,
    cleanupFoliateDocumentListeners,
    hideEbookBoxLayer,
    resetEbookBoxState,
    scheduleEbookBoxUpdate,
  };
}
