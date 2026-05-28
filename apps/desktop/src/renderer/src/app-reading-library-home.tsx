import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  BookText,
  ChevronLeft,
  ChevronRight,
  FileText,
  Highlighter,
  Lightbulb,
  MoreHorizontal,
  RefreshCw,
  Search,
  Smartphone,
  Trash2,
} from 'lucide-react';
import type { ArticleSummaryRecord, WeReadBook, WeReadSettings } from '@yomitomo/shared';
import { Input } from './components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import type { EbookImportProgressCallback, PdfImportProgressCallback } from './app-reading-types';
import {
  articleAnnotationCount,
  articleThoughtCount,
  articleMatchesLibrarySearch,
  compareLibraryArticles,
  librarySourceForArticle,
  type LibrarySource,
} from './app-reading-library-utils';
import {
  ArticleBook,
  BookCoverFrame,
  nativeBookCoverStyle,
  useNativeCoverRatio,
} from './app-article-book';
import { urlHost } from './app-utils';
import { LibraryImportControls, type ArticleImportResult } from './app-reading-library-imports';

const LIBRARY_PAGE_SIZE_OPTIONS = [6, 12, 18, 24] as const;
const ARTICLE_DELETE_HOLD_MS = 1400;

const LIBRARY_SOURCE_OPTIONS: Array<{
  value: LibrarySource;
  label: string;
}> = [
  { value: 'web', label: '网页文章' },
  { value: 'ebook', label: '电子书' },
  { value: 'pdf', label: 'PDF' },
  { value: 'weread', label: '微信读书' },
];

