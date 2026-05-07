import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  RefreshCcw,
  MessageSquare,
  Trash2,
  X,
} from 'lucide-react';
import type {
  Agent,
  Annotation,
  ArticleRecord,
  Comment as AnnotationComment,
} from '@yomitomo/shared';
import { agentReadingIntentLabel, renderMarkdown, resolveTextAnchor } from '@yomitomo/shared';
import {
  annotationPrimaryComment,
  annotationTypeLabel,
  annotationStoredColor,
  annotationThreadComments,
  annotationIdsAtHighlightPoint,
  buildHighlightSegments,
  buildTocAnnotationStats,
  extractTocItems,
  findCurrentTocTarget,
  highlightSegmentStyle,
  isPrimaryTocItem,
  rangeFromOffsets,
  rangeHighlightBoxes,
  questionStatusLabel,
  sortAnnotations,
  sortArticles,
  type ExtractTocOptions,
  type HighlightBox,
  type TocItem,
} from '@yomitomo/core';
import { commentAuthorProfile, formatDate, formatDateTime, urlHost } from './app-utils';
import { Button } from './components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { AvatarImage, CopyIconButton, OpenArticleButton } from './app-ui';
import { ReadingCard } from './app-reading-card-panel';
import { ArticleBook } from './app-article-book';

const ARTICLE_DELETE_HOLD_MS = 1400;
const LIBRARY_PAGE_SIZE_OPTIONS = [8, 12, 16, 24] as const;

type SourceAnnotationStyle = React.CSSProperties & {
  '--source-note-color'?: string;
  '--stack-offset'?: string;
};

type SourceAnnotationRailItem = {
  annotation: Annotation;
  isStackFront: boolean;
  stackCount: number;
  stackIndex: number;
  style: SourceAnnotationStyle;
};

type SourceActiveConnection = {
  path: string;
  color: string;
};

function SourceHighlightDots({ colors }: { colors: string[] }) {
  if (colors.length <= 1) return null;

  return (
    <>
      <span className="source-highlight-dots is-start" aria-hidden="true">
        {colors.map((color, index) => (
          <i key={`${color}-${index}`} style={{ backgroundColor: color }} />
        ))}
      </span>
      <span className="source-highlight-dots is-end" aria-hidden="true">
        {colors.map((color, index) => (
          <i key={`${color}-${index}`} style={{ backgroundColor: color }} />
        ))}
      </span>
    </>
  );
}

