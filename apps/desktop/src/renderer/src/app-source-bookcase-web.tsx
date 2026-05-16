import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentReadingIntent,
  AgentReadingPlanItem,
  Annotation,
  AnnotationType,
  ArticleRecord,
  Comment as AnnotationComment,
  FocusCoReadingPlan,
  PublicAgent,
  QuestionStatus,
  ReadingMemory,
} from '@yomitomo/shared';
import {
  createTextAnchor,
  makeId,
  normalizeMessageSendShortcut,
  normalizeSelectionActionShortcuts,
  resolveTextAnchor,
} from '@yomitomo/shared';
import {
  appendAnnotationComment,
  annotationColor,
  annotationPrimaryComment,
  annotationThreadComments,
  annotationIdsAtHighlightPoint,
  articleTitleTocItems,
  createEpubTextAnchor,
  extractTocItems,
  findMentionedAgents,
  findCurrentTocTarget,
  getArticleSelection,
  isRangeInsideArticle,
  mergeReadingMemory,
  offsetFromArticleStart,
  rangeFromOffsets,
  rangeHighlightBoxes,
  selectionActionPosition,
  sortAnnotations,
  createUserAnnotation,
  createUserComment,
  type ExtractTocOptions,
  type HighlightBox,
  type TocItem,
  updateAnnotationComment,
} from '@yomitomo/core';
import {
  buildTocAnnotationStats,
  useAgentAnnotationQueue,
  getShortcutModifier,
  ReaderAppView,
  annotationNavigationForInsertionIndex,
  annotationNavigationForReferenceIndex,
  buildReaderReadingSections,
  readerAnnotationScrollTop,
  readerConversationStyles,
  readerDesktopEmbeddedStyles,
  readerStyles,
  type ActiveConnection,
  type AnnotationNavigationDirection,
  type HighlightChoice,
  type ReaderSettings,
} from '@yomitomo/reader-ui';
import { OpenArticleButton } from './app-ui';
import type { PromptArticle } from './app-reading-types';
import { articleIdentityLine } from './app-utils';
import {
  agentInstructionFromNote,
  annotationViewportPositions,
  articleWithAnnotations,
  buildAnnotationConnectionPath,
  defaultTocOpen,
  navigationForActiveAnnotation,
  normalizeDesktopReaderSettings,
  promptArticle,
  publicAnnotationAgents,
  readDesktopReaderSettings,
  recordRendererPerformanceTiming,
  rendererPerformanceElapsedMs,
  targetAnchorReadingPlan,
  usesOverlayToc,
  writeDesktopReaderSettings,
  type SourceSelectionAction,
  type WebSourceBookcaseProps,
} from './app-source-bookcase-shared';

const sourceTocOptions: ExtractTocOptions = {
  headingSelector:
    '.reader-article-body h1, .reader-article-body h2, .reader-article-body h3, .reader-article-body h4',
  inferredSelector:
    '.reader-article-body p, .reader-article-body div, .reader-article-body section',
};

const sourceReaderTocStyles = `
@media(min-width:1321px){
  .source-reader-shell .reader-app.has-toc.is-toc-open .reader-main{
    grid-template-columns:minmax(180px,260px) minmax(0,1fr);
  }
  .source-reader-shell .reader-app.has-toc .reader-surface{
    padding:18px 14px 64px;
  }
  .source-reader-shell .reader-app.has-toc.is-toc-open .reader-canvas{
    margin:0;
  }
}
.reader-app.has-toc.is-toc-open .reader-toc{
  margin:18px 0 18px 18px;
  padding:14px;
  border:1px solid rgba(150,123,84,.28);
  border-radius:8px;
  background:rgba(255,253,248,.72);
}
.reader-toc-title{
  margin:0 0 10px;
  color:#746d63;
  font-size:11px;
  font-weight:900;
  letter-spacing:.12em;
  text-transform:none;
}
.reader-toc-item{
  display:grid;
  width:100%;
  margin:0;
  border:0;
  border-radius:8px;
  background:transparent;
  color:#746d63;
  font-size:12px;
  font-weight:820;
  line-height:1.3;
  padding:9px 8px;
}
.reader-toc-item:hover{
  background:rgba(245,239,226,.9);
  color:#28231d;
}
.reader-toc-item-main{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  align-items:center;
  gap:8px;
}
.reader-toc-item-main>span:first-child{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.reader-toc-summary{
  margin-top:12px;
  border-radius:8px;
}
@media(max-width:1320px){
  .reader-app.has-toc.is-toc-open .reader-toc{
    margin:0;
    border-radius:0;
  }
}
`;

