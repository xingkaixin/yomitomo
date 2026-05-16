import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type {
  AgentReadingPlanItem,
  Annotation,
  Comment as AnnotationComment,
  FocusCoReadingPlan,
  PublicAgent,
  ReadingMemory,
} from '@yomitomo/shared';
import {
  makeId,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
  resolveTextAnchor,
} from '@yomitomo/shared';
import {
  annotationPrimaryComment,
  annotationThreadComments,
  annotationIdsAtHighlightPoint,
  createEpubTextAnchorFromQuote,
  createUserAnnotation,
  findMentionedAgents,
  mergeReadingMemory,
  selectionActionPosition,
  type TocItem,
} from '@yomitomo/core';
import {
  buildTocAnnotationStats,
  clampNumber,
  getShortcutModifier,
  ReaderAppView,
  readerConversationStyles,
  readerDesktopEmbeddedStyles,
  readerStyles,
  selectionActionShortcut,
  sleep,
  type ReaderSettings,
} from '@yomitomo/reader-ui';
import {
  closeFoliateView,
  configureFoliateView,
  currentFoliateContent,
  ebookArticleText,
  ebookChapterForFoliateSection,
  ebookHighlightAnnotationsSignature,
  ebookReaderReadingSections,
  ebookSectionIndexForChapter,
  ebookTocItemsForReader,
  flattenFoliateToc,
  foliateRangeHighlightBoxes,
  formatEbookPageLabel,
  isEbookPaginationReady,
  isRangeInsideDocumentBody,
  lastFoliateRangeViewportRect,
  rangeForEbookAnchorInDocument,
  selectionContextForRange,
  updateKnownSectionPageCount,
  waitForAnimationFrame,
  waitForFoliateIdle,
  waitForFoliatePageInfo,
  type EbookBoxUpdateReason,
  type FoliatePageInfo,
  type FoliateRelocateDetail,
  type FoliateTocItem,
  type FoliateViewElement,
} from './app-ebook-reader-utils';
import { playEbookAgentAnnotationPlayback } from './app-source-ebook-agent-playback';
import type { PromptArticle } from './app-reading-types';
import {
  buildAgentAnnotationRequestInput,
  resolveSourceAgentMentionInstructions,
  runSourceAgentAnnotationRequest,
  type SourceAgentAnnotationPlaybackMode,
  type SourceAgentAnnotationRequestOptions,
} from './app-source-agent-request';
import { runSourceAgentCommentRequest } from './app-source-agent-comment-request';
import {
  articleWithAnnotations,
  defaultTocOpen,
  normalizeDesktopReaderSettings,
  promptArticle,
  publicAnnotationAgents,
  readDesktopReaderSettings,
  usesOverlayToc,
  writeDesktopReaderSettings,
  type EbookBookcaseProps,
} from './app-source-bookcase-shared';
import { useSourceAnnotations } from './use-source-annotations';
import { useEbookAgentVirtualReading } from './use-ebook-agent-virtual-reading';
import { useEbookReaderBoxes } from './use-ebook-reader-boxes';
import { useSourceActiveConnection } from './use-source-active-connection';
import { useSourceSelectionComposer } from './use-source-selection-composer';
import {
  ebookAnnotationNavigationState,
  isEditableKeyboardTarget,
  sourceEbookReaderStyles,
} from './app-source-bookcase-ebook-utils';

