import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import type {
  AgentReadingPlanItem,
  Annotation,
  ArticleReadingProgress,
  PublicAgent,
} from '@yomitomo/shared';
import {
  createTextAnchor,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
} from '@yomitomo/shared';
import {
  articlePublishedDistillationCount,
  annotationIdsAtHighlightPoint,
  createEpubTextAnchor,
  findCurrentTocTarget,
  getArticleSelection,
  isRangeInsideArticle,
  offsetFromArticleStart,
  rangeHighlightBoxes,
  selectionActionPosition,
  createUserAnnotation,
  type TocItem,
} from '@yomitomo/core';
import {
  ReaderAppView,
  type AnnotationNavigationDirection,
} from '@yomitomo/reader-ui/reader-app-view';
import { mergeAgentAnnotationAsThought } from '@yomitomo/reader-ui/reader-agent-annotation-playback';
import {
  readerConversationStyles,
  readerDesktopEmbeddedStyles,
  readerStyles,
} from '@yomitomo/reader-ui/reader-styles';
import { getShortcutModifier } from '@yomitomo/reader-ui/reader-shortcuts';
import {
  buildTocAnnotationStats,
  readerAnnotationScrollTop,
} from '@yomitomo/reader-ui/reader-annotations';
import { useAgentAnnotationQueue } from '@yomitomo/reader-ui/use-agent-annotation-queue';
import { OpenArticleButton } from '../../app-ui';
import { type SourceAgentAnnotationPlaybackMode } from '../bookcase/app-source-agent-request';
import { articleIdentityLine } from '../../app-utils';
import {
  articleWithMergedAgentAnnotation,
  defaultTocOpen,
  promptArticle,
  useDesktopReaderSettings,
  usesOverlayToc,
  type WebSourceBookcaseProps,
} from '../bookcase/app-source-bookcase-shared';
import { useSourceActiveConnection } from '../bookcase/use-source-active-connection';
import { useSourceSelectionComposer } from '../bookcase/use-source-selection-composer';
import { sourceTocOptions, useWebReaderBoxes } from './use-web-reader-boxes';
import {
  articleLinkExternalUrl,
  sourceArticleBodyHtml,
  sourceReaderTocStyles,
  webAnnotationNavigationState,
} from './app-source-bookcase-web-utils';
import {
  constrainSourceAgentPlanAnnotation,
  useSourceReaderSession,
} from '../bookcase/use-source-reader-session';

