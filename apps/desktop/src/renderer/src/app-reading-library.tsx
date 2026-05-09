import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, RefreshCcw, Trash2 } from 'lucide-react';
import type {
  Agent,
  AgentReadingPlanItem,
  AgentReadingIntent,
  Annotation,
  AnnotationType,
  ArticleRecord,
  Comment as AnnotationComment,
  PublicAgent,
  QuestionStatus,
  UserProfile,
} from '@yomitomo/shared';
import { agentPersonalityName, createTextAnchor, resolveTextAnchor } from '@yomitomo/shared';
import {
  appendAnnotationComment,
  annotationColor,
  annotationThreadComments,
  annotationIdsAtHighlightPoint,
  extractTocItems,
  findMentionedAgents,
  findCurrentTocTarget,
  getArticleSelection,
  isRangeInsideArticle,
  offsetFromArticleStart,
  rangeFromOffsets,
  rangeHighlightBoxes,
  selectionActionPosition,
  sortAnnotations,
  sortArticles,
  createUserAnnotation,
  createUserComment,
  type ExtractTocOptions,
  type HighlightBox,
  type TocItem,
  updateAnnotationComment,
} from '@yomitomo/core';
import {
  buildTocAnnotationStats,
  defaultReaderSettings,
  useAgentAnnotationQueue,
  getShortcutModifier,
  ReaderAppView,
  readerAnnotationScrollTop,
  readerConversationStyles,
  readerDesktopEmbeddedStyles,
  readerStyles,
  type ActiveConnection,
  type HighlightChoice,
  type ReaderReadingSection,
  type SelectionAction,
} from '@yomitomo/reader-ui';
import { formatDate, urlHost } from './app-utils';
import { Button } from './components/ui/button';
import { OpenArticleButton } from './app-ui';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { ReadingCard } from './app-reading-card-panel';
import { ArticleBook } from './app-article-book';

const ARTICLE_DELETE_HOLD_MS = 1400;
const LIBRARY_PAGE_SIZE_OPTIONS = [8, 12, 16, 24] as const;

type SourceSelectionAction = SelectionAction;

function defaultTocOpen() {
  return typeof window !== 'undefined' && window.innerWidth > 1320;
}

function usesOverlayToc() {
  return typeof window !== 'undefined' && window.innerWidth <= 1320;
}

