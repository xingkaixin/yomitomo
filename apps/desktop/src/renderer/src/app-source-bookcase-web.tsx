import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import type {
  AgentReadingPlanItem,
  AgentReadingIntent,
  Annotation,
  Comment as AnnotationComment,
  FocusCoReadingPlan,
  PublicAgent,
  ReadingMemory,
} from '@yomitomo/shared';
import {
  createTextAnchor,
  makeId,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
} from '@yomitomo/shared';
import {
  annotationPrimaryComment,
  annotationThoughtComments,
  annotationIdsAtHighlightPoint,
  appendAnnotationComment,
  createUserComment,
  createEpubTextAnchor,
  findMentionedAgents,
  findCurrentTocTarget,
  getArticleSelection,
  isRangeInsideArticle,
  mergeReadingMemory,
  offsetFromArticleStart,
  rangeHighlightBoxes,
  selectionActionPosition,
  createUserAnnotation,
  type TocItem,
} from '@yomitomo/core';
import {
  buildTocAnnotationStats,
  useAgentAnnotationQueue,
  getShortcutModifier,
  mergeAgentAnnotationAsThought,
  ReaderAppView,
  buildReaderReadingSections,
  readerAnnotationScrollTop,
  readerConversationStyles,
  readerDesktopEmbeddedStyles,
  readerStyles,
  type AnnotationNavigationDirection,
  type ReaderSettings,
} from '@yomitomo/reader-ui';
import { OpenArticleButton } from './app-ui';
import type { PromptArticle } from './app-reading-types';
import {
  buildAgentAnnotationRequestInput,
  createPendingAgentAnnotation,
  runSourceAgentAnnotationRequest,
  type SourceAgentAnnotationPlaybackMode,
  type SourceAgentAnnotationRequestOptions,
  withoutAnnotationId,
} from './app-source-agent-request';
import { runSourceAgentCommentRequest } from './app-source-agent-comment-request';
import { runSourceAgentReviewRequest } from './app-source-agent-review-request';
import { articleIdentityLine } from './app-utils';
import {
  articleWithAnnotations,
  articleWithMergedAgentAnnotation,
  agentInstructionFromNote,
  defaultTocOpen,
  mentionDirectivesForAgent,
  normalizeDesktopReaderSettings,
  planSelectionMentionRoute,
  promptArticle,
  readDesktopReaderSettings,
  routeFocusReadingPlanMessages,
  usesOverlayToc,
  writeDesktopReaderSettings,
  type WebSourceBookcaseProps,
} from './app-source-bookcase-shared';
import { useSourceActiveConnection } from './use-source-active-connection';
import { useSourceSelectionComposer } from './use-source-selection-composer';
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
} from './use-source-reader-session';