export function EbookBookcase({
  agents,
  annotations: articleAnnotations,
  article,
  focusAnnotationId,
  messageSendShortcut,
  selectionActionShortcuts,
  selectedAnnotationId,
  userProfile,
  onFocusedAnnotation,
  onClose,
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
  const viewHostRef = useRef<HTMLDivElement | null>(null);
  const measureHostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<FoliateViewElement | null>(null);
  const ebookFileRef = useRef<File | null>(null);
  const onSaveArticleReadingProgressRef = useRef(onSaveArticleReadingProgress);
  const scheduleEbookBoxUpdateRef = useRef<(reason: EbookBoxUpdateReason) => void>(() => {});
  const annotationAgents = useMemo(() => publicAnnotationAgents(agents), [agents]);
  const {
    addComment,
    annotations,
    annotationsRef,
    applyAnnotations,
    deleteAnnotation,
    latestArticleRef,
    replaceAnnotations,
    saveAnnotations,
    setAnnotationQuestionStatus,
    setCommentQuestionStatus,
  } = useSourceAnnotations({
    annotationAgents,
    annotations: articleAnnotations,
    article,
    ignoreStaleArticleUpdates: true,
    onBeforeDeleteAnnotation: (annotationId) => noteRefs.current.delete(annotationId),
    onCommentSaved: ({ annotation, comment, mentionedAgents }) => {
      for (const agent of mentionedAgents) {
        void requestAgentComment(agent, annotation, comment);
      }
    },
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
    onSaveArticle,
    userProfile,
  });
  const [agentAnnotateOpen, setAgentAnnotateOpen] = useState(false);
  const [annotatingAgentIds, setAnnotatingAgentIds] = useState<string[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
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
  const [replyRequest, setReplyRequest] = useState<{ annotationId: string; key: number } | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState('');
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() =>
    readDesktopReaderSettings(),
  );
  const readerSettingsRef = useRef<ReaderSettings>(readerSettings);
  const [tocItems, setTocItems] = useState<FoliateTocItem[]>([]);
  const [sectionFractions, setSectionFractions] = useState<number[]>([]);
  const [pageInfo, setPageInfo] = useState<FoliatePageInfo | null>(null);
  const pageInfoSectionIndexRef = useRef<number | undefined>(pageInfo?.sectionIndex);
  const [sectionPageCounts, setSectionPageCounts] = useState<Array<number | null>>([]);
  const [paginationLayoutKey, setPaginationLayoutKey] = useState('');
  const paginationLayoutKeyRef = useRef('');
  const [progress, setProgress] = useState(() => article.readingProgress?.progress ?? 0);
  const [readerState, setReaderState] = useState<{
    status: 'loading' | 'ready' | 'error';
    message: string;
  }>({ status: 'loading', message: '正在打开 EPUB。' });
  const readerStateStatusRef = useRef(readerState.status);
  const {
    boxes,
    attachFoliateDocumentListeners,
    cleanupFoliateDocumentListeners,
    resetEbookBoxState,
    scheduleEbookBoxUpdate: scheduleEbookBoxUpdateImpl,
  } = useEbookReaderBoxes({
    annotationAgents,
    annotationsRef,
    article,
    canvasRef,
    viewRef,
    pageInfoSectionIndexRef,
    paginationLayoutKeyRef,
    readerSettingsRef,
    readerStateStatus: readerState.status,
    readerStateStatusRef,
    userProfile,
    onFoliatePointerDown: handleFoliatePointerDown,
    onFoliateSelection: handleFoliateSelection,
    onFoliateSelectionShortcut: handleFoliateSelectionShortcut,
  });
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
  const ebookText = useMemo(() => ebookArticleText(article), [article]);
  const readerTocItems = useMemo(
    () => ebookTocItemsForReader(tocItems, article),
    [article, tocItems],
  );
  const tocStats = useMemo(
    () => buildTocAnnotationStats(readerTocItems, annotations, userProfile, annotationAgents),
    [annotationAgents, annotations, readerTocItems, userProfile],
  );
  const readingSections = useMemo(
    () => ebookReaderReadingSections(article, ebookText),
    [article, ebookText],
  );
  const annotationTotals = useMemo(
    () => ({
      annotations: annotations.length,
      comments: annotations.reduce(
        (count, annotation) => count + annotationThreadComments(annotation).length,
        0,
      ),
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

  useEffect(() => {
    onSaveArticleReadingProgressRef.current = onSaveArticleReadingProgress;
  }, [onSaveArticleReadingProgress]);

  useLayoutEffect(() => {
    noteRefs.current.clear();
    replaceAnnotations(articleAnnotations);
    resetEbookBoxState();
    clearAnnotationUiState();
    setAgentAnnotateOpen(false);
    setAnnotatingAgentIds([]);
    cleanupEbookAgentTheater();
    setNotesOpen(false);
    setCommentsCloseKey((key) => key + 1);
    setReplyRequest(null);
    setStatusMessage('');
    setSettingsOpen(false);
    setTocOpen(defaultTocOpen());
    setTocItems([]);
    setSectionFractions([]);
    pageInfoSectionIndexRef.current = undefined;
    setPageInfo(null);
    setSectionPageCounts([]);
    paginationLayoutKeyRef.current = '';
    setPaginationLayoutKey('');
    setProgress(article.readingProgress?.progress ?? 0);
    readerStateStatusRef.current = 'loading';
    setReaderState({ status: 'loading', message: '正在打开 EPUB。' });
  }, [
    article.id,
    articleAnnotations,
    cleanupEbookAgentTheater,
    clearAnnotationUiState,
    replaceAnnotations,
    resetEbookBoxState,
  ]);

  useEffect(() => {
    readerSettingsRef.current = readerSettings;
    configureFoliateView(viewRef.current, readerSettings);
    scheduleEbookBoxUpdate('reader_settings');
  }, [readerSettings]);

  useEffect(() => {
    readerStateStatusRef.current = readerState.status;
  }, [readerState.status]);

  useEffect(
    () => () => {
      cleanupFoliateDocumentListeners();
      cleanupEbookAgentTheater();
    },
    [],
  );

  useEffect(() => {
    const host = viewHostRef.current;
    if (!host) return;
    const hostElement = host;

    let cancelled = false;
    let view: FoliateViewElement | null = null;

    const handleRelocate = (event: Event) => {
      const detail = (event as CustomEvent<FoliateRelocateDetail>).detail;
      const nextProgress = clampNumber(detail.fraction, 0, 1, 0);
      const pageIndex = Math.max(0, detail.location?.current ?? Math.round(nextProgress * 1000));
      const pageCount = Math.max(1, detail.location?.total ?? 1000);
      const nextPageInfo =
        (event.currentTarget as FoliateViewElement | null)?.getPageInfo?.() ?? null;

      setProgress(nextProgress);
      pageInfoSectionIndexRef.current = nextPageInfo?.sectionIndex;
      setPageInfo(nextPageInfo);
      if (nextPageInfo) {
        setSectionPageCounts((counts) => updateKnownSectionPageCount(counts, nextPageInfo));
      }
      attachFoliateDocumentListeners(event.currentTarget as FoliateViewElement);
      scheduleEbookBoxUpdate('relocate');
      void onSaveArticleReadingProgressRef.current(article.id, {
        pageIndex,
        pageCount,
        chapterIndex: detail.section?.current,
        progress: nextProgress,
        updatedAt: new Date().toISOString(),
      });
    };

    const handleExternalLink = (event: Event) => {
      const customEvent = event as CustomEvent<Record<string, string | undefined>>;
      const href = customEvent.detail['href_'] || customEvent.detail.href;
      if (!href) return;
      event.preventDefault();
      void window.yomitomoDesktop.openUrl(href);
    };

    async function openEbook() {
      try {
        await import('./vendor/foliate-js/view.js');
        const data = await window.yomitomoDesktop.readEbookFile(article.id);
        if (cancelled) return;

        const file = new File([data], article.ebook.metadata.fileName || `${article.title}.epub`, {
          type: 'application/epub+zip',
        });
        ebookFileRef.current = file;
        view = document.createElement('foliate-view') as FoliateViewElement;
        view.className = 'ebook-foliate-view';
        view.addEventListener('relocate', handleRelocate);
        view.addEventListener('external-link', handleExternalLink);
        hostElement.replaceChildren(view);
        await view.open(file);
        if (cancelled) return;

        viewRef.current = view;
        configureFoliateView(view, readerSettingsRef.current);
        setTocItems(flattenFoliateToc(view.book?.toc ?? []));
        setSectionFractions(view.getSectionFractions?.() ?? []);
        readerStateStatusRef.current = 'ready';
        setReaderState({ status: 'ready', message: '' });

        const restoredProgress = article.readingProgress?.progress;
        if (typeof restoredProgress === 'number' && restoredProgress > 0) {
          await view.goToFraction(Math.min(1, restoredProgress));
        } else {
          await view.next();
        }
        attachFoliateDocumentListeners(view);
        scheduleEbookBoxUpdate('open_ebook');
      } catch (error) {
        if (cancelled) return;
        readerStateStatusRef.current = 'error';
        setReaderState({
          status: 'error',
          message: error instanceof Error ? error.message : 'EPUB 打开失败',
        });
      }
    }

    void openEbook();

    return () => {
      cancelled = true;
      view?.removeEventListener('relocate', handleRelocate);
      view?.removeEventListener('external-link', handleExternalLink);
      cleanupFoliateDocumentListeners();
      closeFoliateView(view);
      view?.remove();
      if (viewRef.current === view) viewRef.current = null;
      if (viewRef.current === null) ebookFileRef.current = null;
      hostElement.replaceChildren();
    };
  }, [article.id, article.ebook.metadata.fileName, article.title]);

  useLayoutEffect(() => {
    const host = viewHostRef.current;
    if (!host) return;

    const updateLayoutKey = (reason: EbookBoxUpdateReason) => {
      const rect = host.getBoundingClientRect();
      const nextLayoutKey = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
      paginationLayoutKeyRef.current = nextLayoutKey;
      setPaginationLayoutKey(nextLayoutKey);
      scheduleEbookBoxUpdate(reason);
    };

    updateLayoutKey('layout_measure');
    const observer = new ResizeObserver(() => updateLayoutKey('resize_observer'));
    observer.observe(host);
    return () => observer.disconnect();
  }, [article.id]);

  useEffect(() => {
    const measureHost = measureHostRef.current;
    const sourceFile = ebookFileRef.current;
    const visibleView = viewRef.current;
    const sections = visibleView?.book?.sections ?? [];
    const [layoutWidth, layoutHeight] = paginationLayoutKey.split('x').map(Number);
    if (
      readerState.status !== 'ready' ||
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

    let cancelled = false;
    let measureView: FoliateViewElement | null = null;
    const counts: Array<number | null> = sections.map((section) =>
      section.linear === 'no' ? 0 : null,
    );
    const currentPageInfo = visibleEbookView.getPageInfo?.();
    pageInfoSectionIndexRef.current = currentPageInfo?.sectionIndex;
    setPageInfo(currentPageInfo ?? null);
    setSectionPageCounts(
      currentPageInfo ? updateKnownSectionPageCount(counts, currentPageInfo) : counts,
    );

    const timer = window.setTimeout(() => {
      void measureEbookPages();
    }, 360);

    async function measureEbookPages() {
      try {
        await waitForFoliateIdle();
        if (cancelled) return;

        await import('./vendor/foliate-js/view.js');
        measureView = document.createElement('foliate-view') as FoliateViewElement;
        measureView.className = 'ebook-foliate-view';
        measureHostElement.replaceChildren(measureView);
        await measureView.open(sourceEbookFile);
        configureFoliateView(measureView, readerSettingsRef.current);

        for (const [index, section] of sections.entries()) {
          if (cancelled) return;
          if (section.linear === 'no') continue;

          await waitForFoliateIdle();
          if (cancelled) return;

          await measureView.goTo(index);
          const nextPageInfo = await waitForFoliatePageInfo(measureView, index);
          if (cancelled) return;

          counts[index] = Math.max(1, nextPageInfo?.pageCount ?? 1);
        }

        if (!cancelled) setSectionPageCounts(counts);
      } catch (error) {
        console.warn(error);
      } finally {
        closeFoliateView(measureView);
        measureView?.remove();
        if (measureHostElement.firstChild === measureView) measureHostElement.replaceChildren();
      }
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      closeFoliateView(measureView);
      measureView?.remove();
      if (measureHost.firstChild === measureView) measureHost.replaceChildren();
    };
  }, [
    article.id,
    paginationLayoutKey,
    readerSettings.contentWidth,
    readerSettings.fontSize,
    readerState.status,
  ]);

  function goLeft() {
    void viewRef.current?.goLeft();
  }

  function goRight() {
    void viewRef.current?.goRight();
  }

  function goToTocItem(item: FoliateTocItem) {
    if (usesOverlayToc()) setTocOpen(false);
    void viewRef.current?.goTo(item.href);
  }

  function goToReaderTocItem(item: TocItem) {
    const tocItem = tocItems[item.index];
    if (tocItem) goToTocItem(tocItem);
  }

  function goToProgress(event: React.ChangeEvent<HTMLInputElement>) {
    const nextProgress = clampNumber(Number(event.currentTarget.value), 0, 1, progress);
    setProgress(nextProgress);
    void viewRef.current?.goToFraction(nextProgress);
  }

  function updateEbookReaderSettings(nextSettings: ReaderSettings) {
    const normalizedSettings = normalizeDesktopReaderSettings(nextSettings);
    setReaderSettings(normalizedSettings);
    writeDesktopReaderSettings(normalizedSettings);
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

  function scheduleEbookBoxUpdate(reason: EbookBoxUpdateReason) {
    scheduleEbookBoxUpdateRef.current(reason);
  }

  function handleFoliatePointerDown() {
    clearAnnotationUiState();
    if (settingsOpen || agentAnnotateOpen) {
      setSettingsOpen(false);
      setAgentAnnotateOpen(false);
    }
    if (selectedAnnotationId) onOpenAnnotation(null);
  }

  function handleFoliateSelection(doc: Document) {
    const canvasElement = canvasRef.current;
    const view = viewRef.current;
    const selection = doc.getSelection();
    if (
      !canvasElement ||
      !view ||
      !selection ||
      selection.rangeCount === 0 ||
      selection.isCollapsed
    ) {
      clearSelection();
      return;
    }

    const range = selection.getRangeAt(0);
    if (!isRangeInsideDocumentBody(doc, range)) return;

    const content = currentFoliateContent(view);
    const sectionIndex = content?.index ?? pageInfo?.sectionIndex ?? 0;
    const chapter = ebookChapterForFoliateSection(article, view, sectionIndex);
    const context = selectionContextForRange(doc, range);
    const anchor =
      article.ebook.index && chapter
        ? createEpubTextAnchorFromQuote(article.ebook.index, ebookText, range.toString(), {
            chapterId: chapter.id,
            prefix: context.prefix,
            suffix: context.suffix,
          })
        : null;
    if (!anchor?.exact.trim()) {
      setStatusMessage('无法定位这段选区，请缩短或重新选择');
      window.setTimeout(() => setStatusMessage(''), 1800);
      selection.removeAllRanges();
      return;
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const lastRect = lastFoliateRangeViewportRect(range, canvasRect);
    if (!lastRect) return;

    const position = selectionActionPosition(lastRect, canvasRect);
    openSelectionAction(
      { x: position.x, y: position.y, anchor },
      foliateRangeHighlightBoxes(range, canvasRect, 'source-selection').map((box) =>
        Object.assign(box, {
          annotationId: '__selection__',
          contributorId: userProfile.id,
          color: userProfile.annotationColor,
        }),
      ),
    );
    selection.removeAllRanges();
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

    const mentionedAgents = findMentionedAgents(note, annotationAgents);
    if (mentionedAgents.length > 0) {
      cancelComposer();
      const instructions = await resolveSourceAgentMentionInstructions({
        desktop: window.yomitomoDesktop,
        article: articleContext,
        targetAnchor: currentComposer.anchor,
        agents: mentionedAgents,
        note,
        onStatus: isCurrentArticle(currentArticle.id)
          ? (message, options) => {
              setStatusMessage(message);
              if (options?.clearAfterMs)
                window.setTimeout(() => setStatusMessage(''), options.clearAfterMs);
            }
          : undefined,
      });
      for (const item of instructions) {
        void requestAgentAnnotations(item.agent, {
          readingIntent: item.readingIntent,
          instruction: item.instruction,
          targetAnchor: currentComposer.anchor,
          article: articleContext,
          articleId: currentArticle.id,
        });
      }
      return;
    }

    const annotation = createUserAnnotation(currentComposer.anchor, userProfile, note);
    await saveAnnotations([...currentArticle.annotations, annotation]);
    openAnnotation(annotation.id);
    void inferAnnotationMetadataForAnnotation(currentArticle.id, annotation, articleContext);
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
      setStatusMessage(error instanceof Error ? error.message : '批注标签生成失败');
      window.setTimeout(() => setStatusMessage(''), 1800);
    }
  }

  async function appendAgentAnnotationToArticle(articleId: string, annotation: Annotation) {
    if (isCurrentArticle(articleId)) {
      const nextAnnotations = [...annotationsRef.current, annotation];
      applyAnnotations(nextAnnotations);
      openAnnotation(annotation.id);
    }
    await onUpdateArticle(articleId, (targetArticle) =>
      articleWithAnnotations(targetArticle, [...targetArticle.annotations, annotation]),
    );
  }

  function focusQuestionAnnotation(annotationId: string) {
    setNotesOpen(false);
    openAnnotation(annotationId);
    void goToAnnotation(annotationId);
  }

  function answerQuestion(annotationId: string) {
    focusQuestionAnnotation(annotationId);
    setReplyRequest({ annotationId, key: Date.now() });
  }

  async function requestAgentComment(
    agent: PublicAgent,
    annotation: Annotation,
    userComment: AnnotationComment,
  ) {
    const desktop = window.yomitomoDesktop;
    const currentArticle = latestArticleRef.current;
    if (!desktop || !currentArticle) return;

    await runSourceAgentCommentRequest({
      agent,
      annotation,
      userComment,
      desktop,
      currentArticle,
      articleText: currentArticleText(),
      annotationsRef,
      applyAnnotations,
      saveAnnotations,
      setStatusMessage,
    });
  }

  function constrainAgentPlanAnnotation(
    annotation: Annotation,
    readingPlan: AgentReadingPlanItem[] | undefined,
    articleText = currentArticleText(),
  ) {
    if (!readingPlan?.length) return annotation;

    const position = resolveTextAnchor(articleText, annotation.anchor);
    if (!position) return null;

    const planItem = readingPlan.find(
      (item) => position.start >= item.sectionStart && position.end <= item.sectionEnd,
    );
    if (!planItem) return null;
    if (!planItem.readingIntent) return annotation;
    if (annotation.readingIntent === planItem.readingIntent) return annotation;

    return {
      ...annotation,
      readingIntent: planItem.readingIntent,
      comments: annotation.comments.map((comment) => ({
        ...comment,
        readingIntent: comment.readingIntent || planItem.readingIntent,
      })),
    };
  }

  async function saveFocusCoReadingPlan(plan: FocusCoReadingPlan) {
    await onUpdateArticle(plan.articleId, (targetArticle) => {
      const nextArticle = {
        ...targetArticle,
        focusCoReadingPlan: plan,
        updatedAt: new Date().toISOString(),
      };
      if (isCurrentArticle(plan.articleId)) latestArticleRef.current = nextArticle;
      return nextArticle;
    });
  }

  async function saveFocusCoReadingReadingMemory(
    articleId: string,
    readingMemory: ReadingMemory | undefined,
  ) {
    if (!readingMemory) return;
    await onUpdateArticle(articleId, (targetArticle) => {
      const plan = targetArticle.focusCoReadingPlan;
      if (!plan) return null;
      const mergedMemory = mergeReadingMemory(plan.readingMemory, readingMemory);
      if (!mergedMemory) return null;
      const now = new Date().toISOString();
      const nextArticle = {
        ...targetArticle,
        focusCoReadingPlan: {
          ...plan,
          readingMemory: mergedMemory,
          updatedAt: now,
        },
        updatedAt: now,
      };
      if (isCurrentArticle(articleId)) latestArticleRef.current = nextArticle;
      return nextArticle;
    });
  }

  async function planFocusCoReading(selectedAgentIds: string[]) {
    const desktop = window.yomitomoDesktop;
    const currentArticle = latestArticleRef.current;
    if (!desktop || !currentArticle) throw new Error('无法规划聚焦共读');

    setStatusMessage('正在规划聚焦共读');
    try {
      const route = await desktop.planFocusCoReadingRoute({
        selectedAgentIds,
        sections: readingSections.map((section) => ({
          sectionId: section.id,
          sectionTitle: section.title,
          sectionStart: section.start,
          sectionEnd: section.end,
        })),
        chapterSummaries: currentArticle.focusCoReadingPlan?.sections.flatMap((section) =>
          section.summary || section.tag
            ? [
                {
                  sectionId: section.sectionId,
                  summary: section.summary,
                  tag: section.tag,
                },
              ]
            : [],
        ),
        article: promptArticle(currentArticle, currentArticleText()),
      });
      const now = new Date().toISOString();
      const routeBySection = new Map(route.sections.map((section) => [section.sectionId, section]));
      const previousSections = new Map(
        currentArticle.focusCoReadingPlan?.sections.map((section) => [section.sectionId, section]),
      );
      const sections = readingSections.flatMap((section) => {
        const routed = routeBySection.get(section.id);
        const previous = previousSections.get(section.id);
        const agentIds = (routed?.agentIds || []).filter((agentId) =>
          selectedAgentIds.includes(agentId),
        );
        const messages = previous?.messages || [];
        if (agentIds.length === 0 && messages.length === 0 && !routed?.summary && !routed?.tag) {
          return [];
        }
        return [
          {
            sectionId: section.id,
            sectionTitle: section.title,
            sectionStart: section.start,
            sectionEnd: section.end,
            summary: routed?.summary,
            tag: routed?.tag,
            targetDensity: routed?.targetDensity,
            needsFurtherPlanning: routed?.needsFurtherPlanning,
            agentIds,
            messages,
          },
        ];
      });
      const plan: FocusCoReadingPlan = {
        id: currentArticle.focusCoReadingPlan?.id || makeId('focus_co_reading'),
        articleId: currentArticle.id,
        selectedAgentIds,
        sections,
        readingMemory: currentArticle.focusCoReadingPlan?.readingMemory,
        createdAt: currentArticle.focusCoReadingPlan?.createdAt || now,
        updatedAt: now,
      };
      await saveFocusCoReadingPlan(plan);
      return plan;
    } finally {
      setStatusMessage('');
    }
  }

  async function requestAgentAnnotations(
    agent: PublicAgent,
    options: SourceAgentAnnotationRequestOptions = {},
  ) {
    const desktop = window.yomitomoDesktop;
    const currentArticle = latestArticleRef.current;
    const articleId = options.articleId || currentArticle?.id;
    const articleContext =
      options.article ||
      (currentArticle ? promptArticle(currentArticle, currentArticleText()) : null);
    if (!desktop || !articleId || !articleContext) return;
    if (!options.articleId && annotatingAgentIds.includes(agent.id)) return;
    const targetAnchor = options.targetAnchor;
    const requestInput = buildAgentAnnotationRequestInput(agent, options, {
      article: articleContext,
      annotations: annotationsRef.current,
      readingMemory: latestArticleRef.current?.focusCoReadingPlan?.readingMemory,
    });
    const { playbackMode, readingPlan } = requestInput;

    const visibleArticle = startEbookPlayback(agent, articleId, targetAnchor, playbackMode);
    let requestFailed = true;
    try {
      const { result, annotationCount } = await runSourceAgentAnnotationRequest({
        desktop,
        requestInput,
        onAnnotation: (annotation) =>
          handleEbookStreamItem(
            articleId,
            annotation,
            readingPlan,
            articleContext.text,
            Boolean(targetAnchor),
          ),
      });
      if (requestInput.shouldSaveReadingMemory) {
        await saveFocusCoReadingReadingMemory(articleId, result.readingMemory);
      }
      if (annotationCount === 0 && isCurrentArticle(articleId)) {
        finishEmptyEbookPlayback(agent, targetAnchor);
      }
      await finishEbookPlayback(agent.id, visibleArticle);
      requestFailed = false;
    } finally {
      finishEbookRequest(agent, articleId, targetAnchor, {
        requestFailed,
        visibleArticle,
      });
    }
  }

  function startEbookPlayback(
    agent: PublicAgent,
    articleId: string,
    targetAnchor: Annotation['anchor'] | undefined,
    playbackMode: SourceAgentAnnotationPlaybackMode,
  ) {
    setAnnotatingAgentIds((ids) => (ids.includes(agent.id) ? ids : [...ids, agent.id]));
    setStatusMessage(`${agent.nickname} 正在批注`);
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
    const constrainedAnnotation = constrainAgentPlanAnnotation(
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
    if (targetAnchor) finishEbookVirtualReading(agent.id, '没有批注');
    setStatusMessage(`${agent.nickname} 暂无新批注`);
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
      finishEbookVirtualReading(agent.id, '批注失败');
    }
    if (options.requestFailed && options.visibleArticle) finishEbookAgentDock(agent.id, false);
    setAnnotatingAgentIds((ids) => ids.filter((id) => id !== agent.id));
    setStatusMessage((message) => (message.includes('暂无新批注') ? message : ''));
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

  useEffect(() => {
    if (!focusAnnotationId) return;
    if (!annotations.some((annotation) => annotation.id === focusAnnotationId)) {
      onFocusedAnnotation();
      return;
    }
    void goToAnnotation(focusAnnotationId).then(() => onFocusedAnnotation());
  }, [annotations, focusAnnotationId, onFocusedAnnotation]);

  const progressPercent = Math.round(progress * 100);
  const paginationReady = isEbookPaginationReady(pageInfo, sectionPageCounts);
  const pageLabel = paginationReady ? formatEbookPageLabel(pageInfo, sectionPageCounts) : '';
  const progressTickId = `ebook-progress-ticks-${article.id}`;
  const readerArticle = {
    title: article.title,
    byline: article.byline || article.ebook.metadata.fileName,
    excerpt: statusMessage,
    content: '',
  };
  const shortcutModifier = getShortcutModifier();
  const sendShortcut = normalizeMessageSendShortcut(messageSendShortcut);
  const actionShortcuts = useMemo(
    () => normalizeSelectionActionShortcuts(selectionActionShortcuts),
    [selectionActionShortcuts],
  );
  const pageAnnotations = useMemo(() => {
    const visibleIds = new Set(boxes.map((box) => box.annotationId).filter(Boolean));
    return annotations.filter((annotation) => visibleIds.has(annotation.id));
  }, [annotations, boxes]);

  function handleFoliateSelectionShortcut(event: KeyboardEvent) {
    const activeSelectionAction = selectionAction;
    if (!activeSelectionAction || composer || event.defaultPrevented) return;
    if (isEditableKeyboardTarget(event.target)) return;

    const shortcut = selectionActionShortcut(event, actionShortcuts);
    if (!shortcut) return;

    event.preventDefault();
    event.stopPropagation();
    if (shortcut === 'copy') {
      void copySelection(activeSelectionAction);
      return;
    }
    openComposer(activeSelectionAction);
  }

  return (
    <section className="source-bookcase source-ebook-reader-shell ebook-reader-shell">
      <style>{`${readerStyles}\n${readerConversationStyles}\n${readerDesktopEmbeddedStyles}\n${sourceEbookReaderStyles}`}</style>
      <ReaderAppView
        activeConnection={activeConnection}
        activeId={selectedAnnotationId}
        agentAnnotateOpen={agentAnnotateOpen}
        agentDockCompleting={ebookAgentDockCompleting}
        agentDockItems={ebookAgentDockItems}
        agentTheaterBoxes={agentTheaterBoxes}
        agents={annotationAgents}
        annotatingAgents={annotatingAgentIds}
        annotationTotals={annotationTotals}
        annotations={pageAnnotations}
        articleContent={
          <div
            className="ebook-reader-content"
            style={
              { '--ebook-content-width': `${readerSettings.contentWidth}px` } as React.CSSProperties
            }
          >
            <div className="ebook-page-control-row">
              <div
                className={
                  paginationReady
                    ? 'ebook-page-control-actions'
                    : 'ebook-page-control-actions is-paginating'
                }
              >
                <button
                  className="ebook-icon-button"
                  type="button"
                  aria-label="上一页"
                  disabled={readerState.status !== 'ready' || !paginationReady}
                  onClick={goLeft}
                >
                  <ChevronLeft size={17} />
                </button>
                <span className="ebook-location-label">{pageLabel}</span>
                <button
                  className="ebook-icon-button"
                  type="button"
                  aria-label="下一页"
                  disabled={readerState.status !== 'ready' || !paginationReady}
                  onClick={goRight}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
            <div
              className={`ebook-page-stage is-${readerState.status}`}
              tabIndex={0}
              onKeyDown={handleReaderKeyDown}
              style={
                {
                  '--ebook-font-size': `${readerSettings.fontSize}px`,
                  '--ebook-content-width': `${readerSettings.contentWidth}px`,
                } as React.CSSProperties
              }
            >
              <div className="ebook-foliate-frame" ref={viewHostRef} />
              {readerState.status !== 'ready' ? (
                <div className="ebook-reader-status" role="status">
                  {readerState.message}
                </div>
              ) : null}
              <div className="ebook-foliate-measurer" ref={measureHostRef} aria-hidden="true" />
            </div>
            <div className="ebook-reader-progress">
              <input
                aria-label="快速跳转阅读进度"
                className="ebook-progress-slider"
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
              {sectionFractions.length > 0 ? (
                <datalist id={progressTickId}>
                  {sectionFractions.map((fraction, index) => (
                    <option value={fraction} key={`${index}-${fraction}`} />
                  ))}
                </datalist>
              ) : null}
            </div>
          </div>
        }
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
        focusCoReadingPlan={article.focusCoReadingPlan}
        highlightChoice={highlightChoice}
        notesOpen={notesOpen}
        noteRefs={noteRefs}
        notesRef={railRef}
        readerSettings={readerSettings}
        readingSections={readingSections}
        replyRequest={replyRequest}
        selectionAction={selectionAction}
        settingsOpen={settingsOpen}
        messageSendShortcut={sendShortcut}
        selectionActionShortcuts={actionShortcuts}
        shortcutModifier={shortcutModifier}
        surfaceRef={surfaceRef}
        temporaryBoxes={temporaryBoxes}
        tocAnnotationStats={tocStats}
        tocItems={readerTocItems}
        tocOpen={tocOpen}
        userProfile={userProfile}
        virtualCursors={virtualCursors}
        onAddComment={addComment}
        onAnnotationLayoutChange={recalculateActiveConnection}
        onAnswerQuestion={answerQuestion}
        onCancelAgentAnnotateMenu={() => setAgentAnnotateOpen(false)}
        onCancelComposer={cancelComposer}
        onClearActiveAnnotation={() => onOpenAnnotation(null)}
        onClose={onClose}
        onCloseFloatingPanels={() => {
          setSettingsOpen(false);
          setAgentAnnotateOpen(false);
        }}
        onCloseHighlightChoice={() => setHighlightChoice(null)}
        onCloseResponsivePanels={() => {
          setTocOpen(false);
          setNotesOpen(false);
        }}
        onCopySelection={copySelection}
        onCreateAnnotation={createAnnotation}
        onDeleteAnnotation={deleteAnnotation}
        onFocusAnnotation={openAnnotation}
        onNavigateAnnotation={navigateAnnotation}
        onResolveAnnotationNavigation={resolveAnnotationNavigation}
        onHighlightClick={handleHighlightClick}
        onMouseUp={() => undefined}
        onOpenComposer={openComposer}
        onPlanFocusCoReading={planFocusCoReading}
        onSaveFocusCoReadingPlan={saveFocusCoReadingPlan}
        onScrollToHeading={goToReaderTocItem}
        onScrollToHighlight={(annotationId) => {
          openAnnotation(annotationId);
          void goToAnnotation(annotationId);
        }}
        onSetAnnotationQuestionStatus={setAnnotationQuestionStatus}
        onSetCommentQuestionStatus={setCommentQuestionStatus}
        onStartAgentReadingPlan={(agent, readingPlan) => {
          setAgentAnnotateOpen(false);
          void requestAgentAnnotations(agent, { readingPlan });
        }}
        onToggleAgentAnnotate={() => {
          setSettingsOpen(false);
          setAgentAnnotateOpen((open) => !open);
        }}
        onToggleNotes={() => {
          if (!notesOpen) setCommentsCloseKey((key) => key + 1);
          setNotesOpen((open) => !open);
        }}
        onToggleSettings={() => {
          setAgentAnnotateOpen(false);
          setSettingsOpen((open) => !open);
        }}
        onToggleToc={() => setTocOpen((open) => !open)}
        onUpdateReaderSettings={updateEbookReaderSettings}
      />
    </section>
  );
}
