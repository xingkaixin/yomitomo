import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AgentReadingPlanItem, Annotation, PublicAgent } from '@yomitomo/shared';
import { normalizeMessageSendShortcut, normalizeSelectionActionShortcuts } from '@yomitomo/shared';
import {
  annotationPrimaryComment,
  articlePublishedDistillationCount,
  annotationIdsAtHighlightPoint,
  createUserAnnotation,
  type TocItem,
} from '@yomitomo/core';
import { mergeAgentAnnotationAsThought } from '@yomitomo/reader-ui/reader-agent-annotation-playback';
import { sleep } from '@yomitomo/reader-ui/reader-animation';
import { buildTocAnnotationStats } from '@yomitomo/reader-ui/reader-annotations';
import { getShortcutModifier } from '@yomitomo/reader-ui/reader-shortcuts';
import {
  currentFoliateContent,
  ebookArticleText,
  ebookHighlightAnnotationsSignature,
  ebookSectionIndexForChapter,
  ebookTocItemsForReader,
  formatEbookPageLabel,
  isEbookPaginationReady,
  rangeForEbookAnchorInDocument,
  recordEbookPageTurnTrace,
  waitForAnimationFrame,
  waitForFoliateIdle,
  type EbookBoxUpdateReason,
  type EbookPageTurnTrace,
  type FoliateViewElement,
} from './app-ebook-reader-utils';
import { EbookReaderShell } from './app-source-ebook-reader-shell';
import { playEbookAgentAnnotationPlayback } from './app-source-ebook-agent-playback';
import type { PromptArticle } from './app-reading-types';
import { type SourceAgentAnnotationPlaybackMode } from './app-source-agent-request';
import {
  articleWithAnnotations,
  articleWithMergedAgentAnnotation,
  defaultTocOpen,
  promptArticle,
  useDesktopReaderSettings,
  usesOverlayToc,
  type EbookBookcaseProps,
} from './app-source-bookcase-shared';
import { useEbookAgentVirtualReading } from './use-ebook-agent-virtual-reading';
import { useEbookFoliateView } from './use-ebook-foliate-view';
import { useEbookReaderBoxes } from './use-ebook-reader-boxes';
import { useEbookSelection } from './use-ebook-selection';
import { useReaderPageTurnKeys, type ReaderPageTurnDirection } from './use-reader-page-turn-keys';
import { useSourceActiveConnection } from './use-source-active-connection';
import { useSourceSelectionComposer } from './use-source-selection-composer';
import { ebookAnnotationNavigationState } from './app-source-bookcase-ebook-utils';
import { ArticleBook } from './app-article-book';
import { articleDisplayTitle } from './app-reading-library-utils';
import {
  constrainSourceAgentPlanAnnotation,
  useSourceReaderSession,
} from './use-source-reader-session';

