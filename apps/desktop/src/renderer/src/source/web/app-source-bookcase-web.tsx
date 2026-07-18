import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Annotation, ArticleReadingProgress, ReaderQuestionContext } from '@yomitomo/shared';
import { createTextAnchor, resolveTextAnchor } from '@yomitomo/shared';
import {
  annotationIdsAtHighlightPoint,
  createTranslationTextAnchor,
  createEpubTextAnchor,
  findCurrentTocTarget,
  getArticleSelection,
  type HighlightBox,
  isRangeInsideArticle,
  offsetFromArticleStartIgnoringSelector,
  rangeHighlightBoxes,
  rangeForTranslationTextAnchor,
  rangeFromOffsets,
  rangeFromOffsetsIgnoringSelector,
  selectionActionPosition,
  scrollReaderSurfaceToRect,
  createUserAnnotation,
  sourceTextContent,
  textForTranslationAnchor,
  translationElementForRange,
  type TocItem,
} from '@yomitomo/core';
import {
  ReaderAppView,
  type AnnotationNavigationDirection,
  type SelectionAdjustmentHandle,
  type SelectionAdjustmentPointer,
} from '@yomitomo/reader-ui/reader-app-view';
import { ReaderSettingsToolbarControls } from '@yomitomo/reader-ui/reader-toolbar-controls';
import { readerDesktopEmbeddedBundleStyles } from '@yomitomo/reader-ui/reader-styles';
import {
  buildTocAnnotationStats,
  readerAnnotationScrollTop,
} from '@yomitomo/reader-ui/reader-annotations';
import { useAgentAnnotationQueue } from '@yomitomo/reader-ui/use-agent-annotation-queue';
import { OpenArticleButton } from '../../shell/app-ui';
import { articleIdentityLine } from '../../shell/app-utils';
import { appToast } from '../../shell/app-toast';
import { recordRendererPerformanceTiming } from '../../shell/app-renderer-performance';
import type { WebSourceBookcaseProps } from '../bookcase/app-source-bookcase';
import { isContinuousTextSelectionMouseEvent } from '../bookcase/source-reader-selection-events';
import { useSourceActiveConnection } from '../bookcase/use-source-active-connection';
import { useRecentAnnotationFeedback } from '../bookcase/use-recent-annotation-feedback';
import { sourceTocOptions, useWebReaderBoxes } from './use-web-reader-boxes';
import {
  articleLinkExternalUrl,
  sourceArticleBodyHtml,
  sourceReaderTocStyles,
  webAnnotationNavigationState,
} from './app-source-bookcase-web-utils';
import {
  describeAnchorForDebug,
  describeHighlightBoxesForDebug,
  describePointerForDebug,
  describeRangeForDebug,
  describeReaderSelection,
  describeSelectionNode,
  logReaderSelectionDebug,
  readerSelectionDebugEnabled,
  shouldLogSelectionDebug,
} from './web-reader-selection-debug';
import {
  shouldUseWebSelectionGesturePreview,
  shouldUseWebSelectionGestureRange,
  webSelectionGesturePointFromClientPoint,
  webSelectionGestureRangeFromClientPoint,
  webTranslationSelectionGesturePointFromClientPoint,
  type WebSelectionGestureRange,
  type WebSelectionGesturePoint,
} from './web-reader-selection-gesture';
import { useSourceReaderSession } from '../bookcase/use-source-reader-session';
import { createWebSourceReaderController } from './app-source-bookcase-web-controller';
import { useSourceReaderWorkspace } from '../bookcase/use-source-reader-workspace';
import { buildSourceReaderAppActions } from '../bookcase/source-reader-app-actions';
import { buildSourceReaderAppViewProps } from '../bookcase/source-reader-app-view-props';
import { useReaderSearchNavigation } from '../bookcase/use-reader-search-navigation';
import { useSourceReadingProgressSaver } from '../bookcase/use-source-reading-progress-saver';
import {
  annotationRailDebugBoxGroups,
  annotationRailDebugNumber,
  annotationRailDebugRect,
  annotationRailDebugStyleNumber,
  webAnnotationRailDebugEnabled,
  WEB_ANNOTATION_RAIL_DEBUG_INTERVAL_MS,
  WEB_ANNOTATION_RAIL_DEBUG_OVERSCAN,
  WEB_ANNOTATION_RAIL_DEBUG_SAMPLE_LIMIT,
} from './web-annotation-rail-debug';
import {
  canAdjustWebSelectionAnchor,
  webSelectionAdjustmentKind,
  type WebSelectionAdjustment,
} from './web-selection-adjustment';
import { createWebReadingProgressFrame } from './web-reading-progress-frame';
import {
  describeSelectionAdjustmentPoint,
  selectionAdjustmentAdjustedOffsets,
  selectionAdjustmentDraggingHandle,
} from '../bookcase/selection-adjustment';
import { useWebBilingualTranslation } from './use-web-bilingual-translation';

const WEB_SELECTION_DRAG_ANNOTATION_ID = '__selection_drag__';
const WEB_HIGHLIGHT_HIT_PADDING = 8;
const WEB_READING_PROGRESS_SAVE_DEBOUNCE_MS = 450;
const WEB_READING_PROGRESS_SAVE_MIN_DELTA = 0.01;

type ReaderRailViewport = {
  height: number;
  top: number;
};

