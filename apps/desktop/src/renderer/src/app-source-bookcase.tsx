import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type {
  Agent,
  AgentReadingPlanItem,
  AgentReadingIntent,
  Annotation,
  AnnotationType,
  ArticleReadingProgress,
  ArticleRecord,
  Comment as AnnotationComment,
  FocusCoReadingPlan,
  MessageSendShortcut,
  PublicAgent,
  QuestionStatus,
  ReadingMemory,
  SelectionActionShortcuts,
  UserProfile,
} from '@yomitomo/shared';
import {
  agentPersonalities,
  agentPersonalityName,
  createTextAnchor,
  hashText,
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
  createEpubTextAnchorFromQuote,
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
  clampNumber,
  defaultReaderSettings,
  useAgentAnnotationQueue,
  useAgentReadingDock,
  getShortcutModifier,
  ReaderAppView,
  annotationNavigationForInsertionIndex,
  annotationNavigationForReferenceIndex,
  buildReaderReadingSections,
  readerAnnotationScrollTop,
  readerConversationStyles,
  readerDesktopEmbeddedStyles,
  readerStyles,
  animateTheaterHighlight,
  selectionActionShortcut,
  sleep,
  type ActiveConnection,
  type AnnotationNavigationDirection,
  type HighlightChoice,
  type ReaderSettings,
  type SelectionAction,
  type VirtualCursorState,
} from '@yomitomo/reader-ui';
import { articleIdentityLine } from './app-utils';
import { OpenArticleButton } from './app-ui';
import type { ArticleUpdater, PromptArticle } from './app-reading-types';
import {
  closeFoliateView,
  configureFoliateView,
  currentFoliateContent,
  mappedFoliateRangeRects,
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
  rangeForEbookAnchorCursorInDocument,
  rangeForEbookAnchorInDocument,
  selectionContextForRange,
  updateKnownSectionPageCount,
  waitForAnimationFrame,
  waitForFoliateIdle,
  waitForFoliatePageInfo,
  type DomTextIndexTiming,
  type EbookBoxScheduleSnapshot,
  type EbookBoxScheduleState,
  type EbookBoxUpdateReason,
  type FoliatePageInfo,
  type FoliateRelocateDetail,
  type FoliateTocItem,
  type FoliateViewElement,
} from './app-ebook-reader-utils';

const DESKTOP_READER_SETTINGS_KEY = 'yomitomo.desktop.readerSettings';

type SourceSelectionAction = SelectionAction;

function defaultTocOpen() {
  return typeof window !== 'undefined' && window.innerWidth > 1320;
}

function usesOverlayToc() {
  return typeof window !== 'undefined' && window.innerWidth <= 1320;
}

function buildAnnotationConnectionPath(startX: number, startY: number, endX: number, endY: number) {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const length = Math.hypot(deltaX, deltaY);
  if (length < 1) {
    return `M ${formatPathNumber(startX)} ${formatPathNumber(startY)} L ${formatPathNumber(endX)} ${formatPathNumber(endY)}`;
  }

  const normalX = -deltaY / length;
  const normalY = deltaX / length;
  const segmentCount = Math.max(3, Math.min(6, Math.round(length / 74)));
  const amplitude = Math.min(18, Math.max(7, length * 0.035));
  const points = Array.from({ length: segmentCount + 1 }, (_, index) => {
    const progress = index / segmentCount;
    const endpoint = index === 0 || index === segmentCount;
    const direction = index % 2 === 0 ? -1 : 1;
    const offset = endpoint ? 0 : Math.sin(Math.PI * progress) * amplitude * direction;
    return {
      x: startX + deltaX * progress + normalX * offset,
      y: startY + deltaY * progress + normalY * offset,
    };
  });

  return smoothPathThroughPoints(points);
}