export function EbookBookcase({
  agents,
  annotations: articleAnnotations,
  article,
  distillationAnimation,
  focusAnnotationId,
  messageSendShortcut,
  selectionActionShortcuts,
  selectedAnnotationId,
  userProfile,
  onFocusedAnnotation,
  onClose,
  onDeleteArticleAnnotation,
  onDeleteArticleComment,
  onOpenAnnotationDiscussion,
  onOpenAnnotation,
  onSaveArticle,
  onSaveArticleReadingProgress,
  onUpdateArticle,
}: EbookBookcaseProps) {
  const articleRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const noteRefs = useRef(new Map<string, HTMLElement>());
  const scheduleEbookBoxUpdateRef = useRef<(reason: EbookBoxUpdateReason) => void>(() => {});
  const pageTurnTraceRef = useRef<EbookPageTurnTrace | null>(null);
  const beforeEbookPageTurnRef = useRef<(trace: EbookPageTurnTrace) => void>(() => {});
  const attachFoliateDocumentListenersRef = useRef<(view: FoliateViewElement | null) => void>(
    () => {},
  );
  const cleanupFoliateDocumentListenersRef = useRef<() => void>(() => {});
  const scheduleEbookBoxUpdate = useCallback((reason: EbookBoxUpdateReason) => {
    scheduleEbookBoxUpdateRef.current(reason);
  }, []);
  const beforeEbookPageTurn = useCallback((trace: EbookPageTurnTrace) => {
    beforeEbookPageTurnRef.current(trace);
  }, []);
  const attachFoliateDocumentListenersBridge = useCallback((view: FoliateViewElement | null) => {
    attachFoliateDocumentListenersRef.current(view);
  }, []);
  const cleanupFoliateDocumentListenersBridge = useCallback(() => {
    cleanupFoliateDocumentListenersRef.current();
  }, []);
  const [statusMessage, setStatusMessage] = useState('');
  const {
    addComment,
    annotations,
    annotationsRef,
    annotationAgents,
    applyAnnotations,
    deleteAnnotation,
    deleteComment,
    latestArticleRef,
    pendingAnnotationAgents,
    replaceAnnotations,
    requestAnnotationReview,
    reviewAgents,
    saveAnnotations,
  } = useSourceReaderSession({
    agents,
    agentAnnotationAdapter: {
      getContext: ({ currentArticle, options }) => {
        const articleId = options.articleId || currentArticle.id;
        const articleContext =
          options.article || promptArticle(currentArticle, currentArticleText());
        return {
          article: articleContext,
          articleId,
          articleText: articleContext.text,
          visibleArticle: isCurrentArticle(articleId),
        };
      },
      isBusy: ({ agent, options }) => !options.articleId && annotatingAgentIds.includes(agent.id),
      start: ({ agent, context, options, requestInput }) =>
        startEbookPlayback(
          agent,
          context.articleId,
          options.targetAnchor,
          requestInput.playbackMode,
        ),
      onAnnotation: ({ annotation, context, options, requestInput }) =>
        handleEbookStreamItem(
          context.articleId,
          annotation,
          requestInput.readingPlan,
          context.articleText,
          Boolean(options.targetAnchor),
        ),
      onEmpty: async ({ agent, context, options, playback }) => {
        if (isCurrentArticle(context.articleId)) {
          finishEmptyEbookPlayback(agent, options.targetAnchor);
        }
        await finishEbookPlayback(agent.id, Boolean(playback));
      },
      onSuccess: ({ agent, playback }) => finishEbookPlayback(agent.id, Boolean(playback)),
      finish: ({ agent, context, options, playback, requestFailed }) => {
        finishEbookRequest(agent, context.articleId, options.targetAnchor, {
          requestFailed,
          visibleArticle: Boolean(playback),
        });
      },
    },
    annotations: articleAnnotations,
    article,
    clearPendingOnArticleChange: true,
    clearPendingOnDeleteAnnotation: true,
    ignoreStaleArticleUpdates: true,
    onBeforeDeleteAnnotation: (annotationId) => {
      noteRefs.current.delete(annotationId);
    },
    getArticleText: currentArticleText,
    onAnnotationsApplied: ({ previousAnnotations, nextAnnotations }) => {
      const previousHighlightSignature = ebookHighlightAnnotationsSignature(
        previousAnnotations,
        userProfile,
        annotationAgents,
      );
      const nextHighlightSignature = ebookHighlightAnnotationsSignature(
        nextAnnotations,
        userProfile,
        annotationAgents,
      );
      if (nextHighlightSignature !== previousHighlightSignature) {
        scheduleEbookBoxUpdate('annotations_applied');
      }
    },
    onAnnotationsSaved: ({ previousAnnotations, nextAnnotations }) => {
      const previousHighlightSignature = ebookHighlightAnnotationsSignature(
        previousAnnotations,
        userProfile,
        annotationAgents,
      );
      const nextHighlightSignature = ebookHighlightAnnotationsSignature(
        nextAnnotations,
        userProfile,
        annotationAgents,
      );
      if (nextHighlightSignature !== previousHighlightSignature) {
        scheduleEbookBoxUpdate('annotations_saved');
      }
    },
    onOpenAnnotation: openAnnotation,
    onDeleteArticleAnnotation,
    onDeleteArticleComment,
    onSaveArticle,
    setStatusMessage,
    userProfile,
  });
  const [annotatingAgentIds, setAnnotatingAgentIds] = useState<string[]>([]);
  const [tocOpen, setTocOpen] = useState(() => defaultTocOpen());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commentsCloseKey, setCommentsCloseKey] = useState(0);

  const {
    temporaryBoxes,
    highlightChoice,
    setHighlightChoice,
    selectionAction,
    composer,
    clearSelection,
    clearAnnotationUiState,
    openSelectionAction,
    cancelComposer,
    copySelection,
    openComposer,
  } = useSourceSelectionComposer({
    canvasRef,
    onOpenComposer: () => setCommentsCloseKey((key) => key + 1),
  });
  const [readerSettings, updateEbookReaderSettings] = useDesktopReaderSettings();
  const ebookText = useMemo(() => ebookArticleText(article), [article]);
  const actionShortcuts = useMemo(
    () => normalizeSelectionActionShortcuts(selectionActionShortcuts),
    [selectionActionShortcuts],
  );
  const articleAnnotationSignature = useMemo(
    () => ebookHighlightAnnotationsSignature(articleAnnotations, userProfile, annotationAgents),
    [annotationAgents, articleAnnotations, userProfile],
  );
  const latestArticleAnnotationsRef = useRef(articleAnnotations);
  const articleAnnotationSignatureRef = useRef({
    articleId: article.id,
    signature: articleAnnotationSignature,
  });
  latestArticleAnnotationsRef.current = articleAnnotations;
  const {
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
  } = useEbookFoliateView({
    article,
    readerSettings,
    onSaveArticleReadingProgress,
    onAttachFoliateDocumentListeners: attachFoliateDocumentListenersBridge,
    onBeforePageTurn: beforeEbookPageTurn,
    onCleanupFoliateDocumentListeners: cleanupFoliateDocumentListenersBridge,
    onScheduleEbookBoxUpdate: scheduleEbookBoxUpdate,
    pageTurnTraceRef,
  });
  const turnPageFromKeyboard = useCallback(
    (direction: ReaderPageTurnDirection) => {
      if (direction === 'left') goLeft();
      else goRight();
    },
    [goLeft, goRight],
  );
  const { handleFoliateSelection, handleFoliateSelectionShortcut } = useEbookSelection({
    article,
    canvasRef,
    viewRef,
    pageInfo,
    ebookText,
    userProfile,
    actionShortcuts,
    selectionAction,
    composer,
    clearSelection,
    copySelection,
    openComposer,
    openSelectionAction,
    setStatusMessage,
  });
  useReaderPageTurnKeys({
    enabled: readerState.status === 'ready',
    onTurnPage: turnPageFromKeyboard,
  });
  const {
    boxes,
    attachFoliateDocumentListeners,
    cleanupFoliateDocumentListeners,
    hideEbookBoxLayer,
    resetEbookBoxState,
    scheduleEbookBoxUpdate: scheduleEbookBoxUpdateImpl,
  } = useEbookReaderBoxes({
    annotationAgents,
    annotationsRef,
    article,
    canvasRef,
    viewRef,
    pageTurnTraceRef,
    pageInfoSectionIndexRef,
    paginationLayoutKeyRef,
    readerSettingsRef,
    readerStateStatus: readerState.status,
    readerStateStatusRef,
    userProfile,
    onFoliatePointerDown: handleFoliatePointerDown,
    onFoliatePageTurnKey: turnPageFromKeyboard,
    onFoliateSelection: handleFoliateSelection,
    onFoliateSelectionShortcut: handleFoliateSelectionShortcut,
  });
  attachFoliateDocumentListenersRef.current = attachFoliateDocumentListeners;
  cleanupFoliateDocumentListenersRef.current = cleanupFoliateDocumentListeners;
  scheduleEbookBoxUpdateRef.current = scheduleEbookBoxUpdateImpl;
  const { activeConnection, recalculateActiveConnection } = useSourceActiveConnection({
    annotationAgents,
    annotations,
    boxes,
    canvasRef,
    noteRefs,
    selectedAnnotationId,
    surfaceRef,
    userProfile,
  });
  const readerTocItems = useMemo(
    () => ebookTocItemsForReader(tocItems, article),
    [article, tocItems],
  );
  const tocStats = useMemo(
    () => buildTocAnnotationStats(readerTocItems, annotations, userProfile, annotationAgents),
    [annotationAgents, annotations, readerTocItems, userProfile],
  );
  const annotationTotals = useMemo(
    () => ({
      annotations: annotations.length,
      distillations: articlePublishedDistillationCount(annotations),
    }),
    [annotations],
  );
  const {
    agentDockCompleting: ebookAgentDockCompleting,
    agentDockItems: ebookAgentDockItems,
    agentTheaterBoxes,
    completionBurstKey: ebookCompletionBurstKey,
    virtualCursors,
    agentAnimationQueueRef: ebookAgentAnimationQueueRef,
    cleanupAgentTheater: cleanupEbookAgentTheater,
    cursorAgent: ebookCursorAgent,
    finishAgentDock: finishEbookAgentDock,
    finishVirtualReading: finishEbookVirtualReading,
    setAgentTheaterBoxes,
    startAgentDock: startEbookAgentDock,
    startVirtualReading: startEbookVirtualReading,
    stopVirtualReadingTimer: stopEbookVirtualReadingTimer,
    updateVirtualCursor: updateEbookVirtualCursor,
  } = useEbookAgentVirtualReading({
    agents: annotationAgents,
    canvasRef,
    viewHostRef,
    viewRef,
  });
  beforeEbookPageTurnRef.current = (trace) => {
    clearAnnotationUiState();
    hideEbookBoxLayer();
    recordEbookPageTurnTrace(trace, 'overlay_hide_requested', {
      boxCount: boxes.length,
      pageAnnotationCount: pageAnnotations.length,
    });
  };

  useLayoutEffect(() => {
    noteRefs.current.clear();
    replaceAnnotations(latestArticleAnnotationsRef.current);
    resetEbookBoxState();
    clearAnnotationUiState();
    setAnnotatingAgentIds([]);
    cleanupEbookAgentTheater();
    setCommentsCloseKey((key) => key + 1);
    setStatusMessage('');
    setSettingsOpen(false);
    setTocOpen(defaultTocOpen());
  }, [
    article.id,
    cleanupEbookAgentTheater,
    clearAnnotationUiState,
    replaceAnnotations,
    resetEbookBoxState,
  ]);

  useEffect(() => {
    const previous = articleAnnotationSignatureRef.current;
    articleAnnotationSignatureRef.current = {
      articleId: article.id,
      signature: articleAnnotationSignature,
    };
    if (previous.articleId !== article.id || previous.signature === articleAnnotationSignature) {
      return;
    }
    scheduleEbookBoxUpdate('annotations_applied');
  }, [article.id, articleAnnotationSignature, scheduleEbookBoxUpdate]);

  useEffect(
    () => () => {
      cleanupEbookAgentTheater();
    },
    [cleanupEbookAgentTheater],
  );

  function goToReaderTocItem(item: TocItem) {
    const tocItem = tocItems[item.index];
    if (!tocItem) return;
    if (usesOverlayToc()) setTocOpen(false);
    goToTocItem(tocItem);
  }

  function handleReaderKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      goRight();
    }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      goLeft();
    }
  }

  function handleFoliatePointerDown() {
    clearAnnotationUiState();
    if (settingsOpen) {
      setSettingsOpen(false);
    }
    if (selectedAnnotationId) onOpenAnnotation(null);
  }

  function enqueueEbookAgentAnnotationPlayback(
    articleId: string,
    annotation: Annotation,
    options: { revealMissingRange?: boolean } = {},
  ) {
    const run = async () => {
      try {
        await playEbookAgentAnnotation(articleId, annotation, options);
      } catch (error) {
        console.warn(error);
        await appendAgentAnnotationToArticle(articleId, annotation);
      }
    };
    const next = ebookAgentAnimationQueueRef.current.then(run, run);
    ebookAgentAnimationQueueRef.current = next.then(
      () => undefined,
      () => undefined,
    );
  }

  async function playEbookAgentAnnotation(
    articleId: string,
    annotation: Annotation,
    options: { revealMissingRange?: boolean } = {},
  ) {
    await playEbookAgentAnnotationPlayback({
      articleId,
      annotation,
      revealMissingRange: options.revealMissingRange,
      canvasElement: canvasRef.current,
      surfaceElement: surfaceRef.current,
      document: currentFoliateContent(viewRef.current)?.doc || null,
      cursorAgent: ebookCursorAgent(annotation),
      isCurrentArticle,
      appendAgentAnnotationToArticle,
      goToAnnotation,
      finishEbookVirtualReading,
      stopEbookVirtualReadingTimer,
      updateEbookVirtualCursor,
      setAgentTheaterBoxes,
    });
  }

  function currentArticleText() {
    return ebookText;
  }

  function isCurrentArticle(articleId: string) {
    return latestArticleRef.current?.id === articleId;
  }

  function openAnnotation(annotationId: string) {
    clearAnnotationUiState();
    onOpenAnnotation(annotationId);
  }

  async function createAnnotation(note: string) {
    if (!composer) return;
    const currentComposer = composer;
    const currentArticle = latestArticleRef.current;
    if (!currentArticle) return;
    const articleContext = promptArticle(currentArticle, currentArticleText());
    cancelComposer();
    const annotation = createUserAnnotation(currentComposer.anchor, userProfile, note);
    await saveAnnotations([...currentArticle.annotations, annotation]);
    openAnnotation(annotation.id);
    if (annotationPrimaryComment(annotation)) {
      void inferAnnotationMetadataForAnnotation(currentArticle.id, annotation, articleContext);
    }
  }

  async function inferAnnotationMetadataForAnnotation(
    articleId: string,
    annotation: Annotation,
    articleContext: PromptArticle,
  ) {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;
    try {
      const metadata = await desktop.inferAnnotationMetadata({
        article: articleContext,
        anchor: annotation.anchor,
        note: annotationPrimaryComment(annotation)?.content || '',
      });
      await onUpdateArticle(articleId, (targetArticle) => {
        let found = false;
        const nextAnnotations = targetArticle.annotations.map((item) => {
          if (item.id !== annotation.id) return item;
          found = true;
          const primaryCommentId = annotationPrimaryComment(item)?.id;
          return {
            ...item,
            annotationType: metadata.annotationType,
            readingIntent: metadata.readingIntent,
            comments: item.comments.map((comment) =>
              comment.id === primaryCommentId
                ? { ...comment, readingIntent: metadata.readingIntent }
                : comment,
            ),
            updatedAt: new Date().toISOString(),
          };
        });
        return found ? articleWithAnnotations(targetArticle, nextAnnotations) : null;
      });
    } catch (error) {
      if (!isCurrentArticle(articleId)) return;
      setStatusMessage(error instanceof Error ? error.message : '想法标签生成失败');
      window.setTimeout(() => setStatusMessage(''), 1800);
    }
  }

  async function appendAgentAnnotationToArticle(articleId: string, annotation: Annotation) {
    let activeId = annotation.id;
    let currentMerge: ReturnType<typeof mergeAgentAnnotationAsThought> | null = null;
    if (isCurrentArticle(articleId)) {
      const result = mergeAgentAnnotationAsThought(annotationsRef.current, annotation);
      activeId = result.activeId;
      currentMerge = result;
      applyAnnotations(result.annotations);
      openAnnotation(result.activeId);
    }
    await onUpdateArticle(articleId, (targetArticle) => {
      const result = articleWithMergedAgentAnnotation(targetArticle, annotation, currentMerge);
      activeId = result.activeId;
      return result.article;
    });
    return activeId;
  }

  function startEbookPlayback(
    agent: PublicAgent,
    articleId: string,
    targetAnchor: Annotation['anchor'] | undefined,
    playbackMode: SourceAgentAnnotationPlaybackMode,
  ) {
    setAnnotatingAgentIds((ids) => (ids.includes(agent.id) ? ids : [...ids, agent.id]));
    const visibleArticle = isCurrentArticle(articleId);
    if (visibleArticle) startEbookAgentDock(agent);
    if (visibleArticle && playbackMode === 'target' && targetAnchor) {
      startEbookVirtualReading(agent, targetAnchor);
    }
    return visibleArticle;
  }

  function handleEbookStreamItem(
    articleId: string,
    annotation: Annotation,
    readingPlan: AgentReadingPlanItem[],
    articleText: string,
    revealMissingRange: boolean,
  ) {
    const constrainedAnnotation = constrainSourceAgentPlanAnnotation(
      annotation,
      readingPlan,
      articleText,
    );
    if (!constrainedAnnotation) return false;
    if (isCurrentArticle(articleId)) {
      enqueueEbookAgentAnnotationPlayback(articleId, constrainedAnnotation, {
        revealMissingRange,
      });
      return true;
    }
    void appendAgentAnnotationToArticle(articleId, constrainedAnnotation);
    return true;
  }

  function finishEmptyEbookPlayback(
    agent: PublicAgent,
    targetAnchor: Annotation['anchor'] | undefined,
  ) {
    if (targetAnchor) finishEbookVirtualReading(agent.id, '没有新想法');
    setStatusMessage(`${agent.nickname} 暂无新想法`);
    window.setTimeout(() => setStatusMessage(''), 1400);
  }

  async function finishEbookPlayback(agentId: string, visibleArticle: boolean) {
    if (!visibleArticle) return;
    await ebookAgentAnimationQueueRef.current;
    await sleep(900);
    finishEbookAgentDock(agentId, true);
  }

  function finishEbookRequest(
    agent: PublicAgent,
    articleId: string,
    targetAnchor: Annotation['anchor'] | undefined,
    options: { requestFailed: boolean; visibleArticle: boolean },
  ) {
    if (options.requestFailed && targetAnchor && isCurrentArticle(articleId)) {
      finishEbookVirtualReading(agent.id, '想法添加失败');
    }
    if (options.requestFailed && options.visibleArticle) finishEbookAgentDock(agent.id, false);
    setAnnotatingAgentIds((ids) => ids.filter((id) => id !== agent.id));
    setStatusMessage((message) => (message.includes('暂无新想法') ? message : ''));
  }

  function handleHighlightClick(
    annotationId: string,
    event: React.MouseEvent<HTMLButtonElement>,
    visibleAnnotationIds: string[],
  ) {
    const canvasElement = canvasRef.current;
    if (!canvasElement) {
      openAnnotation(annotationId);
      return;
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const annotationIds =
      visibleAnnotationIds.length > 0
        ? visibleAnnotationIds
        : annotationIdsAtHighlightPoint(
            boxes,
            {
              x: event.clientX - canvasRect.left,
              y: event.clientY - canvasRect.top,
            },
            1,
          );

    if (annotationIds.length <= 1) {
      openAnnotation(annotationIds[0] || annotationId);
      return;
    }

    const x = event.clientX - canvasRect.left + 8;
    setHighlightChoice({
      x: Math.max(8, Math.min(Math.max(8, canvasRect.width - 236), x)),
      y: Math.max(8, event.clientY - canvasRect.top + 8),
      annotationIds,
    });
  }

  async function goToAnnotation(annotationId: string) {
    const annotation = annotationsRef.current.find((item) => item.id === annotationId);
    const view = viewRef.current;
    const index = article.ebook.index;
    if (!annotation || !view || !index) return false;

    const chapter = annotation.anchor.chapterId
      ? index.chapters.find((item) => item.id === annotation.anchor.chapterId)
      : null;
    const sectionIndex = chapter ? ebookSectionIndexForChapter(article, view, chapter) : -1;
    if (sectionIndex >= 0) await view.goTo(sectionIndex);
    else if (typeof annotation.anchor.textStartInBook === 'number' && index.textLength > 0) {
      await view.goToFraction(annotation.anchor.textStartInBook / index.textLength);
    }

    await waitForFoliateIdle();
    await waitForAnimationFrame();
    const doc = currentFoliateContent(view)?.doc;
    const range = doc ? rangeForEbookAnchorInDocument(doc, annotation.anchor) : null;
    if (range) await view.renderer?.scrollToAnchor?.(range);
    await waitForAnimationFrame();
    scheduleEbookBoxUpdate('annotation_navigation');
    return true;
  }

  const resolveAnnotationNavigation = useCallback(
    ({
      activeId,
      annotations: navigationAnnotations,
    }: {
      activeId: string | null;
      annotations: Annotation[];
    }) =>
      ebookAnnotationNavigationState({
        activeId,
        annotations: navigationAnnotations,
        boxes,
        pageInfo,
        article,
        view: viewRef.current,
      }),
    [article, boxes, pageInfo],
  );

  function navigateAnnotation(annotationId: string) {
    openAnnotation(annotationId);
    void goToAnnotation(annotationId);
  }

  function focusPageAnnotation(annotationId: string) {
    openAnnotation(annotationId);
    if (boxes.some((box) => box.annotationId === annotationId)) return;
    void goToAnnotation(annotationId);
  }

  useEffect(() => {
    if (!focusAnnotationId) return;
    if (!annotations.some((annotation) => annotation.id === focusAnnotationId)) {
      onFocusedAnnotation();
      return;
    }
    let cancelled = false;
    let timer: number | null = null;
    void goToAnnotation(focusAnnotationId).then(() => {
      if (cancelled) return;
      timer = window.setTimeout(onFocusedAnnotation, 180);
    });
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [annotations, focusAnnotationId, onFocusedAnnotation]);

  const progressPercent = Math.round(progress * 100);
  const paginationReady = isEbookPaginationReady(pageInfo, sectionPageCounts);
  const pageLabel = paginationReady ? formatEbookPageLabel(pageInfo, sectionPageCounts) : '';
  const progressTickId = `ebook-progress-ticks-${article.id}`;
  const readerArticle = {
    title: articleDisplayTitle(article),
    byline: article.byline || article.ebook.metadata.fileName,
    excerpt: statusMessage,
    content: '',
  };
  const shortcutModifier = getShortcutModifier();
  const sendShortcut = normalizeMessageSendShortcut(messageSendShortcut);
  const pageAnnotations = useMemo(() => {
    const visibleIds = new Set(boxes.map((box) => box.annotationId).filter(Boolean));
    return annotations.filter((annotation) => visibleIds.has(annotation.id));
  }, [annotations, boxes]);

  return (
    <EbookReaderShell
      activeConnection={activeConnection}
      activeId={selectedAnnotationId}
      agentDockCompleting={ebookAgentDockCompleting}
      agentDockItems={ebookAgentDockItems}
      agentTheaterBoxes={agentTheaterBoxes}
      agents={annotationAgents}
      annotationTotals={annotationTotals}
      annotations={pageAnnotations}
      distillationAnimation={distillationAnimation}
      articleId={article.id}
      articleRef={articleRef}
      boxes={boxes}
      canvasRef={canvasRef}
      commentsCloseKey={commentsCloseKey}
      composer={composer}
      completionBurstKey={ebookCompletionBurstKey}
      embedded
      extracted={readerArticle}
      filteredAnnotations={annotations}
      highlightChoice={highlightChoice}
      measureHostRef={measureHostRef}
      noteRefs={noteRefs}
      notesRef={railRef}
      pageLabel={pageLabel}
      paginationReady={paginationReady}
      pendingAnnotationAgents={pendingAnnotationAgents}
      progress={progress}
      progressPercent={progressPercent}
      progressTickId={progressTickId}
      readerSettings={readerSettings}
      reviewAgents={reviewAgents}
      readerState={readerState}
      sectionFractions={sectionFractions}
      selectionAction={selectionAction}
      settingsOpen={settingsOpen}
      messageSendShortcut={sendShortcut}
      selectionActionShortcuts={actionShortcuts}
      shortcutModifier={shortcutModifier}
      surfaceRef={surfaceRef}
      temporaryBoxes={temporaryBoxes}
      toolbarArticleAction={
        <span className="ebook-toolbar-cover">
          <ArticleBook article={article} />
        </span>
      }
      tocAnnotationStats={tocStats}
      tocItems={readerTocItems}
      tocOpen={tocOpen}
      userProfile={userProfile}
      viewHostRef={viewHostRef}
      virtualCursors={virtualCursors}
      onAddComment={addComment}
      onAnnotationLayoutChange={recalculateActiveConnection}
      onCancelComposer={cancelComposer}
      onClearActiveAnnotation={() => onOpenAnnotation(null)}
      onClearSelection={clearSelection}
      onClose={onClose}
      onCloseFloatingPanels={() => {
        setSettingsOpen(false);
      }}
      onCloseHighlightChoice={() => setHighlightChoice(null)}
      onCloseResponsivePanels={() => {
        setTocOpen(false);
      }}
      onCopySelection={copySelection}
      onCreateAnnotation={createAnnotation}
      onDeleteAnnotation={deleteAnnotation}
      onDeleteComment={deleteComment}
      onFocusAnnotation={openAnnotation}
      onOpenAnnotationDiscussion={(annotationId) =>
        void onOpenAnnotationDiscussion?.(article.id, annotationId)
      }
      onGoLeft={goLeft}
      onGoRight={goRight}
      onGoToProgress={goToProgress}
      onHighlightClick={handleHighlightClick}
      onMouseUp={() => undefined}
      onNavigateAnnotation={navigateAnnotation}
      onOpenComposer={openComposer}
      onReaderKeyDown={handleReaderKeyDown}
      onRequestAnnotationReview={requestAnnotationReview}
      onResolveAnnotationNavigation={resolveAnnotationNavigation}
      onScrollToHeading={goToReaderTocItem}
      onScrollToHighlight={focusPageAnnotation}
      onToggleSettings={() => setSettingsOpen((open) => !open)}
      onToggleToc={() => setTocOpen((open) => !open)}
      onUpdateReaderSettings={updateEbookReaderSettings}
    />
  );
}