export function ReadingLibrary({
  agents,
  articles,
  onDeleteArticle,
  onRefresh,
}: {
  agents: Agent[];
  articles: ArticleRecord[];
  onDeleteArticle: (articleId: string) => Promise<void> | void;
  onRefresh: () => void;
}) {
  const [activeShelf, setActiveShelf] = useState<'library' | 'source' | 'card'>('library');
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [sourceFocusAnnotationId, setSourceFocusAnnotationId] = useState<string | null>(null);
  const sortedArticles = useMemo(() => sortArticles(articles), [articles]);
  const selectedArticle =
    sortedArticles.find((article) => article.id === selectedArticleId) || null;
  const annotations = useMemo(
    () => (selectedArticle ? sortAnnotations(selectedArticle.annotations) : []),
    [selectedArticle],
  );
  const reviewAgents = useMemo(
    () => agents.filter((agent) => agent.kind === 'review' && agent.enabled),
    [agents],
  );
  const selectedAnnotation =
    annotations.find((annotation) => annotation.id === selectedAnnotationId) ||
    annotations[0] ||
    null;
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
      <div
        className={
          activeShelf === 'library'
            ? 'library-shelf is-expanded'
            : 'library-shelf is-collapsed is-library-bookcase'
        }
      >
        {activeShelf === 'library' ? (
          <LibraryHome
            articles={articles}
            sortedArticles={sortedArticles}
            stats={stats}
            onDeleteArticle={deleteLibraryArticle}
            onOpenArticle={openArticle}
            onRefresh={onRefresh}
          />
        ) : (
          <LibraryBookcaseRail
            articles={sortedArticles}
            selectedArticleId={selectedArticle?.id || null}
            onExpand={openLibraryShelf}
            onSelect={openArticle}
          />
        )}
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
              onFocusedAnnotation={() => setSourceFocusAnnotationId(null)}
              onOpenAnnotation={setSelectedAnnotationId}
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

function LibraryBookcaseRail({
  articles,
  selectedArticleId,
  onExpand,
  onSelect,
}: {
  articles: ArticleRecord[];
  selectedArticleId: string | null;
  onExpand: () => void;
  onSelect: (article: ArticleRecord) => void;
}) {
  return (
    <aside className="library-bookcase-rail">
      <header className="library-bookcase-header">
        <button className="library-back-button" type="button" onClick={onExpand}>
          <ChevronLeft size={16} />
          阅读库
        </button>
        <span>{articles.length} 本</span>
      </header>
      <div className="library-bookcase-scroll">
        {articles.map((article) => (
          <button
            className={
              article.id === selectedArticleId
                ? 'library-bookcase-item is-active'
                : 'library-bookcase-item'
            }
            key={article.id}
            type="button"
            onClick={() => onSelect(article)}
          >
            <ArticleBook article={article} />
            <span className="library-bookcase-copy">
              <strong>{article.title}</strong>
              <span>{article.annotations.length} 批注</span>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function ShelfTab({
  count,
  icon,
  label,
  onClick,
}: {
  count: number;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="library-shelf-tab" type="button" onClick={onClick}>
      <span className="library-shelf-tab-icon">{icon}</span>
      <span className="library-shelf-tab-label">{label}</span>
      <span className="library-shelf-tab-count">{count}</span>
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
    '.source-article-body h1, .source-article-body h2, .source-article-body h3, .source-article-body h4',
  inferredSelector:
    '.source-article-body p, .source-article-body div, .source-article-body section',
};

function SourceBookcase({
  agents,
  annotations,
  article,
  focusAnnotationId,
  selectedAnnotationId,
  onFocusedAnnotation,
  onOpenAnnotation,
}: {
  agents: Agent[];
  annotations: Annotation[];
  article: ArticleRecord | null;
  focusAnnotationId: string | null;
  selectedAnnotationId: string | null;
  onFocusedAnnotation: () => void;
  onOpenAnnotation: (annotationId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const noteRefs = useRef(new Map<string, HTMLElement>());
  const [boxes, setBoxes] = useState<HighlightBox[]>([]);
  const [activeConnection, setActiveConnection] = useState<SourceActiveConnection | null>(null);
  const [highlightChoice, setHighlightChoice] = useState<{
    x: number;
    y: number;
    annotationIds: string[];
  } | null>(null);
  const highlightSegments = useMemo(() => buildHighlightSegments(boxes), [boxes]);
  const annotationRailItems = useMemo(
    () => buildSourceAnnotationRailItems(annotations, boxes, selectedAnnotationId),
    [annotations, boxes, selectedAnnotationId],
  );
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const contentHtml = useMemo(() => (article ? sourceArticleBodyHtml(article) : ''), [article]);
  const tocStats = useMemo(
    () => buildTocAnnotationStats(tocItems, annotations),
    [tocItems, annotations],
  );
  const commentCount = useMemo(
    () =>
      annotations.reduce(
        (count, annotation) => count + annotationThreadComments(annotation).length,
        0,
      ),
    [annotations],
  );

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
              color: annotationStoredColor(annotation),
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
  }, [article?.id, annotations]);

  const recalculateActiveConnection = useCallback(() => {
    if (!selectedAnnotationId) {
      setActiveConnection(null);
      return;
    }

    const canvasElement = canvasRef.current;
    const scrollElement = scrollRef.current;
    const railElement = railRef.current;
    const noteElement = noteRefs.current.get(selectedAnnotationId);
    const annotation = annotations.find((item) => item.id === selectedAnnotationId);
    const activeBoxes = boxes.filter((box) => box.annotationId === selectedAnnotationId);
    if (
      !canvasElement ||
      !scrollElement ||
      !railElement ||
      !noteElement ||
      !annotation ||
      activeBoxes.length === 0
    ) {
      setActiveConnection(null);
      return;
    }

    const canvasRect = canvasElement.getBoundingClientRect();
    const scrollRect = scrollElement.getBoundingClientRect();
    const noteRect = noteElement.getBoundingClientRect();
    const noteY =
      railElement.offsetTop + noteElement.offsetTop + Math.min(72, noteElement.offsetHeight / 2);
    const box = activeBoxes.toSorted((left, right) => {
      const leftY = left.top + left.height / 2;
      const rightY = right.top + right.height / 2;
      return Math.abs(leftY - noteY) - Math.abs(rightY - noteY);
    })[0];
    if (!box) {
      setActiveConnection(null);
      return;
    }

    const startX = box.left + box.width + 6;
    const startY = box.top + box.height / 2;
    const endX = railElement.offsetLeft - 8;
    const endY = noteY;
    const highlightViewportY = canvasRect.top + startY;
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
    const color = sourceAnnotationColor(annotation, agents);
    setActiveConnection((current) =>
      current?.path === path && current.color === color ? current : { path, color },
    );
  }, [agents, annotations, boxes, selectedAnnotationId]);

  useLayoutEffect(() => {
    recalculateActiveConnection();
  }, [annotationRailItems, recalculateActiveConnection]);

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

  useEffect(() => {
    const scrollElement = scrollRef.current;
    const canvasElement = canvasRef.current;
    if (!focusAnnotationId || !scrollElement || !canvasElement) return;

    const top = sourceAnnotationScrollTop({
      annotationId: focusAnnotationId,
      boxes,
      canvasOffsetTop: canvasElement.offsetTop,
      scrollHeight: scrollElement.scrollHeight,
      viewportHeight: scrollElement.clientHeight,
    });
    if (top === null) return;

    scrollElement.scrollTo({ top, behavior: 'smooth' });
    onFocusedAnnotation();
  }, [boxes, focusAnnotationId, onFocusedAnnotation]);

  function openAnnotation(annotationId: string) {
    setHighlightChoice(null);
    onOpenAnnotation(annotationId);
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

  return (
    <section className="source-bookcase">
      <header className="source-bookcase-header">
        <div className="min-w-0">
          <h2>{article.title}</h2>
          <p>
            {article.byline || urlHost(article.canonicalUrl || article.url)} ·{' '}
            {formatDate(article.updatedAt)}
          </p>
        </div>
        <OpenArticleButton article={article} />
      </header>
      <div className={tocItems.length > 0 ? 'source-body-layout' : 'source-body-layout is-no-toc'}>
        <aside className={tocItems.length > 0 ? 'source-toc' : 'source-toc is-empty'}>
          <div className="source-toc-title">目录</div>
          {tocItems.map((item) => {
            const stats = isPrimaryTocItem(item) ? tocStats.get(item.index) : undefined;
            return (
              <button
                className="source-toc-item"
                data-depth={Math.min(item.depth, 4)}
                key={`${item.index}-${item.text}`}
                type="button"
                onClick={() => scrollToTocItem(item)}
              >
                <span className="source-toc-item-main">
                  <span>{item.text}</span>
                  <span className="source-toc-meta">
                    {(stats?.colors.length || 0) > 0 ? (
                      <span className="source-toc-markers">
                        {stats!.colors.slice(0, 5).map((color) => (
                          <i key={color} style={{ backgroundColor: color }} />
                        ))}
                      </span>
                    ) : null}
                    {(stats?.count || 0) > 0 ? <strong>{stats?.count}</strong> : null}
                  </span>
                </span>
              </button>
            );
          })}
          <div className="source-toc-summary">
            共 {annotations.length} 条批注 · {commentCount} 条评论
          </div>
        </aside>
        <div className="source-scroll" ref={scrollRef}>
          <div className="source-canvas" ref={canvasRef}>
            <article className="source-article" ref={articleRef}>
              <div
                className="source-article-body"
                dangerouslySetInnerHTML={{ __html: contentHtml }}
              />
            </article>
            <div className="source-highlight-layer">
              {highlightSegments.map((segment) => {
                const active = segment.annotationIds.includes(selectedAnnotationId || '');
                const annotationId = segment.annotationIds[0] || '';
                return (
                  <button
                    aria-label="打开对应批注"
                    className={active ? 'source-highlight is-active' : 'source-highlight'}
                    key={`source-highlight-${segment.id}`}
                    style={highlightSegmentStyle(segment, active) as React.CSSProperties}
                    type="button"
                    onClick={(event) => handleHighlightClick(annotationId, event)}
                  >
                    <SourceHighlightDots colors={segment.colors} />
                  </button>
                );
              })}
            </div>
            <aside className="source-annotation-rail" ref={railRef} aria-label="文章批注">
              {annotations.length === 0 ? (
                <div className="source-note-empty">
                  <strong>暂无批注</strong>
                  <p>浏览器插件同步的批注会显示在原文右侧。</p>
                </div>
              ) : null}
              {annotationRailItems.map(
                ({ annotation, isStackFront, stackCount, stackIndex, style }) => (
                  <SourceAnnotationCard
                    active={annotation.id === selectedAnnotationId}
                    agents={agents}
                    annotation={annotation}
                    isStackFront={isStackFront}
                    key={annotation.id}
                    noteRef={(element) => {
                      if (element) noteRefs.current.set(annotation.id, element);
                      else noteRefs.current.delete(annotation.id);
                    }}
                    stackCount={stackCount}
                    stackIndex={stackIndex}
                    style={style}
                    onFocus={openAnnotation}
                  />
                ),
              )}
            </aside>
            {activeConnection ? <SourceAnnotationConnection connection={activeConnection} /> : null}
            {highlightChoice ? (
              <SourceHighlightChoiceMenu
                agents={agents}
                annotations={highlightChoice.annotationIds
                  .map((id) => annotations.find((annotation) => annotation.id === id))
                  .filter((annotation): annotation is Annotation => Boolean(annotation))}
                x={highlightChoice.x}
                y={highlightChoice.y}
                onClose={() => setHighlightChoice(null)}
                onSelect={openAnnotation}
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function SourceAnnotationCard({
  active,
  agents,
  annotation,
  isStackFront,
  stackCount,
  stackIndex,
  style,
  noteRef,
  onFocus,
}: {
  active: boolean;
  agents: Agent[];
  annotation: Annotation;
  isStackFront: boolean;
  stackCount: number;
  stackIndex: number;
  style: SourceAnnotationStyle;
  noteRef: (element: HTMLElement | null) => void;
  onFocus: (annotationId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const author = sourceAnnotationAuthor(annotation, agents);
  const primaryComment = annotationPrimaryComment(annotation);
  const threadComments = annotationThreadComments(annotation);
  const primaryCommentHtml = useMemo(
    () => (primaryComment ? renderMarkdown(primaryComment.content) : ''),
    [primaryComment],
  );
  const labels = [
    annotation.annotationType ? annotationTypeLabel(annotation.annotationType) : '',
    annotation.readingIntent ? agentReadingIntentLabel(annotation.readingIntent) : '',
    annotation.questionStatus ? questionStatusLabel(annotation.questionStatus) : '',
  ].filter(Boolean);
  const className = [
    'source-note',
    active ? 'is-active' : '',
    stackCount > 1 ? 'is-stacked' : '',
    isStackFront ? 'is-stack-front' : '',
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    if (!active && expanded) setExpanded(false);
  }, [active, expanded]);

  function focus() {
    onFocus(annotation.id);
  }

  function toggleComments() {
    if (!active) {
      focus();
      return;
    }
    setExpanded((open) => !open);
  }

  return (
    <section
      className={className}
      data-stack-count={stackCount}
      data-stack-index={stackIndex}
      ref={noteRef}
      style={{ ...sourceNoteStyle(author.color, active), ...style }}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('button')) return;
        focus();
      }}
    >
      <div className="source-note-action-row">
        {labels.map((label) => (
          <span key={label}>{label}</span>
        ))}
        <time dateTime={annotation.createdAt}>{formatDateTime(annotation.createdAt)}</time>
      </div>
      <button className="source-note-persona" type="button" onClick={focus}>
        <AvatarImage value={author.avatar} className="size-7" fallback={author.fallback} />
        <strong>{author.nickname}</strong>
        <em>@{author.username}</em>
      </button>
      <button className="source-note-quote" type="button" onClick={focus}>
        “{annotation.anchor.exact}”
      </button>
      {primaryComment ? (
        <div
          className="source-note-primary-comment"
          dangerouslySetInnerHTML={{ __html: primaryCommentHtml }}
        />
      ) : null}
      <div className="source-note-toolbar">
        <button type="button" onClick={toggleComments}>
          <MessageSquare size={14} />
          {threadComments.length} 条评论
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <CopyIconButton label="复制原文" value={annotation.anchor.exact} />
      </div>
      {expanded ? (
        <div className="source-note-comments-popover">
          <div className="source-note-comments-panel">
            <header>
              <strong>评论</strong>
              <span>{threadComments.length} 条</span>
            </header>
            <div className="source-note-comments">
              {threadComments.length > 0 ? (
                threadComments.map((comment) => (
                  <SourceAnnotationComment comment={comment} key={comment.id} />
                ))
              ) : (
                <div className="source-note-comment-empty">这条批注还没有评论</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SourceAnnotationComment({ comment }: { comment: AnnotationComment }) {
  const author = commentAuthorProfile(comment);
  const html = useMemo(() => renderMarkdown(comment.content), [comment.content]);

  return (
    <article className="source-note-comment">
      <AvatarImage value={author.avatar} className="size-8" fallback={author.name.slice(0, 1)} />
      <div className="min-w-0">
        <header>
          <strong>{author.name}</strong>
          <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
        </header>
        <div className="comment-markdown" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </article>
  );
}

function SourceAnnotationConnection({ connection }: { connection: SourceActiveConnection }) {
  return (
    <svg className="source-annotation-connection" aria-hidden="true">
      <path d={connection.path} style={{ stroke: connection.color }} />
    </svg>
  );
}

export function buildSourceAnnotationRailItems(
  annotations: Annotation[],
  boxes: HighlightBox[],
  activeId: string | null,
): SourceAnnotationRailItem[] {
  const boxesByAnnotation = new Map<string, HighlightBox[]>();
  for (const box of boxes) {
    const items = boxesByAnnotation.get(box.annotationId) || [];
    items.push(box);
    boxesByAnnotation.set(box.annotationId, items);
  }

  const positioned = annotations
    .map((annotation, index) => {
      const annotationBoxes = boxesByAnnotation.get(annotation.id) || [];
      const top =
        annotationBoxes.length > 0
          ? Math.max(0, Math.min(...annotationBoxes.map((box) => box.top)) - 10)
          : 120 + index * 150;
      return {
        annotation,
        index,
        start: annotation.anchor.start,
        end: annotation.anchor.end,
        top,
      };
    })
    .toSorted((left, right) => left.top - right.top || left.index - right.index);

  const groups: Array<typeof positioned> = [];
  for (const item of positioned) {
    const group = groups.find((items) =>
      items.some((groupItem) => sourceAnchorsOverlap(item, groupItem)),
    );
    if (group) group.push(item);
    else groups.push([item]);
  }

  const railGroups = groups
    .map((group) =>
      group.toSorted((left, right) => left.top - right.top || left.index - right.index),
    )
    .map((group) => ({
      group,
      desiredTop: group[0]?.top || 0,
      height: estimateSourceRailGroupHeight(group),
    }))
    .toSorted((left, right) => left.desiredTop - right.desiredTop);

  const groupTops = railGroups.map((group) => group.desiredTop);
  for (let index = 1; index < railGroups.length; index += 1) {
    const previousBottom = groupTops[index - 1]! + railGroups[index - 1]!.height + 18;
    groupTops[index] = Math.max(groupTops[index]!, previousBottom);
  }
  for (let index = railGroups.length - 2; index >= 0; index -= 1) {
    const nextTop = groupTops[index + 1]! - railGroups[index]!.height - 18;
    groupTops[index] = Math.max(0, Math.min(groupTops[index]!, nextTop));
  }

  return railGroups.flatMap(({ group }, groupIndex) => {
    const stackCount = group.length;
    const groupTop = groupTops[groupIndex] || 0;
    const activeIndex = group.findIndex((item) => item.annotation.id === activeId);
    const frontIndex = activeIndex >= 0 ? activeIndex : 0;
    return group.map((item, stackIndex) => {
      const stackDepth = stackCount > 1 ? (stackIndex - frontIndex + stackCount) % stackCount : 0;
      const isStackFront = stackDepth === 0;
      const isActive = item.annotation.id === activeId;
      return {
        annotation: item.annotation,
        isStackFront,
        stackCount,
        stackIndex: stackDepth,
        style: {
          top: groupTop + stackDepth * 42,
          zIndex: isActive ? 90 : isStackFront ? 40 : 10 + stackCount - stackDepth,
          '--stack-offset': `${Math.min(stackDepth, 4) * 14}px`,
        },
      };
    });
  });
}

function sourceAnchorsOverlap(
  left: { start: number; end: number },
  right: { start: number; end: number },
) {
  return Math.max(left.start, right.start) < Math.min(left.end, right.end);
}

function estimateSourceRailGroupHeight(group: Array<{ annotation: Annotation }>) {
  const first = group[0];
  if (!first) return 176;
  return estimateSourceAnnotationCardHeight(first.annotation) + Math.max(0, group.length - 1) * 42;
}

function estimateSourceAnnotationCardHeight(annotation: Annotation) {
  const quoteLines = Math.max(1, Math.ceil(annotation.anchor.exact.length / 24));
  const primaryComment = annotationPrimaryComment(annotation)?.content || '';
  const commentLines = primaryComment
    ? Math.min(5, Math.max(1, Math.ceil(primaryComment.length / 28)))
    : 0;
  return 118 + quoteLines * 18 + commentLines * 24;
}

function sourceArticleTitleTocItems(
  articleElement: HTMLElement,
  article: ArticleRecord,
): TocItem[] {
  const textLength = articleElement.textContent?.length || 0;
  const text = article.title.trim();
  return text ? [{ index: -1, text, depth: 0, start: 0, end: textLength }] : [];
}

export function sourceAnnotationScrollTop({
  annotationId,
  boxes,
  canvasOffsetTop,
  scrollHeight,
  viewportHeight,
}: {
  annotationId: string;
  boxes: HighlightBox[];
  canvasOffsetTop: number;
  scrollHeight: number;
  viewportHeight: number;
}) {
  const annotationBoxes = boxes.filter((box) => box.annotationId === annotationId);
  if (annotationBoxes.length === 0 || viewportHeight <= 0) return null;

  const top = Math.min(...annotationBoxes.map((box) => box.top));
  const bottom = Math.max(...annotationBoxes.map((box) => box.top + box.height));
  const targetTop = canvasOffsetTop + (top + bottom) / 2 - viewportHeight / 2;
  const maxTop = Math.max(0, scrollHeight - viewportHeight);

  return Math.max(0, Math.min(maxTop, targetTop));
}

function SourceHighlightChoiceMenu({
  agents,
  annotations,
  x,
  y,
  onClose,
  onSelect,
}: {
  agents: Agent[];
  annotations: Annotation[];
  x: number;
  y: number;
  onClose: () => void;
  onSelect: (annotationId: string) => void;
}) {
  if (annotations.length <= 1) return null;

  return (
    <div className="source-highlight-choice-menu" style={{ left: x, top: y }}>
      <header>
        <strong>选择批注</strong>
        <button type="button" onClick={onClose} aria-label="关闭批注选择">
          <X size={14} />
        </button>
      </header>
      {annotations.map((annotation) => {
        const author = sourceAnnotationAuthor(annotation, agents);
        const labels = [
          annotation.annotationType ? annotationTypeLabel(annotation.annotationType) : '',
          annotation.readingIntent ? agentReadingIntentLabel(annotation.readingIntent) : '',
        ].filter(Boolean);
        return (
          <button key={annotation.id} type="button" onClick={() => onSelect(annotation.id)}>
            <AvatarImage value={author.avatar} className="size-8" fallback={author.fallback} />
            <span>
              <strong>{author.nickname}</strong>
              <em>@{author.username}</em>
            </span>
            {labels.length > 0 ? (
              <span className="source-highlight-choice-tags">
                {labels.map((label) => (
                  <b key={label}>{label}</b>
                ))}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function sourceAnnotationAuthor(annotation: Annotation, agents: Agent[]) {
  if (annotation.author === 'ai') {
    const agent = agents.find(
      (item) =>
        item.id === annotation.agentId ||
        (annotation.agentUsername && item.username === annotation.agentUsername),
    );
    return {
      avatar: agent?.avatar || annotation.agentAvatar || '',
      color: sourceAnnotationColor(annotation, agents),
      fallback: 'AI',
      nickname: agent?.nickname || annotation.agentNickname || annotation.agentUsername || 'Agent',
      username: agent?.username || annotation.agentUsername || 'agent',
    };
  }

  return {
    avatar: annotation.userAvatar || '',
    color: sourceAnnotationColor(annotation, agents),
    fallback: '我',
    nickname: annotation.userNickname || annotation.userUsername || '我',
    username: annotation.userUsername || 'me',
  };
}

function sourceAnnotationColor(annotation: Annotation, agents: Agent[]) {
  if (annotation.author === 'ai') {
    const agent = agents.find(
      (item) =>
        item.id === annotation.agentId ||
        (annotation.agentUsername && item.username === annotation.agentUsername),
    );
    return (
      agent?.annotationColor || annotation.agentAnnotationColor || annotation.color || '#f4c95d'
    );
  }

  return annotation.userAnnotationColor || annotation.color || '#f4c95d';
}

function sourceNoteStyle(color: string, active: boolean): React.CSSProperties {
  const accent = color || '#f4c95d';
  return {
    borderColor: alphaColor(accent, active ? 0.82 : 0.38),
    boxShadow: active
      ? `0 0 0 3px ${alphaColor(accent, 0.18)}, 0 10px 34px hsl(31 34% 24% / 0.08)`
      : undefined,
  };
}

function alphaColor(color: string, alpha: number) {
  const hex = color.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(244,201,93,${alpha})`;
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
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