export function WebSourceBookcase({
  agents,
  annotations: articleAnnotations,
  article,
  distillationAnimation,
  focusAnnotationId,
  messageSendShortcut,
  settings,
  selectionActionShortcuts,
  selectedAnnotationId,
  uiLanguage,
  userProfile,
  onArticleChange,
  onFocusedAnnotation,
  onClose,
  onDeleteArticleAnnotation,
  onDeleteArticleComment,
  onOpenAnnotationDiscussion,
  onOpenAnnotation,
  onMergeArticleAgentAnnotation,
  onSaveArticleAnnotation,
  onSaveArticleComment,
  onSaveArticleReadingProgress,
  onSaveArticleReaderChatState,
}: WebSourceBookcaseProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const articleSelectionGestureRef = useRef<WebSelectionGesturePoint | null>(null);
  const articleSelectionGestureDragPointRef = useRef<WebSelectionGestureClientPoint | null>(null);
  const articleSelectionAdjustmentRef = useRef<WebSelectionAdjustment | null>(null);
  const suppressArticleSelectionMouseUpRef = useRef(false);
  const restoredWebProgressArticleRef = useRef<string | null>(null);
  const noteRefs = useRef(new Map<string, HTMLElement>());
  const { markAnnotationCreated, newAnnotationIds } = useRecentAnnotationFeedback(
    article.id,
    settings,
  );
  const [statusMessage, setStatusMessage] = useState('');
  const [readingProgress, setReadingProgress] = useState(
    () => normalizeSavedWebProgress(article.readingProgress) ?? 0,
  );
  const shouldSaveWebProgress = useCallback(
    (nextProgress: ArticleReadingProgress, lastSavedProgress: ArticleReadingProgress | null) =>
      !lastSavedProgress ||
      Math.abs(nextProgress.progress - lastSavedProgress.progress) >=
        WEB_READING_PROGRESS_SAVE_MIN_DELTA,
    [],
  );
  const { saveNow: saveWebProgressNow, scheduleSave: scheduleWebProgressSave } =
    useSourceReadingProgressSaver({
      articleId: article.id,
      debounceMs: WEB_READING_PROGRESS_SAVE_DEBOUNCE_MS,
      initialProgress: article.readingProgress,
      onSaveArticleReadingProgress,
      shouldSave: shouldSaveWebProgress,
    });
  const [annotationRailViewport, setAnnotationRailViewport] = useState<ReaderRailViewport>({
    height: 0,
    top: 0,
  });
  const [activeTocIndex, setActiveTocIndex] = useState<number | null>(null);
  const sourceReaderSession = useSourceReaderSession({
    agents,
    annotations: articleAnnotations,
    article,
    onArticleChange,
    clearPendingOnArticleChange: true,
    clearPendingOnDeleteAnnotation: true,
    uiLanguage,
    onBeforeDeleteAnnotation: (annotationId) => {
      noteRefs.current.delete(annotationId);
    },
    getArticleText: currentArticleText,
    onOpenAnnotation: openAnnotation,
    onDeleteArticleAnnotation,
    onDeleteArticleComment,
    onSaveArticleAnnotation,
    onSaveArticleComment,
    setStatusMessage,
    userProfile,
  });
  const {
    addComment,
    annotations,
    annotationsRef,
    annotationAgents,
    deleteAnnotation,
    deleteComment,
    saveAnnotation,
  } = sourceReaderSession;
  const [tocOpen, setTocOpen] = useState(false);
  const [, setSettingsOpen] = useState(false);
  const [articleSearchText, setArticleSearchText] = useState('');
  const [searchBoxes, setSearchBoxes] = useState<HighlightBox[]>([]);
  const clearSearchBoxes = useCallback(() => setSearchBoxes([]), []);
  const onFocusedAnnotationRef = useRef(onFocusedAnnotation);
  const webFocusBoxCountRef = useRef(0);
  const annotationRailDebugLastLogRef = useRef(0);
  const scrollToAnnotationRef = useRef<(annotationId: string) => boolean>(() => false);
  const contentHtml = useMemo(() => (article ? sourceArticleBodyHtml(article) : ''), [article]);
  const bilingualTranslation = useWebBilingualTranslation({
    annotations,
    article,
    articleRef,
    contentHtml,
    deleteAnnotation,
    scrollRef,
    style: settings?.bilingualTranslationStyle || 'dashedLine',
    targetLanguage: settings?.bilingualTranslationTargetLanguage,
  });
  const translatedContentHtml = bilingualTranslation.renderedHtml;
  const translationSelectionDisabled = bilingualTranslation.selection.isDisabled;
  const searchNavigation = useReaderSearchNavigation(articleSearchText, {
    onClose: clearSearchBoxes,
  });
  const { boxes, tocItems } = useWebReaderBoxes({
    annotationAgents,
    annotations,
    article,
    articleRef,
    canvasRef,
    contentHtml: translatedContentHtml,
    userProfile,
  });
  useEffect(() => {
    onFocusedAnnotationRef.current = onFocusedAnnotation;
  }, [onFocusedAnnotation]);
  useEffect(() => {
    webFocusBoxCountRef.current = boxes.length;
  }, [boxes.length]);
  const { activeConnection, recalculateActiveConnection } = useSourceActiveConnection({
    annotationAgents,
    annotations,
    boxes,
    canvasRef,
    noteRefs,
    selectedAnnotationId,
    surfaceRef: scrollRef,
    userProfile,
  });
  const tocStats = useMemo(
    () => buildTocAnnotationStats(tocItems, annotations, userProfile, annotationAgents),
    [annotationAgents, annotations, tocItems, userProfile],
  );

  useEffect(() => {
    const scrollElement = scrollRef.current;
    const articleElement = articleRef.current;
    if (!scrollElement || !articleElement || tocItems.length === 0) {
      setActiveTocIndex(null);
      return;
    }

    let frame = 0;
    const updateActiveTocIndex = () => {
      frame = 0;
      const nextIndex = webActiveTocIndex(articleElement, scrollElement, tocItems);
      setActiveTocIndex((current) => (current === nextIndex ? current : nextIndex));
    };
    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActiveTocIndex);
    };

    scheduleUpdate();
    scrollElement.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    return () => {
      scrollElement.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [tocItems, translatedContentHtml]);

  const {
    agentDockCompleting,
    agentDockItems,
    agentTheaterBoxes,
    annotatingAgents: annotatingAgentIds,
    completionBurstKey,
    virtualCursors,
    cleanupVirtualReadingSessions,
    enqueueAgentAnnotation,
    finishVirtualReading,
    finishVirtualReadingIfIdle,
    markAgentAnnotating,
    markVirtualReadingDone,
    processAgentAnnotationQueue,
    startVirtualReading,
  } = useAgentAnnotationQueue({
    agents: annotationAgents,
    articleRef,
    canvasRef,
    surfaceRef: scrollRef,
    articleBodySelector: '.reader-article-body',
    annotationsRef,
    saveAnnotation,
    setActiveId: openAnnotation,
    readerLog: () => {},
  });
  useEffect(() => cleanupVirtualReadingSessions, []);

  const sourceReaderWorkspace = useSourceReaderWorkspace({
    article,
    canvasRef,
    getArticleText: currentArticleText,
    messageSendShortcut,
    selectionActionShortcuts,
    session: sourceReaderSession,
    uiLanguage,
    onSaveArticleReaderChatState,
  });
  const { labels, readerChat, readerSettings, selection, updateReaderSettings } =
    sourceReaderWorkspace;
  const {
    temporaryBoxes,
    setTemporaryBoxes,
    selectionAction,
    setSelectionAction,
    setHighlightChoice,
    composer,
    clearSelection,
    clearAnnotationUiState,
    openSelectionAction,
    cancelComposer,
    copySelection,
    openComposer,
  } = selection;
  const selectionDebugContextRef = useRef<Record<string, unknown>>({});

  useEffect(() => {
    sourceReaderSession.registerAgentAnnotationAdapter(
      createWebSourceReaderController({
        applyAnnotations: sourceReaderSession.applyAnnotations,
        currentArticleText,
        enqueueAgentAnnotation,
        finishVirtualReading,
        finishVirtualReadingIfIdle,
        getAnnotations: () => sourceReaderSession.annotationsRef.current,
        isAgentAnnotating: (agentId) => annotatingAgentIds.includes(agentId),
        isCurrentArticle,
        markAgentAnnotating,
        markVirtualReadingDone,
        onOpenAnnotation: openAnnotation,
        onMergeArticleAgentAnnotation,
        processAgentAnnotationQueue,
        setStatusMessage,
        startVirtualReading,
      }),
    );
  });

  useEffect(() => {
    clearAnnotationUiState();
  }, [article?.id, annotations, clearAnnotationUiState]);

  useEffect(() => {
    setTocOpen(false);
    setSettingsOpen(false);
    setStatusMessage('');
    searchNavigation.resetSearch();
    setArticleSearchText('');
    articleSelectionGestureRef.current = null;
    articleSelectionGestureDragPointRef.current = null;
    suppressArticleSelectionMouseUpRef.current = false;
    setReadingProgress(normalizeSavedWebProgress(article.readingProgress) ?? 0);
    restoredWebProgressArticleRef.current = null;
  }, [article?.id, searchNavigation.resetSearch]);

  useEffect(() => {
    if (!searchNavigation.open) {
      setArticleSearchText('');
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setArticleSearchText(articleRef.current ? sourceTextContent(articleRef.current) : '');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [article.id, searchNavigation.open, translatedContentHtml]);

  useEffect(() => {
    if (searchNavigation.preparing || !searchNavigation.open || !searchNavigation.activeMatch) {
      setSearchBoxes([]);
      return;
    }
    const articleElement = articleRef.current;
    const canvasElement = canvasRef.current;
    const scrollElement = scrollRef.current;
    if (!articleElement || !canvasElement || !scrollElement) return;

    const range = rangeFromOffsetsIgnoringSelector(
      articleElement,
      searchNavigation.activeMatch.start,
      searchNavigation.activeMatch.end,
      '[data-reader-translation]',
    );
    if (!range) {
      setSearchBoxes([]);
      return;
    }

    const rect = range.getClientRects()[0];
    if (rect) scrollReaderSurfaceToRect(scrollElement, rect, 82);
    const canvasRect = canvasElement.getBoundingClientRect();
    setSearchBoxes(
      rangeHighlightBoxes(range, canvasRect, searchNavigation.activeMatch.id).map((box) =>
        Object.assign(box, {
          annotationId: '__search__',
          contributorId: '__search__',
          color: 'var(--reader-search-highlight-active)',
        }),
      ),
    );
  }, [searchNavigation.activeMatch, searchNavigation.open, searchNavigation.preparing]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || restoredWebProgressArticleRef.current === article.id) return;
    const savedProgress = normalizeSavedWebProgress(article.readingProgress);
    if (savedProgress === null || savedProgress <= 0) {
      restoredWebProgressArticleRef.current = article.id;
      return;
    }

    let cancelled = false;
    const restore = () => {
      if (cancelled) return;
      const maxScrollTop = webReaderMaxScrollTop(scrollElement);
      if (maxScrollTop > 0) scrollElement.scrollTo({ top: maxScrollTop * savedProgress });
      setReadingProgress(savedProgress);
      restoredWebProgressArticleRef.current = article.id;
    };
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(restore);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [article.id, article.readingProgress]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const progressFrame = createWebReadingProgressFrame(setReadingProgress);
    const scheduleProgressUpdate = () => {
      const progress = webReaderProgress(scrollElement);
      progressFrame.schedule(progress);
      return progress;
    };
    const scheduleSave = () => {
      const progress = scheduleProgressUpdate();
      scheduleWebProgressSave(webReadingProgressSnapshot(progress));
    };

    let initialFrame: number | null = null;
    initialFrame = window.requestAnimationFrame(() => {
      initialFrame = window.requestAnimationFrame(() => {
        initialFrame = null;
        const progress = webReaderProgress(scrollElement);
        setReadingProgress(progress);
        if (webReaderMaxScrollTop(scrollElement) <= 0)
          void saveWebProgressNow(webReadingProgressSnapshot(progress));
      });
    });
    scrollElement.addEventListener('scroll', scheduleSave, { passive: true });
    return () => {
      scrollElement.removeEventListener('scroll', scheduleSave);
      if (initialFrame !== null) window.cancelAnimationFrame(initialFrame);
      progressFrame.cancel();
    };
  }, [article.id, saveWebProgressNow, scheduleWebProgressSave]);

  useLayoutEffect(() => {
    const scrollElement = scrollRef.current;
    const canvasElement = canvasRef.current;
    if (!scrollElement || !canvasElement) {
      setAnnotationRailViewport((current) =>
        current.height === 0 && current.top === 0 ? current : { height: 0, top: 0 },
      );
      return;
    }

    let frame = 0;
    const updateViewport = () => {
      frame = 0;
      const top = Math.max(0, Math.round(scrollElement.scrollTop - canvasElement.offsetTop));
      const height = Math.max(0, Math.round(scrollElement.clientHeight));
      setAnnotationRailViewport((current) =>
        current.height === height && current.top === top ? current : { height, top },
      );
    };
    const scheduleUpdate = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateViewport);
    };
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleUpdate);

    updateViewport();
    scrollElement.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    resizeObserver?.observe(scrollElement);
    resizeObserver?.observe(canvasElement);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      scrollElement.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      resizeObserver?.disconnect();
    };
  }, [article.id]);

  useLayoutEffect(() => {
    if (!webAnnotationRailDebugEnabled()) return;
    const now = performance.now();
    if (now - annotationRailDebugLastLogRef.current < WEB_ANNOTATION_RAIL_DEBUG_INTERVAL_MS) return;

    const frame = window.requestAnimationFrame(() => {
      const scrollElement = scrollRef.current;
      const canvasElement = canvasRef.current;
      const railElement = railRef.current;
      if (!scrollElement || !canvasElement || !railElement) return;

      annotationRailDebugLastLogRef.current = performance.now();
      const canvasRect = canvasElement.getBoundingClientRect();
      const scrollRect = scrollElement.getBoundingClientRect();
      const railRect = railElement.getBoundingClientRect();
      const viewportTop = annotationRailViewport.top;
      const viewportBottom = viewportTop + annotationRailViewport.height;
      const boxGroups = annotationRailDebugBoxGroups(boxes);
      const noteElements = Array.from(
        railElement.querySelectorAll<HTMLElement>('.reader-note[data-annotation-id]'),
      );
      const notes = noteElements
        .map((note) => {
          const annotationId = note.dataset.annotationId || '';
          const rect = note.getBoundingClientRect();
          const computed = window.getComputedStyle(note);
          const inlineTop = annotationRailDebugStyleNumber(note.style.top || computed.top);
          const actualTop = rect.top - canvasRect.top;
          const actualBottom = rect.bottom - canvasRect.top;
          const anchor = boxGroups.get(annotationId) ?? null;
          return {
            actualBottom: annotationRailDebugNumber(actualBottom),
            actualTop: annotationRailDebugNumber(actualTop),
            actualViewportTop: annotationRailDebugNumber(rect.top - scrollRect.top),
            anchorBottom: annotationRailDebugNumber(anchor?.bottom),
            anchorNearViewport: anchor
              ? anchor.top <= viewportBottom + WEB_ANNOTATION_RAIL_DEBUG_OVERSCAN &&
                anchor.bottom >= viewportTop - WEB_ANNOTATION_RAIL_DEBUG_OVERSCAN
              : null,
            anchorTop: annotationRailDebugNumber(anchor?.top),
            anchorVisible: anchor
              ? anchor.top <= viewportBottom && anchor.bottom >= viewportTop
              : null,
            classes: note.className,
            id: annotationId,
            inlineTop,
            railSide: note.dataset.railSide ?? null,
            stackCount: note.dataset.stackCount ?? null,
            stackIndex: note.dataset.stackIndex ?? null,
            transform: computed.transform === 'none' ? 'none' : computed.transform,
          };
        })
        .toSorted((left, right) => (left.actualTop ?? 0) - (right.actualTop ?? 0))
        .slice(0, WEB_ANNOTATION_RAIL_DEBUG_SAMPLE_LIMIT);

      recordRendererPerformanceTiming('reader_annotation_rail_layout', {
        articleId: article.id,
        canvasOffsetTop: annotationRailDebugNumber(canvasElement.offsetTop),
        canvasRect: annotationRailDebugRect(canvasRect),
        noteCount: noteElements.length,
        railRect: annotationRailDebugRect(railRect),
        scroll: {
          clientHeight: annotationRailDebugNumber(scrollElement.clientHeight),
          scrollHeight: annotationRailDebugNumber(scrollElement.scrollHeight),
          scrollTop: annotationRailDebugNumber(scrollElement.scrollTop),
        },
        selectedAnnotationId,
        viewport: {
          bottom: annotationRailDebugNumber(viewportBottom),
          height: annotationRailDebugNumber(annotationRailViewport.height),
          top: annotationRailDebugNumber(viewportTop),
        },
        visibleAnchorCount: Array.from(boxGroups.values()).filter(
          (group) => group.top <= viewportBottom && group.bottom >= viewportTop,
        ).length,
        notes,
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [annotationRailViewport, article.id, boxes, selectedAnnotationId]);

  const scrollToAnnotation = useCallback(
    (annotationId: string) => {
      const scrollElement = scrollRef.current;
      const canvasElement = canvasRef.current;
      if (!scrollElement || !canvasElement) return false;

      const top = readerAnnotationScrollTop({
        annotationId,
        boxes,
        canvasOffsetTop: canvasElement.offsetTop,
        scrollHeight: scrollElement.scrollHeight,
        viewportHeight: scrollElement.clientHeight,
      });
      if (top === null) return false;

      scrollElement.scrollTo({ top, behavior: 'smooth' });
      return true;
    },
    [boxes],
  );
  useEffect(() => {
    scrollToAnnotationRef.current = scrollToAnnotation;
  }, [scrollToAnnotation]);

  useEffect(() => {
    if (!focusAnnotationId) return;
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const handleWheel = (event: WheelEvent) => {
      recordRendererPerformanceTiming('reader_scroll_input', {
        source: 'web',
        articleId: article.id,
        annotationId: focusAnnotationId,
        deltaY: event.deltaY,
        defaultPrevented: event.defaultPrevented,
        scrollTop: scrollElement.scrollTop,
        scrollHeight: scrollElement.scrollHeight,
        clientHeight: scrollElement.clientHeight,
      });
    };
    scrollElement.addEventListener('wheel', handleWheel, { passive: true });
    return () => scrollElement.removeEventListener('wheel', handleWheel);
  }, [article.id, focusAnnotationId]);

  const resolveAnnotationNavigation = useCallback(
    ({
      activeId,
      annotations: navigationAnnotations,
    }: {
      activeId: string | null;
      annotations: Annotation[];
    }) =>
      webAnnotationNavigationState({
        activeId,
        annotations: navigationAnnotations,
        boxes,
        canvasElement: canvasRef.current,
        scrollElement: scrollRef.current,
      }),
    [boxes],
  );

  const navigateAnnotation = useCallback(
    (annotationId: string, _direction: AnnotationNavigationDirection) => {
      clearAnnotationUiState();
      onOpenAnnotation(annotationId);
      scrollToAnnotation(annotationId);
    },
    [clearAnnotationUiState, onOpenAnnotation, scrollToAnnotation],
  );

  useEffect(() => {
    if (!focusAnnotationId) return;
    const scrollElement = scrollRef.current;
    recordRendererPerformanceTiming('reader_focus', {
      source: 'web',
      phase: 'effect_start',
      articleId: article.id,
      annotationId: focusAnnotationId,
      annotationCount: annotations.length,
      boxCount: boxes.length,
      hasScrollElement: Boolean(scrollElement),
      scrollTop: scrollElement?.scrollTop ?? null,
      scrollHeight: scrollElement?.scrollHeight ?? null,
      clientHeight: scrollElement?.clientHeight ?? null,
    });
    const maxAttemptCount = 30;
    let attemptCount = 0;
    let cancelled = false;
    let frame: number | null = null;
    let timer: number | null = null;

    const completeFocus = (phase: string, delayMs: number) => {
      timer = window.setTimeout(() => {
        if (cancelled) return;
        const currentScrollElement = scrollRef.current;
        recordRendererPerformanceTiming('reader_focus', {
          source: 'web',
          phase,
          articleId: article.id,
          annotationId: focusAnnotationId,
          scrollTop: currentScrollElement?.scrollTop ?? null,
        });
        onFocusedAnnotationRef.current();
      }, delayMs);
    };

    const attemptFocus = () => {
      if (cancelled) return;
      const currentScrollElement = scrollRef.current;
      const currentAnnotations = annotationsRef.current;
      if (!currentAnnotations.some((annotation) => annotation.id === focusAnnotationId)) {
        recordRendererPerformanceTiming('reader_focus', {
          source: 'web',
          phase: 'annotation_missing_consume',
          articleId: article.id,
          annotationId: focusAnnotationId,
          annotationCount: currentAnnotations.length,
          attemptCount,
        });
        onFocusedAnnotationRef.current();
        return;
      }

      const scrolled = scrollToAnnotationRef.current(focusAnnotationId);
      recordRendererPerformanceTiming('reader_focus', {
        source: 'web',
        phase: 'navigation_requested',
        articleId: article.id,
        annotationId: focusAnnotationId,
        scrolled,
        attemptCount,
        scrollTop: currentScrollElement?.scrollTop ?? null,
        boxCount: webFocusBoxCountRef.current,
      });

      if (scrolled) {
        completeFocus('complete_timer', 520);
        return;
      }

      attemptCount += 1;
      if (attemptCount >= maxAttemptCount) {
        recordRendererPerformanceTiming('reader_focus', {
          source: 'web',
          phase: 'navigation_unavailable_consume',
          articleId: article.id,
          annotationId: focusAnnotationId,
          attemptCount,
          boxCount: webFocusBoxCountRef.current,
        });
        completeFocus('unavailable_complete', 0);
        return;
      }

      frame = window.requestAnimationFrame(attemptFocus);
    };

    frame = window.requestAnimationFrame(attemptFocus);
    return () => {
      recordRendererPerformanceTiming('reader_focus', {
        source: 'web',
        phase: 'effect_cleanup',
        articleId: article.id,
        annotationId: focusAnnotationId,
        scrollTop: scrollElement?.scrollTop ?? null,
      });
      cancelled = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [annotationsRef, article.id, focusAnnotationId]);

  function openAnnotation(annotationId: string) {
    clearAnnotationUiState();
    onOpenAnnotation(annotationId);
  }

  function currentArticleText() {
    return articleRef.current ? sourceTextContent(articleRef.current) : '';
  }

  function startArticleSelectionAdjustment(point: SelectionAdjustmentPointer) {
    const anchor = selectionAction?.anchor;
    const kind = anchor ? webSelectionAdjustmentKind(anchor) : null;
    if (!anchor || !kind || !canAdjustWebSelectionAnchor(anchor)) {
      articleSelectionAdjustmentRef.current = null;
      return;
    }

    articleSelectionAdjustmentRef.current =
      kind === 'translation'
        ? {
            kind,
            handle: point.handle,
            startOffset: anchor.start,
            endOffset: anchor.end,
            translationBlockId: anchor.segmentId || '',
          }
        : {
            kind,
            handle: point.handle,
            startOffset: anchor.start,
            endOffset: anchor.end,
          };
    logReaderSelectionDebug('selection-handle:start', {
      ...selectionDebugContext(),
      kind,
      handle: point.handle,
      anchor: describeAnchorForDebug(anchor),
      pointer: describeSelectionAdjustmentPoint(point),
    });
  }

  function updateArticleSelectionAdjustment(point: SelectionAdjustmentPointer) {
    const adjustment = articleSelectionAdjustmentRef.current;
    const articleElement = articleRef.current;
    const canvasElement = canvasRef.current;
    if (!adjustment || adjustment.handle !== point.handle || !articleElement || !canvasElement) {
      return;
    }
    if (adjustment.kind === 'translation') {
      updateTranslationSelectionAdjustment(adjustment, point, canvasElement);
      return;
    }

    const targetPoint = webSelectionGesturePointFromClientPoint(
      articleElement,
      point.clientX,
      point.clientY,
    );
    if (!targetPoint || targetPoint.translationBlockId) return;

    const nextOffsets = selectionAdjustmentAdjustedOffsets(adjustment, targetPoint.sourceOffset);
    if (!nextOffsets) return;

    const range = rangeFromOffsetsIgnoringSelector(
      articleElement,
      nextOffsets.startOffset,
      nextOffsets.endOffset,
      '[data-reader-translation]',
    );
    if (!range || range.collapsed) return;

    const selectedArticleText = currentArticleText();
    const anchor = article.ebook?.index
      ? createEpubTextAnchor(
          article.ebook.index,
          selectedArticleText,
          nextOffsets.startOffset,
          nextOffsets.endOffset,
        )
      : createTextAnchor(selectedArticleText, nextOffsets.startOffset, nextOffsets.endOffset);
    commitSelectionAdjustment({
      anchor,
      canvasElement,
      draggingHandle: selectionAdjustmentDraggingHandle(adjustment, targetPoint.sourceOffset),
      range,
    });
  }

  function updateTranslationSelectionAdjustment(
    adjustment: Extract<WebSelectionAdjustment, { kind: 'translation' }>,
    point: SelectionAdjustmentPointer,
    canvasElement: HTMLElement,
  ) {
    const articleElement = articleRef.current;
    if (!articleElement) return;

    const targetPoint = webTranslationSelectionGesturePointFromClientPoint(
      articleElement,
      adjustment.translationBlockId,
      point.clientX,
      point.clientY,
    );
    if (!targetPoint) return;

    const nextOffsets = selectionAdjustmentAdjustedOffsets(
      adjustment,
      targetPoint.translationOffset,
    );
    if (!nextOffsets) return;

    const range = rangeFromOffsets(
      targetPoint.translationElement,
      nextOffsets.startOffset,
      nextOffsets.endOffset,
    );
    if (!range || range.collapsed) return;

    const anchor = createTranslationTextAnchor(range, targetPoint.translationElement);
    if (!anchor) return;

    commitSelectionAdjustment({
      anchor,
      canvasElement,
      draggingHandle: selectionAdjustmentDraggingHandle(adjustment, targetPoint.translationOffset),
      range,
    });
  }

  function commitSelectionAdjustment({
    anchor,
    canvasElement,
    draggingHandle,
    range,
  }: {
    anchor: Annotation['anchor'];
    canvasElement: HTMLElement;
    draggingHandle: SelectionAdjustmentHandle;
    range: Range;
  }) {
    if (!anchor.exact.trim()) return;

    const rects = range.getClientRects();
    const lastRect = rects[rects.length - 1];
    if (!lastRect) return;

    const canvasRect = canvasElement.getBoundingClientRect();
    const position = selectionActionPosition(lastRect, canvasRect);
    const highlightBoxes = rangeHighlightBoxes(range, canvasRect, 'source-selection').map((box) =>
      Object.assign(box, {
        annotationId: '__selection__',
        contributorId: userProfile.id,
        color: userProfile.annotationColor,
      }),
    );
    setSelectionAction({
      x: position.x,
      y: position.y,
      anchor,
      adjustable: true,
      draggingHandle,
    });
    setTemporaryBoxes(highlightBoxes);
  }

  function finishArticleSelectionAdjustment(point: SelectionAdjustmentPointer) {
    updateArticleSelectionAdjustment(point);
    const adjustment = articleSelectionAdjustmentRef.current;
    articleSelectionAdjustmentRef.current = null;
    logReaderSelectionDebug('selection-handle:end', {
      ...selectionDebugContext(),
      handle: point.handle,
      pointer: describeSelectionAdjustmentPoint(point),
      adjusted: Boolean(adjustment),
    });
    setSelectionAction((action) =>
      action?.draggingHandle ? { ...action, draggingHandle: undefined } : action,
    );
  }

  function isCurrentArticle(articleId: string) {
    return article.id === articleId;
  }

  function selectionDebugContext() {
    return {
      articleId: article.id,
      sourceType: article.sourceType || 'web',
      ...bilingualTranslation.debugContext(),
      composerOpen: Boolean(composer),
      selectionActionOpen: Boolean(selectionAction),
      temporaryBoxCount: temporaryBoxes.length,
    };
  }

  selectionDebugContextRef.current = selectionDebugContext();

  function logCurrentSelectionDebug(event: string, details: Record<string, unknown> = {}) {
    const articleElement = articleRef.current;
    logReaderSelectionDebug(event, {
      ...selectionDebugContext(),
      selection: articleElement
        ? describeReaderSelection(getArticleSelection(articleElement), articleElement)
        : { present: false, articleMounted: false },
      ...details,
    });
  }

  function setArticleSelectionGestureVisible(visible: boolean) {
    const articleElement = articleRef.current;
    articleElement?.classList.toggle('is-web-selection-gesture', visible);
  }

  function removeArticleSelectionGesturePreviewBoxes() {
    setTemporaryBoxes((currentBoxes) => {
      if (!currentBoxes.some((box) => box.annotationId === WEB_SELECTION_DRAG_ANNOTATION_ID)) {
        return currentBoxes;
      }
      return currentBoxes.filter((box) => box.annotationId !== WEB_SELECTION_DRAG_ANNOTATION_ID);
    });
  }

  function clearArticleSelectionGesturePreview() {
    setArticleSelectionGestureVisible(false);
    removeArticleSelectionGesturePreviewBoxes();
  }

  function previewArticleSelectionGesture() {
    const articleElement = articleRef.current;
    const canvasElement = canvasRef.current;
    const selectionGesture = articleSelectionGestureRef.current;
    const dragPoint = articleSelectionGestureDragPointRef.current;
    if (!articleElement || !canvasElement || !selectionGesture || !dragPoint) return;

    const gestureRange = webSelectionGestureRangeFromClientPoint(
      articleElement,
      selectionGesture,
      dragPoint.clientX,
      dragPoint.clientY,
    );
    if (!gestureRange) {
      removeArticleSelectionGesturePreviewBoxes();
      return;
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const previewBoxes = rangeHighlightBoxes(
      gestureRange.range,
      canvasRect,
      'source-selection-drag',
    ).map((box) =>
      Object.assign(box, {
        annotationId: WEB_SELECTION_DRAG_ANNOTATION_ID,
        contributorId: userProfile.id,
        color: userProfile.annotationColor,
      }),
    );
    setTemporaryBoxes(previewBoxes);
  }

  useEffect(() => {
    const ownerDocument = articleRef.current?.ownerDocument || document;
    let frame = 0;
    let previewFrame = 0;

    const debugArticle = { articleId: article.id, sourceType: article.sourceType || 'web' };
    const currentContext = () => selectionDebugContextRef.current;
    const currentOpenState = () => {
      const context = currentContext();
      return {
        composerOpen: context.composerOpen === true,
        selectionActionOpen: context.selectionActionOpen === true,
      };
    };

    const logSelectionState = (event: string, details: Record<string, unknown> = {}) => {
      if (!readerSelectionDebugEnabled()) return;
      const articleElement = articleRef.current;
      if (!articleElement) return;
      const nativeSelection = getArticleSelection(articleElement);
      logReaderSelectionDebug(event, {
        ...currentContext(),
        selection: describeReaderSelection(nativeSelection, articleElement),
        ...details,
      });
    };

    const handleSelectionChange = () => {
      if (!readerSelectionDebugEnabled() || frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const articleElement = articleRef.current;
        if (!articleElement) return;
        const nativeSelection = getArticleSelection(articleElement);
        if (!shouldLogSelectionDebug(nativeSelection, articleElement, currentOpenState())) {
          return;
        }
        logReaderSelectionDebug('selectionchange', {
          ...currentContext(),
          selection: describeReaderSelection(nativeSelection, articleElement),
        });
      });
    };

    const handlePointerEvent = (event: PointerEvent) => {
      const articleElement = articleRef.current;
      const surfaceElement = scrollRef.current;
      if (!articleElement) return;
      const targetNode = event.target instanceof Node ? event.target : null;
      const nativeSelection = getArticleSelection(articleElement);
      const insideReader = Boolean(
        targetNode && (articleElement.contains(targetNode) || surfaceElement?.contains(targetNode)),
      );
      const shouldFlush = event.type === 'pointerup' || event.type === 'pointercancel';
      if (targetNode && articleElement.contains(targetNode)) {
        if (event.type === 'pointerdown') {
          bilingualTranslation.selection.start('pointerdown');
          articleSelectionGestureRef.current = webSelectionGesturePointFromClientPoint(
            articleElement,
            event.clientX,
            event.clientY,
          );
          articleSelectionGestureDragPointRef.current = {
            clientX: event.clientX,
            clientY: event.clientY,
          };
          setArticleSelectionGestureVisible(
            shouldUseWebSelectionGesturePreview(articleSelectionGestureRef.current),
          );
        }
        if (
          event.type === 'pointermove' &&
          articleSelectionGestureRef.current &&
          shouldUseWebSelectionGesturePreview(articleSelectionGestureRef.current) &&
          event.buttons === 1
        ) {
          articleSelectionGestureDragPointRef.current = {
            clientX: event.clientX,
            clientY: event.clientY,
          };
          if (!previewFrame) {
            previewFrame = window.requestAnimationFrame(() => {
              previewFrame = 0;
              previewArticleSelectionGesture();
            });
          }
        }
        if (event.type === 'pointerup') {
          articleSelectionGestureDragPointRef.current = {
            clientX: event.clientX,
            clientY: event.clientY,
          };
        }
        if (event.type === 'pointercancel') {
          articleSelectionGestureRef.current = null;
          articleSelectionGestureDragPointRef.current = null;
          clearArticleSelectionGesturePreview();
        }
        if (shouldFlush) bilingualTranslation.selection.finish(event.type);
      } else if (shouldFlush) {
        bilingualTranslation.selection.finish(`${event.type}-outside-article`);
        clearArticleSelectionGesturePreview();
      } else if (event.type === 'pointerdown') {
        articleSelectionGestureRef.current = null;
        articleSelectionGestureDragPointRef.current = null;
        clearArticleSelectionGesturePreview();
      }
      if (event.type === 'pointermove') return;
      if (!readerSelectionDebugEnabled()) return;
      if (
        !insideReader &&
        !shouldLogSelectionDebug(nativeSelection, articleElement, currentOpenState())
      ) {
        return;
      }

      logReaderSelectionDebug(event.type, {
        ...currentContext(),
        button: event.button,
        buttons: event.buttons,
        pointer: describePointerForDebug(event, articleElement, surfaceElement),
        target: describeSelectionNode(targetNode, articleElement),
        selection: describeReaderSelection(nativeSelection, articleElement),
      });
    };

    const handleWindowBlur = () => bilingualTranslation.selection.finish('window-blur');

    logSelectionState('reader-mounted');
    ownerDocument.addEventListener('selectionchange', handleSelectionChange);
    window.addEventListener('pointerdown', handlePointerEvent, true);
    window.addEventListener('pointermove', handlePointerEvent, true);
    window.addEventListener('pointerup', handlePointerEvent, true);
    window.addEventListener('pointercancel', handlePointerEvent, true);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      ownerDocument.removeEventListener('selectionchange', handleSelectionChange);
      window.removeEventListener('pointerdown', handlePointerEvent, true);
      window.removeEventListener('pointermove', handlePointerEvent, true);
      window.removeEventListener('pointerup', handlePointerEvent, true);
      window.removeEventListener('pointercancel', handlePointerEvent, true);
      window.removeEventListener('blur', handleWindowBlur);
      if (frame) window.cancelAnimationFrame(frame);
      if (previewFrame) window.cancelAnimationFrame(previewFrame);
      setArticleSelectionGestureVisible(false);
      logReaderSelectionDebug('reader-unmounted', debugArticle);
    };
  }, [article.id, article.sourceType]);

  function handleArticleMouseUp(event?: React.MouseEvent<HTMLElement>) {
    clearArticleSelectionGesturePreview();
    const articleElement = articleRef.current;
    const canvasElement = canvasRef.current;
    if (!articleElement || !canvasElement) {
      logCurrentSelectionDebug('mouseup:missing-elements', {
        hasArticle: Boolean(articleElement),
        hasCanvas: Boolean(canvasElement),
      });
      return;
    }

    const articleSelection = getArticleSelection(articleElement);
    logReaderSelectionDebug('mouseup:start', {
      ...selectionDebugContext(),
      target: describeSelectionNode(
        event?.target instanceof Node ? event.target : null,
        articleElement,
      ),
      selection: describeReaderSelection(articleSelection, articleElement),
    });
    const selectionGesture = articleSelectionGestureRef.current;
    articleSelectionGestureRef.current = null;
    articleSelectionGestureDragPointRef.current = null;
    if (suppressArticleSelectionMouseUpRef.current) {
      suppressArticleSelectionMouseUpRef.current = false;
      articleSelection?.removeAllRanges();
      clearSelection();
      logReaderSelectionDebug('mouseup:continuous-click-selection-suppressed', {
        ...selectionDebugContext(),
        selection: describeReaderSelection(articleSelection, articleElement),
      });
      return;
    }
    const gestureRange = event
      ? webSelectionGestureRangeFromClientPoint(
          articleElement,
          selectionGesture,
          event.clientX,
          event.clientY,
        )
      : null;
    const nativeRange =
      articleSelection && articleSelection.rangeCount > 0 && !articleSelection.isCollapsed
        ? articleSelection.getRangeAt(0)
        : null;
    const shouldUseGestureRange =
      nativeRange && selectionGesture && gestureRange
        ? shouldUseWebSelectionGestureRange(
            nativeRange,
            articleElement,
            selectionGesture,
            gestureRange,
          )
        : !nativeRange && Boolean(gestureRange);
    const range = shouldUseGestureRange ? gestureRange?.range || null : nativeRange;

    if (shouldUseGestureRange && gestureRange) {
      logReaderSelectionDebug('mouseup:gesture-range-used', {
        ...selectionDebugContext(),
        reason: nativeRange ? 'native-anchor-mismatch' : 'native-empty',
        nativeRange: nativeRange ? describeRangeForDebug(nativeRange, articleElement) : null,
        gestureRange: describeWebSelectionGestureRangeForDebug(gestureRange),
      });
    }

    if (!range) {
      // Clicks inside the composer bubble up with an empty native selection;
      // while the composer owns the highlight, blank-click clearing is handled
      // by the reader shell pointer capture instead.
      logReaderSelectionDebug('mouseup:empty-selection', {
        ...selectionDebugContext(),
        clearedUiSelection: !composer,
        selection: describeReaderSelection(articleSelection, articleElement),
      });
      if (!composer) clearSelection();
      return;
    }
    if (translationSelectionDisabled) {
      logReaderSelectionDebug('mouseup:translation-selection-disabled', {
        ...selectionDebugContext(),
        selection: describeReaderSelection(articleSelection, articleElement),
      });
      articleSelection?.removeAllRanges();
      clearSelection();
      bilingualTranslation.selection.showDisabledToast();
      return;
    }

    if (!isRangeInsideArticle(range, articleElement)) {
      logReaderSelectionDebug('mouseup:range-outside-article', {
        ...selectionDebugContext(),
        range: describeRangeForDebug(range, articleElement),
      });
      return;
    }
    const translationElement = translationElementForRange(range);
    if (!translationElement && rangeIntersectsIgnoredSelector(range, '[data-reader-translation]')) {
      logReaderSelectionDebug('mouseup:mixed-source-translation', {
        ...selectionDebugContext(),
        range: describeRangeForDebug(range, articleElement),
      });
      articleSelection?.removeAllRanges();
      clearSelection();
      appToast.warning(t('source.mixedSelectionToast'));
      return;
    }
    const anchor = translationElement
      ? createTranslationTextAnchor(range, translationElement)
      : (() => {
          const selectedArticleText = currentArticleText();
          const start = offsetFromArticleStartIgnoringSelector(
            articleElement,
            range.startContainer,
            range.startOffset,
            '[data-reader-translation]',
          );
          const end = offsetFromArticleStartIgnoringSelector(
            articleElement,
            range.endContainer,
            range.endOffset,
            '[data-reader-translation]',
          );
          return article.ebook?.index
            ? createEpubTextAnchor(article.ebook.index, selectedArticleText, start, end)
            : createTextAnchor(selectedArticleText, start, end);
        })();
    if (!anchor) {
      logReaderSelectionDebug('mouseup:anchor-missing', {
        ...selectionDebugContext(),
        range: describeRangeForDebug(range, articleElement),
      });
      return;
    }
    if (!anchor.exact.trim()) {
      logReaderSelectionDebug('mouseup:blank-anchor', {
        ...selectionDebugContext(),
        anchor: describeAnchorForDebug(anchor),
        range: describeRangeForDebug(range, articleElement),
      });
      return;
    }

    const rects = range.getClientRects();
    const lastRect = rects[rects.length - 1];
    if (!lastRect) {
      logReaderSelectionDebug('mouseup:missing-rect', {
        ...selectionDebugContext(),
        anchor: describeAnchorForDebug(anchor),
        range: describeRangeForDebug(range, articleElement),
      });
      return;
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const position = selectionActionPosition(lastRect, canvasRect);
    const highlightBoxes = rangeHighlightBoxes(range, canvasRect, 'source-selection').map((box) =>
      Object.assign(box, {
        annotationId: '__selection__',
        contributorId: userProfile.id,
        color: userProfile.annotationColor,
      }),
    );
    openSelectionAction(
      {
        x: position.x,
        y: position.y,
        anchor,
        adjustable: canAdjustWebSelectionAnchor(anchor),
      },
      highlightBoxes,
    );
    logReaderSelectionDebug('mouseup:selection-action-opened', {
      ...selectionDebugContext(),
      anchor: describeAnchorForDebug(anchor),
      range: describeRangeForDebug(range, articleElement),
      boxes: describeHighlightBoxesForDebug(highlightBoxes),
      position,
      rectCount: rects.length,
    });
    articleSelection?.removeAllRanges();
    logCurrentSelectionDebug('mouseup:native-selection-cleared');
  }

  function handleArticleMouseDown(event: React.MouseEvent<HTMLElement>) {
    const suppressedContinuousClick = suppressArticleContinuousTextSelection(event);
    if (!translationSelectionDisabled || event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(translationSelectionToastIgnoredSelector)) return;
    bilingualTranslation.selection.showDisabledToast();
    if (suppressedContinuousClick) return;
  }

  function suppressArticleContinuousTextSelection(event: React.MouseEvent<HTMLElement>) {
    if (!isContinuousTextSelectionMouseEvent(event)) {
      suppressArticleSelectionMouseUpRef.current = false;
      return false;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(translationSelectionToastIgnoredSelector)) return false;
    event.preventDefault();
    suppressArticleSelectionMouseUpRef.current = true;
    articleSelectionGestureRef.current = null;
    articleSelectionGestureDragPointRef.current = null;
    clearArticleSelectionGesturePreview();

    const articleElement = articleRef.current;
    if (!articleElement) return true;
    getArticleSelection(articleElement)?.removeAllRanges();
    clearSelection();
    logCurrentSelectionDebug('mousedown:continuous-click-selection-suppressed', {
      clickDetail: event.detail,
    });
    return true;
  }

  function handleArticleClick(event: React.MouseEvent<HTMLElement>) {
    const target = event.target instanceof Element ? event.target : null;
    const translationAction = target?.closest<HTMLElement>('[data-reader-translation-action]');
    if (translationAction) {
      event.preventDefault();
      const blockId = translationAction.getAttribute('data-reader-translation-block-id');
      if (blockId) bilingualTranslation.retryBlock(blockId);
      return;
    }

    if (openHighlightAtClientPoint(event.clientX, event.clientY)) {
      event.preventDefault();
      return;
    }

    const anchor = target?.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;

    const url = articleLinkExternalUrl(article, anchor.getAttribute('href'));
    if (!url) return;

    event.preventDefault();
    void window.yomitomoDesktop.openUrl(url);
  }

  function openHighlightAtClientPoint(
    clientX: number,
    clientY: number,
    preferredAnnotationIds: string[] = [],
    fallbackAnnotationId?: string,
  ) {
    const canvasElement = canvasRef.current;
    if (!canvasElement) {
      if (fallbackAnnotationId) openAnnotation(fallbackAnnotationId);
      return Boolean(fallbackAnnotationId);
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const annotationIds =
      preferredAnnotationIds.length > 0
        ? preferredAnnotationIds
        : annotationIdsAtHighlightPoint(
            boxes,
            {
              x: clientX - canvasRect.left,
              y: clientY - canvasRect.top,
            },
            WEB_HIGHLIGHT_HIT_PADDING,
          );
    if (annotationIds.length === 0) {
      if (!fallbackAnnotationId) return false;
      openAnnotation(fallbackAnnotationId);
      return true;
    }

    if (annotationIds.length <= 1) {
      openAnnotation(annotationIds[0]);
      return true;
    }

    const x = clientX - canvasRect.left + 8;
    setHighlightChoice({
      x: Math.max(8, Math.min(Math.max(8, canvasRect.width - 236), x)),
      y: Math.max(8, clientY - canvasRect.top + 8),
      annotationIds,
    });
    return true;
  }

  async function createAnnotation(note: string) {
    if (!composer) return;
    const currentComposer = composer;
    logCurrentSelectionDebug('composer:create-annotation', {
      anchor: describeAnchorForDebug(currentComposer.anchor),
      noteLength: note.length,
    });
    cancelComposer();
    const annotation = createUserAnnotation(currentComposer.anchor, userProfile, note);
    await saveAnnotation(annotation);
    markAnnotationCreated(annotation.id);
    openAnnotation(annotation.id);
  }

  function askSelection(action: { anchor: Annotation['anchor'] }) {
    logCurrentSelectionDebug('selection:ask', {
      anchor: describeAnchorForDebug(action.anchor),
    });
    readerChat.askSelection(readerQuestionContext(action.anchor));
    clearSelection();
  }

  function clearSelectionFromShell() {
    logCurrentSelectionDebug('selection:clear-ui');
    clearSelection();
  }

  function cancelComposerFromShell() {
    logCurrentSelectionDebug('composer:cancel');
    cancelComposer();
  }

  function openComposerFromSelection(action: {
    anchor: Annotation['anchor'];
    x: number;
    y: number;
  }) {
    logCurrentSelectionDebug('selection:open-composer', {
      anchor: describeAnchorForDebug(action.anchor),
      position: { x: action.x, y: action.y },
    });
    openComposer(action);
  }

  function readerQuestionContext(anchor: Annotation['anchor']): ReaderQuestionContext {
    const contextText =
      anchor.segmentId && articleRef.current
        ? textForTranslationAnchor(articleRef.current, anchor)
        : currentArticleText();
    return {
      sourceType: article.sourceType || 'web',
      quote: anchor.exact,
      title: article.title,
      anchor,
      nearbyText: contextText.slice(
        Math.max(0, anchor.start - 500),
        Math.min(contextText.length, anchor.end + 500),
      ),
    };
  }

  function revealReaderChatContext(context: ReaderQuestionContext) {
    const anchor = context.anchor;
    const articleElement = articleRef.current;
    const scrollElement = scrollRef.current;
    if (!anchor || !articleElement || !scrollElement) return;

    const range = anchor.segmentId
      ? rangeForTranslationTextAnchor(articleElement, anchor)
      : (() => {
          const position = resolveTextAnchor(sourceTextContent(articleElement), anchor);
          if (!position) return null;
          return rangeFromOffsetsIgnoringSelector(
            articleElement,
            position.start,
            position.end,
            '[data-reader-translation]',
          );
        })();
    if (!range) return;

    scrollReaderSurfaceToRect(scrollElement, range.getBoundingClientRect(), 48);
  }

  function handleHighlightClick(
    annotationId: string,
    event: React.MouseEvent<HTMLButtonElement>,
    visibleAnnotationIds: string[],
  ) {
    openHighlightAtClientPoint(event.clientX, event.clientY, visibleAnnotationIds, annotationId);
  }

  function scrollToTocItem(item: TocItem) {
    setTocOpen(false);
    const articleElement = articleRef.current;
    const scrollElement = scrollRef.current;
    if (!articleElement || !scrollElement) return;
    if (item.index < 0) {
      scrollElement.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const target = findCurrentTocTarget(articleElement, item, sourceTocOptions);
    if (!target) return;
    const targetRect = target.getBoundingClientRect();
    const scrollRect = scrollElement.getBoundingClientRect();
    scrollElement.scrollTo({
      top: Math.max(0, scrollElement.scrollTop + targetRect.top - scrollRect.top - 18),
      behavior: 'smooth',
    });
  }

  if (!article) {
    return (
      <section className="source-bookcase is-empty">
        <div className="source-empty">{t('reader.emptySource')}</div>
      </section>
    );
  }

  const readerArticle = {
    title: article.title,
    byline: articleIdentityLine(article),
    excerpt: statusMessage,
    content: contentHtml,
  };
  const readerActions = buildSourceReaderAppActions({
    articleId: article.id,
    annotation: {
      onAddComment: addComment,
      onAnnotationLayoutChange: recalculateActiveConnection,
      onClearActiveAnnotation: () => onOpenAnnotation(null),
      onCreateAnnotation: createAnnotation,
      onDeleteAnnotation: deleteAnnotation,
      onDeleteComment: deleteComment,
      onFocusAnnotation: openAnnotation,
      onHighlightClick: handleHighlightClick,
      onNavigateAnnotation: navigateAnnotation,
      onResolveAnnotationNavigation: resolveAnnotationNavigation,
      onScrollToHighlight: (annotationId) => {
        openAnnotation(annotationId);
        scrollToAnnotation(annotationId);
      },
    },
    chat: readerChat.actions,
    selection: {
      onCancelComposer: cancelComposerFromShell,
      onClearSelection: clearSelectionFromShell,
      onCloseHighlightChoice: () => setHighlightChoice(null),
      onCopySelection: copySelection,
      onMouseUp: handleArticleMouseUp,
      onAskSelection: askSelection,
      onSelectionHandleDrag: updateArticleSelectionAdjustment,
      onSelectionHandleDragEnd: finishArticleSelectionAdjustment,
      onSelectionHandleDragStart: startArticleSelectionAdjustment,
      onOpenComposer: openComposerFromSelection,
    },
    shell: {
      onClose,
      onCloseFloatingPanels: () => {
        setSettingsOpen(false);
      },
      onCloseResponsivePanels: () => {
        setTocOpen(false);
      },
      onToggleSettings: () => setSettingsOpen((open) => !open),
      onUpdateReaderSettings: updateReaderSettings,
    },
    toc: {
      onScrollToHeading: scrollToTocItem,
      onToggleToc: () => setTocOpen((open) => !open),
    },
    onOpenAnnotationDiscussion,
    onRevealReaderChatContext: revealReaderChatContext,
  });
  const readerAppViewProps = buildSourceReaderAppViewProps({
    actions: readerActions,
    agentPlayback: {
      completionBurstKey,
      dockCompleting: agentDockCompleting,
      dockItems: agentDockItems,
      theaterBoxes: agentTheaterBoxes,
      virtualCursors,
    },
    annotations: {
      activeConnection,
      activeId: selectedAnnotationId,
      annotations,
      boxes,
      distillationAnimation,
      filteredAnnotations: annotations,
      newAnnotationIds,
      searchBoxes,
      temporaryBoxes,
    },
    article: {
      content: (
        <div
          aria-busy={translationSelectionDisabled || undefined}
          className={[
            'reader-article-body',
            translationSelectionDisabled ? 'is-translation-select-disabled' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          dangerouslySetInnerHTML={{ __html: translatedContentHtml }}
          onClick={handleArticleClick}
          onMouseDown={handleArticleMouseDown}
        />
      ),
      extracted: readerArticle,
      id: article.id,
    },
    refs: {
      articleRef,
      canvasRef,
      noteRefs,
      notesRef: railRef,
      surfaceRef: scrollRef,
    },
    session: sourceReaderSession,
    toc: {
      activeIndex: activeTocIndex,
      annotationStats: tocStats,
      items: tocItems,
      open: tocOpen,
    },
    toolbar: {
      articleAction: <OpenArticleButton article={article} iconOnly />,
      controls: (
        <>
          {bilingualTranslation.toolbar}
          <ReaderSettingsToolbarControls
            labels={{ articleWidth: labels.articleWidth, fontSize: labels.fontSize }}
            settings={readerSettings}
            onChange={updateReaderSettings}
          />
        </>
      ),
      search: searchNavigation.search,
      headerMeta: {
        title: article.title,
        byline: article.byline,
        hasCover: Boolean(article.leadImageUrl),
      },
      readingProgress,
    },
    userProfile,
    workspace: sourceReaderWorkspace,
  });
  return (
    <section className="source-bookcase source-reader-shell">
      <style>{`${readerDesktopEmbeddedBundleStyles}\n${sourceReaderTocStyles}`}</style>
      <ReaderAppView {...readerAppViewProps} />
      {bilingualTranslation.dialog}
    </section>
  );
}

function normalizeSavedWebProgress(progress: ArticleReadingProgress | undefined) {
  if (!progress) return null;
  if (!Number.isFinite(progress.progress)) return null;
  return Math.min(1, Math.max(0, progress.progress));
}

function webReaderMaxScrollTop(scrollElement: HTMLElement) {
  return Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
}

function webReaderProgress(scrollElement: HTMLElement) {
  const maxScrollTop = webReaderMaxScrollTop(scrollElement);
  if (maxScrollTop <= 0) return 1;
  return Math.min(1, Math.max(0, scrollElement.scrollTop / maxScrollTop));
}

function webActiveTocIndex(
  articleElement: HTMLElement,
  scrollElement: HTMLElement,
  tocItems: TocItem[],
) {
  const scrollRect = scrollElement.getBoundingClientRect();
  const sampleY = scrollRect.top + scrollRect.height * 0.2;
  const sortedItems = tocItems
    .filter((item) => item.index >= 0)
    .toSorted((left, right) => left.start - right.start);
  let firstIndex: number | null = null;
  let activeIndex: number | null = null;

  for (const item of sortedItems) {
    const target = findCurrentTocTarget(articleElement, item, sourceTocOptions);
    if (!target) continue;
    firstIndex ??= item.index;
    if (target.getBoundingClientRect().top <= sampleY) activeIndex = item.index;
    else break;
  }

  return activeIndex ?? firstIndex;
}

function webReadingProgressSnapshot(progress: number): ArticleReadingProgress {
  return {
    pageIndex: Math.min(999, Math.floor(progress * 1000)),
    pageCount: 1000,
    progress,
    updatedAt: new Date().toISOString(),
  };
}

function rangeIntersectsIgnoredSelector(range: Range, selector: string) {
  const nodes = [range.startContainer, range.endContainer];
  if (
    nodes.some((node) => {
      const element = node instanceof Element ? node : node.parentElement;
      return Boolean(element?.closest(selector));
    })
  ) {
    return true;
  }

  const container = document.createElement('div');
  container.append(range.cloneContents());
  return Boolean(container.querySelector(selector));
}

const translationSelectionToastIgnoredSelector =
  '[data-reader-translation-action], a[href], button, input, textarea, select, [role="button"]';

type WebSelectionGestureClientPoint = {
  clientX: number;
  clientY: number;
};

function describeWebSelectionGestureRangeForDebug(gestureRange: WebSelectionGestureRange) {
  return {
    startOffset: gestureRange.startOffset,
    endOffset: gestureRange.endOffset,
    startPoint: describeWebSelectionGesturePointForDebug(gestureRange.startPoint),
    endPoint: describeWebSelectionGesturePointForDebug(gestureRange.endPoint),
  };
}

function describeWebSelectionGesturePointForDebug(point: WebSelectionGesturePoint) {
  return {
    clientX: Math.round(point.clientX),
    clientY: Math.round(point.clientY),
    sourceOffset: point.sourceOffset,
    translationBlockId: point.translationBlockId,
  };
}
