import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  BookText,
  ChevronLeft,
  ChevronRight,
  FileText,
  Highlighter,
  Layers2,
  MoreHorizontal,
  RefreshCw,
  Search,
  Smartphone,
} from 'lucide-react';
import type {
  AppSettings,
  ArticleSummaryRecord,
  WeReadBook,
  WeReadSettings,
} from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import type {
  EbookImportProgressCallback,
  PdfImportProgressCallback,
} from '../shell/app-reading-types';
import {
  articleAnnotationCount,
  articleDistillationCount,
  articleDisplayTitle,
  articleMatchesLibrarySearch,
  compareLibraryArticles,
  librarySourceForArticle,
  type LibrarySource,
} from './app-reading-library-utils';
import {
  ArticleBook,
  BookCoverFrame,
  formatPdfAuthors,
  nativeBookCoverStyle,
  useNativeCoverRatio,
} from '../shell/app-article-book';
import { libraryContentSourceOptions } from './app-library-content-sources';
import { urlHost } from '../shell/app-utils';
import { LibraryImportControls, type ArticleImportResult } from './app-reading-library-imports';
import { ArticleDeleteMenuItem, useArticleDeleteConfirm } from './app-reading-library-delete';

const LIBRARY_PAGE_SIZE_OPTIONS = [6, 12, 18, 24] as const;

