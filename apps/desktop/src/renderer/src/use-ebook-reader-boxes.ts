import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import { hashText } from '@yomitomo/shared';
import { annotationColor, type HighlightBox } from '@yomitomo/core';
import type { ReaderSettings } from '@yomitomo/reader-ui';
import {
  currentFoliateContent,
  ebookChapterForFoliateSection,
  ebookHighlightAnnotationsSignature,
  foliateRangeHighlightBoxes,
  rangeForEbookAnchorInDocument,
  type DomTextIndexTiming,
  type EbookBoxScheduleSnapshot,
  type EbookBoxScheduleState,
  type EbookBoxUpdateReason,
  type FoliateViewElement,
} from './app-ebook-reader-utils';
import {
  rendererPerformanceElapsedMs,
  recordRendererPerformanceTiming,
  type EbookBookcaseProps,
} from './app-source-bookcase-shared';

type UseEbookReaderBoxesInput = {
  annotationAgents: PublicAgent[];
  annotationsRef: RefObject<Annotation[]>;
  article: EbookBookcaseProps['article'];
  canvasRef: RefObject<HTMLDivElement | null>;
  viewRef: RefObject<FoliateViewElement | null>;
  pageInfoSectionIndexRef: RefObject<number | undefined>;
  paginationLayoutKeyRef: RefObject<string>;
  readerSettingsRef: RefObject<ReaderSettings>;
  readerStateStatus: 'loading' | 'ready' | 'error';
  readerStateStatusRef: RefObject<'loading' | 'ready' | 'error'>;
  userProfile: UserProfile;
  onFoliatePointerDown: () => void;
  onFoliateSelection: (doc: Document) => void;
  onFoliateSelectionShortcut: (event: KeyboardEvent) => void;
};

export function useEbookReaderBoxes({
  annotationAgents,
  annotationsRef,
  article,
  canvasRef,
  viewRef,
  pageInfoSectionIndexRef,
  paginationLayoutKeyRef,
  readerSettingsRef,
  readerStateStatus,
  readerStateStatusRef,
  userProfile,
  onFoliatePointerDown,
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
  const handleFoliatePointerDownRef = useRef(onFoliatePointerDown);
  const handleFoliateSelectionShortcutRef = useRef(onFoliateSelectionShortcut);

  handleFoliateSelectionRef.current = onFoliateSelection;
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
    setBoxes([]);
  }, []);

  const updateEbookBoxes = useCallback(
    (reason: EbookBoxUpdateReason, schedule?: EbookBoxScheduleSnapshot) => {
      const view = viewRef.current;
      const canvasElement = canvasRef.current;
      const content = currentFoliateContent(view);
      const doc = content?.doc;
      if (!article.ebook || !view || !canvasElement || !doc) {
        setBoxes([]);
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
      let skippedChapterCount = 0;
      const searchableAnnotations = visibleAnnotations.filter((annotation) => {
        if (chapter && annotation.anchor.chapterId && annotation.anchor.chapterId !== chapter.id) {
          skippedChapterCount += 1;
          return false;
        }
        return true;
      });
      if (sameInputAsPrevious) {
        const previousMetrics = lastEbookBoxMetricsRef.current;
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
      const nextBoxes = searchableAnnotations.flatMap((annotation) => {
        anchorLookupCount += 1;
        const range = rangeForEbookAnchorInDocument(doc, annotation.anchor, domTextIndexTiming);
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
      paginationLayoutKeyRef,
      readerSettingsRef,
      readerStateStatusRef,
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
    const handleShortcut = (event: KeyboardEvent) =>
      handleFoliateSelectionShortcutRef.current(event);

    doc.addEventListener('mouseup', handleSelection);
    doc.addEventListener('keyup', handleSelection);
    doc.addEventListener('keydown', handleShortcut);
    doc.addEventListener('pointerdown', handlePointerDown, true);
    foliateDocCleanupsRef.current.push(() => {
      doc.removeEventListener('mouseup', handleSelection);
      doc.removeEventListener('keyup', handleSelection);
      doc.removeEventListener('keydown', handleShortcut);
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
    resetEbookBoxState,
    scheduleEbookBoxUpdate,
  };
}
