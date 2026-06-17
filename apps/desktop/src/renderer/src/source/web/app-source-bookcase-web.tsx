import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Languages, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  Annotation,
  ArticleReadingProgress,
  ArticleTranslation,
  ReaderQuestionContext,
} from '@yomitomo/shared';
import { createTextAnchor, resolveTextAnchor } from '@yomitomo/shared';
import {
  annotationIdsAtHighlightPoint,
  articleHtmlWithBilingualTranslation,
  createTranslationTextAnchor,
  createEpubTextAnchor,
  findCurrentTocTarget,
  findReaderSearchMatches,
  getArticleSelection,
  type HighlightBox,
  isRangeInsideArticle,
  offsetFromArticleStartIgnoringSelector,
  rangeHighlightBoxes,
  rangeForTranslationTextAnchor,
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
} from '@yomitomo/reader-ui/reader-app-view';
import { ReaderTooltip } from '@yomitomo/reader-ui/reader-component-primitives';
import { ReaderSettingsToolbarControls } from '@yomitomo/reader-ui/reader-toolbar-controls';
import {
  readerConversationStyles,
  readerDesktopEmbeddedStyles,
  readerStyles,
} from '@yomitomo/reader-ui/reader-styles';
import {
  buildTocAnnotationStats,
  readerAnnotationScrollTop,
} from '@yomitomo/reader-ui/reader-annotations';
import { useAgentAnnotationQueue } from '@yomitomo/reader-ui/use-agent-annotation-queue';
import { OpenArticleButton } from '../../shell/app-ui';
import { articleIdentityLine } from '../../shell/app-utils';
import { appToast } from '../../shell/app-toast';
import { assistantRuntimeErrorMessage } from '../../shell/app-assistant-runtime-progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../../components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import {
  defaultTocOpen,
  usesOverlayToc,
  type WebSourceBookcaseProps,
} from '../bookcase/app-source-bookcase-shared';
import { useSourceActiveConnection } from '../bookcase/use-source-active-connection';
import { useRecentAnnotationFeedback } from '../bookcase/use-recent-annotation-feedback';
import { sourceTocOptions, useWebReaderBoxes } from './use-web-reader-boxes';
import {
  articleLinkExternalUrl,
  sourceArticleBodyHtml,
  sourceReaderTocStyles,
  webAnnotationNavigationState,
} from './app-source-bookcase-web-utils';
import { useSourceReaderSession } from '../bookcase/use-source-reader-session';
import { createWebSourceReaderController } from './app-source-bookcase-web-controller';
import { useSourceReaderWorkspace } from '../bookcase/use-source-reader-workspace';

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
  const [activeTocIndex, setActiveTocIndex] = useState<number | null>(null);
  const sourceReaderSession = useSourceReaderSession({
    agents,
    agentAnnotationAdapter: createWebSourceReaderController({
      applyAnnotations: (nextAnnotations) => sourceReaderSession.applyAnnotations(nextAnnotations),
      currentArticleText,
      enqueueAgentAnnotation: (annotation) => enqueueAgentAnnotation(annotation),
      finishVirtualReading: (agentId, message) => finishVirtualReading(agentId, message),
      finishVirtualReadingIfIdle: (agentId) => finishVirtualReadingIfIdle(agentId),
      getAnnotations: () => sourceReaderSession.annotationsRef.current,
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
  const {
    addComment,
    annotations,
    annotationsRef,
    annotationAgents,
    deleteAnnotation,
    deleteComment,
    latestArticleRef,
    pendingAnnotationAgents,
    reviewAgents,
    saveAnnotations,
  } = sourceReaderSession;
  const [tocOpen, setTocOpen] = useState(() => defaultTocOpen());
  const [, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchMatchIndex, setActiveSearchMatchIndex] = useState(0);
  const [searchBoxes, setSearchBoxes] = useState<HighlightBox[]>([]);
  const [translation, setTranslation] = useState<ArticleTranslation | null>(null);
  const [translationVisible, setTranslationVisible] = useState(false);
  const [translationBusy, setTranslationBusy] = useState(false);
  const [translationMenuOpen, setTranslationMenuOpen] = useState(false);
  const [translationConfirm, setTranslationConfirm] = useState<TranslationConfirmAction | null>(
    null,
  );
  const [translationSuccessBlockIds, setTranslationSuccessBlockIds] = useState<Set<string>>(
    () => new Set(),
  );
  const translationSegmentStatusRef = useRef(
    new Map<string, ArticleTranslation['segments'][number]['status']>(),
  );
  const translationSuccessTimerRef = useRef(new Map<string, number>());
  const bilingualTranslationTargetLanguage = settings?.bilingualTranslationTargetLanguage;
  const bilingualTranslationStyle = settings?.bilingualTranslationStyle || 'dashedLine';
  const translationInProgress = translationBusy || translation?.status === 'translating';
  const translationAnnotationCount = useMemo(() => {
    if (!translation) return 0;
    return translationAnnotationsForBlocks(annotations, currentTranslationBlockIds()).length;
  }, [annotations, translation]);

  const {
    actionShortcuts,
    annotationTotals,
    commentsCloseKey,
    labels,
    readerChat,
    readerSettings,
    selection,
    sendShortcut,
    shortcutModifier,
    updateReaderSettings,
  } = useSourceReaderWorkspace({
    article,
    canvasRef,
    getArticleText: currentArticleText,
    messageSendShortcut,
    selectionActionShortcuts,
    session: sourceReaderSession,
    uiLanguage,
    onSaveArticleReaderChatState,
  });
  const {
    temporaryBoxes,
    highlightChoice,
    setHighlightChoice,
    selectionAction,
    copyRequestKey,
    composer,
    clearSelection,
    clearAnnotationUiState,
    openSelectionAction,
    cancelComposer,
    copySelection,
    openComposer,
  } = selection;
  const contentHtml = useMemo(() => (article ? sourceArticleBodyHtml(article) : ''), [article]);
  const translatedContentHtml = useMemo(() => {
    if (!translationVisible || !translation) return contentHtml;
    return articleHtmlWithBilingualTranslation(document, contentHtml, translation, {
      retryLabel: t('source.retryTranslationSegment'),
      style: bilingualTranslationStyle,
      successBlockIds: translationSuccessBlockIds,
    });
  }, [
    bilingualTranslationStyle,
    contentHtml,
    t,
    translation,
    translationSuccessBlockIds,
    translationVisible,
  ]);
  const articleText = articleRef.current ? sourceTextContent(articleRef.current) : '';
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
    contentHtml: translatedContentHtml,
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
    setTranslation(null);
    setTranslationVisible(false);
    setTranslationMenuOpen(false);
    setTranslationConfirm(null);
    clearTranslationSuccessFeedback();
    translationSegmentStatusRef.current.clear();
    lastSavedWebProgressRef.current = normalizeSavedWebProgress(article.readingProgress);
    setReadingProgress(lastSavedWebProgressRef.current ?? 0);
    restoredWebProgressArticleRef.current = null;
  }, [article?.id]);

  useEffect(() => {
    let cancelled = false;
    if (article.sourceType !== 'web') return;
    void window.yomitomoDesktop
      .getCurrentArticleTranslation({
        articleId: article.id,
        targetLanguage: bilingualTranslationTargetLanguage,
      })
      .then((current) => {
        if (cancelled) return;
        setTranslation(current);
        setTranslationVisible(Boolean(current));
      })
      .catch(() => {
        if (!cancelled) setTranslation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [article.id, article.sourceType, bilingualTranslationTargetLanguage]);

  useEffect(() => {
    const subscribe = (window.yomitomoDesktop as Partial<typeof window.yomitomoDesktop>)
      .onArticleTranslationUpdated;
    if (!subscribe) return;
    return subscribe((nextTranslation) => {
      if (nextTranslation.articleId !== article.id) return;
      setTranslation(nextTranslation);
      setTranslationVisible(true);
    });
  }, [article.id]);

  useEffect(() => {
    return () => clearTranslationSuccessFeedback();
  }, []);

  useEffect(() => {
    const previousStatuses = translationSegmentStatusRef.current;
    const nextStatuses = new Map<string, ArticleTranslation['segments'][number]['status']>();

    for (const segment of translation?.segments || []) {
      nextStatuses.set(segment.sourceBlockId, segment.status);
      const previousStatus = previousStatuses.get(segment.sourceBlockId);
      if (previousStatus === 'translating' && segment.status === 'ready') {
        showTranslationSuccessFeedback(segment.sourceBlockId);
      }
      if (segment.status !== 'ready') {
        clearTranslationSuccessFeedback(segment.sourceBlockId);
      }
    }

    for (const blockId of previousStatuses.keys()) {
      if (!nextStatuses.has(blockId)) clearTranslationSuccessFeedback(blockId);
    }

    translationSegmentStatusRef.current = nextStatuses;
  }, [translation]);

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

    const range = rangeFromOffsetsIgnoringSelector(
      articleElement,
      activeSearchMatch.start,
      activeSearchMatch.end,
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
    return articleRef.current ? sourceTextContent(articleRef.current) : '';
  }

  function isCurrentArticle(articleId: string) {
    return latestArticleRef.current?.id === articleId;
  }

  function handleArticleMouseUp() {
    const articleElement = articleRef.current;
    const canvasElement = canvasRef.current;
    if (!articleElement || !canvasElement) return;

    const articleSelection = getArticleSelection(articleElement);
    if (!articleSelection || articleSelection.rangeCount === 0 || articleSelection.isCollapsed) {
      // Clicks inside the composer bubble up with an empty native selection;
      // while the composer owns the highlight, blank-click clearing is handled
      // by the reader shell pointer capture instead.
      if (!composer) clearSelection();
      return;
    }

    const range = articleSelection.getRangeAt(0);
    if (!isRangeInsideArticle(range, articleElement)) return;
    const translationElement = translationElementForRange(range);
    if (!translationElement && rangeIntersectsIgnoredSelector(range, '[data-reader-translation]')) {
      articleSelection.removeAllRanges();
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
    if (!anchor) return;
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
    articleSelection.removeAllRanges();
  }

  function handleArticleClick(event: React.MouseEvent<HTMLElement>) {
    const target = event.target instanceof Element ? event.target : null;
    const translationAction = target?.closest<HTMLElement>('[data-reader-translation-action]');
    if (translationAction) {
      event.preventDefault();
      const blockId = translationAction.getAttribute('data-reader-translation-block-id');
      if (blockId) void requestBilingualTranslation({ sourceBlockIds: [blockId] });
      return;
    }

    const anchor = target?.closest<HTMLAnchorElement>('a[href]');
    if (!anchor) return;

    const url = articleLinkExternalUrl(article, anchor.getAttribute('href'));
    if (!url) return;

    event.preventDefault();
    void window.yomitomoDesktop.openUrl(url);
  }

  function showTranslationSuccessFeedback(blockId: string) {
    const previousTimer = translationSuccessTimerRef.current.get(blockId);
    if (previousTimer) window.clearTimeout(previousTimer);
    setTranslationSuccessBlockIds((current) => new Set(current).add(blockId));
    const nextTimer = window.setTimeout(() => {
      translationSuccessTimerRef.current.delete(blockId);
      setTranslationSuccessBlockIds((current) => {
        if (!current.has(blockId)) return current;
        const next = new Set(current);
        next.delete(blockId);
        return next;
      });
    }, 2000);
    translationSuccessTimerRef.current.set(blockId, nextTimer);
  }

  function clearTranslationSuccessFeedback(blockId?: string) {
    if (blockId) {
      const timer = translationSuccessTimerRef.current.get(blockId);
      if (timer) window.clearTimeout(timer);
      translationSuccessTimerRef.current.delete(blockId);
      setTranslationSuccessBlockIds((current) => {
        if (!current.has(blockId)) return current;
        const next = new Set(current);
        next.delete(blockId);
        return next;
      });
      return;
    }

    for (const timer of translationSuccessTimerRef.current.values()) window.clearTimeout(timer);
    translationSuccessTimerRef.current.clear();
    setTranslationSuccessBlockIds((current) => (current.size === 0 ? current : new Set()));
  }

  function currentTranslationBlockIds() {
    return new Set((translation?.segments || []).map((segment) => segment.sourceBlockId));
  }

  // 译文锚定在生成文本上，删除/重翻会让旧划线失效，连带删除受影响段的译文批注，
  // 复用单条删除生命周期（讨论、已沉淀卡片、store patch 一并清理）。
  async function deleteTranslationAnnotations(blockIds: Set<string>) {
    const affected = translationAnnotationsForBlocks(annotationsRef.current, blockIds);
    for (const annotation of affected) {
      await deleteAnnotation(annotation.id);
    }
  }

  async function requestBilingualTranslation(
    input: {
      force?: boolean;
      sourceBlockIds?: string[];
    } = {},
  ) {
    if (translationBusy) return;
    if (!input.force && !input.sourceBlockIds?.length && translation && !translationVisible) {
      setTranslationVisible(true);
      return;
    }
    setTranslationBusy(true);
    try {
      const retranslatedBlockIds = input.force
        ? currentTranslationBlockIds()
        : input.sourceBlockIds?.length
          ? new Set(input.sourceBlockIds)
          : null;
      if (retranslatedBlockIds) await deleteTranslationAnnotations(retranslatedBlockIds);
      const nextTranslation = await window.yomitomoDesktop.translateArticle({
        articleId: article.id,
        force: input.force,
        sourceBlockIds: input.sourceBlockIds,
        targetLanguage: bilingualTranslationTargetLanguage,
      });
      setTranslation(nextTranslation);
      setTranslationVisible(true);
    } catch (error) {
      appToast.error(assistantRuntimeErrorMessage(error, 'source.translationFailed'));
    } finally {
      setTranslationBusy(false);
    }
  }

  async function deleteBilingualTranslation() {
    if (translationBusy) return;
    try {
      await deleteTranslationAnnotations(currentTranslationBlockIds());
      await window.yomitomoDesktop.deleteCurrentArticleTranslation({
        articleId: article.id,
        targetLanguage: bilingualTranslationTargetLanguage,
      });
      setTranslation(null);
      setTranslationVisible(false);
      setTranslationMenuOpen(false);
    } catch (error) {
      appToast.error(assistantRuntimeErrorMessage(error, 'source.deleteTranslationFailed'));
    }
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
              dangerouslySetInnerHTML={{ __html: translatedContentHtml }}
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
        selection={{ composer, copyRequestKey, highlightChoice, selectionAction }}
        settings={{
          messageSendShortcut: sendShortcut,
          readerSettings,
          selectionActionShortcuts: actionShortcuts,
          settingsOpen: false,
          shortcutModifier,
          showSettings: false,
        }}
        toc={{
          activeIndex: activeTocIndex,
          annotationStats: tocStats,
          items: tocItems,
          open: tocOpen,
        }}
        toolbar={{
          articleAction: <OpenArticleButton article={article} iconOnly />,
          controls: (
            <>
              <ReaderTranslationToolbarButton
                busy={translationInProgress}
                hasTranslation={Boolean(translation)}
                labels={{
                  deleteTranslation: t('source.deleteTranslation'),
                  hideTranslation: t('source.hideTranslation'),
                  retranslateArticle: t('source.retranslateArticle'),
                  showTranslation: t('source.showTranslation'),
                  translateArticle: t('source.translateArticle'),
                }}
                menuOpen={translationMenuOpen}
                visible={translationVisible}
                onConfirm={(action) => setTranslationConfirm(action)}
                onMenuOpenChange={setTranslationMenuOpen}
                onSetVisible={setTranslationVisible}
              />
              <ReaderSettingsToolbarControls
                labels={{ articleWidth: labels.articleWidth, fontSize: labels.fontSize }}
                settings={readerSettings}
                onChange={updateReaderSettings}
              />
            </>
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
      <ReaderTranslationConfirmDialog
        action={translationConfirm}
        annotationNotice={
          translationConfirm && translationConfirm !== 'translate' && translationAnnotationCount > 0
            ? t('source.translationAnnotationsRemovalNotice', { count: translationAnnotationCount })
            : ''
        }
        labels={{
          cancel: t('common.cancel'),
          confirmDeleteTranslation: t('source.confirmDeleteTranslation'),
          confirmDeleteTranslationDescription: t('source.confirmDeleteTranslationDescription'),
          confirmDeleteTranslationTitle: t('source.confirmDeleteTranslationTitle'),
          confirmRetranslate: t('source.confirmRetranslate'),
          confirmRetranslateDescription: t('source.confirmRetranslateDescription'),
          confirmRetranslateTitle: t('source.confirmRetranslateTitle'),
          confirmTranslate: t('source.confirmTranslate'),
          confirmTranslateDescription: t('source.confirmTranslateDescription'),
          confirmTranslateTitle: t('source.confirmTranslateTitle'),
        }}
        onClose={() => setTranslationConfirm(null)}
        onConfirm={async (action) => {
          setTranslationConfirm(null);
          if (action === 'delete') await deleteBilingualTranslation();
          else await requestBilingualTranslation({ force: action === 'retranslate' });
        }}
      />
    </section>
  );
}

type TranslationConfirmAction = 'translate' | 'retranslate' | 'delete';

type ReaderTranslationLabels = {
  deleteTranslation: string;
  hideTranslation: string;
  retranslateArticle: string;
  showTranslation: string;
  translateArticle: string;
};

function ReaderTranslationToolbarButton({
  busy,
  hasTranslation,
  labels,
  menuOpen,
  visible,
  onConfirm,
  onMenuOpenChange,
  onSetVisible,
}: {
  busy: boolean;
  hasTranslation: boolean;
  labels: ReaderTranslationLabels;
  menuOpen: boolean;
  visible: boolean;
  onConfirm: (action: TranslationConfirmAction) => void;
  onMenuOpenChange: (open: boolean) => void;
  onSetVisible: (visible: boolean) => void;
}) {
  if (!hasTranslation) {
    return (
      <ReaderTooltip content={labels.translateArticle} side="bottom">
        <button
          aria-label={labels.translateArticle}
          className={['reader-icon-button', busy ? 'is-busy' : ''].filter(Boolean).join(' ')}
          disabled={busy}
          type="button"
          onClick={() => onConfirm('translate')}
        >
          {busy ? <RefreshCw size={18} /> : <Languages size={18} />}
        </button>
      </ReaderTooltip>
    );
  }

  const buttonLabel = visible ? labels.hideTranslation : labels.showTranslation;
  return (
    <Popover open={menuOpen} onOpenChange={onMenuOpenChange}>
      <ReaderTooltip content={buttonLabel} side="bottom">
        <PopoverTrigger asChild>
          <button
            aria-label={buttonLabel}
            className={['reader-icon-button', visible ? 'is-active' : '', busy ? 'is-busy' : '']
              .filter(Boolean)
              .join(' ')}
            type="button"
          >
            {busy ? <RefreshCw size={18} /> : visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </PopoverTrigger>
      </ReaderTooltip>
      <PopoverContent align="end" className="reader-translation-menu" side="bottom" sideOffset={10}>
        <button
          aria-label={buttonLabel}
          type="button"
          onClick={() => {
            onSetVisible(!visible);
            onMenuOpenChange(false);
          }}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          <span>{buttonLabel}</span>
        </button>
        <button
          aria-label={labels.retranslateArticle}
          disabled={busy}
          type="button"
          onClick={() => {
            onMenuOpenChange(false);
            onConfirm('retranslate');
          }}
        >
          <RefreshCw size={15} />
          <span>{labels.retranslateArticle}</span>
        </button>
        <button
          aria-label={labels.deleteTranslation}
          className="is-danger"
          disabled={busy}
          type="button"
          onClick={() => {
            onMenuOpenChange(false);
            onConfirm('delete');
          }}
        >
          <Trash2 size={15} />
          <span>{labels.deleteTranslation}</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}

type ReaderTranslationConfirmLabels = {
  cancel: string;
  confirmDeleteTranslation: string;
  confirmDeleteTranslationDescription: string;
  confirmDeleteTranslationTitle: string;
  confirmRetranslate: string;
  confirmRetranslateDescription: string;
  confirmRetranslateTitle: string;
  confirmTranslate: string;
  confirmTranslateDescription: string;
  confirmTranslateTitle: string;
};

function ReaderTranslationConfirmDialog({
  action,
  annotationNotice,
  labels,
  onClose,
  onConfirm,
}: {
  action: TranslationConfirmAction | null;
  annotationNotice: string;
  labels: ReaderTranslationConfirmLabels;
  onClose: () => void;
  onConfirm: (action: TranslationConfirmAction) => Promise<void>;
}) {
  const copy =
    action === 'delete'
      ? {
          confirm: labels.confirmDeleteTranslation,
          description: labels.confirmDeleteTranslationDescription,
          title: labels.confirmDeleteTranslationTitle,
        }
      : action === 'retranslate'
        ? {
            confirm: labels.confirmRetranslate,
            description: labels.confirmRetranslateDescription,
            title: labels.confirmRetranslateTitle,
          }
        : {
            confirm: labels.confirmTranslate,
            description: labels.confirmTranslateDescription,
            title: labels.confirmTranslateTitle,
          };
  return (
    <Dialog open={Boolean(action)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogPortal>
        <DialogOverlay className="reader-translation-confirm-overlay">
          <DialogContent
            aria-describedby="reader-translation-confirm-description"
            aria-labelledby="reader-translation-confirm-title"
            className="reader-translation-confirm"
          >
            <DialogTitle id="reader-translation-confirm-title">{copy.title}</DialogTitle>
            <DialogDescription id="reader-translation-confirm-description">
              {annotationNotice ? `${copy.description} ${annotationNotice}` : copy.description}
            </DialogDescription>
            <div className="reader-translation-confirm-actions">
              <button type="button" onClick={onClose}>
                {labels.cancel}
              </button>
              <button
                className={action === 'delete' ? 'is-danger' : 'is-primary'}
                disabled={!action}
                type="button"
                onClick={() => {
                  if (action) void onConfirm(action);
                }}
              >
                {copy.confirm}
              </button>
            </div>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

function translationAnnotationsForBlocks(annotations: Annotation[], blockIds: Set<string>) {
  return annotations.filter(
    (annotation) => annotation.anchor.segmentId && blockIds.has(annotation.anchor.segmentId),
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