export function WebSourceBookcase({
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
  onUpdateArticle,
}: WebSourceBookcaseProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const noteRefs = useRef(new Map<string, HTMLElement>());
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
    addPendingAnnotationAgent,
    removePendingAnnotationAgent,
    reviewAgents,
    saveAnnotations,
  } = useSourceReaderSession({
    agents,
    annotations: articleAnnotations,
    article,
    clearPendingOnArticleChange: true,
    clearPendingOnDeleteAnnotation: true,
    ignoreStaleArticleUpdates: true,
    onBeforeDeleteAnnotation: (annotationId) => {
      noteRefs.current.delete(annotationId);
    },
    onAgentCommentMentioned: (agent, annotation, comment) => {
      void requestAgentComment(agent, annotation, comment);
    },
    onOpenAnnotation: openAnnotation,
    onSaveArticle,
    userProfile,
  });
  const [agentAnnotateOpen, setAgentAnnotateOpen] = useState(false);
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
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() =>
    readDesktopReaderSettings(),
  );
  const [statusMessage, setStatusMessage] = useState('');
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
  const readingSections = useMemo(
    () =>
      articleRef.current && article
        ? buildReaderReadingSections(articleRef.current, tocItems, article.title)
        : [],
    [article, tocItems],
  );
  const annotationTotals = useMemo(
    () => ({
      annotations: annotations.length,
      comments: annotations.reduce(
        (count, annotation) => count + annotationThoughtComments(annotation).length,
        0,
      ),
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
    setAgentAnnotateOpen(false);
    setStatusMessage('');
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
    if (scrollToAnnotation(focusAnnotationId)) onFocusedAnnotation();
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
    const articleContext = promptArticle(currentArticle, currentArticleText());
    cancelComposer();
    const mentionedAgents = findMentionedAgents(note, annotationAgents);
    const annotation = createUserAnnotation(currentComposer.anchor, userProfile, '');
    await saveAnnotations([...currentArticle.annotations, annotation]);
    openAnnotation(annotation.id);
    for (const agent of mentionedAgents) addPendingAnnotationAgent(annotation.id, agent);

    if (mentionedAgents.length === 0) {
      const comment = createUserComment(userProfile, note, { now: annotation.createdAt });
      const nextAnnotations = appendAnnotationComment(
        annotationsRef.current,
        annotation.id,
        comment,
        annotation.createdAt,
      );
      const nextAnnotation = nextAnnotations?.find((item) => item.id === annotation.id);
      if (!nextAnnotations || !nextAnnotation) return;
      await saveAnnotations(nextAnnotations);
      void inferAnnotationMetadataForAnnotation(currentArticle.id, nextAnnotation, articleContext);
      return;
    }

    const mentionRoute = await planSelectionMentionRoute({
      desktop: window.yomitomoDesktop,
      note,
      targetAnchor: currentComposer.anchor,
      agents: mentionedAgents,
      article: articleContext,
    });
    let primaryComment: AnnotationComment | null = null;
    if (mentionRoute.createUserThought) {
      const comment = createUserComment(userProfile, note, { now: annotation.createdAt });
      const nextAnnotations = appendAnnotationComment(
        annotationsRef.current,
        annotation.id,
        comment,
        annotation.createdAt,
      );
      const nextAnnotation = nextAnnotations?.find((item) => item.id === annotation.id);
      if (nextAnnotations && nextAnnotation) {
        await saveAnnotations(nextAnnotations);
        primaryComment = annotationPrimaryComment(nextAnnotation);
        void inferAnnotationMetadataForAnnotation(
          currentArticle.id,
          nextAnnotation,
          articleContext,
        );
      }
    }

    for (const agent of mentionedAgents) {
      const directives = mentionDirectivesForAgent(mentionRoute, agent);
      const commentDirectives = directives.filter((directive) => directive.action === 'comment');
      const thoughtDirectives = directives.filter(
        (directive) => directive.action === 'create_thought',
      );
      let scheduledAgentRequest = false;
      if (primaryComment) {
        for (const directive of commentDirectives) {
          scheduledAgentRequest = true;
          void requestAgentComment(agent, annotation, primaryComment, undefined, {
            instruction: directive.instruction,
            readingIntent: directive.readingIntent,
            pendingAnnotationId: annotation.id,
          });
        }
      }
      const targetThoughtDirectives =
        thoughtDirectives.length > 0
          ? thoughtDirectives
          : !primaryComment && commentDirectives.length > 0
            ? commentDirectives
            : [];
      for (const directive of targetThoughtDirectives) {
        void requestAgentAnnotations(agent, {
          targetAnchor: currentComposer.anchor,
          instruction: directive.instruction || agentInstructionFromNote(note, [agent]),
          readingIntent: directive.readingIntent,
          article: articleContext,
          articleId: currentArticle.id,
          pendingAnnotationId: annotation.id,
        });
        scheduledAgentRequest = true;
      }
      if (!scheduledAgentRequest) {
        removePendingAnnotationAgent(annotation.id, agent.id);
      }
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

  async function requestAgentComment(
    agent: PublicAgent,
    annotation: Annotation,
    userComment: AnnotationComment,
    reviewTargetCommentId?: string,
    options: {
      instruction?: string;
      readingIntent?: AgentReadingIntent;
      pendingAnnotationId?: string;
    } = {},
  ) {
    const desktop = window.yomitomoDesktop;
    const currentArticle = latestArticleRef.current;
    if (!desktop || !currentArticle) {
      if (options.pendingAnnotationId) {
        removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
      }
      return;
    }

    try {
      await runSourceAgentCommentRequest({
        agent,
        annotation,
        userComment,
        instruction: options.instruction,
        readingIntent: options.readingIntent,
        desktop,
        currentArticle,
        articleText: currentArticleText(),
        reviewTargetCommentId,
        annotationsRef,
        applyAnnotations,
        saveAnnotations,
        setStatusMessage,
      });
    } finally {
      if (options.pendingAnnotationId) {
        removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
      }
    }
  }

  async function requestAnnotationReview(annotationId: string, selectedAgents: PublicAgent[]) {
    const desktop = window.yomitomoDesktop;
    const currentArticle = latestArticleRef.current;
    const currentAnnotation = annotationsRef.current.find(
      (annotation) => annotation.id === annotationId,
    );
    if (!desktop || !currentArticle || !currentAnnotation || selectedAgents.length === 0) return;

    await runSourceAgentReviewRequest({
      agents: selectedAgents,
      annotation: currentAnnotation,
      desktop,
      currentArticle,
      articleText: currentArticleText(),
      annotationsRef,
      applyAnnotations,
      saveAnnotations,
      setStatusMessage,
    });
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
    if (!desktop || !articleId || !articleContext) {
      if (options.pendingAnnotationId) {
        removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
      }
      return;
    }
    const articleScopedWrite = Boolean(options.articleId);
    if (!articleScopedWrite && annotatingAgentIds.includes(agent.id)) {
      if (options.pendingAnnotationId) {
        removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
      }
      return;
    }
    const visibleArticle = isCurrentArticle(articleId);
    const showProgress = !articleScopedWrite || visibleArticle;
    const requestInput = buildAgentAnnotationRequestInput(agent, options, {
      article: articleContext,
      annotations: annotationsRef.current,
      readingMemory: latestArticleRef.current?.focusCoReadingPlan?.readingMemory,
    });
    const routedReadingPlan = await routeFocusReadingPlanMessages({
      desktop,
      agent,
      agents: annotationAgents,
      article: articleContext,
      readingPlan: requestInput.readingPlan,
    });
    const routedRequestInput =
      routedReadingPlan === requestInput.readingPlan
        ? requestInput
        : {
            ...requestInput,
            readingPlan: routedReadingPlan,
            payload: {
              ...requestInput.payload,
              readingPlan: requestInput.payload.readingPlan ? routedReadingPlan : undefined,
            },
          };
    const { readingPlan } = routedRequestInput;
    let pendingAnnotationId = '';

    startAgentAnnotationPlayback(agent, readingPlan, routedRequestInput.playbackMode, showProgress);
    if (showProgress && options.targetAnchor && visibleArticle && !options.pendingAnnotationId) {
      const pendingAnnotation = createPendingAgentAnnotation(
        agent,
        options.targetAnchor,
        options.readingIntent,
      );
      pendingAnnotationId = pendingAnnotation.id;
      applyAnnotations([...annotationsRef.current, pendingAnnotation]);
      openAnnotation(pendingAnnotation.id);
    }
    try {
      const { result, annotationCount } = await runSourceAgentAnnotationRequest({
        desktop,
        requestInput: routedRequestInput,
        onAnnotation: (annotation) => {
          if (pendingAnnotationId) {
            applyAnnotations(withoutAnnotationId(annotationsRef.current, pendingAnnotationId));
            pendingAnnotationId = '';
          }
          return handleAgentAnnotationStreamItem(
            articleId,
            annotation,
            readingPlan,
            articleScopedWrite,
            articleScopedWrite ? articleContext.text : currentArticleText(),
          );
        },
      });
      if (requestInput.shouldSaveReadingMemory) {
        await saveFocusCoReadingReadingMemory(articleId, result.readingMemory);
      }
      if (showProgress && isCurrentArticle(articleId)) markVirtualReadingDone(agent.id);
      if (annotationCount === 0) {
        finishEmptyAgentAnnotationPlayback(agent, articleId, showProgress);
        return;
      }
      if (showProgress && isCurrentArticle(articleId)) finishVirtualReadingIfIdle(agent.id);
    } finally {
      if (pendingAnnotationId) {
        applyAnnotations(withoutAnnotationId(annotationsRef.current, pendingAnnotationId));
      }
      finishAgentAnnotationRequest(agent, showProgress);
      if (options.pendingAnnotationId) {
        removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
      }
    }
  }

  function startAgentAnnotationPlayback(
    agent: PublicAgent,
    readingPlan: AgentReadingPlanItem[],
    playbackMode: SourceAgentAnnotationPlaybackMode,
    showProgress: boolean,
  ) {
    if (!showProgress) return;
    markAgentAnnotating(agent.id, true);
    setStatusMessage(`${agent.nickname} 正在添加想法`);
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

  function updateReaderSettings(nextSettings: ReaderSettings) {
    const normalizedSettings = normalizeDesktopReaderSettings(nextSettings);
    setReaderSettings(normalizedSettings);
    writeDesktopReaderSettings(normalizedSettings);
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
        agentAnnotateOpen={agentAnnotateOpen}
        agentDockCompleting={agentDockCompleting}
        agentDockItems={agentDockItems}
        agentTheaterBoxes={agentTheaterBoxes}
        agents={annotationAgents}
        annotatingAgents={annotatingAgentIds}
        annotationTotals={annotationTotals}
        annotations={annotations}
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
        focusCoReadingPlan={article.focusCoReadingPlan}
        highlightChoice={highlightChoice}
        noteRefs={noteRefs}
        notesRef={railRef}
        pendingAnnotationAgents={pendingAnnotationAgents}
        readerSettings={readerSettings}
        reviewAgents={reviewAgents}
        readingSections={readingSections}
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
        onCancelAgentAnnotateMenu={() => setAgentAnnotateOpen(false)}
        onCancelComposer={cancelComposer}
        onClearActiveAnnotation={() => onOpenAnnotation(null)}
        onClearSelection={clearSelection}
        onClose={onClose}
        onCloseFloatingPanels={() => {
          setSettingsOpen(false);
          setAgentAnnotateOpen(false);
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
        onNavigateAnnotation={navigateAnnotation}
        onResolveAnnotationNavigation={resolveAnnotationNavigation}
        onHighlightClick={handleHighlightClick}
        onMouseUp={handleArticleMouseUp}
        onOpenComposer={openComposer}
        onPlanFocusCoReading={planFocusCoReading}
        onRequestAnnotationReview={requestAnnotationReview}
        onSaveFocusCoReadingPlan={saveFocusCoReadingPlan}
        onScrollToHeading={scrollToTocItem}
        onScrollToHighlight={(annotationId) => {
          openAnnotation(annotationId);
          scrollToAnnotation(annotationId);
        }}
        onStartAgentReadingPlan={(agent, readingPlan) => {
          setAgentAnnotateOpen(false);
          void requestAgentAnnotations(agent, { readingPlan });
        }}
        onToggleAgentAnnotate={() => {
          setSettingsOpen(false);
          setAgentAnnotateOpen((open) => !open);
        }}
        onToggleSettings={() => {
          setAgentAnnotateOpen(false);
          setSettingsOpen((open) => !open);
        }}
        onToggleToc={() => setTocOpen((open) => !open)}
        onUpdateReaderSettings={updateReaderSettings}
      />
    </section>
  );
}
