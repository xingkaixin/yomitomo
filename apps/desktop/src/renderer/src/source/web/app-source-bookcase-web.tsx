import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Annotation, ReaderQuestionContext } from '@yomitomo/shared';
import { resolveTextAnchor } from '@yomitomo/shared';
import {
  annotationIdsAtHighlightPoint,
  findCurrentTocTarget,
  rangeHighlightBoxes,
  rangeForTranslationTextAnchor,
  rangeFromOffsetsIgnoringSelector,
  scrollReaderSurfaceToRect,
  sourceTextContent,
  textForTranslationAnchor,
  type TocItem,
} from '@yomitomo/core';
import {
  ReaderAppView,
  type AnnotationNavigationDirection,
} from '@yomitomo/reader-ui/reader-app-view';
import { ReaderSettingsToolbarControls } from '@yomitomo/reader-ui/reader-toolbar-controls';
import { getDesktopApi } from '../../shell/app-desktop-api';
import { readerDesktopEmbeddedBundleStyles } from '@yomitomo/reader-ui/reader-styles';
import {
  buildTocAnnotationStats,
  readerAnnotationScrollTop,
} from '@yomitomo/reader-ui/reader-annotations';
import { useAgentAnnotationQueue } from '@yomitomo/reader-ui/use-agent-annotation-queue';
import { OpenArticleButton } from '../../shell/app-ui';
import { articleIdentityLine } from '../../shell/app-article-presentation';
import type { WebSourceBookcaseProps } from '../bookcase/source-bookcase-types';
import { sourceTocOptions, useWebReaderBoxes } from './use-web-reader-boxes';
import {
  articleLinkExternalUrl,
  sourceArticleBodyHtml,
  sourceReaderTocStyles,
  webAnnotationNavigationState,
} from './app-source-bookcase-web-utils';
import { createWebSourceReaderController } from './app-source-bookcase-web-controller';
import { useSourceReaderApp } from '../bookcase/use-source-reader-app';
import { useSourceReaderAppView } from '../bookcase/use-source-reader-app-view';
import { useWebAnnotationRailDiagnostics } from './use-web-annotation-rail-diagnostics';
import { useWebBilingualTranslation } from './use-web-bilingual-translation';
import { useWebReaderSelection } from './use-web-reader-selection';
import { useWebActiveTocIndex } from './use-web-active-toc-index';
import { useWebReadingProgress } from './use-web-reading-progress';
import { useWebAnnotationFocus } from './use-web-annotation-focus';

const WEB_HIGHLIGHT_HIT_PADDING = 8;