export function LibraryHome({
  activeSource,
  articles,
  onActiveSourceChange,
  sortedArticles,
  onDeleteArticle,
  onImportEbookFile,
  onImportPdfFile,
  onImportArticleUrl,
  onOpenArticle,
  onOpenWeReadBook,
  onOpenWeReadExternal,
  onSyncWeRead,
  wereadBooks,
  wereadOpenMessage,
  wereadSettings,
  wereadSyncing,
}: {
  activeSource: LibrarySource;
  articles: ArticleSummaryRecord[];
  onActiveSourceChange: (source: LibrarySource) => void;
  sortedArticles: ArticleSummaryRecord[];
  onDeleteArticle: (articleId: string) => Promise<void>;
  onImportEbookFile: (
    file: File,
    onProgress?: EbookImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onImportPdfFile: (
    file: File,
    onProgress?: PdfImportProgressCallback,
  ) => Promise<ArticleImportResult>;
  onImportArticleUrl: (url: string) => Promise<ArticleImportResult>;
  onOpenArticle: (article: ArticleSummaryRecord) => void;
  onOpenWeReadBook: (book: WeReadBook) => void;
  onOpenWeReadExternal: (book: WeReadBook) => void;
  onSyncWeRead: () => void;
  wereadBooks: WeReadBook[];
  wereadOpenMessage: string;
  wereadSettings: WeReadSettings;
  wereadSyncing: boolean;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [searchQuery, setSearchQuery] = useState('');
  const filteredArticles = useMemo(
    () =>
      sortedArticles
        .filter((article) => articleMatchesLibrarySearch(article, searchQuery))
        .toSorted((left, right) => compareLibraryArticles(left, right, 'recentAdded')),
    [searchQuery, sortedArticles],
  );
  const sourceArticles = useMemo(
    () => filteredArticles.filter((article) => librarySourceForArticle(article) === activeSource),
    [activeSource, filteredArticles],
  );
  const filteredWeReadBooks = useMemo(
    () => wereadBooks.filter((book) => weReadBookMatchesSearch(book, searchQuery)),
    [searchQuery, wereadBooks],
  );
  const activeItemsLength =
    activeSource === 'weread' ? filteredWeReadBooks.length : sourceArticles.length;
  const pageCount = Math.max(1, Math.ceil(activeItemsLength / pageSize));
  const pageArticles = sourceArticles.slice((page - 1) * pageSize, page * pageSize);
  const pageWeReadBooks = filteredWeReadBooks.slice((page - 1) * pageSize, page * pageSize);
  const counts = useMemo(
    () =>
      articles.reduce(
        (result, article) => {
          result[librarySourceForArticle(article)] += 1;
          return result;
        },
        { web: 0, ebook: 0, pdf: 0, weread: wereadBooks.length },
      ),
    [articles, wereadBooks.length],
  );
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

  useEffect(() => {
    setPage(1);
  }, [activeSource, pageSize, searchQuery]);

  const activeSourceLabel =
    activeSource === 'web'
      ? '网页文章'
      : activeSource === 'ebook'
        ? '电子书'
        : activeSource === 'pdf'
          ? 'PDF'
          : '微信读书';
  const footerCountLabel =
    activeSource === 'web'
      ? `共 ${sourceArticles.length} 篇`
      : activeSource === 'ebook'
        ? `共 ${sourceArticles.length} 本`
        : activeSource === 'pdf'
          ? `共 ${sourceArticles.length} 份`
          : `共 ${filteredWeReadBooks.length} 本`;
  const emptyReason = emptyLibraryReason({
    activeSource,
    itemsLength: activeSource === 'weread' ? wereadBooks.length : articles.length,
    filteredLength:
      activeSource === 'weread' ? filteredWeReadBooks.length : filteredArticles.length,
    searchQuery,
  });

  return (
    <section className={`library-home is-${activeSource}`} aria-label={activeSourceLabel}>
      <header className="library-home-header">
        <div className="library-home-header-main">
          <div className="library-source-tabs" role="tablist" aria-label="阅读库内容类型">
            {LIBRARY_SOURCE_OPTIONS.map((option) => (
              <button
                aria-pressed={activeSource === option.value}
                aria-disabled={option.value === 'weread' && !wereadSettings.configured}
                className={[
                  activeSource === option.value ? 'is-active' : '',
                  option.value === 'weread' && !wereadSettings.configured ? 'is-disabled' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-tooltip={
                  option.value === 'weread' && !wereadSettings.configured
                    ? '请先到设置 / 微信读书配置 API Key'
                    : undefined
                }
                title={
                  option.value === 'weread' && !wereadSettings.configured
                    ? '请先到设置 / 微信读书配置 API Key'
                    : undefined
                }
                key={option.value}
                type="button"
                onClick={() => {
                  if (option.value === 'weread' && !wereadSettings.configured) return;
                  onActiveSourceChange(option.value);
                }}
              >
                <span>{option.label}</span>
                <em>{counts[option.value]}</em>
              </button>
            ))}
          </div>
          <div className="library-home-actions">
            <label className="library-search">
              <Search size={16} />
              <Input
                type="search"
                value={searchQuery}
                placeholder="搜索标题 / 来源 / 作者"
                aria-label="搜索文章、作者或来源"
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
            {activeSource === 'weread' ? null : (
              <LibraryImportControls
                defaultImportType={activeSource}
                onImportEbookFile={onImportEbookFile}
                onImportPdfFile={onImportPdfFile}
                onImportArticleUrl={onImportArticleUrl}
                onOpenArticle={onOpenArticle}
              />
            )}
            {activeSource === 'weread' ? (
              <button
                className="library-sync-button"
                type="button"
                disabled={!wereadSettings.configured || wereadSyncing}
                onClick={onSyncWeRead}
              >
                <RefreshCw size={15} />
                {wereadSyncing ? '同步中' : '同步'}
              </button>
            ) : null}
            {activeSource === 'weread' && wereadOpenMessage ? (
              <p className="library-inline-error">{wereadOpenMessage}</p>
            ) : null}
          </div>
        </div>
      </header>
      <div className="library-toolbar" aria-label="阅读库工具栏">
        <span>最近添加 · 降序</span>
      </div>
      <div className="library-home-body">
        {activeSource === 'weread' && !wereadSettings.configured ? (
          <LibraryEmptyState icon={<Smartphone size={32} />} title="需要配置微信读书">
            请先到设置 / 微信读书配置 API Key，再同步你的划线和想法。
          </LibraryEmptyState>
        ) : activeSource === 'weread' && filteredWeReadBooks.length > 0 ? (
          <div className="library-ebook-list">
            {pageWeReadBooks.map((book) => (
              <WeReadBookListItem
                book={book}
                key={book.bookId}
                onOpen={() => onOpenWeReadBook(book)}
                onOpenExternal={() => onOpenWeReadExternal(book)}
              />
            ))}
          </div>
        ) : sourceArticles.length > 0 ? (
          activeSource === 'web' ? (
            <div className="library-web-grid">
              {pageArticles.map((article) => (
                <WebArticleListItem
                  article={article}
                  key={article.id}
                  onDelete={() => void onDeleteArticle(article.id)}
                  onOpen={() => onOpenArticle(article)}
                />
              ))}
            </div>
          ) : (
            <div className="library-ebook-list">
              {pageArticles.map((article) => (
                <LibraryDocumentListItem
                  article={article}
                  key={article.id}
                  onDelete={() => void onDeleteArticle(article.id)}
                  onOpen={() => onOpenArticle(article)}
                />
              ))}
            </div>
          )
        ) : (
          <LibraryEmptyState icon={emptyReason.icon} title={emptyReason.title}>
            {emptyReason.description}
          </LibraryEmptyState>
        )}
      </div>
      {activeItemsLength > 0 ? (
        <footer
          className={pageCount > 1 ? 'library-home-footer' : 'library-home-footer is-compact'}
        >
          <span>{footerCountLabel}</span>
          {pageCount > 1 ? (
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
          ) : null}
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

function WebArticleListItem({
  article,
  onDelete,
  onOpen,
}: {
  article: ArticleSummaryRecord;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const counts = articleCounts(article);
  const host = webArticleHost(article);

  return (
    <article
      className="library-web-item"
      role="button"
      tabIndex={0}
      aria-label={`打开文章：${article.title}`}
      onClick={onOpen}
      onKeyDown={(event) => openItemWithKeyboard(event, onOpen)}
    >
      <div className="library-web-item-source">
        <span>{host}</span>
      </div>
      <div className="library-web-item-main">
        <h3 title={article.title}>{article.title}</h3>
      </div>
      <div className="library-web-item-meta">
        <time dateTime={article.createdAt}>{formatLibraryShortDate(article.createdAt)}</time>
        <ArticleCountStats counts={counts} />
      </div>
      <LibraryItemActions title={article.title} onDelete={onDelete} />
    </article>
  );
}

function LibraryDocumentListItem({
  article,
  onDelete,
  onOpen,
}: {
  article: ArticleSummaryRecord;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const counts = articleCounts(article);
  const sourceLabel = libraryDocumentSourceLabel(article);

  return (
    <article
      className="library-ebook-list-item"
      role="button"
      tabIndex={0}
      aria-label={`打开${article.sourceType === 'pdf' ? 'PDF' : '电子书'}：${article.title}`}
      onClick={onOpen}
      onKeyDown={(event) => openItemWithKeyboard(event, onOpen)}
    >
      <div className="library-ebook-cover-column">
        <ArticleBook article={article} />
        <span
          className="library-ebook-progress"
          style={ebookProgressStyle(article)}
          aria-label="阅读进度"
        />
      </div>
      <div className="library-ebook-list-copy">
        {sourceLabel ? (
          <div className="library-ebook-list-source">
            <span>{sourceLabel}</span>
          </div>
        ) : null}
        <div className="library-ebook-list-main">
          <h3 title={article.title}>{article.title}</h3>
        </div>
        <div className="library-ebook-list-meta">
          <time dateTime={article.createdAt}>{formatLibraryShortDate(article.createdAt)}</time>
          <ArticleCountStats counts={counts} />
        </div>
      </div>
      <LibraryItemActions title={article.title} onDelete={onDelete} />
    </article>
  );
}

function WeReadBookListItem({
  book,
  onOpen,
  onOpenExternal,
}: {
  book: WeReadBook;
  onOpen: () => void;
  onOpenExternal: () => void;
}) {
  const readingTime = book.readingTime ?? book.recordReadingTime;
  return (
    <article
      className="library-ebook-list-item"
      role="button"
      tabIndex={0}
      aria-label={`打开微信读书笔记：${book.title}`}
      onClick={onOpen}
      onKeyDown={(event) => openItemWithKeyboard(event, onOpen)}
    >
      <div className="library-ebook-cover-column">
        <WeReadCover book={book} />
        <span
          className="library-ebook-progress"
          style={weReadProgressStyle(book)}
          aria-label="阅读进度"
        />
      </div>
      <div className="library-ebook-list-copy">
        <div className="library-ebook-list-source">
          <span>{book.author || '微信读书'}</span>
        </div>
        <div className="library-ebook-list-main">
          <h3 title={book.title}>{book.title}</h3>
        </div>
        <div className="library-ebook-list-meta">
          {readingTime ? <span>阅读 {formatWeReadDuration(readingTime)}</span> : null}
          <ArticleCountStats counts={{ annotations: book.noteCount, comments: book.reviewCount }} />
        </div>
      </div>
      <WeReadItemActions title={book.title} onOpenExternal={onOpenExternal} />
    </article>
  );
}

function formatWeReadDuration(value: number) {
  const minutes = Math.round(value / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

export function WeReadCover({
  book,
  variant = 'book',
}: {
  book: WeReadBook;
  variant?: 'book' | 'cover';
}) {
  const { ratio, updateRatio } = useNativeCoverRatio(book.cover);

  return (
    <BookCoverFrame
      className={variant === 'cover' ? 'weread-book-cover is-flat-cover' : 'weread-book-cover'}
      imageUrl={book.cover}
      nativeCover={Boolean(book.cover)}
      style={nativeBookCoverStyle(ratio)}
      title={book.cover ? undefined : book.title.slice(0, 6)}
      onImageLoad={updateRatio}
    />
  );
}

function WeReadItemActions({
  title,
  onOpenExternal,
}: {
  title: string;
  onOpenExternal: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className="library-item-actions"
      tabIndex={-1}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setMenuOpen(false);
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="library-card-menu">
        <button
          className={menuOpen ? 'library-card-more is-active' : 'library-card-more'}
          type="button"
          aria-label={`更多操作：${title}`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((current) => !current)}
        >
          <MoreHorizontal size={17} />
        </button>
        {menuOpen ? (
          <div className="library-card-menu-popover" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onOpenExternal();
              }}
            >
              <Smartphone size={14} />
              <span>打开微信读书</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function libraryDocumentSourceLabel(article: ArticleSummaryRecord) {
  if (article.sourceType === 'pdf') return article.pdf?.metadata.author || '';
  return article.byline || article.ebook?.metadata.fileName || '电子书';
}

function LibraryItemActions({ title, onDelete }: { title: string; onDelete: () => void }) {
  const [deleteHolding, setDeleteHolding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const deleteTimerRef = useRef<number | null>(null);

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
    <div
      className="library-item-actions"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setMenuOpen(false);
        stopDeleteHold();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="library-card-menu">
        <button
          className={menuOpen ? 'library-card-more is-active' : 'library-card-more'}
          type="button"
          aria-label={`更多操作：${title}`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((current) => !current)}
        >
          <MoreHorizontal size={17} />
        </button>
        {menuOpen ? (
          <div className="library-card-menu-popover" role="menu">
            <button
              className={deleteHolding ? 'library-item-delete is-holding' : 'library-item-delete'}
              style={{ '--delete-hold-ms': `${ARTICLE_DELETE_HOLD_MS}ms` } as React.CSSProperties}
              type="button"
              role="menuitem"
              aria-label={`长按删除：${title}`}
              onClick={(event) => event.preventDefault()}
              onContextMenu={(event) => event.preventDefault()}
              onPointerCancel={stopDeleteHold}
              onPointerDown={startDeleteHold}
              onPointerLeave={stopDeleteHold}
              onPointerUp={stopDeleteHold}
            >
              <Trash2 size={14} />
              <span>长按删除</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LibraryEmptyState({
  children,
  icon,
  title,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <section className="library-empty">
      {icon}
      <h3>{title}</h3>
      <p>{children}</p>
    </section>
  );
}

function ArticleCountStats({
  counts,
}: {
  counts: {
    annotations: number;
    comments: number;
  };
}) {
  if (counts.annotations === 0 && counts.comments === 0) return null;

  return (
    <span
      className="library-count-stats"
      aria-label={`${counts.annotations} 划线，${counts.comments} 想法`}
    >
      <span className="library-count-stat" title="划线">
        <span className="library-count-value">{counts.annotations}</span>
        <Highlighter size={14} aria-hidden="true" />
      </span>
      <span className="library-count-separator" aria-hidden="true">
        ·
      </span>
      <span className="library-count-stat" title="想法">
        <span className="library-count-value">{counts.comments}</span>
        <Lightbulb size={14} aria-hidden="true" />
      </span>
    </span>
  );
}

function openItemWithKeyboard(event: React.KeyboardEvent<HTMLElement>, onOpen: () => void) {
  if (event.target !== event.currentTarget) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onOpen();
}

function articleCounts(article: ArticleSummaryRecord) {
  return {
    annotations: articleAnnotationCount(article),
    comments: articleThoughtCount(article),
  };
}

function webArticleHost(article: ArticleSummaryRecord) {
  return urlHost(article.canonicalUrl || article.url).replace(/^www\./, '') || 'web';
}

function formatLibraryShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function ebookProgressStyle(article: ArticleSummaryRecord) {
  const progress = Math.min(1, Math.max(0, article.readingProgress?.progress ?? 0));
  return { '--ebook-progress': `${Math.round(progress * 100)}%` } as React.CSSProperties;
}

function weReadProgressStyle(book: WeReadBook) {
  const progress = Math.min(1, Math.max(0, book.readingProgress / 100));
  return { '--ebook-progress': `${Math.round(progress * 100)}%` } as React.CSSProperties;
}

function weReadBookMatchesSearch(book: WeReadBook, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [book.title, book.author, book.intro]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

function emptyLibraryReason({
  activeSource,
  itemsLength,
  filteredLength,
  searchQuery,
}: {
  activeSource: LibrarySource;
  itemsLength: number;
  filteredLength: number;
  searchQuery: string;
}) {
  if (itemsLength === 0) {
    return {
      description: '从右上角加号添加网页文章或导入 ePub 电子书，阅读库会按类型分开呈现。',
      icon: <BookOpen size={32} />,
      title: '阅读库还没有内容',
    };
  }

  if (filteredLength === 0 || searchQuery.trim()) {
    return {
      description: '调整搜索词后继续浏览。',
      icon: <Search size={32} />,
      title: '暂无匹配内容',
    };
  }

  if (activeSource === 'web') {
    return {
      description: '点击加号添加网页文章，这一版面会以域名、标题、日期、划线和想法展示。',
      icon: <FileText size={32} />,
      title: '暂无网页文章',
    };
  }

  if (activeSource === 'pdf') {
    return {
      description: '点击加号导入 PDF 文件，文档会保留页数和基础信息。',
      icon: <FileText size={32} />,
      title: '暂无 PDF',
    };
  }

  if (activeSource === 'weread') {
    return {
      description: '点击同步拉取微信读书中已有笔记的书籍，列表会展示封面、阅读进度、划线和想法。',
      icon: <Smartphone size={32} />,
      title: '暂无微信读书笔记',
    };
  }

  return {
    description: '点击加号导入 ePub 文件，电子书会保留封面并显示阅读进度。',
    icon: <BookText size={32} />,
    title: '暂无电子书',
  };
}