export function ReadingLibrary({
  agents,
  articles,
  userProfile,
  onDeleteArticle,
  onRefresh,
  onSaveArticle,
}: {
  agents: Agent[];
  articles: ArticleRecord[];
  userProfile: UserProfile;
  onDeleteArticle: (articleId: string) => Promise<void> | void;
  onRefresh: () => void;
  onSaveArticle: (article: ArticleRecord) => Promise<void> | void;
}) {
  const [activeShelf, setActiveShelf] = useState<'library' | 'source' | 'card'>('library');
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [sourceFocusAnnotationId, setSourceFocusAnnotationId] = useState<string | null>(null);
  const sortedArticles = useMemo<ArticleRecord[]>(() => sortArticles(articles), [articles]);
  const selectedArticle =
    sortedArticles.find((article) => article.id === selectedArticleId) || null;
  const annotations = useMemo<Annotation[]>(
    () => (selectedArticle ? sortAnnotations(selectedArticle.annotations) : []),
    [selectedArticle],
  );
  const reviewAgents = useMemo(
    () => agents.filter((agent) => agent.kind === 'review' && agent.enabled),
    [agents],
  );
  const selectedAnnotation =
    annotations.find((annotation) => annotation.id === selectedAnnotationId) || null;
  const stats = articles.reduce(
    (result, article) => ({
      annotations: result.annotations + article.annotations.length,
      comments:
        result.comments +
        article.annotations.reduce(
          (count, annotation) => count + annotationThreadComments(annotation).length,
          0,
        ),
    }),
    { annotations: 0, comments: 0 },
  );

  useEffect(() => {
    if (!selectedArticle) {
      setSelectedAnnotationId(null);
      return;
    }
    const nextAnnotation = sortAnnotations(selectedArticle.annotations)[0] || null;
    setSelectedAnnotationId(nextAnnotation?.id || null);
  }, [selectedArticle?.id]);

  useEffect(() => {
    if (selectedArticleId && !sortedArticles.some((article) => article.id === selectedArticleId)) {
      setSelectedArticleId(null);
    }
  }, [selectedArticleId, sortedArticles]);

  async function deleteLibraryArticle(articleId: string) {
    await onDeleteArticle(articleId);
    if (selectedArticleId === articleId) {
      openLibraryShelf();
    }
  }

  function openArticle(article: ArticleRecord) {
    setSelectedArticleId(article.id);
    setSelectedAnnotationId(sortAnnotations(article.annotations)[0]?.id || null);
    setSourceFocusAnnotationId(null);
    setActiveShelf('source');
  }

  function openLibraryShelf() {
    setSelectedArticleId(null);
    setSelectedAnnotationId(null);
    setSourceFocusAnnotationId(null);
    setActiveShelf('library');
  }

  function openSourceShelf() {
    if (!selectedArticle) return;
    setSourceFocusAnnotationId(selectedAnnotation?.id || null);
    setActiveShelf('source');
  }

  function openCardShelf() {
    if (!selectedArticle) return;
    setSourceFocusAnnotationId(null);
    setActiveShelf('card');
  }

  if (activeShelf === 'library' || !selectedArticle) {
    return (
      <LibraryHome
        articles={articles}
        sortedArticles={sortedArticles}
        stats={stats}
        onDeleteArticle={deleteLibraryArticle}
        onOpenArticle={openArticle}
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <div className={`library-bookcase-screen is-${activeShelf}-expanded`}>
      <div className="library-shelf is-collapsed is-library-bookcase">
        <ShelfTab icon={<BookOpen size={18} />} label="阅读库" onClick={openLibraryShelf} />
      </div>

      <div
        className={
          activeShelf === 'source' ? 'library-shelf is-expanded' : 'library-shelf is-collapsed'
        }
      >
        <ShelfTab
          count={annotations.length}
          icon={<BookOpen size={18} />}
          label="原文"
          onClick={openSourceShelf}
        />
        <div className="library-shelf-content">
          {activeShelf === 'source' ? (
            <SourceBookcase
              agents={agents}
              annotations={annotations}
              article={selectedArticle}
              focusAnnotationId={sourceFocusAnnotationId}
              selectedAnnotationId={selectedAnnotation?.id || null}
              userProfile={userProfile}
              onFocusedAnnotation={() => setSourceFocusAnnotationId(null)}
              onClose={openLibraryShelf}
              onOpenAnnotation={setSelectedAnnotationId}
              onSaveArticle={onSaveArticle}
            />
          ) : null}
        </div>
      </div>

      <div
        className={
          activeShelf === 'card' ? 'library-shelf is-expanded' : 'library-shelf is-collapsed'
        }
      >
        <ShelfTab
          count={selectedArticle?.readingCard?.sections.length || (selectedArticle ? 4 : 0)}
          icon={<BookOpen size={18} />}
          label="读后笔记"
          onClick={openCardShelf}
        />
        <div className="library-shelf-content">
          {activeShelf === 'card' ? (
            <ReadingCard
              article={selectedArticle}
              reviewAgents={reviewAgents}
              onGenerated={onRefresh}
              onOpenEvidence={(annotationId) => {
                setSelectedAnnotationId(annotationId);
                setSourceFocusAnnotationId(annotationId);
                setActiveShelf('source');
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LibraryHome({
  articles,
  sortedArticles,
  stats,
  onDeleteArticle,
  onOpenArticle,
  onRefresh,
}: {
  articles: ArticleRecord[];
  sortedArticles: ArticleRecord[];
  stats: { annotations: number; comments: number };
  onDeleteArticle: (articleId: string) => Promise<void>;
  onOpenArticle: (article: ArticleRecord) => void;
  onRefresh: () => void;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const pageCount = Math.max(1, Math.ceil(sortedArticles.length / pageSize));
  const pageArticles = sortedArticles.slice((page - 1) * pageSize, page * pageSize);
  const pageNumbers = useMemo(() => {
    const visibleCount = Math.min(5, pageCount);
    const start = Math.min(
      Math.max(1, page - Math.floor(visibleCount / 2)),
      pageCount - visibleCount + 1,
    );
    return Array.from({ length: visibleCount }, (_, index) => start + index);
  }, [page, pageCount]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  return (
    <section className="library-home">
      <header className="library-home-header">
        <div>
          <h2>阅读库</h2>
          <p>
            {articles.length} 篇文章 · {stats.annotations} 条批注 · {stats.comments} 条讨论
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={onRefresh}>
          <RefreshCcw size={16} />
          刷新
        </Button>
      </header>
      <div className="library-home-body">
        {sortedArticles.length > 0 ? (
          <div className="library-card-grid">
            {pageArticles.map((article) => (
              <ArticleLibraryCard
                article={article}
                key={article.id}
                onDelete={() => void onDeleteArticle(article.id)}
                onOpen={() => onOpenArticle(article)}
              />
            ))}
          </div>
        ) : (
          <section className="library-empty">
            <BookOpen size={32} />
            <h3>还没有同步文章</h3>
            <p>在浏览器插件阅读器里创建批注后，这里会出现对应文章。</p>
          </section>
        )}
      </div>
      {sortedArticles.length > 0 ? (
        <footer className="library-home-footer">
          <span>共 {sortedArticles.length} 项</span>
          <div className="library-pagination" aria-label="阅读库分页">
            <button
              type="button"
              aria-label="上一页"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft size={16} />
            </button>
            {pageNumbers.map((pageNumber) => (
              <button
                className={pageNumber === page ? 'is-active' : undefined}
                type="button"
                aria-current={pageNumber === page ? 'page' : undefined}
                key={pageNumber}
                onClick={() => setPage(pageNumber)}
              >
                {pageNumber}
              </button>
            ))}
            <button
              type="button"
              aria-label="下一页"
              disabled={page === pageCount}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger className="library-page-size-trigger" aria-label="每页显示数量">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="theme-select-content">
              <SelectGroup>
                {LIBRARY_PAGE_SIZE_OPTIONS.map((option) => (
                  <SelectItem value={String(option)} key={option}>
                    每页 {option} 项
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </footer>
      ) : null}
    </section>
  );
}

function ShelfTab({
  count,
  icon,
  label,
  onClick,
}: {
  count?: number;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={count === undefined ? 'library-shelf-tab is-title-only' : 'library-shelf-tab'}
      type="button"
      onClick={onClick}
    >
      <span className="library-shelf-tab-icon">{icon}</span>
      <span className="library-shelf-tab-label">{label}</span>
      {count === undefined ? null : <span className="library-shelf-tab-count">{count}</span>}
    </button>
  );
}

function ArticleLibraryCard({
  article,
  onDelete,
  onOpen,
}: {
  article: ArticleRecord;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const [deleteHolding, setDeleteHolding] = useState(false);
  const deleteTimerRef = useRef<number | null>(null);
  const comments = article.annotations.reduce(
    (count, annotation) => count + annotationThreadComments(annotation).length,
    0,
  );
  const authorLabel =
    article.byline ||
    article.siteName ||
    urlHost(article.canonicalUrl || article.url) ||
    '未知作者';

  useEffect(
    () => () => {
      if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current);
    },
    [],
  );

  function stopDeleteHold() {
    if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = null;
    setDeleteHolding(false);
  }

  function startDeleteHold(event: React.PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (deleteTimerRef.current !== null) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setDeleteHolding(true);
    deleteTimerRef.current = window.setTimeout(() => {
      deleteTimerRef.current = null;
      onDelete();
    }, ARTICLE_DELETE_HOLD_MS);
  }

  return (
    <article className="library-card">
      <div className="library-card-main">
        <ArticleBook article={article} />
        <div className="library-card-copy">
          <div>
            <h3>{article.title}</h3>
            <p>{authorLabel}</p>
            <time dateTime={article.updatedAt}>{formatDate(article.updatedAt)}</time>
          </div>
        </div>
      </div>
      <footer className="library-card-footer">
        <div className="library-card-meta">
          <span>{article.annotations.length} 批注</span>
          <span>{comments} 讨论</span>
        </div>
        <div className="library-card-actions">
          <button
            className={deleteHolding ? 'library-item-delete is-holding' : 'library-item-delete'}
            style={{ '--delete-hold-ms': `${ARTICLE_DELETE_HOLD_MS}ms` } as React.CSSProperties}
            type="button"
            aria-label={`长按删除文章：${article.title}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onPointerCancel={stopDeleteHold}
            onPointerDown={startDeleteHold}
            onPointerLeave={stopDeleteHold}
            onPointerUp={stopDeleteHold}
          >
            <Trash2 size={14} />
            <span>长按删除</span>
          </button>
          <button className="library-card-open" type="button" onClick={onOpen}>
            <BookOpen size={15} />
            查看
          </button>
        </div>
      </footer>
    </article>
  );
}

const sourceTocOptions: ExtractTocOptions = {
  headingSelector:
    '.reader-article-body h1, .reader-article-body h2, .reader-article-body h3, .reader-article-body h4',
  inferredSelector:
    '.reader-article-body p, .reader-article-body div, .reader-article-body section',
};

function SourceBookcase({
  agents,
  annotations: articleAnnotations,
  article,
  focusAnnotationId,
  selectedAnnotationId,
  userProfile,
  onFocusedAnnotation,
  onClose,
  onOpenAnnotation,
  onSaveArticle,
}: {
  agents: Agent[];
  annotations: Annotation[];
  article: ArticleRecord | null;
  focusAnnotationId: string | null;
  selectedAnnotationId: string | null;
  userProfile: UserProfile;
  onFocusedAnnotation: () => void;
  onClose: () => void;
  onOpenAnnotation: (annotationId: string | null) => void;
  onSaveArticle: (article: ArticleRecord) => Promise<void> | void;
}) {
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
  const [readerSettings, setReaderSettings] = useState(defaultReaderSettings);
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
        ? buildSourceReadingSections(articleRef.current, tocItems, article.title)
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
        const text = articleElement.textContent || '';
        const canvasRect = canvasElement.getBoundingClientRect();
        const extractedTocItems = extractTocItems(articleElement, sourceTocOptions);
        const nextTocItems =
          extractedTocItems.length > 0
            ? extractedTocItems
            : sourceArticleTitleTocItems(articleElement, article);
        const nextBoxes = annotations.flatMap((annotation) => {
          const position = resolveTextAnchor(text, annotation.anchor);
          if (!position) return [];
          const range = rangeFromOffsets(articleElement, position.start, position.end);
          if (!range) return [];
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
  }, [annotations, article, contentHtml]);

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

    const direction = endX >= startX ? 1 : -1;
    const tension = Math.max(48, Math.abs(endX - startX) * 0.42);
    const path = `M ${startX} ${startY} C ${startX + tension * direction} ${startY}, ${endX - tension * direction} ${endY}, ${endX} ${endY}`;
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
      if (!scrollElement || !canvasElement) return;

      const top = readerAnnotationScrollTop({
        annotationId,
        boxes,
        canvasOffsetTop: canvasElement.offsetTop,
        scrollHeight: scrollElement.scrollHeight,
        viewportHeight: scrollElement.clientHeight,
      });
      if (top === null) return;

      scrollElement.scrollTo({ top, behavior: 'smooth' });
    },
    [boxes],
  );

  useEffect(() => {
    if (!focusAnnotationId) return;
    scrollToAnnotation(focusAnnotationId);
    onFocusedAnnotation();
  }, [focusAnnotationId, onFocusedAnnotation, scrollToAnnotation]);

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
    const sortedAnnotations = sortAnnotations(nextAnnotations);
    const nextArticle = {
      ...currentArticle,
      annotations: sortedAnnotations,
      updatedAt: new Date().toISOString(),
    };
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

  function promptArticle() {
    const currentArticle = latestArticleRef.current;
    return {
      title: currentArticle?.title || '',
      url: currentArticle?.canonicalUrl || currentArticle?.url || '',
      text: currentArticleText(),
    };
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
    const anchor = createTextAnchor(articleText, start, end);
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

  async function createAnnotation(
    note: string,
    annotationType: AnnotationType,
    readingIntent: AgentReadingIntent,
  ) {
    if (!composer) return;
    const mentionedAgents = findMentionedAgents(note, annotationAgents);
    if (mentionedAgents.length > 0) {
      const instruction = agentInstructionFromNote(note, mentionedAgents);
      cancelComposer();
      for (const agent of mentionedAgents) {
        void requestAgentAnnotations(agent, {
          annotationType,
          readingIntent,
          instruction,
          targetAnchor: composer.anchor,
        });
      }
      return;
    }

    const currentArticle = latestArticleRef.current;
    if (!currentArticle) return;
    const annotation = createUserAnnotation(composer.anchor, userProfile, note, annotationType);
    await saveAnnotations([...currentArticle.annotations, annotation]);
    openAnnotation(annotation.id);
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
          article: promptArticle(),
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
  ) {
    if (!readingPlan?.length) return annotation;

    const articleText = currentArticleText();
    const position = resolveTextAnchor(articleText, annotation.anchor);
    if (!position) return null;

    const planItem = readingPlan.find(
      (item) => position.start >= item.sectionStart && position.end <= item.sectionEnd,
    );
    if (!planItem) return null;
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

  async function requestAgentAnnotations(
    agent: PublicAgent,
    options: {
      annotationType?: AnnotationType;
      readingIntent?: AgentReadingIntent;
      instruction?: string;
      targetAnchor?: Annotation['anchor'];
      readingPlan?: AgentReadingPlanItem[];
    } = {},
  ) {
    const desktop = window.yomitomoDesktop;
    const currentArticle = latestArticleRef.current;
    if (!desktop || !currentArticle || annotatingAgentIds.includes(agent.id)) return;

    markAgentAnnotating(agent.id, true);
    setStatusMessage(`${agent.nickname} 正在批注`);
    const readingPlan =
      options.readingPlan || targetAnchorReadingPlan(options.targetAnchor, options.readingIntent);
    startVirtualReading(
      agent,
      readingPlan,
      options.targetAnchor ? 'target' : readingPlan.length > 0 ? 'careful' : 'article',
    );
    let annotationCount = 0;
    try {
      await desktop.requestAgentAnnotationsStream(
        {
          agentId: agent.id,
          agentUsername: agent.username,
          annotationType: options.annotationType,
          readingIntent: options.readingIntent,
          instruction: options.instruction,
          targetAnchor: options.targetAnchor,
          readingPlan: options.readingPlan,
          article: promptArticle(),
        },
        (event) => {
          if (event.type !== 'item') return;
          const annotation = constrainAgentPlanAnnotation(event.annotation, options.readingPlan);
          if (!annotation) return;
          annotationCount += 1;
          enqueueAgentAnnotation(annotation);
          void processAgentAnnotationQueue();
        },
      );
      markVirtualReadingDone(agent.id);
      if (annotationCount === 0) {
        finishVirtualReading(agent.id, '没有批注');
        setStatusMessage(`${agent.nickname} 暂无新批注`);
        window.setTimeout(() => setStatusMessage(''), 1400);
        return;
      }
      finishVirtualReadingIfIdle(agent.id);
    } finally {
      markAgentAnnotating(agent.id, false);
      setStatusMessage((message) => (message.includes('暂无新批注') ? message : ''));
    }
  }

  function handleHighlightClick(annotationId: string, event: React.MouseEvent<HTMLButtonElement>) {
    const canvasElement = canvasRef.current;
    if (!canvasElement) {
      openAnnotation(annotationId);
      return;
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const annotationIds = annotationIdsAtHighlightPoint(
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
    byline: article.byline || urlHost(article.canonicalUrl || article.url),
    excerpt: [formatDate(article.updatedAt), statusMessage].filter(Boolean).join(' · '),
    content: contentHtml,
  };
  const shortcutModifier = getShortcutModifier();

  return (
    <section className="source-bookcase source-reader-shell">
      <style>{`${readerStyles}\n${readerConversationStyles}\n${readerDesktopEmbeddedStyles}`}</style>
      <ReaderAppView
        activeConnection={activeConnection}
        activeId={selectedAnnotationId}
        agentAnnotateOpen={agentAnnotateOpen}
        agentTheaterBoxes={agentTheaterBoxes}
        agents={annotationAgents}
        annotatingAgents={annotatingAgentIds}
        annotationTotals={annotationTotals}
        annotations={annotations}
        articleRef={articleRef}
        boxes={boxes}
        canvasRef={canvasRef}
        commentsCloseKey={commentsCloseKey}
        composer={composer}
        completionBurstKey={completionBurstKey}
        desktopConnected
        embedded
        extracted={readerArticle}
        filteredAnnotations={annotations}
        hasSavedPairing={false}
        highlightChoice={highlightChoice}
        notesOpen={notesOpen}
        noteRefs={noteRefs}
        notesRef={railRef}
        pairingId=""
        pairingStatus=""
        pairingTokenDraft=""
        readerSettings={readerSettings}
        readingSections={readingSections}
        replyRequest={replyRequest}
        selectionAction={selectionAction}
        settingsOpen={settingsOpen}
        shortcutModifier={shortcutModifier}
        showConnectionSettings={false}
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
        onCreateAnnotation={createAnnotation}
        onDeleteAnnotation={deleteAnnotation}
        onDisconnectDesktop={() => {}}
        onFocusAnnotation={openAnnotation}
        onHighlightClick={handleHighlightClick}
        onMouseUp={handleArticleMouseUp}
        onOpenComposer={(action) => {
          const canvasWidth = canvasRef.current?.clientWidth || 360;
          setCommentsCloseKey((key) => key + 1);
          setComposer({
            x: Math.min(action.x, Math.max(4, canvasWidth - 364)),
            y: action.y,
            anchor: action.anchor,
          });
          setSelectionAction(null);
        }}
        onSavePairingToken={() => {}}
        onScrollToHeading={scrollToTocItem}
        onScrollToHighlight={(annotationId) => {
          openAnnotation(annotationId);
          scrollToAnnotation(annotationId);
        }}
        onSetAnnotationQuestionStatus={setAnnotationQuestionStatus}
        onSetCommentQuestionStatus={setCommentQuestionStatus}
        onSetPairingTokenDraft={() => {}}
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
        onUpdateReaderSettings={setReaderSettings}
      />
    </section>
  );
}

function sourceArticleTitleTocItems(
  articleElement: HTMLElement,
  article: ArticleRecord,
): TocItem[] {
  const textLength = articleElement.textContent?.length || 0;
  const text = article.title.trim();
  return text ? [{ index: -1, text, depth: 0, start: 0, end: textLength }] : [];
}

function publicAnnotationAgents(agents: Agent[]): PublicAgent[] {
  return agents
    .filter((agent) => agent.kind === 'annotation' && agent.enabled)
    .map((agent) => ({
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
      temperature: agent.temperature,
    }));
}

function buildSourceReadingSections(
  articleElement: HTMLElement,
  tocItems: TocItem[],
  articleTitle: string,
): ReaderReadingSection[] {
  const body = articleElement.querySelector('.reader-article-body');
  const bodyStart = body ? offsetFromArticleStart(articleElement, body, 0) : 0;
  const bodyTocItems = tocItems.filter(
    (item) =>
      item.start >= bodyStart &&
      normalizeHeadingText(item.text) !== normalizeHeadingText(articleTitle),
  );
  if (bodyTocItems.length > 0) {
    const targetDepth = Math.min(...bodyTocItems.map((item) => item.depth));
    return bodyTocItems
      .filter((item) => item.depth === targetDepth)
      .map((item) => ({
        id: `toc-${item.index}`,
        title: item.text,
        start: item.start,
        end: item.end,
      }));
  }

  return [
    {
      id: 'body',
      title: '正文',
      start: bodyStart,
      end: articleElement.textContent?.length || bodyStart,
    },
  ];
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

function normalizeHeadingText(text: string) {
  return text.trim().replace(/\s+/g, ' ');
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