export function WebSourceBookcase({
  annotationActions: { onArticleChange, onFocusedAnnotation, onOpenAnnotation },
  articleActions,
  content: { agents, annotations: articleAnnotations, article, userProfile },
  presentation: {
    distillationAnimation,
    messageSendShortcut,
    settings,
    selectionActionShortcuts,
    uiLanguage,
  },
  readerControl: { focusAnnotationId, onClose, onOpenEvidenceSource, selectedAnnotationId },
}: WebSourceBookcaseProps) {
  const { mergeArticleAgentAnnotation, saveArticleReadingProgress } = articleActions;
  const sourceReaderApp = useSourceReaderApp({
    articleActions,
    beforeOpenAnnotation,
    getArticleText: currentArticleText,
    messageSendShortcut,
    onOpenEvidenceSource,
    settings,
    selectionActionShortcuts,
    session: {
      agents,
      annotations: articleAnnotations,
      article,
      onArticleChange,
      clearPendingOnArticleChange: true,
      clearPendingOnDeleteAnnotation: true,
      uiLanguage,
      onOpenAnnotation,
      userProfile,
    },
  });
  const {
    isCurrentArticle,
    newAnnotationIds,
    openAnnotation,
    session: sourceReaderSession,
    setStatusMessage,
    statusMessage,
    surface: {
      articleRef,
      canvasRef,
      handleRef: readerSurfaceRef,
      railRef,
      viewportRef: scrollRef,
    },
    workspace: sourceReaderWorkspace,
  } = sourceReaderApp;
  const readingProgress = useWebReadingProgress({
    articleId: article.id,
    initialProgress: article.readingProgress,
    onSaveArticleReadingProgress: saveArticleReadingProgress,
    scrollRef,
  });
  const { annotations, annotationsRef, annotationAgents, deleteAnnotation, saveAnnotation } =
    sourceReaderSession;
  const [articleSearchText, setArticleSearchText] = useState('');
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
  const { boxes, tocItems } = useWebReaderBoxes({
    annotationAgents,
    annotations,
    article,
    articleRef,
    canvasRef,
    contentHtml: translatedContentHtml,
    userProfile,
  });
  const activeTocIndex = useWebActiveTocIndex({
    articleRef,
    contentVersion: translatedContentHtml,
    scrollRef,
    tocItems,
  });
  useWebAnnotationRailDiagnostics({
    articleId: article.id,
    boxes,
    canvasRef,
    railRef,
    scrollRef,
    selectedAnnotationId,
  });
  const tocStats = useMemo(
    () => buildTocAnnotationStats(tocItems, annotations, userProfile, annotationAgents),
    [annotationAgents, annotations, tocItems, userProfile],
  );

  const {
    agentDockCompleting,
    agentDockItems,
    agentTheaterBoxes,
    annotatingAgents: annotatingAgentIds,
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

  const { labels, readerSettings, selection, updateReaderSettings } = sourceReaderWorkspace;
  const { temporaryBoxes, setHighlightChoice, clearAnnotationUiState } = selection;
  const webReaderSelection = useWebReaderSelection({
    article,
    articleRef,
    canvasRef,
    getArticleText: currentArticleText,
    scrollRef,
    selection,
    translation: bilingualTranslation,
    userProfile,
  });

  useEffect(() => {
    return sourceReaderSession.registerAgentAnnotationAdapter(
      createWebSourceReaderController({
        currentArticleText,
        enqueueAgentAnnotation,
        finishVirtualReading,
        finishVirtualReadingIfIdle,
        isAgentAnnotating: (agentId) => annotatingAgentIds.includes(agentId),
        isCurrentArticle,
        markAgentAnnotating,
        markVirtualReadingDone,
        onMergeArticleAgentAnnotation: mergeArticleAgentAnnotation,
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
    setStatusMessage('');
    setArticleSearchText('');
  }, [article?.id]);

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
  useWebAnnotationFocus({
    annotationsRef,
    articleId: article.id,
    boxCount: boxes.length,
    focusAnnotationId,
    onFocusedAnnotation,
    scrollRef,
    scrollToAnnotation,
  });

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

  function currentArticleText() {
    return articleRef.current ? sourceTextContent(articleRef.current) : '';
  }

  function beforeOpenAnnotation() {
    sourceReaderApp.workspace.selection.clearAnnotationUiState();
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
    void getDesktopApi().app.openUrl(url);
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

  function observeClearSelection() {
    webReaderSelection.diagnostics.logCurrent('selection:clear-ui');
  }

  function observeCancelComposer() {
    webReaderSelection.diagnostics.logCurrent('composer:cancel');
  }

  function observeOpenComposer(action: { anchor: Annotation['anchor']; x: number; y: number }) {
    webReaderSelection.diagnostics.logAnchor('selection:open-composer', action.anchor, () => ({
      position: { x: action.x, y: action.y },
    }));
  }

  function readerQuestionContext(anchor: Annotation['anchor']): ReaderQuestionContext {
    const contextText =
      anchor.segmentId && articleRef.current
        ? textForTranslationAnchor(articleRef.current, anchor)
        : currentArticleText();
    return {
      sourceType: article.sourceType,
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
    sourceReaderApp.closeToc();
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

  const revealWebSearchMatch = useCallback((match: { id: string; start: number; end: number }) => {
    const articleElement = articleRef.current;
    const canvasElement = canvasRef.current;
    const scrollElement = scrollRef.current;
    if (!articleElement || !canvasElement || !scrollElement) return [];

    const range = rangeFromOffsetsIgnoringSelector(
      articleElement,
      match.start,
      match.end,
      '[data-reader-translation]',
    );
    if (!range) return [];

    const rect = range.getClientRects()[0];
    if (rect) scrollReaderSurfaceToRect(scrollElement, rect, 82);
    return rangeHighlightBoxes(range, canvasElement.getBoundingClientRect(), match.id);
  }, []);

  const readerArticle = {
    title: article.title,
    byline: articleIdentityLine(article),
    excerpt: statusMessage,
    content: contentHtml,
  };
  const { searchOpen, viewProps: readerAppViewProps } = useSourceReaderAppView({
    app: sourceReaderApp,
    adapter: {
      lifecycle: {
        onAskSelection: (anchor) =>
          webReaderSelection.diagnostics.logAnchor('selection:ask', anchor),
        onBeforeCreateAnnotation: (note, anchor) =>
          webReaderSelection.diagnostics.logAnchor('composer:create-annotation', anchor, () => ({
            noteLength: note.length,
          })),
        onCancelComposer: observeCancelComposer,
        onClearSelection: observeClearSelection,
        onOpenComposer: observeOpenComposer,
      },
      navigation: {
        onNavigateAnnotation: navigateAnnotation,
        onResolveAnnotationNavigation: resolveAnnotationNavigation,
        onScrollToHighlight: (annotationId) => {
          openAnnotation(annotationId);
          scrollToAnnotation(annotationId);
        },
        onScrollToHeading: scrollToTocItem,
      },
      onHighlightClick: handleHighlightClick,
      onRevealReaderChatContext: revealReaderChatContext,
      questionContext: readerQuestionContext,
      search: {
        revealSearchMatch: revealWebSearchMatch,
        text: articleSearchText,
      },
      selection: {
        onMouseUp: webReaderSelection.actions.onMouseUp,
        onSelectionHandleDrag: webReaderSelection.actions.onSelectionHandleDrag,
        onSelectionHandleDragEnd: webReaderSelection.actions.onSelectionHandleDragEnd,
        onSelectionHandleDragStart: webReaderSelection.actions.onSelectionHandleDragStart,
      },
    },
    agentPlayback: {
      dockCompleting: agentDockCompleting,
      dockItems: agentDockItems,
      theaterBoxes: agentTheaterBoxes,
      virtualCursors,
    },
    annotations: {
      activeId: selectedAnnotationId,
      annotations,
      boxes,
      distillationAnimation,
      filteredAnnotations: annotations,
      newAnnotationIds,
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
          onMouseDown={webReaderSelection.actions.onMouseDown}
        />
      ),
      extracted: readerArticle,
      id: article.id,
    },
    shell: { onClose },
    toc: {
      activeIndex: activeTocIndex,
      annotationStats: tocStats,
      items: tocItems,
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
      headerMeta: {
        title: article.title,
        byline: article.byline,
        hasCover: Boolean(article.leadImageUrl),
      },
      readingProgress,
    },
    userProfile,
  });
  useEffect(() => {
    if (!searchOpen) {
      setArticleSearchText('');
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setArticleSearchText(articleRef.current ? sourceTextContent(articleRef.current) : '');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [article.id, searchOpen, translatedContentHtml]);
  return (
    <section className="source-bookcase source-reader-shell">
      <style>{`${readerDesktopEmbeddedBundleStyles}\n${sourceReaderTocStyles}`}</style>
      <ReaderAppView {...readerAppViewProps} ref={readerSurfaceRef} />
      {bilingualTranslation.dialog}
    </section>
  );
}
