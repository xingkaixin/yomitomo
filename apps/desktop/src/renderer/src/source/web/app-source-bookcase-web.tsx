import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Annotation, ArticleReadingProgress, ReaderQuestionContext } from '@yomitomo/shared';
import {
  createTextAnchor,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
  resolveTextAnchor,
} from '@yomitomo/shared';
import {
  articlePublishedDistillationCount,
  annotationIdsAtHighlightPoint,
  createEpubTextAnchor,
  findCurrentTocTarget,
  findReaderSearchMatches,
  getArticleSelection,
  type HighlightBox,
  isRangeInsideArticle,
  offsetFromArticleStart,
  rangeHighlightBoxes,
  rangeFromOffsets,
  selectionActionPosition,
  scrollReaderSurfaceToRect,
  createUserAnnotation,
  type TocItem,
} from '@yomitomo/core';
import {
  ReaderAppView,
  type AnnotationNavigationDirection,
} from '@yomitomo/reader-ui/reader-app-view';
import { ReaderSettingsToolbarControls } from '@yomitomo/reader-ui/reader-toolbar-controls';
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
import { OpenArticleButton } from '../../shell/app-ui';
import { readerUiLabels } from '../../i18n/app-i18n-labels';
import { articleIdentityLine } from '../../shell/app-utils';
import {
  defaultTocOpen,
  useDesktopReaderSettings,
  usesOverlayToc,
  type WebSourceBookcaseProps,
} from '../bookcase/app-source-bookcase-shared';
import { useSourceActiveConnection } from '../bookcase/use-source-active-connection';
import { useRecentAnnotationFeedback } from '../bookcase/use-recent-annotation-feedback';
import { useSourceSelectionComposer } from '../bookcase/use-source-selection-composer';
import { sourceTocOptions, useWebReaderBoxes } from './use-web-reader-boxes';
import {
  articleLinkExternalUrl,
  sourceArticleBodyHtml,
  sourceReaderTocStyles,
  webAnnotationNavigationState,
} from './app-source-bookcase-web-utils';
import { useSourceReaderSession } from '../bookcase/use-source-reader-session';
import { createWebSourceReaderController } from './app-source-bookcase-web-controller';
import { useReaderChatSession } from '../bookcase/use-reader-chat-session';

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
  onFocusedAnnotation,
  onClose,
  onDeleteArticleAnnotation,
  onDeleteArticleComment,
  onOpenAnnotationDiscussion,
  onOpenAnnotation,
  onSaveArticle,
  onSaveArticleReadingProgress,
  onSaveArticleReaderChatState,
  onUpdateArticle,
}: WebSourceBookcaseProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const lastSavedWebProgressRef = useRef<number | null>(null);
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
    reviewAgents,
    saveAnnotations,
  } = useSourceReaderSession({
    agents,
    agentAnnotationAdapter: createWebSourceReaderController({
      applyAnnotations: (nextAnnotations) => applyAnnotations(nextAnnotations),
      currentArticleText,
      enqueueAgentAnnotation: (annotation) => enqueueAgentAnnotation(annotation),
      finishVirtualReading: (agentId, message) => finishVirtualReading(agentId, message),
      finishVirtualReadingIfIdle: (agentId) => finishVirtualReadingIfIdle(agentId),
      getAnnotations: () => annotationsRef.current,
      isAgentAnnotating: (agentId) => annotatingAgentIds.includes(agentId),
      isCurrentArticle,
      markAgentAnnotating: (agentId, annotating) => markAgentAnnotating(agentId, annotating),
      markVirtualReadingDone: (agentId) => markVirtualReadingDone(agentId),
      onOpenAnnotation: openAnnotation,
      onUpdateArticle,
      processAgentAnnotationQueue: () => processAgentAnnotationQueue(),
      setStatusMessage,
      startVirtualReading: (agent, readingPlan, playbackMode) =>
        startVirtualReading(agent, readingPlan, playbackMode),
    }),
    annotations: articleAnnotations,
    article,
    clearPendingOnArticleChange: true,
    clearPendingOnDeleteAnnotation: true,
    ignoreStaleArticleUpdates: true,
    uiLanguage,
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
  const [, setSettingsOpen] = useState(false);
  const [commentsCloseKey, setCommentsCloseKey] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(0);
  const [searchBoxes, setSearchBoxes] = useState<HighlightBox[]>([]);

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
  const articleText = articleRef.current?.textContent || '';
  const searchResult = useMemo(
    () => findReaderSearchMatches(articleText, searchQuery),
    [articleText, searchQuery],
  );
  const activeSearchMatch =
    searchResult.matches[Math.min(activeSearchMatchIndex, searchResult.matches.length - 1)] || null;
  const { boxes, tocItems } = useWebReaderBoxes({
    annotationAgents,
    annotations,
    article,
    articleRef,
    canvasRef,
    contentHtml,
    userProfile,
  });
  const readerChat = useReaderChatSession({
    agents: annotationAgents,
    article,
    getArticleText: currentArticleText,
    uiLanguage,
    onSaveArticleReaderChatState,
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
    setSearchOpen(false);
    setSearchQuery('');
    setActiveSearchMatchIndex(0);
    setSearchBoxes([]);
    lastSavedWebProgressRef.current = normalizeSavedWebProgress(article.readingProgress);
    setReadingProgress(lastSavedWebProgressRef.current ?? 0);
    restoredWebProgressArticleRef.current = null;
  }, [article?.id]);

  useEffect(() => {
    setActiveSearchMatchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (!searchOpen || !activeSearchMatch) {
      setSearchBoxes([]);
      return;
    }
    const articleElement = articleRef.current;
    const canvasElement = canvasRef.current;
    const scrollElement = scrollRef.current;
    if (!articleElement || !canvasElement || !scrollElement) return;

    const range = rangeFromOffsets(articleElement, activeSearchMatch.start, activeSearchMatch.end);
    if (!range) {
      setSearchBoxes([]);
      return;
    }

    const rect = range.getClientRects()[0];
    if (rect) scrollReaderSurfaceToRect(scrollElement, rect, 82);
    const canvasRect = canvasElement.getBoundingClientRect();
    setSearchBoxes(
      rangeHighlightBoxes(range, canvasRect, activeSearchMatch.id).map((box) =>
        Object.assign(box, {
          annotationId: '__search__',
          contributorId: '__search__',
          color: '#d7a93f',
        }),
      ),
    );
  }, [activeSearchMatch, searchOpen]);

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
    const updateProgress = () => {
      setReadingProgress(webReaderProgress(scrollElement));
    };
    const scheduleSave = () => {
      updateProgress();
      if (saveTimer !== undefined) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(saveProgress, 450);
    };

    const initialFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        updateProgress();
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
    const selectedArticleText = currentArticleText();
    const start = offsetFromArticleStart(articleElement, range.startContainer, range.startOffset);
    const end = offsetFromArticleStart(articleElement, range.endContainer, range.endOffset);
    const anchor = article.ebook?.index
      ? createEpubTextAnchor(article.ebook.index, selectedArticleText, start, end)
      : createTextAnchor(selectedArticleText, start, end);
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
    markAnnotationCreated(annotation.id);
    openAnnotation(annotation.id);
  }

  function askSelection(action: { anchor: Annotation['anchor'] }) {
    readerChat.askSelection(readerQuestionContext(action.anchor));
    clearSelection();
  }

  function readerQuestionContext(anchor: Annotation['anchor']): ReaderQuestionContext {
    return {
      sourceType: article.sourceType || 'web',
      quote: anchor.exact,
      title: article.title,
      anchor,
      nearbyText: currentArticleText().slice(
        Math.max(0, anchor.start - 500),
        Math.min(currentArticleText().length, anchor.end + 500),
      ),
    };
  }

  function revealReaderChatContext(context: ReaderQuestionContext) {
    const anchor = context.anchor;
    const articleElement = articleRef.current;
    const scrollElement = scrollRef.current;
    if (!anchor || !articleElement || !scrollElement) return;

    const position = resolveTextAnchor(articleElement.textContent || '', anchor);
    if (!position) return;

    const range = rangeFromOffsets(articleElement, position.start, position.end);
    if (!range) return;

    scrollReaderSurfaceToRect(scrollElement, range.getBoundingClientRect(), 48);
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

  function closeSearch() {
    setSearchOpen(false);
    setSearchBoxes([]);
  }

  function navigateSearchMatch(direction: 'previous' | 'next') {
    const total = searchResult.matches.length;
    if (total === 0) return;
    setActiveSearchMatchIndex((index) =>
      direction === 'next' ? (index + 1) % total : (index - 1 + total) % total,
    );
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
  const shortcutModifier = getShortcutModifier();
  const sendShortcut = normalizeMessageSendShortcut(messageSendShortcut);
  const actionShortcuts = useMemo(
    () => normalizeSelectionActionShortcuts(selectionActionShortcuts),
    [selectionActionShortcuts],
  );
  const labels = readerUiLabels();

  return (
    <section className="source-bookcase source-reader-shell">
      <style>
        {`${readerStyles}\n${readerConversationStyles}\n${readerDesktopEmbeddedStyles}\n${sourceReaderTocStyles}`}
      </style>
      <ReaderAppView
        actions={{
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
            onOpenAnnotationDiscussion: (annotationId, sourceRect) =>
              void onOpenAnnotationDiscussion?.(article.id, annotationId, sourceRect),
            onResolveAnnotationNavigation: resolveAnnotationNavigation,
            onScrollToHighlight: (annotationId) => {
              openAnnotation(annotationId);
              scrollToAnnotation(annotationId);
            },
          },
          chat: { ...readerChat.actions, onRevealContext: revealReaderChatContext },
          selection: {
            onCancelComposer: cancelComposer,
            onClearSelection: clearSelection,
            onCloseHighlightChoice: () => setHighlightChoice(null),
            onCopySelection: copySelection,
            onMouseUp: handleArticleMouseUp,
            onAskSelection: askSelection,
            onOpenComposer: openComposer,
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
        }}
        agents={{
          agents: annotationAgents,
          completionBurstKey,
          dockCompleting: agentDockCompleting,
          dockItems: agentDockItems,
          pendingAnnotationAgents,
          reviewAgents,
          theaterBoxes: agentTheaterBoxes,
          virtualCursors,
        }}
        annotations={{
          activeConnection,
          activeId: selectedAnnotationId,
          annotationTotals,
          annotations,
          boxes,
          commentsCloseKey,
          distillationAnimation,
          filteredAnnotations: annotations,
          newAnnotationIds,
          searchBoxes,
          temporaryBoxes,
        }}
        article={{
          content: (
            <div
              className="reader-article-body"
              dangerouslySetInnerHTML={{ __html: contentHtml }}
              onClick={handleArticleClick}
            />
          ),
          extracted: readerArticle,
          id: article.id,
        }}
        chat={readerChat.model}
        labels={labels}
        options={{ embedded: true }}
        refs={{
          articleRef,
          canvasRef,
          noteRefs,
          notesRef: railRef,
          surfaceRef: scrollRef,
        }}
        selection={{ composer, highlightChoice, selectionAction }}
        settings={{
          messageSendShortcut: sendShortcut,
          readerSettings,
          selectionActionShortcuts: actionShortcuts,
          settingsOpen: false,
          shortcutModifier,
          showSettings: false,
        }}
        toc={{
          annotationStats: tocStats,
          items: tocItems,
          open: tocOpen,
        }}
        toolbar={{
          articleAction: <OpenArticleButton article={article} iconOnly />,
          controls: (
            <ReaderSettingsToolbarControls
              labels={{ articleWidth: labels.articleWidth, fontSize: labels.fontSize }}
              settings={readerSettings}
              onChange={updateReaderSettings}
            />
          ),
          search: {
            activeMatchIndex: activeSearchMatchIndex,
            limited: searchResult.limited,
            matches: searchResult.matches,
            open: searchOpen,
            query: searchQuery,
            onClose: closeSearch,
            onNextMatch: () => navigateSearchMatch('next'),
            onOpen: () => setSearchOpen(true),
            onPreviousMatch: () => navigateSearchMatch('previous'),
            onQueryChange: setSearchQuery,
          },
          headerMeta: {
            title: article.title,
            byline: article.byline,
            hasCover: Boolean(article.leadImageUrl),
          },
          readingProgress,
        }}
        userProfile={userProfile}
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