export function LibraryHome({
  activeSource,
  articles,
  sourceTransitionDirection = 'none',
  onActiveSourceChange,
  sortedArticles,
  onDeleteArticle,
  onImportEbookFile,
  onImportPdfFile,
  onImportArticleUrl,
  onCancelArticleImport,
  onOpenArticle,
  onOpenWeReadBook,
  onOpenWeReadExternal,
  onSaveSettings,
  onSyncWeRead,
  settings,
  wereadBooks,
  wereadOpenMessage,
  wereadSettings,
  wereadSyncing,
}: {
  activeSource: LibrarySource;
  articles: ArticleSummaryRecord[];
  sourceTransitionDirection?: LibrarySourceTransitionDirection;
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
  onImportArticleUrl: (url: string, requestId?: string) => Promise<ArticleImportResult>;
  onCancelArticleImport?: (requestId: string) => Promise<boolean> | boolean;
  onOpenArticle: (article: ArticleSummaryRecord) => void;
  onOpenWeReadBook: (book: WeReadBook) => void;
  onOpenWeReadExternal: (book: WeReadBook) => void;
  onSaveSettings: (settings: AppSettings) => Promise<void> | void;
  onSyncWeRead: () => void;
  settings: AppSettings;
  wereadBooks: WeReadBook[];
  wereadOpenMessage: string;
  wereadSettings: WeReadSettings;
  wereadSyncing: boolean;
}) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [pageTransitionDirection, setPageTransitionDirection] =
    useState<LibrarySourceTransitionDirection>('none');
  const [pageSize, setPageSize] = useState(() =>
    normalizeLibraryPageSize(settings.libraryPageSize),
  );
  const [searchQuery, setSearchQuery] = useState('');
  const sourceTabRefs = useRef(new Map<LibrarySource, HTMLButtonElement>());
  const pendingSourceFocusRef = useRef<LibrarySource | null>(null);
  const sourceOptions = useMemo(() => libraryContentSourceOptions(settings), [settings]);
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
  const activeSourcePanelId = librarySourcePanelId(activeSource);
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
    setPage((current) => {
      const nextPage = Math.min(current, pageCount);
      if (nextPage !== current) setPageTransitionDirection('none');
      return nextPage;
    });
  }, [pageCount]);

  useEffect(() => {
    setPageTransitionDirection('none');
    setPage(1);
    if (pendingSourceFocusRef.current === activeSource) {
      pendingSourceFocusRef.current = null;
      sourceTabRefs.current.get(activeSource)?.focus();
    }
  }, [activeSource, pageSize, searchQuery]);

  useEffect(() => {
    setPageSize(normalizeLibraryPageSize(settings.libraryPageSize));
  }, [settings.libraryPageSize]);

  const activeSourceLabel = t(`library.sources.${activeSource}`);
  const footerCountLabel = t(`library.total.${activeSource}`, {
    count: activeSource === 'weread' ? filteredWeReadBooks.length : sourceArticles.length,
  });
  const emptyReason = emptyLibraryReason({
    activeSource,
    itemsLength: activeSource === 'weread' ? wereadBooks.length : articles.length,
    filteredLength:
      activeSource === 'weread' ? filteredWeReadBooks.length : filteredArticles.length,
    searchQuery,
    t,
  });

  return (
    <section className={`library-home is-${activeSource}`} aria-label={activeSourceLabel}>
      <header className="library-home-header">
        <div className="library-home-header-main">
          <div
            className="library-source-tabs"
            role="tablist"
            aria-label={t('library.sourceTabsLabel')}
            onKeyDown={(event) => {
              if (
                event.key !== 'ArrowLeft' &&
                event.key !== 'ArrowRight' &&
                event.key !== 'Home' &&
                event.key !== 'End'
              )
                return;
              event.preventDefault();
              const enabledOptions = sourceOptions.filter(
                (item) => item.value !== 'weread' || wereadSettings.configured,
              );
              if (enabledOptions.length === 0) return;
              const currentIndex = Math.max(
                0,
                enabledOptions.findIndex((item) => item.value === activeSource),
              );
              const nextIndex =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? enabledOptions.length - 1
                    : event.key === 'ArrowRight'
                      ? (currentIndex + 1) % enabledOptions.length
                      : (currentIndex - 1 + enabledOptions.length) % enabledOptions.length;
              const nextSource = enabledOptions[nextIndex].value;
              pendingSourceFocusRef.current = nextSource;
              onActiveSourceChange(nextSource);
            }}
          >
            {sourceOptions.map((option) => {
              const selected = activeSource === option.value;
              const unavailable = option.value === 'weread' && !wereadSettings.configured;
              const disabledReason = unavailable ? t('library.weReadSetupTooltip') : undefined;
              return (
                <button
                  aria-controls={librarySourcePanelId(option.value)}
                  aria-disabled={unavailable}
                  aria-selected={selected}
                  className={[selected ? 'is-active' : '', unavailable ? 'is-disabled' : '']
                    .filter(Boolean)
                    .join(' ')}
                  data-tooltip={disabledReason}
                  id={librarySourceTabId(option.value)}
                  ref={(element) => {
                    if (element) sourceTabRefs.current.set(option.value, element);
                    else sourceTabRefs.current.delete(option.value);
                  }}
                  role="tab"
                  tabIndex={selected ? 0 : -1}
                  title={disabledReason}
                  key={option.value}
                  type="button"
                  onClick={() => {
                    if (unavailable) return;
                    onActiveSourceChange(option.value);
                  }}
                >
                  <span>{t(`library.sources.${option.value}`)}</span>
                  <em>{counts[option.value]}</em>
                </button>
              );
            })}
          </div>
          <div className="library-home-actions">
            <label className="library-search">
              <Search size={16} />
              <Input
                type="search"
                value={searchQuery}
                placeholder={t('library.searchPlaceholder')}
                aria-label={t('library.searchLabel')}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
            {activeSource === 'weread' ? null : (
              <LibraryImportControls
                defaultImportType={activeSource}
                onImportEbookFile={onImportEbookFile}
                onImportPdfFile={onImportPdfFile}
                onImportArticleUrl={onImportArticleUrl}
                onCancelArticleImport={onCancelArticleImport}
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
                {wereadSyncing ? t('library.syncing') : t('library.sync')}
              </button>
            ) : null}
            {activeSource === 'weread' && wereadOpenMessage ? (
              <p className="library-inline-error">{wereadOpenMessage}</p>
            ) : null}
          </div>
        </div>
      </header>
      <div className="library-toolbar" aria-label={t('library.toolbarLabel')}>
        <span>{t('library.toolbarSort')}</span>
      </div>
      <div className="library-home-body" data-source-transition={sourceTransitionDirection}>
        <div
          className="library-source-panel"
          id={activeSourcePanelId}
          role="tabpanel"
          aria-labelledby={librarySourceTabId(activeSource)}
          data-page-transition={pageTransitionDirection}
          key={activeSource}
        >
          <div className="library-page-panel" key={`${activeSource}-${page}`}>
            {activeSource === 'weread' && !wereadSettings.configured ? (
              <LibraryEmptyState
                icon={<Smartphone size={32} />}
                title={t('library.weReadSetupTitle')}
              >
                {t('library.weReadSetupDescription')}
              </LibraryEmptyState>
            ) : activeSource === 'weread' && filteredWeReadBooks.length > 0 ? (
              <div className="library-list library-ebook-list">
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
                <div className="library-list library-web-grid">
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
                <div className="library-list library-ebook-list">
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
        </div>
      </div>
      {activeItemsLength > 0 ? (
        <footer
          className={pageCount > 1 ? 'library-home-footer' : 'library-home-footer is-compact'}
        >
          <span>{footerCountLabel}</span>
          {pageCount > 1 ? (
            <div className="library-pagination" aria-label={t('library.pagination.label')}>
              <button
                type="button"
                aria-label={t('library.pagination.previous')}
                disabled={page === 1}
                onClick={() => changePage(Math.max(1, page - 1))}
              >
                <ChevronLeft size={16} />
              </button>
              {pageNumbers.map((pageNumber) => (
                <button
                  className={pageNumber === page ? 'is-active' : undefined}
                  type="button"
                  aria-current={pageNumber === page ? 'page' : undefined}
                  key={pageNumber}
                  onClick={() => changePage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}
              <button
                type="button"
                aria-label={t('library.pagination.next')}
                disabled={page === pageCount}
                onClick={() => changePage(Math.min(pageCount, page + 1))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          ) : null}
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              const nextPageSize = normalizeLibraryPageSize(Number(value));
              setPageTransitionDirection('none');
              setPageSize(nextPageSize);
              setPage(1);
              void Promise.resolve(
                onSaveSettings({ ...settings, libraryPageSize: nextPageSize }),
              ).catch(() => setPageSize(normalizeLibraryPageSize(settings.libraryPageSize)));
            }}
          >
            <SelectTrigger
              className="library-page-size-trigger"
              aria-label={t('library.pagination.pageSize')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="theme-select-content">
              <SelectGroup>
                {LIBRARY_PAGE_SIZE_OPTIONS.map((option) => (
                  <SelectItem value={String(option)} key={option}>
                    {t('library.pagination.pageSizeOption', { count: option })}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </footer>
      ) : null}
    </section>
  );

  function changePage(nextPage: number) {
    if (nextPage === page) {
      setPageTransitionDirection('none');
      return;
    }
    setPageTransitionDirection(nextPage > page ? 'forward' : 'backward');
    setPage(nextPage);
  }
}

export type LibrarySourceTransitionDirection = 'backward' | 'forward' | 'none';

function normalizeLibraryPageSize(value: unknown) {
  return LIBRARY_PAGE_SIZE_OPTIONS.includes(value as (typeof LIBRARY_PAGE_SIZE_OPTIONS)[number])
    ? (value as (typeof LIBRARY_PAGE_SIZE_OPTIONS)[number])
    : 12;
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
  const { t, i18n } = useTranslation();
  const counts = articleCounts(article);
  const host = webArticleHost(article);
  const title = articleDisplayTitle(article);

  return (
    <article className="library-list-item library-web-item">
      <button
        className="library-list-item-open"
        type="button"
        aria-label={t('library.actions.openArticle', { title })}
        onClick={onOpen}
      />
      <div className="library-web-item-cover" aria-hidden="true">
        <ArticleBook article={article} />
        <LibraryCoverProgress progress={article.readingProgress?.progress ?? 0} />
      </div>
      <div className="library-web-item-source">
        <span>{host}</span>
      </div>
      <div className="library-web-item-main">
        <h3 title={title}>{title}</h3>
      </div>
      <div className="library-web-item-meta">
        <time dateTime={article.createdAt}>
          {formatLibraryShortDate(article.createdAt, i18n.language)}
        </time>
        <ArticleCountStats counts={counts} />
      </div>
      <LibraryItemActions title={title} onDelete={onDelete} />
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
  const { t, i18n } = useTranslation();
  const counts = articleCounts(article);
  const sourceLabel = libraryDocumentSourceLabel(article, t('library.fallback.ebook'));
  const title = articleDisplayTitle(article);

  return (
    <article className="library-list-item library-ebook-list-item">
      <button
        className="library-list-item-open"
        type="button"
        aria-label={t('library.actions.openDocument', {
          title,
          type: article.sourceType === 'pdf' ? 'PDF' : t('library.fallback.ebook'),
        })}
        onClick={onOpen}
      />
      <div className="library-ebook-cover-column">
        <ArticleBook article={article} />
        <LibraryCoverProgress progress={article.readingProgress?.progress ?? 0} />
      </div>
      <div className="library-ebook-list-copy">
        {sourceLabel ? (
          <div
            className={[
              'library-ebook-list-source',
              article.sourceType === 'pdf' ? 'is-pdf-source' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span>{sourceLabel}</span>
          </div>
        ) : null}
        <div className="library-ebook-list-main">
          <h3 title={title}>{title}</h3>
        </div>
        <div className="library-ebook-list-meta">
          <time dateTime={article.createdAt}>
            {formatLibraryShortDate(article.createdAt, i18n.language)}
          </time>
          <ArticleCountStats counts={counts} />
        </div>
      </div>
      <LibraryItemActions title={title} onDelete={onDelete} />
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
  const { t, i18n } = useTranslation();
  const lastReadAt = formatWeReadLastReadDate(book.lastReadAt, i18n.language);
  return (
    <article className="library-list-item library-ebook-list-item">
      <button
        className="library-list-item-open"
        type="button"
        aria-label={t('library.actions.openWeRead', { title: book.title })}
        onClick={onOpen}
      />
      <div className="library-ebook-cover-column">
        <WeReadCover book={book} />
        <LibraryCoverProgress progress={book.readingProgress / 100} />
      </div>
      <div className="library-ebook-list-copy">
        <div className="library-ebook-list-source">
          <span>{book.author || t('library.fallback.weread')}</span>
        </div>
        <div className="library-ebook-list-main">
          <h3 title={book.title}>{book.title}</h3>
        </div>
        <div className="library-ebook-list-meta">
          {lastReadAt ? <time dateTime={lastReadAt.dateTime}>{lastReadAt.label}</time> : null}
          <ArticleCountStats counts={{ annotations: book.noteCount, distillations: 0 }} />
        </div>
      </div>
      <WeReadItemActions title={book.title} onOpenExternal={onOpenExternal} />
    </article>
  );
}

function formatWeReadLastReadDate(value: number | undefined, locale: string) {
  if (!value) return null;
  const timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return {
    dateTime: date.toISOString(),
    label: formatLibraryShortDate(date.toISOString(), locale),
  };
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
  const { t } = useTranslation();
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
          aria-label={t('library.actions.more', { title })}
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
              <span>{t('library.actions.openWeReadExternal')}</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function libraryDocumentSourceLabel(article: ArticleSummaryRecord, ebookFallback: string) {
  if (article.sourceType === 'pdf')
    return formatPdfAuthors(article.pdf?.metadata.author || '', { maxAuthors: 3, maxLength: 42 });
  return article.byline || article.ebook?.metadata.fileName || ebookFallback;
}

function LibraryItemActions({ title, onDelete }: { title: string; onDelete: () => void }) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { dialog: deleteDialog, requestDelete } = useArticleDeleteConfirm(title, onDelete);

  return (
    <div
      className="library-item-actions"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setMenuOpen(false);
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="library-card-menu">
        <button
          className={menuOpen ? 'library-card-more is-active' : 'library-card-more'}
          type="button"
          aria-label={t('library.actions.more', { title })}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={() => setMenuOpen((current) => !current)}
        >
          <MoreHorizontal size={17} />
        </button>
        {menuOpen ? (
          <div className="library-card-menu-popover" role="menu">
            <ArticleDeleteMenuItem
              title={title}
              onSelect={() => {
                setMenuOpen(false);
                requestDelete();
              }}
            />
          </div>
        ) : null}
      </div>
      {deleteDialog}
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
    distillations: number;
  };
}) {
  const { t } = useTranslation();
  if (counts.annotations === 0 && counts.distillations === 0) return null;
  const label = libraryCountStatsLabel(counts, t);

  return (
    <span className="library-count-stats" aria-label={label} data-tooltip={label}>
      <span className="library-count-stat">
        <span className="library-count-value">{counts.annotations}</span>
        <Highlighter size={14} aria-hidden="true" />
      </span>
      <span className="library-count-separator" aria-hidden="true">
        ·
      </span>
      <span className="library-count-stat">
        <span className="library-count-value">{counts.distillations}</span>
        <Layers2 size={14} aria-hidden="true" />
      </span>
    </span>
  );
}

function libraryCountStatsLabel(
  counts: { annotations: number; distillations: number },
  t: ReturnType<typeof useTranslation>['t'],
) {
  return t('library.stats.label', {
    annotations: counts.annotations,
    distillations: counts.distillations,
  });
}

function articleCounts(article: ArticleSummaryRecord) {
  return {
    annotations: articleAnnotationCount(article),
    distillations: articleDistillationCount(article),
  };
}

function librarySourceTabId(source: LibrarySource) {
  return `library-source-tab-${source}`;
}

function librarySourcePanelId(source: LibrarySource) {
  return `library-source-panel-${source}`;
}

function LibraryCoverProgress({ progress }: { progress: number }) {
  const { t } = useTranslation();
  return (
    <span
      className="library-cover-progress library-ebook-progress"
      style={coverProgressStyle(progress)}
      aria-label={t('library.actions.progress')}
    />
  );
}

function webArticleHost(article: ArticleSummaryRecord) {
  return urlHost(article.canonicalUrl || article.url).replace(/^www\./, '') || 'web';
}

function formatLibraryShortDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function coverProgressStyle(value: number) {
  const progress = Math.min(1, Math.max(0, value));
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
  t,
}: {
  activeSource: LibrarySource;
  itemsLength: number;
  filteredLength: number;
  searchQuery: string;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  if (itemsLength === 0) {
    return {
      description: t('library.empty.libraryDescription'),
      icon: <BookOpen size={32} />,
      title: t('library.empty.libraryTitle'),
    };
  }

  if (filteredLength === 0 || searchQuery.trim()) {
    return {
      description: t('library.empty.noMatchDescription'),
      icon: <Search size={32} />,
      title: t('library.empty.noMatchTitle'),
    };
  }

  if (activeSource === 'web') {
    return {
      description: t('library.empty.webDescription'),
      icon: <FileText size={32} />,
      title: t('library.empty.webTitle'),
    };
  }

  if (activeSource === 'pdf') {
    return {
      description: t('library.empty.pdfDescription'),
      icon: <FileText size={32} />,
      title: t('library.empty.pdfTitle'),
    };
  }

  if (activeSource === 'weread') {
    return {
      description: t('library.empty.wereadDescription'),
      icon: <Smartphone size={32} />,
      title: t('library.empty.wereadTitle'),
    };
  }

  return {
    description: t('library.empty.ebookDescription'),
    icon: <BookText size={32} />,
    title: t('library.empty.ebookTitle'),
  };
}