export function WebSourceBookcase({
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
}: WebSourceBookcaseProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const lastSavedWebProgressRef = useRef<number | null>(null);
  const restoredWebProgressArticleRef = useRef<string | null>(null);
  const noteRefs = useRef(new Map<string, HTMLElement>());
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
        const articleScopedWrite = Boolean(options.articleId);
        const visibleArticle = isCurrentArticle(articleId);
        return {
          article: articleContext,
          articleId,
          articleScopedWrite,
          articleText: articleScopedWrite ? articleContext.text : currentArticleText(),
          showProgress: !articleScopedWrite || visibleArticle,
          visibleArticle,
        };
      },
      isBusy: ({ agent, context }) =>
        !context.articleScopedWrite && annotatingAgentIds.includes(agent.id),
      start: ({ agent, context, requestInput }) => {
        startAgentAnnotationPlayback(
          agent,
          requestInput.readingPlan,
          requestInput.playbackMode,
          context.showProgress !== false,
        );
      },
      onAnnotation: ({ annotation, context, requestInput }) =>
        handleAgentAnnotationStreamItem(
          context.articleId,
          annotation,
          requestInput.readingPlan,
          Boolean(context.articleScopedWrite),
          context.articleText,
        ),
      onEmpty: ({ agent, context }) => {
        if (context.showProgress !== false && isCurrentArticle(context.articleId)) {
          markVirtualReadingDone(agent.id);
        }
        finishEmptyAgentAnnotationPlayback(
          agent,
          context.articleId,
          context.showProgress !== false,
        );
      },
      onSuccess: ({ agent, context }) => {
        if (context.showProgress !== false && isCurrentArticle(context.articleId)) {
          markVirtualReadingDone(agent.id);
          finishVirtualReadingIfIdle(agent.id);
        }
      },
      finish: ({ agent, context }) => {
        finishAgentAnnotationRequest(agent, context.showProgress !== false);
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
    onOpenAnnotation: openAnnotation,
    onDeleteArticleAnnotation,
    onDeleteArticleComment,
    onSaveArticle,
    setStatusMessage,
    userProfile,
  });
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
  const [readerSettings, updateReaderSettings] = useDesktopReaderSettings();
  const contentHtml = useMemo(() => (article ? sourceArticleBodyHtml(article) : ''), [article]);
  const { boxes, tocItems } = useWebReaderBoxes({
    annotationAgents,
    annotations,
    article,
    articleRef,
    canvasRef,
    contentHtml,
    userProfile,
  });
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
  const annotationTotals = useMemo(
    () => ({
      annotations: annotations.length,
      distillations: articlePublishedDistillationCount(annotations),
    }),
    [annotations],
  );
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
    saveAnnotations,
    setActiveId: openAnnotation,
    readerLog: () => {},
  });
  useEffect(() => cleanupVirtualReadingSessions, []);

  useEffect(() => {
    clearAnnotationUiState();
  }, [article?.id, annotations, clearAnnotationUiState]);

  useEffect(() => {
    setTocOpen(defaultTocOpen());
    setSettingsOpen(false);
    setStatusMessage('');
    lastSavedWebProgressRef.current = normalizeSavedWebProgress(article.readingProgress);
    restoredWebProgressArticleRef.current = null;
  }, [article?.id]);

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

    let saveTimer: number | undefined;
    const saveProgress = () => {
      const progress = webReaderProgress(scrollElement);
      if (
        lastSavedWebProgressRef.current !== null &&
        Math.abs(progress - lastSavedWebProgressRef.current) < 0.01
      ) {
        return;
      }

      lastSavedWebProgressRef.current = progress;
      void onSaveArticleReadingProgress(article.id, webReadingProgressSnapshot(progress));
    };
    const scheduleSave = () => {
      if (saveTimer !== undefined) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(saveProgress, 450);
    };

    const initialFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (webReaderMaxScrollTop(scrollElement) <= 0) saveProgress();
      });
    });
    scrollElement.addEventListener('scroll', scheduleSave, { passive: true });
    return () => {
      scrollElement.removeEventListener('scroll', scheduleSave);
      window.cancelAnimationFrame(initialFrame);
      if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    };
  }, [article.id, onSaveArticleReadingProgress]);

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
    if (!annotations.some((annotation) => annotation.id === focusAnnotationId)) {
      onFocusedAnnotation();
      return;
    }
    if (!scrollToAnnotation(focusAnnotationId)) return;
    const timer = window.setTimeout(onFocusedAnnotation, 520);
    return () => window.clearTimeout(timer);
  }, [annotations, focusAnnotationId, onFocusedAnnotation, scrollToAnnotation]);

  function openAnnotation(annotationId: string) {
    clearAnnotationUiState();
    onOpenAnnotation(annotationId);
  }

  function currentArticleText() {
    return articleRef.current?.textContent || '';
  }

  function isCurrentArticle(articleId: string) {
    return latestArticleRef.current?.id === articleId;
  }

  function handleArticleMouseUp() {
    const articleElement = articleRef.current;
    const canvasElement = canvasRef.current;
    if (!articleElement || !canvasElement) return;

    const selection = getArticleSelection(articleElement);
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      clearSelection();
      return;
    }

    const range = selection.getRangeAt(0);
    if (!isRangeInsideArticle(range, articleElement)) return;
    const articleText = currentArticleText();
    const start = offsetFromArticleStart(articleElement, range.startContainer, range.startOffset);
    const end = offsetFromArticleStart(articleElement, range.endContainer, range.endOffset);
    const anchor = article.ebook?.index
      ? createEpubTextAnchor(article.ebook.index, articleText, start, end)
      : createTextAnchor(articleText, start, end);
    if (!anchor.exact.trim()) return;

    const rects = range.getClientRects();
    const lastRect = rects[rects.length - 1];
    if (!lastRect) return;

    const canvasRect = canvasElement.getBoundingClientRect();
    const position = selectionActionPosition(lastRect, canvasRect);
    openSelectionAction(
      { x: position.x, y: position.y, anchor },
      rangeHighlightBoxes(range, canvasRect, 'source-selection').map((box) =>
        Object.assign(box, {
          annotationId: '__selection__',
          contributorId: userProfile.id,
          color: userProfile.annotationColor,
        }),
      ),
    );
    selection.removeAllRanges();
  }

  function handleArticleClick(event: React.MouseEvent<HTMLElement>) {
    const target = event.target instanceof Element ? event.target : null;
    const anchor = target?.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;

    const url = articleLinkExternalUrl(article, anchor.getAttribute('href'));
    if (!url) return;

    event.preventDefault();
    void window.yomitomoDesktop.openUrl(url);
  }

  async function createAnnotation(note: string) {
    if (!composer) return;
    const currentComposer = composer;
    const currentArticle = latestArticleRef.current;
    if (!currentArticle) return;
    cancelComposer();
    const annotation = createUserAnnotation(currentComposer.anchor, userProfile, note);
    await saveAnnotations([...currentArticle.annotations, annotation]);
    openAnnotation(annotation.id);
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

  function startAgentAnnotationPlayback(
    agent: PublicAgent,
    readingPlan: AgentReadingPlanItem[],
    playbackMode: SourceAgentAnnotationPlaybackMode,
    showProgress: boolean,
  ) {
    if (!showProgress) return;
    markAgentAnnotating(agent.id, true);
    startVirtualReading(agent, readingPlan, playbackMode);
  }

  function handleAgentAnnotationStreamItem(
    articleId: string,
    annotation: Annotation,
    readingPlan: AgentReadingPlanItem[],
    articleScopedWrite: boolean,
    articleText: string,
  ) {
    const constrainedAnnotation = constrainSourceAgentPlanAnnotation(
      annotation,
      readingPlan,
      articleText,
    );
    if (!constrainedAnnotation) return false;
    if (articleScopedWrite) {
      void appendAgentAnnotationToArticle(articleId, constrainedAnnotation);
      return true;
    }
    if (!isCurrentArticle(articleId)) return true;
    enqueueAgentAnnotation(constrainedAnnotation);
    void processAgentAnnotationQueue();
    return true;
  }

  function finishEmptyAgentAnnotationPlayback(
    agent: PublicAgent,
    articleId: string,
    showProgress: boolean,
  ) {
    if (!showProgress || !isCurrentArticle(articleId)) return;
    finishVirtualReading(agent.id, '没有新想法');
    setStatusMessage(`${agent.nickname} 暂无新想法`);
    window.setTimeout(() => setStatusMessage(''), 1400);
  }

  function finishAgentAnnotationRequest(agent: PublicAgent, showProgress: boolean) {
    if (!showProgress) return;
    markAgentAnnotating(agent.id, false);
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

  function scrollToTocItem(item: TocItem) {
    if (usesOverlayToc()) setTocOpen(false);
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
        <div className="source-empty">选择一篇文章查看原文</div>
      </section>
    );
  }

  const readerArticle = {
    title: article.title,
    byline: articleIdentityLine(article),
    excerpt: statusMessage,
    content: contentHtml,
  };
  const shortcutModifier = getShortcutModifier();
  const sendShortcut = normalizeMessageSendShortcut(messageSendShortcut);
  const actionShortcuts = useMemo(
    () => normalizeSelectionActionShortcuts(selectionActionShortcuts),
    [selectionActionShortcuts],
  );

  return (
    <section className="source-bookcase source-reader-shell">
      <button className="source-reader-back-button" type="button" onClick={onClose}>
        <ChevronLeft size={16} />
        <span>返回阅读库</span>
      </button>
      <style>
        {`${readerStyles}\n${readerConversationStyles}\n${readerDesktopEmbeddedStyles}\n${sourceReaderTocStyles}`}
      </style>
      <ReaderAppView
        activeConnection={activeConnection}
        activeId={selectedAnnotationId}
        agentDockCompleting={agentDockCompleting}
        agentDockItems={agentDockItems}
        agentTheaterBoxes={agentTheaterBoxes}
        agents={annotationAgents}
        annotationTotals={annotationTotals}
        annotations={annotations}
        distillationAnimation={distillationAnimation}
        articleContent={
          <div
            className="reader-article-body"
            dangerouslySetInnerHTML={{ __html: contentHtml }}
            onClick={handleArticleClick}
          />
        }
        articleId={article.id}
        articleRef={articleRef}
        boxes={boxes}
        canvasRef={canvasRef}
        commentsCloseKey={commentsCloseKey}
        composer={composer}
        completionBurstKey={completionBurstKey}
        embedded
        extracted={readerArticle}
        filteredAnnotations={annotations}
        highlightChoice={highlightChoice}
        noteRefs={noteRefs}
        notesRef={railRef}
        pendingAnnotationAgents={pendingAnnotationAgents}
        readerSettings={readerSettings}
        reviewAgents={reviewAgents}
        selectionAction={selectionAction}
        settingsOpen={settingsOpen}
        messageSendShortcut={sendShortcut}
        selectionActionShortcuts={actionShortcuts}
        shortcutModifier={shortcutModifier}
        surfaceRef={scrollRef}
        temporaryBoxes={temporaryBoxes}
        toolbarArticleAction={<OpenArticleButton article={article} iconOnly />}
        tocAnnotationStats={tocStats}
        tocItems={tocItems}
        tocOpen={tocOpen}
        userProfile={userProfile}
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
        onOpenAnnotationDiscussion={(annotationId, sourceRect) =>
          void onOpenAnnotationDiscussion?.(article.id, annotationId, sourceRect)
        }
        onNavigateAnnotation={navigateAnnotation}
        onResolveAnnotationNavigation={resolveAnnotationNavigation}
        onHighlightClick={handleHighlightClick}
        onMouseUp={handleArticleMouseUp}
        onOpenComposer={openComposer}
        onRequestAnnotationReview={requestAnnotationReview}
        onScrollToHeading={scrollToTocItem}
        onScrollToHighlight={(annotationId) => {
          openAnnotation(annotationId);
          scrollToAnnotation(annotationId);
        }}
        onToggleSettings={() => setSettingsOpen((open) => !open)}
        onToggleToc={() => setTocOpen((open) => !open)}
        onUpdateReaderSettings={updateReaderSettings}
      />
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

function webReadingProgressSnapshot(progress: number): ArticleReadingProgress {
  return {
    pageIndex: Math.min(999, Math.floor(progress * 1000)),
    pageCount: 1000,
    progress,
    updatedAt: new Date().toISOString(),
  };
}