function webAnnotationNavigationState({
  activeId,
  annotations,
  boxes,
  canvasElement,
  scrollElement,
}: {
  activeId: string | null;
  annotations: Annotation[];
  boxes: HighlightBox[];
  canvasElement: HTMLElement | null;
  scrollElement: HTMLElement | null;
}) {
  const activeNavigation = navigationForActiveAnnotation(annotations, activeId);
  if (activeNavigation) return activeNavigation;
  if (annotations.length === 0) return { previousId: null, nextId: null };
  if (!canvasElement || !scrollElement)
    return annotationNavigationForInsertionIndex(annotations, 0);

  const positions = annotationViewportPositions(annotations, boxes, canvasElement.offsetTop);
  if (positions.length === 0) return annotationNavigationForInsertionIndex(annotations, 0);

  const viewportTop = scrollElement.scrollTop;
  const viewportBottom = viewportTop + scrollElement.clientHeight;
  const visible = positions
    .filter((position) => position.bottom >= viewportTop && position.top <= viewportBottom)
    .toSorted((left, right) => left.top - right.top || left.index - right.index)[0];

  if (visible) return annotationNavigationForReferenceIndex(annotations, visible.index);

  return annotationNavigationForViewportRange(annotations, positions, viewportTop, viewportBottom);
}

