import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import type React from 'react';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Annotation, ReaderQuestionContext } from '@yomitomo/shared';
import {
  activeTocIndexForOffset,
  annotationIdsAtHighlightPoint,
  createEpubTextAnchor,
  type TocItem,
} from '@yomitomo/core';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import { buildTocAnnotationStats } from '@yomitomo/reader-ui/reader-annotations';
import { ReaderTooltip } from '@yomitomo/reader-ui/reader-component-primitives';
import { ReaderSettingsToolbarControls } from '@yomitomo/reader-ui/reader-toolbar-controls';
import {
  ebookHighlightAnnotationsSignature,
  type EbookBoxUpdateReason,
} from './ebook-annotation-layout';
import { ebookHasStableSectionChapterMapping, ebookTocItemsForReader } from './ebook-content';
import {
  formatEbookPageLabel,
  isEbookPageNavigationReady,
  isEbookPaginationReady,
  recordEbookPageTurnTrace,
  type EbookPageTurnTrace,
  type FoliateViewElement,
} from './ebook-foliate-view';
import { ebookArticleText } from './ebook-text-anchor';
import { EbookReaderShell } from './app-source-ebook-reader-shell';
import type { EbookBookcaseProps } from '../bookcase/source-bookcase-types';
import { useEbookFoliateView } from './use-ebook-foliate-view';
import { useEbookBilingualTranslation } from './use-ebook-bilingual-translation';
import { useEbookReaderBoxes } from './use-ebook-reader-boxes';
import { useFoliateInputBridge } from './use-foliate-input-bridge';
import { useEbookSelection } from './use-ebook-selection';
import { useEbookAnnotationNavigation } from './use-ebook-annotation-navigation';
import {
  useReaderPageTurnKeys,
  type ReaderPageTurnDirection,
} from '../../shell/use-reader-page-turn-keys';
import { ArticleBook } from '../../shell/app-article-book';
import { articleDisplayTitle } from '../../reading-library/app-reading-library-utils';
import { saveAssistantArticleText } from '../bookcase/assistant-article-text';
import { useAssistantPassageReveal } from '../bookcase/use-assistant-passage-reveal';
import { useSourceReaderApp } from '../bookcase/use-source-reader-app';
import { useSourceReaderAppView } from '../bookcase/use-source-reader-app-view';
import { useEbookSpreadLayout } from './use-ebook-spread-layout';

export function EbookBookcase(props: EbookBookcaseProps) {
  return <EbookReader key={props.content.article.id} {...props} />;
}

