import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Quote,
  RefreshCcw,
  FileText,
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
  annotationTypeLabel,
  annotationStoredColor,
  annotationIdsAtHighlightPoint,
  buildTocAnnotationStats,
  extractTocItems,
  findCurrentTocTarget,
  highlightStyle,
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
import {
  annotationAuthorProfile,
  commentAuthorProfile,
  formatDate,
  formatDateTime,
  urlHost,
} from './app-utils';
import { Button } from './components/ui/button';
import { AvatarImage, CopyIconButton, OpenArticleButton } from './app-ui';
import { ReadingCard } from './app-reading-card-panel';
import { ArticleBook } from './app-article-book';

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
  const [activeShelf, setActiveShelf] = useState<'source' | 'annotations' | 'card'>('source');
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const sortedArticles = useMemo(() => sortArticles(articles), [articles]);
  const selectedArticle =
    sortedArticles.find((article) => article.id === selectedArticleId) || sortedArticles[0] || null;
  const annotations = useMemo(
    () => (selectedArticle ? sortAnnotations(selectedArticle.annotations) : []),
    [selectedArticle],
  );
  const reviewAgents = useMemo(() => agents.filter((agent) => agent.kind === 'review'), [agents]);
  const selectedAnnotation =
    annotations.find((annotation) => annotation.id === selectedAnnotationId) ||
    annotations[0] ||
    null;
  const readingCardCount =
    selectedArticle?.readingCard?.sections.length || (selectedArticle ? 4 : 0);
  const stats = articles.reduce(
    (result, article) => ({
      annotations: result.annotations + article.annotations.length,
      comments:
        result.comments +
        article.annotations.reduce((count, annotation) => count + annotation.comments.length, 0),
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
      setSelectedArticleId(sortedArticles[0]?.id || null);
    }
  }, [selectedArticleId, sortedArticles]);

  async function deleteLibraryArticle(articleId: string) {
    await onDeleteArticle(articleId);
    if (selectedArticleId === articleId) {
      const nextArticle = sortedArticles.find((article) => article.id !== articleId) || null;
      setSelectedArticleId(nextArticle?.id || null);
      setSelectedAnnotationId(sortAnnotations(nextArticle?.annotations || [])[0]?.id || null);
    }
  }

  return (
    <div
      className={
        activeShelf === 'source'
          ? 'library-screen is-source-expanded'
          : activeShelf === 'card'
            ? 'library-screen is-card-expanded'
            : 'library-screen is-annotations-expanded'
      }
    >
      <section className="article-rail">
        <div className="article-rail-header">
          <div>
            <h2>阅读库</h2>
            <p>插件同步的已批注文章</p>
          </div>
          <Button type="button" variant="secondary" onClick={onRefresh}>
            <RefreshCcw size={16} />
            刷新
          </Button>
        </div>
        <div className="library-stats">
          <LibraryStat label="文章" value={articles.length} />
          <LibraryStat label="批注" value={stats.annotations} />
          <LibraryStat label="讨论" value={stats.comments} />
        </div>
        {sortedArticles.length > 0 ? (
          <div className="library-list">
            {sortedArticles.map((article) => (
              <ArticleListItem
                active={article.id === selectedArticle?.id}
                article={article}
                key={article.id}
                onDelete={() => void deleteLibraryArticle(article.id)}
                onSelect={() => {
                  setSelectedArticleId(article.id);
                  setSelectedAnnotationId(sortAnnotations(article.annotations)[0]?.id || null);
                }}
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
      </section>

      <div
        className={
          activeShelf === 'source' ? 'library-shelf is-expanded' : 'library-shelf is-collapsed'
        }
      >
        <ShelfTab
          count={annotations.length}
          icon={<BookOpen size={18} />}
          label="原文"
          onClick={() => setActiveShelf('source')}
        />
        <div className="library-shelf-content">
          {activeShelf === 'source' ? (
            <SourceBookcase
              agents={agents}
              annotations={annotations}
              article={selectedArticle}
              selectedAnnotationId={selectedAnnotation?.id || null}
              onOpenAnnotation={(annotationId) => {
                setSelectedAnnotationId(annotationId);
                setActiveShelf('annotations');
              }}
            />
          ) : null}
        </div>
      </div>

      <div
        className={
          activeShelf === 'annotations' ? 'library-shelf is-expanded' : 'library-shelf is-collapsed'
        }
      >
        <ShelfTab
          count={annotations.length}
          icon={<Quote size={18} />}
          label="批注"
          onClick={() => setActiveShelf('annotations')}
        />
        <div className="library-shelf-content">
          {activeShelf === 'annotations' ? (
            selectedArticle ? (
              <AnnotationNotebook
                annotation={selectedAnnotation}
                annotations={annotations}
                article={selectedArticle}
                onOpenSource={() => setActiveShelf('source')}
                onSelect={setSelectedAnnotationId}
              />
            ) : (
              <section className="annotation-notebook is-empty">
                <div className="notebook-empty">选择一篇文章查看批注</div>
              </section>
            )
          ) : null}
        </div>
      </div>

      <div
        className={
          activeShelf === 'card' ? 'library-shelf is-expanded' : 'library-shelf is-collapsed'
        }
      >
        <ShelfTab
          count={readingCardCount}
          icon={<FileText size={18} />}
          label="读后笔记"
          onClick={() => setActiveShelf('card')}
        />
        <div className="library-shelf-content">
          {activeShelf === 'card' ? (
            <ReadingCard
              article={selectedArticle}
              reviewAgents={reviewAgents}
              onGenerated={onRefresh}
              onOpenEvidence={(annotationId) => {
                setSelectedAnnotationId(annotationId);
                setActiveShelf('annotations');
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
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
  selectedAnnotationId,
  onOpenAnnotation,
}: {
  agents: Agent[];
  annotations: Annotation[];
  article: ArticleRecord | null;
  selectedAnnotationId: string | null;
  onOpenAnnotation: (annotationId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<HighlightBox[]>([]);
  const [highlightChoice, setHighlightChoice] = useState<{
    x: number;
    y: number;
    annotationIds: string[];
  } | null>(null);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const contentHtml = useMemo(() => (article ? sourceArticleBodyHtml(article) : ''), [article]);
  const tocStats = useMemo(
    () => buildTocAnnotationStats(tocItems, annotations),
    [tocItems, annotations],
  );
  const commentCount = useMemo(
    () => annotations.reduce((count, annotation) => count + annotation.comments.length, 0),
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
        const nextTocItems = extractTocItems(articleElement, sourceTocOptions);
        const nextBoxes = annotations.flatMap((annotation) => {
          const position = resolveTextAnchor(text, annotation.anchor);
          if (!position) return [];
          const range = rangeFromOffsets(articleElement, position.start, position.end);
          if (!range) return [];
          return rangeHighlightBoxes(range, canvasRect, annotation.id).map((box) =>
            Object.assign(box, {
              annotationId: annotation.id,
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
              <header className="source-article-header">
                <h1>{article.title}</h1>
                {article.byline || article.excerpt ? (
                  <p>{[article.byline, article.excerpt].filter(Boolean).join(' · ')}</p>
                ) : null}
              </header>
              <div
                className="source-article-body"
                dangerouslySetInnerHTML={{ __html: contentHtml }}
              />
            </article>
            <div className="source-highlight-layer">
              {boxes.map((box) => (
                <button
                  aria-label="打开对应批注"
                  className={
                    box.annotationId === selectedAnnotationId
                      ? 'source-highlight is-active'
                      : 'source-highlight'
                  }
                  key={box.id}
                  style={highlightStyle(box, box.annotationId === selectedAnnotationId)}
                  type="button"
                  onClick={(event) => handleHighlightClick(box.annotationId, event)}
                />
              ))}
            </div>
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
      fallback: 'AI',
      nickname: agent?.nickname || annotation.agentNickname || annotation.agentUsername || 'Agent',
      username: agent?.username || annotation.agentUsername || 'agent',
    };
  }

  return {
    avatar: annotation.userAvatar || '',
    fallback: '我',
    nickname: annotation.userNickname || annotation.userUsername || '我',
    username: annotation.userUsername || 'me',
  };
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

function AnnotationNotebook({
  annotation,
  annotations,
  article,
  onOpenSource,
  onSelect,
}: {
  annotation: Annotation | null;
  annotations: Annotation[];
  article: ArticleRecord;
  onOpenSource: () => void;
  onSelect: (id: string | null) => void;
}) {
  const selectedIndex = annotation
    ? annotations.findIndex((item) => item.id === annotation.id)
    : -1;
  const annotationAuthor = annotation ? annotationAuthorProfile(annotation) : null;
  const canPage = selectedIndex >= 0 && annotations.length > 1;

  function selectByOffset(offset: number) {
    if (!canPage) return;
    const nextIndex = (selectedIndex + offset + annotations.length) % annotations.length;
    onSelect(annotations[nextIndex]?.id || null);
  }

  return (
    <section className="annotation-notebook">
      <div className="notebook-rings" aria-hidden="true" />
      <div className="notebook-cover">
        <header className="notebook-header">
          <div className="min-w-0">
            <h2>{article.title}</h2>
            <p>
              {article.byline || urlHost(article.canonicalUrl || article.url)} ·{' '}
              {formatDate(article.updatedAt)}
            </p>
          </div>
          <div className="notebook-header-actions">
            <button className="open-article-button" type="button" onClick={onOpenSource}>
              <BookOpen size={16} />
              <span>查看原文</span>
            </button>
            <div className="annotation-pagination">
              <button
                aria-label="上一条批注"
                type="button"
                disabled={!canPage}
                onClick={() => selectByOffset(-1)}
              >
                <ChevronLeft size={17} />
              </button>
              <span>
                {annotations.length > 0 ? `${selectedIndex + 1} / ${annotations.length}` : '0 / 0'}
              </span>
              <button
                aria-label="下一条批注"
                type="button"
                disabled={!canPage}
                onClick={() => selectByOffset(1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </header>

        {annotation ? (
          <>
            <div className="notebook-scroll">
              <section className="quote-card">
                <div className="annotation-type">
                  <span>
                    {annotation.annotationType
                      ? annotationTypeLabel(annotation.annotationType)
                      : '批注'}
                  </span>
                  {annotation.readingIntent ? (
                    <span>{agentReadingIntentLabel(annotation.readingIntent)}</span>
                  ) : null}
                  {annotation.questionStatus ? (
                    <span>{questionStatusLabel(annotation.questionStatus)}</span>
                  ) : null}
                </div>
                <div className="quote-title">
                  <Quote size={18} />
                  <strong>原文</strong>
                  <CopyIconButton label="复制原文" value={annotation.anchor.exact} />
                </div>
                <blockquote>{annotation.anchor.exact}</blockquote>
                <div className="annotation-author">
                  <AvatarImage
                    value={annotationAuthor?.avatar || ''}
                    className="size-8"
                    fallback={(annotationAuthor?.name || '批').slice(0, 1)}
                  />
                  <div>
                    <strong>{annotationAuthor?.name}</strong>
                    <time>{formatDateTime(annotation.createdAt)}</time>
                  </div>
                </div>
              </section>

              <section className="comment-thread">
                {annotation.comments.length > 0 ? (
                  annotation.comments.map((comment) => (
                    <CommentCard comment={comment} key={comment.id} />
                  ))
                ) : (
                  <div className="comment-empty">这条批注还没有评论</div>
                )}
              </section>
            </div>
            <footer className="notebook-footer">
              <time>批注时间：{formatDateTime(annotation.createdAt)}</time>
            </footer>
          </>
        ) : (
          <div className="notebook-empty">这篇文章还没有批注</div>
        )}
      </div>
    </section>
  );
}

function CommentCard({ comment }: { comment: AnnotationComment }) {
  const author = commentAuthorProfile(comment);
  const html = useMemo(() => renderMarkdown(comment.content), [comment.content]);

  return (
    <article className="comment-card">
      <header>
        <AvatarImage value={author.avatar} className="size-9" fallback={author.name.slice(0, 1)} />
        <div className="min-w-0">
          <strong>{author.name}</strong>
          <time>{formatDateTime(comment.createdAt)}</time>
          {comment.readingIntent ? (
            <span>{agentReadingIntentLabel(comment.readingIntent)}</span>
          ) : null}
          {comment.questionStatus ? (
            <span>{questionStatusLabel(comment.questionStatus)}</span>
          ) : null}
        </div>
        <CopyIconButton label="复制评论" value={comment.content} />
      </header>
      <div className="comment-markdown" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}

function LibraryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="library-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ArticleListItem({
  active,
  article,
  onDelete,
  onSelect,
}: {
  active: boolean;
  article: ArticleRecord;
  onDelete: () => void;
  onSelect: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const comments = article.annotations.reduce(
    (count, annotation) => count + annotation.comments.length,
    0,
  );

  return (
    <article className={active ? 'library-item is-active' : 'library-item'} onClick={onSelect}>
      <button
        className="library-item-main"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <ArticleBook article={article} />
        <div className="library-item-copy">
          <h3>{article.title}</h3>
          <p>
            {article.byline ||
              article.siteName ||
              urlHost(article.canonicalUrl || article.url) ||
              '未知作者'}
          </p>
          <time>{formatDate(article.updatedAt)}</time>
        </div>
      </button>
      <div className="library-item-footer">
        <span className="library-item-count">
          {article.annotations.length} 批注 · {comments} 评
        </span>
        {confirmingDelete ? (
          <span className="library-item-delete-confirm">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setConfirmingDelete(false);
              }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              删除
            </button>
          </span>
        ) : (
          <button
            className="library-item-delete"
            type="button"
            aria-label={`删除文章：${article.title}`}
            onClick={(event) => {
              event.stopPropagation();
              setConfirmingDelete(true);
            }}
          >
            <Trash2 size={14} />
            删除
          </button>
        )}
      </div>
    </article>
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
      const value = attribute.value.trim().toLowerCase();
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