function annotationNavigationForViewportRange(
  annotations: Annotation[],
  positions: Array<{ index: number; top: number; bottom: number }>,
  viewportTop: number,
  viewportBottom: number,
) {
  const previous = positions.findLast((position) => position.bottom < viewportTop);
  const next = positions.find((position) => position.top > viewportBottom);

  return {
    previousId: previous ? (annotations[previous.index]?.id ?? null) : null,
    nextId: next ? (annotations[next.index]?.id ?? null) : null,
  };
}

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
  const [annotations, setLocalAnnotations] = useState<Annotation[]>(() =>
    sortAnnotations(articleAnnotations),
  );
  const latestArticleRef = useRef<ArticleRecord | null>(article);
  const annotationsRef = useRef<Annotation[]>(annotations);
  const [boxes, setBoxes] = useState<HighlightBox[]>([]);
  const [temporaryBoxes, setTemporaryBoxes] = useState<HighlightBox[]>([]);
  const [activeConnection, setActiveConnection] = useState<ActiveConnection | null>(null);
  const [highlightChoice, setHighlightChoice] = useState<HighlightChoice | null>(null);
  const [selectionAction, setSelectionAction] = useState<SourceSelectionAction | null>(null);
  const [composer, setComposer] = useState<SourceSelectionAction | null>(null);
  const [agentAnnotateOpen, setAgentAnnotateOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(() => defaultTocOpen());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commentsCloseKey, setCommentsCloseKey] = useState(0);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(() =>
    readDesktopReaderSettings(),
  );
  const [replyRequest, setReplyRequest] = useState<{ annotationId: string; key: number } | null>(
    null,
  );
  const [statusMessage, setStatusMessage] = useState('');
  const annotationAgents = useMemo(() => publicAnnotationAgents(agents), [agents]);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const contentHtml = useMemo(() => (article ? sourceArticleBodyHtml(article) : ''), [article]);
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
        (count, annotation) => count + annotationThreadComments(annotation).length,
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
  useEffect(() => {
    latestArticleRef.current = article;
  }, [article]);

  useEffect(() => {
    const nextAnnotations = sortAnnotations(articleAnnotations);
    setLocalAnnotations(nextAnnotations);
    annotationsRef.current = nextAnnotations;
  }, [article?.id, articleAnnotations]);

  useEffect(() => cleanupVirtualReadingSessions, []);

  useEffect(() => {
    const articleElement = articleRef.current;
    const canvasElement = canvasRef.current;
    if (!article || !articleElement || !canvasElement) {
      setBoxes([]);
      setTocItems([]);
      return;
    }

    let frame = 0;
    const updateBoxes = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const startedAt = performance.now();
        const text = articleElement.textContent || '';
        const canvasRect = canvasElement.getBoundingClientRect();
        const extractedTocItems = extractTocItems(articleElement, sourceTocOptions);
        const nextTocItems =
          extractedTocItems.length > 0
            ? extractedTocItems
            : articleTitleTocItems(articleElement, article.title);
        let resolvedAnchorCount = 0;
        let rangeCount = 0;
        const nextBoxes = annotations.flatMap((annotation) => {
          const position = resolveTextAnchor(text, annotation.anchor);
          if (!position) return [];
          resolvedAnchorCount += 1;
          const range = rangeFromOffsets(articleElement, position.start, position.end);
          if (!range) return [];
          rangeCount += 1;
          return rangeHighlightBoxes(range, canvasRect, annotation.id).map((box) =>
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
        setTocItems(nextTocItems);
        setBoxes(nextBoxes);
        recordRendererPerformanceTiming('reader_highlight_boxes', {
          source: 'web',
          elapsedMs: rendererPerformanceElapsedMs(startedAt),
          articleId: article.id,
          annotationCount: annotations.length,
          resolvedAnchorCount,
          rangeCount,
          boxCount: nextBoxes.length,
          textChars: text.length,
          tocItemCount: nextTocItems.length,
          contentHtmlChars: contentHtml.length,
        });
      });
    };

    updateBoxes();
    const resizeObserver = new ResizeObserver(updateBoxes);
    resizeObserver.observe(articleElement);
    resizeObserver.observe(canvasElement);
    window.addEventListener('resize', updateBoxes);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateBoxes);
    };
  }, [annotationAgents, annotations, article, contentHtml, userProfile]);

  useEffect(() => {
    setHighlightChoice(null);
    setSelectionAction(null);
    setComposer(null);
    setTemporaryBoxes([]);
  }, [article?.id, annotations]);

  useEffect(() => {
    setNotesOpen(false);
    setTocOpen(defaultTocOpen());
    setSettingsOpen(false);
    setAgentAnnotateOpen(false);
    setReplyRequest(null);
    setStatusMessage('');
  }, [article?.id]);

  const recalculateActiveConnection = useCallback(() => {
    if (!selectedAnnotationId) {
      setActiveConnection(null);
      return;
    }

    const canvasElement = canvasRef.current;
    const scrollElement = scrollRef.current;
    const noteElement = noteRefs.current.get(selectedAnnotationId);
    const annotation = annotations.find((item) => item.id === selectedAnnotationId);
    const activeBoxes = boxes.filter((box) => box.annotationId === selectedAnnotationId);
    const readerElement = canvasElement?.closest('.reader-app');
    if (
      !canvasElement ||
      !scrollElement ||
      !noteElement ||
      !annotation ||
      !readerElement ||
      activeBoxes.length === 0
    ) {
      setActiveConnection(null);
      return;
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const readerRect = readerElement.getBoundingClientRect();
    const scrollRect = scrollElement.getBoundingClientRect();
    const noteRect = noteElement.getBoundingClientRect();
    const noteY = noteRect.top - readerRect.top + Math.min(72, noteRect.height / 2);
    const box = activeBoxes.toSorted((left, right) => {
      const leftY = canvasRect.top - readerRect.top + left.top + left.height / 2;
      const rightY = canvasRect.top - readerRect.top + right.top + right.height / 2;
      return Math.abs(leftY - noteY) - Math.abs(rightY - noteY);
    })[0];
    if (!box) {
      setActiveConnection(null);
      return;
    }

    const startX = canvasRect.left - readerRect.left + box.left + box.width + 6;
    const startY = canvasRect.top - readerRect.top + box.top + box.height / 2;
    const endX = noteRect.left - readerRect.left - 8;
    const endY = noteY;
    const highlightViewportY = readerRect.top + startY;
    const highlightVisible =
      highlightViewportY >= scrollRect.top - 24 && highlightViewportY <= scrollRect.bottom + 24;
    const noteVisible =
      noteRect.bottom >= scrollRect.top + 24 && noteRect.top <= scrollRect.bottom - 24;
    if (!highlightVisible || !noteVisible) {
      setActiveConnection(null);
      return;
    }

    const path = buildAnnotationConnectionPath(startX, startY, endX, endY);
    const color = annotationColor(annotation, userProfile, annotationAgents);
    setActiveConnection((current) =>
      current?.path === path && current.color === color ? current : { path, color },
    );
  }, [annotationAgents, annotations, boxes, selectedAnnotationId, userProfile]);

  useLayoutEffect(() => {
    recalculateActiveConnection();
  }, [annotations, boxes, recalculateActiveConnection]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(recalculateActiveConnection);
    };

    scrollElement?.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      scrollElement?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [recalculateActiveConnection]);

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
      setHighlightChoice(null);
      setSelectionAction(null);
      setComposer(null);
      setTemporaryBoxes([]);
      onOpenAnnotation(annotationId);
      scrollToAnnotation(annotationId);
    },
    [onOpenAnnotation, scrollToAnnotation],
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
    setHighlightChoice(null);
    setSelectionAction(null);
    setComposer(null);
    setTemporaryBoxes([]);
    onOpenAnnotation(annotationId);
  }

  async function saveAnnotations(nextAnnotations: Annotation[]) {
    const currentArticle = latestArticleRef.current;
    if (!currentArticle) return;
    const nextArticle = articleWithAnnotations(currentArticle, nextAnnotations);
    const sortedAnnotations = nextArticle.annotations;
    latestArticleRef.current = nextArticle;
    annotationsRef.current = sortedAnnotations;
    setLocalAnnotations(sortedAnnotations);
    await onSaveArticle(nextArticle);
  }

  function applyAnnotations(nextAnnotations: Annotation[]) {
    const currentArticle = latestArticleRef.current;
    if (!currentArticle) return null;
    const sortedAnnotations = sortAnnotations(nextAnnotations);
    const nextArticle = {
      ...currentArticle,
      annotations: sortedAnnotations,
      updatedAt: new Date().toISOString(),
    };
    latestArticleRef.current = nextArticle;
    annotationsRef.current = sortedAnnotations;
    setLocalAnnotations(sortedAnnotations);
    return nextArticle;
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
      setSelectionAction(null);
      setTemporaryBoxes([]);
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
    setSelectionAction({ x: position.x, y: position.y, anchor });
    setComposer(null);
    setTemporaryBoxes(
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

  function cancelComposer() {
    setComposer(null);
    setSelectionAction(null);
    setTemporaryBoxes([]);
  }

  async function copySelection(action: SourceSelectionAction) {
    await navigator.clipboard.writeText(action.anchor.exact);
    setSelectionAction(null);
    setTemporaryBoxes([]);
  }

  function openComposer(action: SourceSelectionAction) {
    const canvasWidth = canvasRef.current?.clientWidth || 360;
    setCommentsCloseKey((key) => key + 1);
    setComposer({
      x: Math.min(action.x, Math.max(4, canvasWidth - 364)),
      y: action.y,
      anchor: action.anchor,
    });
    setSelectionAction(null);
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
      const instructions = await resolveAgentMentionInstructions(
        note,
        mentionedAgents,
        currentComposer.anchor,
        currentArticle.id,
        articleContext,
      );
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

  async function resolveAgentMentionInstructions(
    note: string,
    mentionedAgents: PublicAgent[],
    anchor: Annotation['anchor'],
    articleId: string,
    articleContext: PromptArticle,
  ) {
    const commonInstruction = agentInstructionFromNote(note, mentionedAgents) || undefined;
    const baseInstructions = mentionedAgents.map((agent) => ({
      agent,
      instruction: commonInstruction,
      readingIntent: undefined as AgentReadingIntent | undefined,
    }));
    const desktop = window.yomitomoDesktop;
    if (!desktop) return baseInstructions;

    try {
      if (isCurrentArticle(articleId)) setStatusMessage('正在拆解助手任务');
      const instructions = await desktop.planAgentMentionInstructions({
        article: articleContext,
        targetAnchor: anchor,
        agents: mentionedAgents,
        note,
      });
      if (isCurrentArticle(articleId)) setStatusMessage('');
      return mentionedAgents.map((agent) => {
        const instruction = instructions.find(
          (item) => item.agentId === agent.id || item.agentUsername === agent.username,
        );
        return {
          agent,
          instruction: instruction?.instruction || commonInstruction,
          readingIntent: instruction?.readingIntent,
        };
      });
    } catch (error) {
      if (isCurrentArticle(articleId)) {
        setStatusMessage(error instanceof Error ? error.message : '助手任务拆解失败');
        window.setTimeout(() => setStatusMessage(''), 1800);
      }
      return baseInstructions;
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
      setStatusMessage(error instanceof Error ? error.message : '批注标签生成失败');
      window.setTimeout(() => setStatusMessage(''), 1800);
    }
  }

  async function appendAgentAnnotationToArticle(articleId: string, annotation: Annotation) {
    await onUpdateArticle(articleId, (targetArticle) =>
      articleWithAnnotations(targetArticle, [...targetArticle.annotations, annotation]),
    );
  }

  async function addComment(annotationId: string, content: string) {
    const trimmed = content.trim();
    const currentArticle = latestArticleRef.current;
    if (!trimmed || !currentArticle) return;
    const userComment = createUserComment(userProfile, trimmed);
    const isFollowUpQuestion = /[?？]/.test(trimmed);
    const comment = isFollowUpQuestion
      ? { ...userComment, questionStatus: 'open' as const }
      : userComment;
    const currentAnnotations = isFollowUpQuestion
      ? currentArticle.annotations
      : currentArticle.annotations.map((annotation) =>
          annotation.id !== annotationId
            ? annotation
            : Object.assign({}, annotation, {
                questionStatus:
                  annotation.questionStatus === 'open' ||
                  (annotation.annotationType === 'question' && !annotation.questionStatus)
                    ? 'answered'
                    : annotation.questionStatus,
                comments: annotation.comments.map((item) =>
                  item.questionStatus === 'open' ||
                  (!item.questionStatus && /[?？]/.test(item.content))
                    ? { ...item, questionStatus: 'answered' as const }
                    : item,
                ),
              }),
        );
    const nextAnnotations = appendAnnotationComment(
      currentAnnotations,
      annotationId,
      comment,
      userComment.createdAt,
    );
    const nextAnnotation = nextAnnotations?.find((annotation) => annotation.id === annotationId);
    if (!nextAnnotations || !nextAnnotation) return;

    await saveAnnotations(nextAnnotations);
    openAnnotation(annotationId);

    const mentionedAgents = findMentionedAgents(trimmed, annotationAgents);
    for (const agent of mentionedAgents) {
      void requestAgentComment(agent, nextAnnotation, comment);
    }
  }

  async function setAnnotationQuestionStatus(annotationId: string, status: QuestionStatus) {
    const now = new Date().toISOString();
    const nextAnnotations = annotationsRef.current.map((annotation) =>
      annotation.id === annotationId
        ? { ...annotation, questionStatus: status, updatedAt: now }
        : annotation,
    );
    await saveAnnotations(nextAnnotations);
    openAnnotation(annotationId);
  }

  async function setCommentQuestionStatus(
    annotationId: string,
    commentId: string,
    status: QuestionStatus,
  ) {
    const now = new Date().toISOString();
    const nextAnnotations = annotationsRef.current.map((annotation) =>
      annotation.id === annotationId
        ? {
            ...annotation,
            updatedAt: now,
            comments: annotation.comments.map((comment) =>
              comment.id === commentId ? { ...comment, questionStatus: status } : comment,
            ),
          }
        : annotation,
    );
    await saveAnnotations(nextAnnotations);
    openAnnotation(annotationId);
  }

  function focusQuestionAnnotation(annotationId: string) {
    setNotesOpen(false);
    openAnnotation(annotationId);
    scrollToAnnotation(annotationId);
  }

  function answerQuestion(annotationId: string) {
    focusQuestionAnnotation(annotationId);
    setReplyRequest({ annotationId, key: Date.now() });
  }

  async function deleteAnnotation(annotationId: string) {
    const nextAnnotations = annotationsRef.current.filter(
      (annotation) => annotation.id !== annotationId,
    );
    noteRefs.current.delete(annotationId);
    await saveAnnotations(nextAnnotations);
  }

  async function requestAgentComment(
    agent: PublicAgent,
    annotation: Annotation,
    userComment: AnnotationComment,
  ) {
    const desktop = window.yomitomoDesktop;
    const currentArticle = latestArticleRef.current;
    if (!desktop || !currentArticle) return;

    setStatusMessage(`${agent.nickname} 正在回复`);
    let pendingCommentId = '';
    let pendingDelta = '';
    let pendingFrame = 0;
    const flushDelta = () => {
      pendingFrame = 0;
      if (!pendingDelta || !pendingCommentId) return;
      const delta = pendingDelta;
      pendingDelta = '';
      const nextAnnotations = updateAnnotationComment(
        annotationsRef.current,
        annotation.id,
        pendingCommentId,
        (comment) => Object.assign({}, comment, { content: comment.content + delta }),
      );
      if (nextAnnotations) applyAnnotations(nextAnnotations);
    };
    const scheduleDeltaFlush = () => {
      if (pendingFrame) return;
      pendingFrame = window.requestAnimationFrame(flushDelta);
    };
    try {
      await desktop.requestAgentCommentStream(
        {
          agentId: agent.id,
          agentUsername: agent.username,
          readingIntent: annotation.readingIntent || userComment.readingIntent,
          article: promptArticle(currentArticle, currentArticleText()),
          annotation,
          userComment,
        },
        (event) => {
          if (event.type === 'start') {
            pendingCommentId = event.comment.id;
            const nextAnnotations = appendAnnotationComment(
              annotationsRef.current,
              annotation.id,
              event.comment,
              event.comment.createdAt,
            );
            if (nextAnnotations) applyAnnotations(nextAnnotations);
            return;
          }

          pendingDelta += event.delta;
          scheduleDeltaFlush();
        },
      );
      if (pendingFrame) {
        window.cancelAnimationFrame(pendingFrame);
        flushDelta();
      }
      const current = annotationsRef.current.find((item) => item.id === annotation.id);
      const agentComment = current?.comments.find(
        (comment) =>
          comment.author === 'ai' &&
          comment.agentId === agent.id &&
          comment.id === pendingCommentId &&
          comment.pending,
      );
      if (agentComment) {
        const nextAnnotations = updateAnnotationComment(
          annotationsRef.current,
          annotation.id,
          agentComment.id,
          (comment) => Object.assign({}, comment, { pending: false }),
        );
        if (nextAnnotations) await saveAnnotations(nextAnnotations);
      }
    } finally {
      if (pendingFrame) window.cancelAnimationFrame(pendingFrame);
      setStatusMessage('');
    }
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
    options: {
      annotationType?: AnnotationType;
      readingIntent?: AgentReadingIntent;
      instruction?: string;
      targetAnchor?: Annotation['anchor'];
      readingPlan?: AgentReadingPlanItem[];
      article?: PromptArticle;
      articleId?: string;
    } = {},
  ) {
    const desktop = window.yomitomoDesktop;
    const currentArticle = latestArticleRef.current;
    const articleId = options.articleId || currentArticle?.id;
    const articleContext =
      options.article ||
      (currentArticle ? promptArticle(currentArticle, currentArticleText()) : null);
    if (!desktop || !articleId || !articleContext) return;
    const articleScopedWrite = Boolean(options.articleId);
    if (!articleScopedWrite && annotatingAgentIds.includes(agent.id)) return;
    const visibleArticle = isCurrentArticle(articleId);
    const showProgress = !articleScopedWrite || visibleArticle;

    if (showProgress) {
      markAgentAnnotating(agent.id, true);
      setStatusMessage(`${agent.nickname} 正在批注`);
    }
    const readingPlan =
      options.readingPlan || targetAnchorReadingPlan(options.targetAnchor, options.readingIntent);
    if (showProgress) {
      startVirtualReading(
        agent,
        readingPlan,
        options.targetAnchor ? 'target' : readingPlan.length > 0 ? 'careful' : 'article',
      );
    }
    let annotationCount = 0;
    try {
      const result = await desktop.requestAgentAnnotationsStream(
        {
          agentId: agent.id,
          agentUsername: agent.username,
          annotationType: options.annotationType,
          readingIntent: options.readingIntent,
          instruction: options.instruction,
          annotations:
            options.targetAnchor || readingPlan.length > 0 ? annotationsRef.current : undefined,
          readingMemory:
            !options.targetAnchor && readingPlan.length > 0
              ? latestArticleRef.current?.focusCoReadingPlan?.readingMemory
              : undefined,
          targetAnchor: options.targetAnchor,
          readingPlan: !options.targetAnchor && readingPlan.length > 0 ? readingPlan : undefined,
          article: articleContext,
        },
        (event) => {
          if (event.type !== 'item') return;
          const annotation = constrainAgentPlanAnnotation(
            event.annotation,
            readingPlan,
            articleScopedWrite ? articleContext.text : currentArticleText(),
          );
          if (!annotation) return;
          annotationCount += 1;
          if (articleScopedWrite) {
            void appendAgentAnnotationToArticle(articleId, annotation);
            return;
          }
          if (!isCurrentArticle(articleId)) return;
          enqueueAgentAnnotation(annotation);
          void processAgentAnnotationQueue();
        },
      );
      if (!options.targetAnchor && readingPlan.length > 0) {
        await saveFocusCoReadingReadingMemory(articleId, result.readingMemory);
      }
      if (showProgress && isCurrentArticle(articleId)) markVirtualReadingDone(agent.id);
      if (annotationCount === 0) {
        if (showProgress && isCurrentArticle(articleId)) {
          finishVirtualReading(agent.id, '没有批注');
          setStatusMessage(`${agent.nickname} 暂无新批注`);
          window.setTimeout(() => setStatusMessage(''), 1400);
        }
        return;
      }
      if (showProgress && isCurrentArticle(articleId)) finishVirtualReadingIfIdle(agent.id);
    } finally {
      if (showProgress) {
        markAgentAnnotating(agent.id, false);
        setStatusMessage((message) => (message.includes('暂无新批注') ? message : ''));
      }
    }
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
        surfaceRef={scrollRef}
        temporaryBoxes={temporaryBoxes}
        toolbarArticleAction={
          <>
            <span className="reader-toolbar-current-view">当前：原文阅读</span>
            <OpenArticleButton article={article} iconOnly />
          </>
        }
        tocAnnotationStats={tocStats}
        tocItems={tocItems}
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
        onMouseUp={handleArticleMouseUp}
        onOpenComposer={openComposer}
        onPlanFocusCoReading={planFocusCoReading}
        onSaveFocusCoReadingPlan={saveFocusCoReadingPlan}
        onScrollToHeading={scrollToTocItem}
        onScrollToHighlight={(annotationId) => {
          openAnnotation(annotationId);
          scrollToAnnotation(annotationId);
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
        onUpdateReaderSettings={updateReaderSettings}
      />
    </section>
  );
}

function sourceArticleBodyHtml(article: ArticleRecord) {
  const container = document.createElement('div');
  container.innerHTML =
    article.contentHtml || `<p>${escapeHtml(article.excerpt || '暂无原文内容')}</p>`;
  container.querySelectorAll('script, style, link, iframe, object, embed').forEach((element) => {
    element.remove();
  });
  container.querySelectorAll<HTMLElement>('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trimStart().slice(0, 32).toLowerCase();
      if (
        name.startsWith('on') ||
        ((name === 'href' || name === 'src') && value.startsWith('javascript:'))
      ) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return container.innerHTML;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