function smoothPathThroughPoints(points: Array<{ x: number; y: number }>) {
  const first = points[0]!;
  let path = `M ${formatPathNumber(first.x)} ${formatPathNumber(first.y)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const afterNext = points[Math.min(points.length - 1, index + 2)]!;
    const control1X = current.x + (next.x - previous.x) / 6;
    const control1Y = current.y + (next.y - previous.y) / 6;
    const control2X = next.x - (afterNext.x - current.x) / 6;
    const control2Y = next.y - (afterNext.y - current.y) / 6;

    path += ` C ${formatPathNumber(control1X)} ${formatPathNumber(control1Y)}, ${formatPathNumber(control2X)} ${formatPathNumber(control2Y)}, ${formatPathNumber(next.x)} ${formatPathNumber(next.y)}`;
  }

  return path;
}

function formatPathNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function readDesktopReaderSettings(): ReaderSettings {
  if (typeof window === 'undefined') return defaultReaderSettings;

  try {
    const raw = window.localStorage.getItem(DESKTOP_READER_SETTINGS_KEY);
    if (!raw) return defaultReaderSettings;
    return normalizeDesktopReaderSettings(JSON.parse(raw) as Partial<ReaderSettings>);
  } catch {
    return defaultReaderSettings;
  }
}

function normalizeDesktopReaderSettings(settings: Partial<ReaderSettings> | undefined) {
  return {
    fontSize: clampNumber(settings?.fontSize, 16, 28, defaultReaderSettings.fontSize),
    contentWidth: clampNumber(
      settings?.contentWidth,
      680,
      1080,
      defaultReaderSettings.contentWidth,
    ),
  };
}

function writeDesktopReaderSettings(settings: ReaderSettings) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(DESKTOP_READER_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    return;
  }
}

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

const sourceEbookReaderStyles = `
.source-ebook-reader-shell{
  grid-template-rows:minmax(0,1fr);
  padding:0;
}
.source-ebook-reader-shell .reader-app.has-toc.is-toc-open .reader-main{
  grid-template-columns:minmax(180px,260px) minmax(0,1fr);
}
.source-ebook-reader-shell .reader-app.has-toc .reader-surface{
  padding:18px 14px 24px;
}
.source-ebook-reader-shell .reader-app.has-toc.is-toc-open .reader-canvas{
  margin:0;
}
.source-ebook-reader-shell .reader-article{
  width:min(100%,var(--reader-content-width));
  max-width:min(var(--reader-content-width),calc(100vw - 120px));
  padding:0;
  border:0;
  border-radius:0;
  background:transparent;
  box-shadow:none;
}
.source-ebook-reader-shell .ebook-reader-content{
  display:grid;
  grid-template-rows:auto minmax(0,1fr) auto;
  gap:12px;
  height:100%;
  min-height:0;
  width:min(100%,var(--ebook-content-width));
}
.source-ebook-reader-shell .reader-canvas,
.source-ebook-reader-shell .reader-article{
  height:100%;
  min-height:0;
}
.source-ebook-reader-shell .reader-article{
  display:grid;
}
.source-ebook-reader-shell .ebook-page-control-row,
.source-ebook-reader-shell .ebook-reader-progress,
.source-ebook-reader-shell .ebook-foliate-frame,
.source-ebook-reader-shell .ebook-reader-status{
  width:100%;
}
.source-ebook-reader-shell .ebook-page-stage{
  width:100%;
  min-height:0;
}
.source-ebook-reader-shell .reader-edge-blur.is-bottom{
  display:none;
}
.source-ebook-reader-shell .reader-highlight.is-active::after{
  opacity:.8;
}
.source-ebook-reader-shell .reader-highlight.is-active::before{
  opacity:.88;
  filter:drop-shadow(0 1px 0 rgba(255,253,248,.72)) drop-shadow(0 0 4px rgba(37,29,22,.14));
}
@media(max-width:1320px){
  .source-ebook-reader-shell .reader-app.has-toc.is-toc-open .reader-canvas{
    margin:0 auto;
  }
}
`;

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!target || !('closest' in target)) return false;
  const closest = (target as { closest?: (selector: string) => Element | null }).closest;
  return typeof closest === 'function'
    ? Boolean(closest.call(target, 'input,textarea,select,[contenteditable="true"]'))
    : false;
}

function promptArticle(currentArticle: ArticleRecord | null, articleText: string): PromptArticle {
  return {
    title: currentArticle?.title || '',
    url: currentArticle?.canonicalUrl || currentArticle?.url || '',
    byline: currentArticle?.byline,
    text: articleText,
    ebookIndex: currentArticle?.ebook?.index,
    ebookMetadata: currentArticle?.ebook?.metadata,
  };
}

function articleWithAnnotations(article: ArticleRecord, annotations: Annotation[]) {
  return {
    ...article,
    annotations: sortAnnotations(annotations),
    updatedAt: new Date().toISOString(),
  };
}

function navigationForActiveAnnotation(annotations: Annotation[], activeId: string | null) {
  if (!activeId) return null;
  const activeIndex = annotations.findIndex((annotation) => annotation.id === activeId);
  return activeIndex >= 0 ? annotationNavigationForReferenceIndex(annotations, activeIndex) : null;
}

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

function ebookAnnotationNavigationState({
  activeId,
  annotations,
  boxes,
  pageInfo,
  article,
  view,
}: {
  activeId: string | null;
  annotations: Annotation[];
  boxes: HighlightBox[];
  pageInfo: FoliatePageInfo | null;
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> };
  view: FoliateViewElement | null;
}) {
  if (annotations.length === 0) return { previousId: null, nextId: null };

  const pageAnnotationIds = new Set(boxes.map((box) => box.annotationId).filter(Boolean));
  if (activeId && pageAnnotationIds.has(activeId)) {
    const activeNavigation = navigationForActiveAnnotation(annotations, activeId);
    if (activeNavigation) return activeNavigation;
  }

  const positions = annotationViewportPositions(annotations, boxes, 0);
  const firstPageAnnotation = positions[0];
  if (firstPageAnnotation) {
    return annotationNavigationForReferenceIndex(annotations, firstPageAnnotation.index);
  }

  const pageRange = ebookPageTextRange(article, view, pageInfo);
  if (!pageRange) return annotationNavigationForInsertionIndex(annotations, 0);

  return annotationNavigationForTextRange(annotations, pageRange.start, pageRange.end);
}

function annotationViewportPositions(
  annotations: Annotation[],
  boxes: HighlightBox[],
  canvasOffsetTop: number,
) {
  const indexById = new Map(annotations.map((annotation, index) => [annotation.id, index]));
  const positions = new Map<
    string,
    { annotationId: string; index: number; top: number; bottom: number }
  >();

  for (const box of boxes) {
    const index = indexById.get(box.annotationId);
    if (index === undefined) continue;

    const top = canvasOffsetTop + box.top;
    const bottom = top + box.height;
    const current = positions.get(box.annotationId);
    positions.set(box.annotationId, {
      annotationId: box.annotationId,
      index,
      top: current ? Math.min(current.top, top) : top,
      bottom: current ? Math.max(current.bottom, bottom) : bottom,
    });
  }

  return Array.from(positions.values()).toSorted(
    (left, right) => left.top - right.top || left.index - right.index,
  );
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

function annotationNavigationForTextRange(
  annotations: Annotation[],
  rangeStart: number,
  rangeEnd: number,
) {
  let previousId: string | null = null;
  let nextId: string | null = null;

  for (const annotation of annotations) {
    const start = annotationTextStart(annotation);
    const end = annotationTextEnd(annotation);
    if (end <= rangeStart) previousId = annotation.id;
    if (nextId === null && start >= rangeEnd) nextId = annotation.id;
  }

  return { previousId, nextId };
}

function annotationTextStart(annotation: Annotation) {
  return (
    finiteNumber(annotation.anchor.textStartInBook) ?? finiteNumber(annotation.anchor.start) ?? 0
  );
}

function annotationTextEnd(annotation: Annotation) {
  return (
    finiteNumber(annotation.anchor.textEndInBook) ??
    finiteNumber(annotation.anchor.end) ??
    annotationTextStart(annotation)
  );
}

function finiteNumber(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function ebookPageTextRange(
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> },
  view: FoliateViewElement | null,
  pageInfo: FoliatePageInfo | null,
) {
  if (!pageInfo) return null;
  const chapter = ebookChapterForFoliateSection(article, view, pageInfo.sectionIndex);
  if (!chapter) return null;

  const pageCount = Math.max(1, pageInfo.pageCount);
  const startRatio = Math.max(0, Math.min(1, pageInfo.pageIndex / pageCount));
  const endRatio = Math.max(startRatio, Math.min(1, (pageInfo.pageIndex + 1) / pageCount));
  return {
    start: chapter.textStart + Math.floor(chapter.textLength * startRatio),
    end: chapter.textStart + Math.ceil(chapter.textLength * endRatio),
  };
}

type SourceBookcaseProps = {
  agents: Agent[];
  annotations: Annotation[];
  article: ArticleRecord | null;
  focusAnnotationId: string | null;
  messageSendShortcut?: MessageSendShortcut;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  selectedAnnotationId: string | null;
  userProfile: UserProfile;
  onFocusedAnnotation: () => void;
  onClose: () => void;
  onOpenAnnotation: (annotationId: string | null) => void;
  onSaveArticle: (article: ArticleRecord) => Promise<void> | void;
  onSaveArticleReadingProgress: (
    articleId: string,
    progress: ArticleReadingProgress,
  ) => Promise<void> | void;
  onUpdateArticle: (articleId: string, update: ArticleUpdater) => Promise<void> | void;
};

type WebSourceBookcaseProps = Omit<SourceBookcaseProps, 'article'> & {
  article: ArticleRecord;
};

export function SourceBookcase(props: SourceBookcaseProps) {
  if (!props.article) {
    return (
      <section className="source-bookcase is-empty">
        <div className="source-empty">选择一篇文章查看原文</div>
      </section>
    );
  }

  if (isEbookArticle(props.article)) {
    return <EbookBookcase {...props} article={props.article} />;
  }

  return <WebSourceBookcase {...props} article={props.article} />;
}

function WebSourceBookcase({
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

type EbookBookcaseProps = Omit<SourceBookcaseProps, 'article'> & {
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> };
};

function EbookBookcase({
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
  const latestArticleRef = useRef<ArticleRecord | null>(article);
  const [annotations, setLocalAnnotations] = useState<Annotation[]>(() =>
    sortAnnotations(articleAnnotations),
  );
  const annotationsRef = useRef<Annotation[]>(annotations);
  const [boxes, setBoxes] = useState<HighlightBox[]>([]);
  const [temporaryBoxes, setTemporaryBoxes] = useState<HighlightBox[]>([]);
  const [activeConnection, setActiveConnection] = useState<ActiveConnection | null>(null);
  const [highlightChoice, setHighlightChoice] = useState<HighlightChoice | null>(null);
  const [selectionAction, setSelectionAction] = useState<SourceSelectionAction | null>(null);
  const [composer, setComposer] = useState<SourceSelectionAction | null>(null);
  const [agentAnnotateOpen, setAgentAnnotateOpen] = useState(false);
  const [annotatingAgentIds, setAnnotatingAgentIds] = useState<string[]>([]);
  const [agentTheaterBoxes, setAgentTheaterBoxes] = useState<HighlightBox[]>([]);
  const [virtualCursors, setVirtualCursors] = useState<VirtualCursorState[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [tocOpen, setTocOpen] = useState(() => defaultTocOpen());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commentsCloseKey, setCommentsCloseKey] = useState(0);
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
  const annotationAgents = useMemo(() => publicAnnotationAgents(agents), [agents]);
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
    completionBurstKey: ebookCompletionBurstKey,
    activateAgentDock: activateEbookAgentDock,
    markAgentDockDone: markEbookAgentDockDone,
    completeAgentDock: completeEbookAgentDock,
    clearAgentDock: clearEbookAgentDock,
  } = useAgentReadingDock(annotationAgents);
  const updateEbookBoxesRef = useRef<
    (reason: EbookBoxUpdateReason, schedule?: EbookBoxScheduleSnapshot) => void
  >(() => {});
  const updateBoxesFrameRef = useRef(0);
  const ebookBoxScheduleRef = useRef<EbookBoxScheduleState>({
    count: 0,
    cancelledFrameCount: 0,
    reasons: [],
    firstScheduledAt: 0,
  });
  const lastEbookBoxInputFingerprintRef = useRef('');
  const lastEbookBoxMetricsRef = useRef({
    boxCount: 0,
    rangeCount: 0,
    resolvedAnchorCount: 0,
  });
  const observedFoliateDocsRef = useRef(new WeakSet<Document>());
  const foliateDocCleanupsRef = useRef<Array<() => void>>([]);
  const handleFoliateSelectionRef = useRef<(doc: Document) => void>(() => {});
  const handleFoliatePointerDownRef = useRef<() => void>(() => {});
  const handleFoliateSelectionShortcutRef = useRef<(event: KeyboardEvent) => void>(() => {});
  const ebookVirtualCursorRef = useRef(new Map<string, VirtualCursorState>());
  const ebookVirtualReadingTimersRef = useRef(new Map<string, number>());
  const ebookAgentAnimationQueueRef = useRef(Promise.resolve());
  const ebookVirtualReadingStepRef = useRef(new Map<string, number>());
  const ebookVirtualReadingStepSizeRef = useRef(new Map<string, number>());
  const activeEbookDockAgentIdsRef = useRef(new Set<string>());
  const ebookDockHadFailureRef = useRef(false);

  useEffect(() => {
    onSaveArticleReadingProgressRef.current = onSaveArticleReadingProgress;
  }, [onSaveArticleReadingProgress]);

  useEffect(() => {
    const currentArticle = latestArticleRef.current;
    if (
      currentArticle?.id === article.id &&
      timestampValue(article.updatedAt) < timestampValue(currentArticle.updatedAt)
    ) {
      return;
    }
    latestArticleRef.current = article;
  }, [article]);

  useEffect(() => {
    const currentArticle = latestArticleRef.current;
    if (
      currentArticle?.id === article.id &&
      timestampValue(article.updatedAt) < timestampValue(currentArticle.updatedAt)
    ) {
      return;
    }
    const nextAnnotations = sortAnnotations(articleAnnotations);
    setLocalAnnotations(nextAnnotations);
    annotationsRef.current = nextAnnotations;
  }, [article.id, article.updatedAt, articleAnnotations]);

  useLayoutEffect(() => {
    noteRefs.current.clear();
    annotationsRef.current = sortAnnotations(articleAnnotations);
    setLocalAnnotations(sortAnnotations(articleAnnotations));
    setBoxes([]);
    setTemporaryBoxes([]);
    setActiveConnection(null);
    setHighlightChoice(null);
    setSelectionAction(null);
    setComposer(null);
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
    lastEbookBoxInputFingerprintRef.current = '';
    lastEbookBoxMetricsRef.current = { boxCount: 0, rangeCount: 0, resolvedAnchorCount: 0 };
    setProgress(article.readingProgress?.progress ?? 0);
    readerStateStatusRef.current = 'loading';
    setReaderState({ status: 'loading', message: '正在打开 EPUB。' });
  }, [article.id]);

  useEffect(() => {
    readerSettingsRef.current = readerSettings;
    configureFoliateView(viewRef.current, readerSettings);
    scheduleEbookBoxUpdate('reader_settings');
  }, [readerSettings]);

  useEffect(() => {
    readerStateStatusRef.current = readerState.status;
  }, [readerState.status]);

  const recalculateActiveConnection = useCallback(() => {
    if (!selectedAnnotationId) {
      setActiveConnection(null);
      return;
    }

    const canvasElement = canvasRef.current;
    const scrollElement = surfaceRef.current;
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

  const updateEbookBoxes = useCallback(
    (reason: EbookBoxUpdateReason, schedule?: EbookBoxScheduleSnapshot) => {
      const currentArticle = latestArticleRef.current;
      const view = viewRef.current;
      const canvasElement = canvasRef.current;
      const content = currentFoliateContent(view);
      const doc = content?.doc;
      if (!currentArticle?.ebook || !view || !canvasElement || !doc) {
        setBoxes([]);
        return;
      }

      const ebookArticle = currentArticle as EbookBookcaseProps['article'];
      const startedAt = performance.now();
      const currentPageInfo = view.getPageInfo?.() ?? null;
      const sectionIndex =
        content.index ?? currentPageInfo?.sectionIndex ?? pageInfoSectionIndexRef.current ?? 0;
      const pageInfoKey = currentPageInfo
        ? `${currentPageInfo.sectionIndex}:${currentPageInfo.pageIndex}:${currentPageInfo.pageCount}`
        : '';
      const chapter = ebookChapterForFoliateSection(ebookArticle, view, sectionIndex);
      const canvasRect = canvasElement.getBoundingClientRect();
      const readerSettingsSnapshot = readerSettingsRef.current;
      const layoutKey = paginationLayoutKeyRef.current;
      const visibleAnnotations = annotationsRef.current;
      const annotationSignature = ebookHighlightAnnotationsSignature(
        visibleAnnotations,
        userProfile,
        annotationAgents,
      );
      const inputFingerprint = hashText(
        [
          currentArticle.id,
          sectionIndex,
          chapter?.id || '',
          annotationSignature,
          pageInfoKey,
          layoutKey,
          readerStateStatusRef.current,
          readerSettingsSnapshot.fontSize,
          readerSettingsSnapshot.contentWidth,
          Math.round(canvasRect.width),
          Math.round(canvasRect.height),
        ].join('|'),
      );
      const sameInputAsPrevious = lastEbookBoxInputFingerprintRef.current === inputFingerprint;
      let skippedChapterCount = 0;
      const searchableAnnotations = visibleAnnotations.filter((annotation) => {
        if (chapter && annotation.anchor.chapterId && annotation.anchor.chapterId !== chapter.id) {
          skippedChapterCount += 1;
          return false;
        }
        return true;
      });
      if (sameInputAsPrevious) {
        const previousMetrics = lastEbookBoxMetricsRef.current;
        recordRendererPerformanceTiming('reader_highlight_boxes', {
          source: 'ebook-foliate',
          result: 'skipped_same_input',
          reason,
          scheduleCount: schedule?.count || 0,
          scheduleReasons: schedule?.reasons || [],
          cancelledFrameCount: schedule?.cancelledFrameCount || 0,
          scheduleDelayMs: schedule?.delayMs,
          inputFingerprint,
          sameInputAsPrevious,
          annotationSignature,
          pageInfoKey,
          paginationLayoutKey: layoutKey,
          readerStateStatus: readerStateStatusRef.current,
          readerFontSize: readerSettingsSnapshot.fontSize,
          readerContentWidth: readerSettingsSnapshot.contentWidth,
          elapsedMs: rendererPerformanceElapsedMs(startedAt),
          articleId: currentArticle.id,
          sectionIndex,
          pageIndex: currentPageInfo?.pageIndex,
          pageCount: currentPageInfo?.pageCount,
          chapterId: chapter?.id,
          annotationCount: visibleAnnotations.length,
          skippedChapterCount,
          anchorLookupCount: searchableAnnotations.length,
          resolvedAnchorCount: previousMetrics.resolvedAnchorCount,
          rangeCount: previousMetrics.rangeCount,
          boxCount: previousMetrics.boxCount,
          domTextIndexBuildCount: 0,
          domTextIndexBuildMs: 0,
          domTextIndexTextChars: 0,
          chapterTextChars:
            chapter?.textEnd !== undefined ? chapter.textEnd - chapter.textStart : undefined,
        });
        return;
      }
      lastEbookBoxInputFingerprintRef.current = inputFingerprint;
      let resolvedAnchorCount = 0;
      let rangeCount = 0;
      let anchorLookupCount = 0;
      const domTextIndexTiming: DomTextIndexTiming = {
        buildCount: 0,
        buildMs: 0,
        textChars: 0,
      };
      const nextBoxes = searchableAnnotations.flatMap((annotation) => {
        anchorLookupCount += 1;
        const range = rangeForEbookAnchorInDocument(doc, annotation.anchor, domTextIndexTiming);
        if (!range) return [];
        resolvedAnchorCount += 1;
        rangeCount += 1;
        return foliateRangeHighlightBoxes(range, canvasRect, annotation.id).map((box) =>
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
      lastEbookBoxMetricsRef.current = {
        boxCount: nextBoxes.length,
        rangeCount,
        resolvedAnchorCount,
      };
      setBoxes(nextBoxes);
      recordRendererPerformanceTiming('reader_highlight_boxes', {
        source: 'ebook-foliate',
        result: 'updated',
        reason,
        scheduleCount: schedule?.count || 0,
        scheduleReasons: schedule?.reasons || [],
        cancelledFrameCount: schedule?.cancelledFrameCount || 0,
        scheduleDelayMs: schedule?.delayMs,
        inputFingerprint,
        sameInputAsPrevious,
        annotationSignature,
        pageInfoKey,
        paginationLayoutKey: layoutKey,
        readerStateStatus: readerStateStatusRef.current,
        readerFontSize: readerSettingsSnapshot.fontSize,
        readerContentWidth: readerSettingsSnapshot.contentWidth,
        elapsedMs: rendererPerformanceElapsedMs(startedAt),
        articleId: currentArticle.id,
        sectionIndex,
        pageIndex: currentPageInfo?.pageIndex,
        pageCount: currentPageInfo?.pageCount,
        chapterId: chapter?.id,
        annotationCount: visibleAnnotations.length,
        skippedChapterCount,
        anchorLookupCount,
        resolvedAnchorCount,
        rangeCount,
        boxCount: nextBoxes.length,
        domTextIndexBuildCount: domTextIndexTiming.buildCount,
        domTextIndexBuildMs: Number(domTextIndexTiming.buildMs.toFixed(2)),
        domTextIndexTextChars: domTextIndexTiming.textChars,
        chapterTextChars:
          chapter?.textEnd !== undefined ? chapter.textEnd - chapter.textStart : undefined,
      });
    },
    [annotationAgents, userProfile],
  );

  updateEbookBoxesRef.current = updateEbookBoxes;

  useLayoutEffect(() => {
    updateEbookBoxes('layout_effect');
  }, [updateEbookBoxes, readerState.status]);

  useLayoutEffect(() => {
    recalculateActiveConnection();
  }, [annotations, boxes, recalculateActiveConnection]);

  useEffect(() => {
    const scrollElement = surfaceRef.current;
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
    const schedule = ebookBoxScheduleRef.current;
    schedule.count += 1;
    schedule.reasons.push(reason);
    if (schedule.firstScheduledAt === 0) schedule.firstScheduledAt = performance.now();
    if (updateBoxesFrameRef.current) {
      schedule.cancelledFrameCount += 1;
      window.cancelAnimationFrame(updateBoxesFrameRef.current);
    }
    updateBoxesFrameRef.current = window.requestAnimationFrame(() => {
      const snapshot: EbookBoxScheduleSnapshot = {
        count: schedule.count,
        cancelledFrameCount: schedule.cancelledFrameCount,
        reasons: Array.from(new Set(schedule.reasons)),
        delayMs: rendererPerformanceElapsedMs(schedule.firstScheduledAt),
      };
      schedule.count = 0;
      schedule.cancelledFrameCount = 0;
      schedule.reasons = [];
      schedule.firstScheduledAt = 0;
      updateBoxesFrameRef.current = 0;
      updateEbookBoxesRef.current(reason, snapshot);
      recalculateActiveConnection();
    });
  }

  function cleanupFoliateDocumentListeners() {
    for (const cleanup of foliateDocCleanupsRef.current) cleanup();
    foliateDocCleanupsRef.current = [];
    observedFoliateDocsRef.current = new WeakSet<Document>();
  }

  function attachFoliateDocumentListeners(view: FoliateViewElement | null) {
    const doc = currentFoliateContent(view)?.doc;
    if (!doc || observedFoliateDocsRef.current.has(doc)) return;
    observedFoliateDocsRef.current.add(doc);

    const handleSelection = () => {
      window.setTimeout(() => {
        const selection = doc.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
        handleFoliateSelectionRef.current(doc);
      }, 0);
    };
    const handlePointerDown = () => handleFoliatePointerDownRef.current();
    const handleShortcut = (event: KeyboardEvent) =>
      handleFoliateSelectionShortcutRef.current(event);

    doc.addEventListener('mouseup', handleSelection);
    doc.addEventListener('keyup', handleSelection);
    doc.addEventListener('keydown', handleShortcut);
    doc.addEventListener('pointerdown', handlePointerDown, true);
    foliateDocCleanupsRef.current.push(() => {
      doc.removeEventListener('mouseup', handleSelection);
      doc.removeEventListener('keyup', handleSelection);
      doc.removeEventListener('keydown', handleShortcut);
      doc.removeEventListener('pointerdown', handlePointerDown, true);
    });
  }

  handleFoliatePointerDownRef.current = () => {
    setHighlightChoice(null);
    setSelectionAction(null);
    setTemporaryBoxes([]);
    if (composer) setComposer(null);
    if (settingsOpen || agentAnnotateOpen) {
      setSettingsOpen(false);
      setAgentAnnotateOpen(false);
    }
    if (selectedAnnotationId) onOpenAnnotation(null);
  };

  handleFoliateSelectionRef.current = (doc: Document) => {
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
      setSelectionAction(null);
      setTemporaryBoxes([]);
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
    setSelectionAction({ x: position.x, y: position.y, anchor });
    setComposer(null);
    setTemporaryBoxes(
      foliateRangeHighlightBoxes(range, canvasRect, 'source-selection').map((box) =>
        Object.assign(box, {
          annotationId: '__selection__',
          contributorId: userProfile.id,
          color: userProfile.annotationColor,
        }),
      ),
    );
    selection.removeAllRanges();
  };

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

  function ebookCursorAgent(annotation: Annotation) {
    return annotationAgents.find(
      (agent) => agent.id === annotation.agentId || agent.username === annotation.agentUsername,
    );
  }

  function updateEbookVirtualCursor(cursorId: string, cursor: VirtualCursorState | null) {
    if (cursor) ebookVirtualCursorRef.current.set(cursorId, cursor);
    else ebookVirtualCursorRef.current.delete(cursorId);
    setVirtualCursors(Array.from(ebookVirtualCursorRef.current.values()));
  }

  function stopEbookVirtualReadingTimer(agentId: string) {
    const timerId = ebookVirtualReadingTimersRef.current.get(agentId);
    if (timerId !== undefined) window.clearInterval(timerId);
    ebookVirtualReadingTimersRef.current.delete(agentId);
    ebookVirtualReadingStepRef.current.delete(agentId);
    ebookVirtualReadingStepSizeRef.current.delete(agentId);
  }

  function startEbookAgentDock(agent: PublicAgent) {
    activeEbookDockAgentIdsRef.current.add(agent.id);
    activateEbookAgentDock(agent);
  }

  function finishEbookAgentDock(agentId: string, succeeded: boolean) {
    if (!activeEbookDockAgentIdsRef.current.has(agentId)) return;
    markEbookAgentDockDone(agentId);
    activeEbookDockAgentIdsRef.current.delete(agentId);
    if (!succeeded) ebookDockHadFailureRef.current = true;
    if (activeEbookDockAgentIdsRef.current.size > 0) return;

    const shouldCelebrate = !ebookDockHadFailureRef.current;
    ebookDockHadFailureRef.current = false;
    completeEbookAgentDock(shouldCelebrate);
  }

  function cleanupEbookAgentTheater() {
    for (const timerId of ebookVirtualReadingTimersRef.current.values()) {
      window.clearInterval(timerId);
    }
    ebookVirtualReadingTimersRef.current.clear();
    ebookVirtualReadingStepRef.current.clear();
    ebookVirtualReadingStepSizeRef.current.clear();
    ebookVirtualCursorRef.current.clear();
    activeEbookDockAgentIdsRef.current.clear();
    ebookDockHadFailureRef.current = false;
    clearEbookAgentDock();
    setVirtualCursors([]);
    setAgentTheaterBoxes([]);
  }

  function ebookReadingCursorForAnchor(
    agent: PublicAgent,
    anchor: Annotation['anchor'] | undefined,
    step: number,
  ): VirtualCursorState | null {
    const canvasElement = canvasRef.current;
    const doc = currentFoliateContent(viewRef.current)?.doc;
    if (canvasElement && doc && anchor) {
      const canvasRect = canvasElement.getBoundingClientRect();
      const range = rangeForEbookAnchorCursorInDocument(doc, anchor, step);
      const rect = range ? lastFoliateRangeViewportRect(range, canvasRect) : null;
      if (rect) {
        return {
          id: agent.id,
          visible: true,
          x: rect.left + rect.width,
          y: rect.top + rect.height / 2,
          label: `${agent.nickname} 正在阅读`,
          offscreen: null,
          agent,
        };
      }
    }

    const fallbackRect =
      viewHostRef.current?.getBoundingClientRect() || canvasRef.current?.getBoundingClientRect();
    if (!fallbackRect) return null;
    return {
      id: agent.id,
      visible: true,
      x: fallbackRect.left + Math.min(fallbackRect.width - 40, 72 + step * 12),
      y: fallbackRect.top + 56,
      label: `${agent.nickname} 正在阅读`,
      offscreen: null,
      agent,
    };
  }

  function startEbookVirtualReading(agent: PublicAgent, anchor: Annotation['anchor'] | undefined) {
    stopEbookVirtualReadingTimer(agent.id);
    const readerIndex = ebookVirtualReadingTimersRef.current.size;
    const interval = 170 + Math.floor(Math.random() * 100);
    const stepSize = 3 + readerIndex * 2 + Math.floor(Math.random() * 5);
    ebookVirtualReadingStepRef.current.set(agent.id, readerIndex * 11);
    ebookVirtualReadingStepSizeRef.current.set(agent.id, stepSize);
    const tick = () => {
      const step = ebookVirtualReadingStepRef.current.get(agent.id) || 0;
      ebookVirtualReadingStepRef.current.set(
        agent.id,
        step + (ebookVirtualReadingStepSizeRef.current.get(agent.id) || 4),
      );
      const cursor = ebookReadingCursorForAnchor(agent, anchor, step);
      if (cursor) updateEbookVirtualCursor(agent.id, cursor);
    };
    tick();
    ebookVirtualReadingTimersRef.current.set(agent.id, window.setInterval(tick, interval));
  }

  function finishEbookVirtualReading(agentId: string, suffix = '批注完成') {
    stopEbookVirtualReadingTimer(agentId);
    const current = ebookVirtualCursorRef.current.get(agentId);
    if (!current) return;
    updateEbookVirtualCursor(agentId, {
      ...current,
      x: Math.min(window.innerWidth - 80, current.x + 72),
      y: Math.max(72, current.y - 42),
      label: `${current.agent?.nickname || '助手'} ${suffix}`,
      leaving: true,
    });
    window.setTimeout(() => updateEbookVirtualCursor(agentId, null), 900);
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
    if (!isCurrentArticle(articleId)) {
      await appendAgentAnnotationToArticle(articleId, annotation);
      return;
    }

    const canvasElement = canvasRef.current;
    const surfaceElement = surfaceRef.current;
    const doc = currentFoliateContent(viewRef.current)?.doc;
    const cursorAgent = ebookCursorAgent(annotation);
    const cursorId =
      cursorAgent?.id || annotation.agentId || annotation.agentUsername || annotation.id;
    const range = doc ? rangeForEbookAnchorInDocument(doc, annotation.anchor) : null;
    if (!canvasElement || !surfaceElement || !range) {
      await appendAgentAnnotationToArticle(articleId, annotation);
      if (options.revealMissingRange) void goToAnnotation(annotation.id);
      finishEbookVirtualReading(cursorId);
      return;
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const rects = mappedFoliateRangeRects(range, canvasRect);
    const firstRect = rects[0];
    const lastRect = rects[rects.length - 1];
    if (!firstRect || !lastRect) {
      await appendAgentAnnotationToArticle(articleId, annotation);
      if (options.revealMissingRange) void goToAnnotation(annotation.id);
      finishEbookVirtualReading(cursorId);
      return;
    }

    const surfaceRect = surfaceElement.getBoundingClientRect();
    const isVisible = firstRect.bottom >= surfaceRect.top && firstRect.top <= surfaceRect.bottom;
    if (!isVisible) {
      updateEbookVirtualCursor(cursorId, {
        id: cursorId,
        visible: true,
        x: surfaceRect.left + surfaceRect.width / 2,
        y: firstRect.top < surfaceRect.top ? surfaceRect.top + 18 : surfaceRect.bottom - 18,
        label: `${annotation.agentNickname || annotation.agentUsername || '助手'} 正在${firstRect.top < surfaceRect.top ? '上方' : '下方'}批注`,
        offscreen: firstRect.top < surfaceRect.top ? 'above' : 'below',
        agent: cursorAgent,
      });
      await sleep(700);
      await appendAgentAnnotationToArticle(articleId, annotation);
      if (options.revealMissingRange) void goToAnnotation(annotation.id);
      finishEbookVirtualReading(cursorId);
      return;
    }

    stopEbookVirtualReadingTimer(cursorId);
    updateEbookVirtualCursor(cursorId, {
      id: cursorId,
      visible: true,
      x: firstRect.left,
      y: firstRect.top + firstRect.height / 2,
      label: `${annotation.agentNickname || annotation.agentUsername || '助手'} 正在批注`,
      offscreen: null,
      agent: cursorAgent,
    });
    await sleep(260);

    const theaterBoxes = foliateRangeHighlightBoxes(
      range,
      canvasRect,
      `theater_${annotation.id}`,
    ).map((box) =>
      Object.assign({}, box, { annotationId: annotation.id, color: annotation.color }),
    );
    await animateTheaterHighlight(theaterBoxes, annotation.anchor.exact.length, (nextBoxes) => {
      const cursorBox = nextBoxes[nextBoxes.length - 1];
      if (cursorBox) {
        updateEbookVirtualCursor(cursorId, {
          id: cursorId,
          visible: true,
          x: canvasRect.left + cursorBox.left + cursorBox.width,
          y: canvasRect.top + cursorBox.top + cursorBox.height / 2,
          label: `${annotation.agentNickname || annotation.agentUsername || '助手'} 正在批注`,
          offscreen: null,
          agent: cursorAgent,
        });
      }
      setAgentTheaterBoxes(nextBoxes);
    });

    await appendAgentAnnotationToArticle(articleId, annotation);
    setAgentTheaterBoxes([]);
    updateEbookVirtualCursor(cursorId, {
      id: cursorId,
      visible: true,
      x: lastRect.right,
      y: lastRect.top + lastRect.height / 2,
      label: `${annotation.agentNickname || annotation.agentUsername || '助手'} 批注完成`,
      offscreen: null,
      agent: cursorAgent,
    });
    await sleep(360);
    finishEbookVirtualReading(cursorId);
  }

  async function saveAnnotations(nextAnnotations: Annotation[]) {
    const currentArticle = latestArticleRef.current;
    if (!currentArticle) return;
    const previousHighlightSignature = ebookHighlightAnnotationsSignature(
      annotationsRef.current,
      userProfile,
      annotationAgents,
    );
    const nextArticle = articleWithAnnotations(currentArticle, nextAnnotations);
    const sortedAnnotations = nextArticle.annotations;
    const nextHighlightSignature = ebookHighlightAnnotationsSignature(
      sortedAnnotations,
      userProfile,
      annotationAgents,
    );
    latestArticleRef.current = nextArticle;
    annotationsRef.current = sortedAnnotations;
    setLocalAnnotations(sortedAnnotations);
    await onSaveArticle(nextArticle);
    if (nextHighlightSignature !== previousHighlightSignature) {
      scheduleEbookBoxUpdate('annotations_saved');
    }
  }

  function applyAnnotations(nextAnnotations: Annotation[]) {
    const currentArticle = latestArticleRef.current;
    if (!currentArticle) return null;
    const previousHighlightSignature = ebookHighlightAnnotationsSignature(
      annotationsRef.current,
      userProfile,
      annotationAgents,
    );
    const sortedAnnotations = sortAnnotations(nextAnnotations);
    const nextHighlightSignature = ebookHighlightAnnotationsSignature(
      sortedAnnotations,
      userProfile,
      annotationAgents,
    );
    const nextArticle = {
      ...currentArticle,
      annotations: sortedAnnotations,
      updatedAt: new Date().toISOString(),
    };
    latestArticleRef.current = nextArticle;
    annotationsRef.current = sortedAnnotations;
    setLocalAnnotations(sortedAnnotations);
    if (nextHighlightSignature !== previousHighlightSignature) {
      scheduleEbookBoxUpdate('annotations_applied');
    }
    return nextArticle;
  }

  function currentArticleText() {
    return ebookText;
  }

  function isCurrentArticle(articleId: string) {
    return latestArticleRef.current?.id === articleId;
  }

  function openAnnotation(annotationId: string) {
    setHighlightChoice(null);
    setSelectionAction(null);
    setComposer(null);
    setTemporaryBoxes([]);
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
    if (isCurrentArticle(articleId)) {
      const nextAnnotations = [...annotationsRef.current, annotation];
      applyAnnotations(nextAnnotations);
      openAnnotation(annotation.id);
    }
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
    void goToAnnotation(annotationId);
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
    if (!options.articleId && annotatingAgentIds.includes(agent.id)) return;

    setAnnotatingAgentIds((ids) => (ids.includes(agent.id) ? ids : [...ids, agent.id]));
    setStatusMessage(`${agent.nickname} 正在批注`);
    const readingPlan =
      options.readingPlan || targetAnchorReadingPlan(options.targetAnchor, options.readingIntent);
    const visibleArticle = isCurrentArticle(articleId);
    if (visibleArticle) startEbookAgentDock(agent);
    if (visibleArticle && options.targetAnchor) {
      startEbookVirtualReading(agent, options.targetAnchor);
    }
    let annotationCount = 0;
    let requestFailed = false;
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
            articleContext.text,
          );
          if (!annotation) return;
          annotationCount += 1;
          if (isCurrentArticle(articleId)) {
            enqueueEbookAgentAnnotationPlayback(articleId, annotation, {
              revealMissingRange: Boolean(options.targetAnchor),
            });
            return;
          }
          void appendAgentAnnotationToArticle(articleId, annotation);
        },
      );
      if (!options.targetAnchor && readingPlan.length > 0) {
        await saveFocusCoReadingReadingMemory(articleId, result.readingMemory);
      }
      if (annotationCount === 0 && isCurrentArticle(articleId)) {
        if (options.targetAnchor) finishEbookVirtualReading(agent.id, '没有批注');
        setStatusMessage(`${agent.nickname} 暂无新批注`);
        window.setTimeout(() => setStatusMessage(''), 1400);
      }
      if (visibleArticle) {
        await ebookAgentAnimationQueueRef.current;
        await sleep(900);
        finishEbookAgentDock(agent.id, true);
      }
    } catch (error) {
      requestFailed = true;
      throw error;
    } finally {
      if (requestFailed && options.targetAnchor && isCurrentArticle(articleId)) {
        finishEbookVirtualReading(agent.id, '批注失败');
      }
      if (requestFailed && visibleArticle) finishEbookAgentDock(agent.id, false);
      setAnnotatingAgentIds((ids) => ids.filter((id) => id !== agent.id));
      setStatusMessage((message) => (message.includes('暂无新批注') ? message : ''));
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
  handleFoliateSelectionShortcutRef.current = (event: KeyboardEvent) => {
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
  };

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

export function isEbookArticle(
  article: ArticleRecord | null,
): article is ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> } {
  return article?.sourceType === 'ebook' && Boolean(article.ebook?.chapters.length);
}

function publicAnnotationAgents(agents: Agent[]): PublicAgent[] {
  return agents
    .filter((agent) => agent.kind === 'annotation' && agent.enabled)
    .map((agent) => {
      const personality = agentPersonalities.find(
        (item) => item.id === agent.presetId || item.soul === agent.soul,
      );
      return {
        id: agent.id,
        kind: agent.kind,
        enabled: agent.enabled,
        presetId: agent.presetId,
        nickname: agent.nickname,
        username: agent.username,
        avatar: agent.avatar,
        annotationColor: agent.annotationColor,
        annotationDensity: agent.annotationDensity,
        personalityName: agentPersonalityName(agent),
        pinyin: personality?.pinyin,
        temperature: agent.temperature,
      };
    });
}

function timestampValue(value: string | number | undefined) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function targetAnchorReadingPlan(
  anchor: Annotation['anchor'] | undefined,
  readingIntent: AgentReadingIntent | undefined,
): AgentReadingPlanItem[] {
  if (!anchor || !readingIntent) return [];
  return [
    {
      sectionId: 'target-selection',
      sectionTitle: '选区',
      sectionStart: anchor.start,
      sectionEnd: anchor.end,
      readingIntent,
    },
  ];
}

function agentInstructionFromNote(note: string, mentionedAgents: PublicAgent[]) {
  let instruction = note.trim();
  for (const agent of mentionedAgents) {
    const handles = [agent.username, agent.nickname].filter(Boolean);
    for (const handle of handles) {
      instruction = instruction.replace(
        new RegExp(`(^|\\s)@${escapeRegExp(handle)}(?=[\\s，。,.!?！？、;；:]|$)`, 'gu'),
        ' ',
      );
    }
  }
  return instruction.replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function rendererPerformanceElapsedMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}

function recordRendererPerformanceTiming(event: string, data: Record<string, unknown>) {
  void window.yomitomoDesktop?.recordPerformanceTiming?.({ event, data });
}