function EbookReader({
  annotationActions: { onArticleChange, onFocusedAnnotation, onOpenAnnotation },
  articleActions,
  content: { agents, annotations: articleAnnotations, article, userProfile },
  presentation: {
    distillationAnimation,
    messageSendShortcut,
    readerTheme,
    settings,
    selectionActionShortcuts,
    uiLanguage,
  },
  readerControl: { focusAnnotationId, onClose, onOpenEvidenceSource, selectedAnnotationId },
}: EbookBookcaseProps) {
  const { saveArticleReadingProgress } = articleActions;
  const { t } = useTranslation();
  const pageTurnTraceRef = useRef<EbookPageTurnTrace | null>(null);
  // Box layout is created after the foliate view it measures, so earlier hooks reach it lazily.
  const boxUpdateRequested = useStableCallback((reason: EbookBoxUpdateReason) =>
    readerBoxes.scheduleEbookBoxUpdate(reason),
  );
  const scheduleEbookBoxUpdate = useCallback((reason: EbookBoxUpdateReason) => {
    boxUpdateRequested(reason);
  }, []);
  const beforeEbookPageTurn = (trace: EbookPageTurnTrace) => {
    clearAnnotationUiState();
    readerBoxes.hideEbookBoxLayer();
    recordEbookPageTurnTrace(trace, 'overlay_hide_requested', {
      boxCount: boxes.length,
      pageAnnotationCount: pageAnnotations.length,
    });
  };
  const attachFoliateDocumentListeners = (view: FoliateViewElement | null) => {
    inputBridge.attachFoliateDocumentListeners(view);
    ebookTranslation.attachFoliateDocument(view);
  };
  const cleanupFoliateDocumentListeners = () => {
    inputBridge.cleanupFoliateDocumentListeners();
    ebookTranslation.cleanupFoliateDocument();
  };
  const sourceReaderApp = useSourceReaderApp({
    articleActions,
    onOpenEvidenceSource,
    beforeOpenAnnotation,
    messageSendShortcut,
    selectionActionShortcuts,
    settings,
    session: {
      agents,
      annotations: articleAnnotations,
      article,
      onArticleChange,
      clearPendingOnArticleChange: true,
      clearPendingOnDeleteAnnotation: true,
      uiLanguage,
      onAnnotationsApplied: ({ previousAnnotations, nextAnnotations }) => {
        const previousHighlightSignature = ebookHighlightAnnotationsSignature(
          previousAnnotations,
          userProfile,
          sourceReaderSession.annotationAgents,
        );
        const nextHighlightSignature = ebookHighlightAnnotationsSignature(
          nextAnnotations,
          userProfile,
          sourceReaderSession.annotationAgents,
        );
        if (nextHighlightSignature !== previousHighlightSignature) {
          scheduleEbookBoxUpdate('annotations_applied');
        }
      },
      onAnnotationsSaved: ({ previousAnnotations, nextAnnotations }) => {
        const previousHighlightSignature = ebookHighlightAnnotationsSignature(
          previousAnnotations,
          userProfile,
          sourceReaderSession.annotationAgents,
        );
        const nextHighlightSignature = ebookHighlightAnnotationsSignature(
          nextAnnotations,
          userProfile,
          sourceReaderSession.annotationAgents,
        );
        if (nextHighlightSignature !== previousHighlightSignature) {
          scheduleEbookBoxUpdate('annotations_saved');
        }
      },
      onOpenAnnotation,
      userProfile,
    },
  });
  const {
    canvasRef,
    handleRef: readerSurfaceRef,
    viewportRef: surfaceRef,
  } = sourceReaderApp.surface;
  const {
    askSelection,
    closeSettings,
    closeToc,
    newAnnotationIds,
    openAnnotation,
    session: sourceReaderSession,
    setStatusMessage,
    statusMessage,
    workspace: sourceReaderWorkspace,
  } = sourceReaderApp;
  const { annotations, annotationsRef, annotationAgents } = sourceReaderSession;

  const {
    actionShortcuts,
    labels,
    readerSettings,
    selection,
    updateReaderSettings: updateEbookReaderSettings,
  } = sourceReaderWorkspace;
  const {
    temporaryBoxes,
    setHighlightChoice,
    selectionAction,
    composer,
    clearSelection,
    clearAnnotationUiState,
    openSelectionAction,
    setSelectionAction,
    setTemporaryBoxes,
    requestSelectionCopy,
    openComposer,
  } = selection;
  const { ebook } = article;
  const ebookText = useMemo(() => ebookArticleText(ebook.chapters), [ebook.chapters]);
  useMountEffect(() => {
    const sections = (ebook.index?.chapters ?? []).map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      start: chapter.textStart,
      end: chapter.textEnd,
    }));
    saveAssistantArticleText(article.id, { text: ebookText, sections });
  });
  const articleAnnotationSignature = useMemo(
    () => ebookHighlightAnnotationsSignature(articleAnnotations, userProfile, annotationAgents),
    [annotationAgents, articleAnnotations, userProfile],
  );
  const appliedAnnotationSignatureRef = useRef(articleAnnotationSignature);
  const readArticleAnnotationSignature = useStableCallback(() => articleAnnotationSignature);
  const applyAnnotationSignature = useCallback(
    (marker: HTMLElement | null) => {
      const signature = readArticleAnnotationSignature();
      if (!marker || appliedAnnotationSignatureRef.current === signature) return;
      appliedAnnotationSignatureRef.current = signature;
      scheduleEbookBoxUpdate('annotations_applied');
    },
    [scheduleEbookBoxUpdate],
  );
  const spreadLayout = useEbookSpreadLayout({
    articleId: article.id,
    canvasRef,
    contentWidth: readerSettings.contentWidth,
    surfaceRef,
  });
  const foliateView = useEbookFoliateView({
    article,
    maxColumnCount: spreadLayout.columns,
    readerTheme,
    readerSettings,
    onSaveArticleReadingProgress: saveArticleReadingProgress,
    onAttachFoliateDocumentListeners: attachFoliateDocumentListeners,
    onBeforePageTurn: beforeEbookPageTurn,
    onCleanupFoliateDocumentListeners: cleanupFoliateDocumentListeners,
    onScheduleEbookBoxUpdate: scheduleEbookBoxUpdate,
    pageTurnTraceRef,
  });
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
    openSettled,
    goLeft,
    goRight,
    goToProgress,
    goToTocItem,
  } = foliateView;
  const ebookTranslation = useEbookBilingualTranslation({
    article,
    style: settings?.bilingualTranslationStyle || 'dashedLine',
    targetLanguage: settings?.bilingualTranslationTargetLanguage,
    onLayoutChange: () => scheduleEbookBoxUpdate('translation'),
  });
  const turnPageFromKeyboard = useCallback(
    (direction: ReaderPageTurnDirection) => {
      if (direction === 'left') goLeft();
      else goRight();
    },
    [goLeft, goRight],
  );
  const {
    finishEbookSelectionAdjustment,
    handleFoliateSelection,
    handleFoliateSelectionShortcut,
    startEbookSelectionAdjustment,
    updateEbookSelectionAdjustment,
  } = useEbookSelection({
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
    askSelection: (action) => askSelection(action, readerQuestionContext),
    requestSelectionCopy,
    openComposer,
    openSelectionAction,
    setSelectionAction,
    setTemporaryBoxes,
    setStatusMessage,
  });
  useReaderPageTurnKeys({
    enabled: readerState.status === 'ready',
    onTurnPage: turnPageFromKeyboard,
  });
  const inputBridge = useFoliateInputBridge({
    canvasRef,
    readerStateStatus: readerState.status,
    viewRef,
    onFoliateClick: handleFoliateClick,
    onFoliatePointerDown: handleFoliatePointerDown,
    onFoliatePageTurnClick: turnPageFromKeyboard,
    onFoliatePageTurnKey: turnPageFromKeyboard,
    onFoliateSelection: handleFoliateSelection,
    onFoliateSelectionShortcut: handleFoliateSelectionShortcut,
  });
  const readerBoxes = useEbookReaderBoxes({
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
  });
  const { boxes } = readerBoxes;
  const ebookNavigation = useEbookAnnotationNavigation({
    annotations,
    annotationsRef,
    article,
    boxes,
    canvasRef,
    ebookText,
    focusAnnotationId,
    onFocusedAnnotation,
    openAnnotation,
    openSettled,
    pageInfo,
    scheduleEbookBoxUpdate,
    viewRef,
  });
  useAssistantPassageReveal(article.id, (start, end) => {
    if (!ebook.index) return;
    const anchor = createEpubTextAnchor(ebook.index, ebookText, start, end);
    void ebookNavigation.goToEbookAnchor('reader-chat-context', anchor);
  });
  const readerTocItems = useMemo(
    () => ebookTocItemsForReader(tocItems, { ebook }),
    [ebook, tocItems],
  );
  const activeTocIndex = useMemo(() => {
    const textLength = article.ebook.index?.textLength ?? 0;
    if (textLength <= 0) return null;
    return activeTocIndexForOffset(readerTocItems, progress * textLength);
  }, [article.ebook.index?.textLength, progress, readerTocItems]);
  const tocStats = useMemo(
    () => buildTocAnnotationStats(readerTocItems, annotations, userProfile, annotationAgents),
    [annotationAgents, annotations, readerTocItems, userProfile],
  );
  function goToReaderTocItem(item: TocItem) {
    const tocItem = tocItems[item.index];
    if (!tocItem) return;
    closeToc();
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
    closeSettings();
    if (selectedAnnotationId) onOpenAnnotation(null);
  }

  function beforeOpenAnnotation() {
    sourceReaderApp.workspace.selection.clearAnnotationUiState();
  }

  function readerQuestionContext(anchor: Annotation['anchor']): ReaderQuestionContext {
    const chapter = anchor.chapterId
      ? article.ebook.index?.chapters.find((item) => item.id === anchor.chapterId)
      : null;
    return {
      sourceType: 'ebook',
      quote: anchor.exact,
      title: article.title,
      locationLabel: chapter?.title,
      anchor,
      nearbyText: ebookText.slice(
        Math.max(0, (anchor.textStartInBook ?? anchor.start) - 500),
        Math.min(ebookText.length, (anchor.textEndInBook ?? anchor.end) + 500),
      ),
    };
  }

  async function revealReaderChatContext(context: ReaderQuestionContext) {
    if (!context.anchor) return;
    await ebookNavigation.goToEbookAnchor('reader-chat-context', context.anchor);
  }

  function handleHighlightClick(
    annotationId: string,
    event: React.MouseEvent<HTMLButtonElement>,
    visibleAnnotationIds: string[],
  ) {
    openHighlightAtClientPoint(event.clientX, event.clientY, visibleAnnotationIds, annotationId);
  }

  function handleFoliateClick(event: MouseEvent, doc: Document) {
    const docSelection = doc.getSelection();
    if (docSelection && docSelection.rangeCount > 0 && !docSelection.isCollapsed) return false;

    const frame = doc.defaultView?.frameElement;
    if (!(frame instanceof HTMLIFrameElement)) return false;

    const frameRect = frame.getBoundingClientRect();
    return openHighlightAtClientPoint(
      frameRect.left + event.clientX,
      frameRect.top + event.clientY,
    );
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
            1,
          );
    if (annotationIds.length === 0) return false;

    if (annotationIds.length <= 1) {
      const annotationId = annotationIds[0] || fallbackAnnotationId;
      if (!annotationId) return false;
      openAnnotation(annotationId);
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

  const progressPercent = Math.round(progress * 100);
  const pageNavigationReady = isEbookPageNavigationReady(pageInfo);
  const paginationReady = isEbookPaginationReady(pageInfo, sectionPageCounts);
  const pageLabel = paginationReady ? formatEbookPageLabel(pageInfo, sectionPageCounts) : '';
  const progressTickId = `ebook-progress-ticks-${article.id}`;
  const readerArticle = {
    title: articleDisplayTitle(article),
    byline: article.byline || article.ebook.metadata.fileName,
    excerpt: statusMessage,
    content: '',
  };
  const pageAnnotations = useMemo(() => {
    const visibleIds = new Set(boxes.map((box) => box.annotationId).filter(Boolean));
    return annotations.filter((annotation) => visibleIds.has(annotation.id));
  }, [annotations, boxes]);
  const supportsAnnotationNavigation = ebookHasStableSectionChapterMapping(article);
  const { viewProps: readerAppViewProps } = useSourceReaderAppView({
    app: sourceReaderApp,
    adapter: {
      navigation: {
        onNavigateAnnotation: supportsAnnotationNavigation
          ? ebookNavigation.navigateAnnotation
          : undefined,
        onResolveAnnotationNavigation: supportsAnnotationNavigation
          ? ebookNavigation.resolveAnnotationNavigation
          : undefined,
        onScrollToHighlight: ebookNavigation.focusPageAnnotation,
        onScrollToHeading: goToReaderTocItem,
      },
      onHighlightClick: handleHighlightClick,
      onRevealReaderChatContext: revealReaderChatContext,
      questionContext: readerQuestionContext,
      search: {
        revealSearchMatch: ebookNavigation.revealSearchMatch,
        text: ebookText,
      },
      selection: {
        onMouseUp: () => undefined,
        onSelectionHandleDrag: updateEbookSelectionAdjustment,
        onSelectionHandleDragEnd: finishEbookSelectionAdjustment,
        onSelectionHandleDragStart: startEbookSelectionAdjustment,
      },
    },
    annotations: {
      activeId: selectedAnnotationId,
      annotations: pageAnnotations,
      boxes,
      distillationAnimation,
      filteredAnnotations: annotations,
      newAnnotationIds,
      railLayoutOverride: spreadLayout.columns === 2 ? spreadLayout.railLayout : undefined,
      showEmptyNotes: annotations.length === 0,
      temporaryBoxes,
    },
    article: {
      extracted: readerArticle,
      id: article.id,
    },
    shell: { onClose },
    toc: {
      activeIndex: activeTocIndex,
      annotationStats: tocStats,
      items: readerTocItems,
    },
    toolbar: {
      articleLeadingVisual: (
        <span className="ebook-toolbar-cover">
          <ArticleBook article={article} />
        </span>
      ),
      controls: (
        <>
          <div
            className={
              paginationReady
                ? 'reader-floating-control-group'
                : 'reader-floating-control-group is-paginating'
            }
          >
            <ReaderTooltip content={t('readerControls.previousPage')} side="bottom">
              <button
                className="reader-icon-button"
                type="button"
                aria-label={t('readerControls.previousPage')}
                disabled={readerState.status !== 'ready' || !pageNavigationReady}
                onClick={goLeft}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={17} />
              </button>
            </ReaderTooltip>
            <span
              className={
                paginationReady
                  ? 'reader-floating-value is-wide'
                  : 'reader-floating-value is-wide is-paginating'
              }
              aria-busy={!paginationReady}
            >
              {pageLabel}
            </span>
            <input
              aria-label={t('readerControls.jumpEbookProgress')}
              className="ebook-progress-slider reader-floating-slider"
              disabled={readerState.status !== 'ready'}
              list={sectionFractions.length > 0 ? progressTickId : undefined}
              max="1"
              min="0"
              step="any"
              style={{ '--ebook-progress-percent': `${progressPercent}%` } as React.CSSProperties}
              type="range"
              value={progress}
              onChange={goToProgress}
            />
            <ReaderTooltip content={t('readerControls.nextPage')} side="bottom">
              <button
                className="reader-icon-button"
                type="button"
                aria-label={t('readerControls.nextPage')}
                disabled={readerState.status !== 'ready' || !pageNavigationReady}
                onClick={goRight}
              >
                <HugeiconsIcon icon={ArrowRight01Icon} size={17} />
              </button>
            </ReaderTooltip>
            {sectionFractions.length > 0 ? (
              <datalist id={progressTickId}>
                {sectionFractions.map((fraction, index) => (
                  <option value={fraction} key={`${index}-${fraction}`} />
                ))}
              </datalist>
            ) : null}
          </div>
          {ebookTranslation.toolbar}
          <ReaderSettingsToolbarControls
            labels={{ articleWidth: labels.articleWidth, fontSize: labels.fontSize }}
            settings={readerSettings}
            onChange={updateEbookReaderSettings}
          />
        </>
      ),
      headerMeta: {
        title: articleDisplayTitle(article),
        byline: article.byline || article.ebook.metadata.fileName,
        hasCover: true,
      },
      readingProgress: progress,
    },
    userProfile,
  });

  return (
    <>
      <EbookReaderShell
        isSpread={spreadLayout.columns === 2}
        measureHostRef={measureHostRef}
        readerApp={readerAppViewProps}
        readerSurfaceRef={readerSurfaceRef}
        readerState={readerState}
        viewHostRef={viewHostRef}
        onReaderKeyDown={handleReaderKeyDown}
      />
      {spreadLayout.marker}
      {foliateView.markers}
      {inputBridge.marker}
      {readerBoxes.markers}
      {ebookTranslation.marker}
      <span hidden key={articleAnnotationSignature} ref={applyAnnotationSignature} />
      {ebookNavigation.focusMarker}
      {ebookTranslation.dialog}
    </>
  );
}
