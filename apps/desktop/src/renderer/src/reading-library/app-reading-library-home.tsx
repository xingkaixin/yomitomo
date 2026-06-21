import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  BookText,
  ChevronLeft,
  ChevronRight,
  FileText,
  Highlighter,
  Layers2,
  MoreHorizontal,
  Pin,
  PinOff,
  Search,
  Smartphone,
} from 'lucide-react';
import type {
  AppSettings,
  ArticleSummaryRecord,
  Collection,
  CollectionMember,
  LibraryPin,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import type {
  EbookImportProgressCallback,
  PdfImportProgressCallback,
} from '../shell/app-reading-types';
import type { SetLibraryPinInput } from '../../../ipc-contract';
import {
  ArticleBook,
  BookCoverFrame,
  nativeBookCoverStyle,
  useNativeCoverRatio,
} from '../shell/app-article-book';
import { libraryContentSourceBaseOptions } from './app-library-content-sources';
import { LibraryImportControls, type ArticleImportResult } from './app-reading-library-imports';
import { ArticleLibraryCard } from './app-reading-library-card';
import { formatLibraryShortDate } from './app-reading-library-utils';
import {
  buildLibraryEntities,
  groupLibraryEntities,
  libraryEntityPinTarget,
} from './app-reading-library-entities';
import type {
  LibraryCollectionEntity,
  LibraryEntity,
  LibraryItemType,
  LibraryTypeScope,
} from './library-entity-types';

const LIBRARY_PAGE_SIZE_OPTIONS = [6, 12, 18, 24] as const;
const LOCAL_LIBRARY_TYPES: LibraryItemType[] = ['web', 'ebook', 'pdf'];

export function LibraryHome({
  collectionMembers,
  collections,
  onDeleteArticle,
  onImportEbookFile,
  onImportPdfFile,
  onImportArticleUrl,
  onCancelArticleImport,
  onOpenArticle,
  onOpenWeReadBook,
  onOpenWeReadExternal,
  onSaveSettings,
  onSetLibraryPin,
  onSyncWeRead,
  pins,
  settings,
  sortedArticles,
  wereadBooks,
  wereadOpenMessage,
  wereadSettings,
  wereadSyncing,
}: {
  collectionMembers: CollectionMember[];
  collections: Collection[];
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
  onSetLibraryPin: (input: SetLibraryPinInput) => Promise<void> | void;
  onSyncWeRead: () => void;
  pins: LibraryPin[];
  settings: AppSettings;
  sortedArticles: ArticleSummaryRecord[];
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
  const [typeScope, setTypeScope] = useState<LibraryTypeScope>('all');
  const wereadAvailable = wereadSettings.configured || wereadBooks.length > 0;
  const availableTypes = useMemo<LibraryItemType[]>(
    () => (wereadAvailable ? [...LOCAL_LIBRARY_TYPES, 'weread'] : LOCAL_LIBRARY_TYPES),
    [wereadAvailable],
  );
  const typeOptions = useMemo(
    () => [
      { value: 'all' as const, label: t('library.typeFilter.all') },
      ...libraryContentSourceBaseOptions()
        .filter((option) => availableTypes.includes(option.value))
        .map((option) => ({ value: option.value, label: option.label })),
    ],
    [availableTypes, t],
  );
  const unfilteredEntities = useMemo(
    () =>
      buildLibraryEntities({
        articles: sortedArticles,
        collectionMembers,
        collections,
        enabledTypes: availableTypes,
        pins,
        query: '',
        typeScope,
        wereadBooks,
      }),
    [availableTypes, collectionMembers, collections, pins, sortedArticles, typeScope, wereadBooks],
  );
  const filteredEntities = useMemo(
    () =>
      buildLibraryEntities({
        articles: sortedArticles,
        collectionMembers,
        collections,
        enabledTypes: availableTypes,
        pins,
        query: searchQuery,
        typeScope,
        wereadBooks,
      }),
    [
      collectionMembers,
      collections,
      availableTypes,
      pins,
      searchQuery,
      sortedArticles,
      typeScope,
      wereadBooks,
    ],
  );
  const activeItemsLength = filteredEntities.length;
  const pageCount = Math.max(1, Math.ceil(activeItemsLength / pageSize));
  const pageEntities = filteredEntities.slice((page - 1) * pageSize, page * pageSize);
  const pageGroups = groupLibraryEntities(pageEntities);
  const pageNumbers = useMemo(() => {
    const visibleCount = Math.min(5, pageCount);
    const start = Math.min(
      Math.max(1, page - Math.floor(visibleCount / 2)),
      pageCount - visibleCount + 1,
    );
    return Array.from({ length: visibleCount }, (_, index) => start + index);
  }, [page, pageCount]);
  const activeTypeLabel =
    typeOptions.find((option) => option.value === typeScope)?.label || t('library.typeFilter.all');
  const footerCountLabel =
    typeScope === 'all'
      ? t('library.total.all', { count: activeItemsLength })
      : t(`library.total.${typeScope}`, { count: activeItemsLength });
  const emptyReason = emptyLibraryReason({
    filteredLength: activeItemsLength,
    itemsLength: unfilteredEntities.length,
    searchQuery,
    t,
    typeScope,
    wereadConfigured: wereadSettings.configured,
  });

  useEffect(() => {
    if (typeScope === 'all' || availableTypes.includes(typeScope)) return;
    setTypeScope('all');
  }, [availableTypes, typeScope]);

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
  }, [pageSize, searchQuery, typeScope]);

  useEffect(() => {
    setPageSize(normalizeLibraryPageSize(settings.libraryPageSize));
  }, [settings.libraryPageSize]);

  const deleteArticle = async (articleId: string) => {
    await onDeleteArticle(articleId);
  };
  const importArticleUrl = async (url: string, requestId?: string) =>
    onImportArticleUrl(url, requestId);
  const importEbookFile = async (file: File, onProgress?: EbookImportProgressCallback) =>
    onImportEbookFile(file, onProgress);
  const importPdfFile = async (file: File, onProgress?: PdfImportProgressCallback) =>
    onImportPdfFile(file, onProgress);

  return (
    <section className="library-home is-mixed" aria-label={t('library.title')}>
      <header className="library-home-header">
        <div className="library-home-header-main">
          <div className="library-search library-search-combo">
            <Search size={16} />
            <Input
              type="search"
              value={searchQuery}
              placeholder={t('library.searchPlaceholder')}
              aria-label={t('library.searchLabel')}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
            <Select
              value={typeScope}
              onValueChange={(value) => setTypeScope(value as LibraryTypeScope)}
            >
              <SelectTrigger
                className="library-type-filter-trigger"
                aria-label={t('library.typeFilter.label')}
              >
                <span>{activeTypeLabel}</span>
              </SelectTrigger>
              <SelectContent className="theme-select-content">
                <SelectGroup>
                  {typeOptions.map((option) => (
                    <SelectItem value={option.value} key={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="library-home-actions">
            <LibraryImportControls
              settings={settings}
              weReadSyncDisabled={!wereadSettings.configured || wereadSyncing}
              weReadSyncVisible={wereadAvailable}
              weReadSyncing={wereadSyncing}
              onImportEbookFile={importEbookFile}
              onImportPdfFile={importPdfFile}
              onImportArticleUrl={importArticleUrl}
              onCancelArticleImport={onCancelArticleImport}
              onOpenArticle={onOpenArticle}
              onSyncWeRead={onSyncWeRead}
            />
            {wereadOpenMessage ? <p className="library-inline-error">{wereadOpenMessage}</p> : null}
          </div>
        </div>
      </header>
      <div className="library-toolbar" aria-label={t('library.toolbarLabel')}>
        <span>{t('library.toolbarSort')}</span>
      </div>
      <div className="library-home-body" data-source-transition="none">
        <div
          className="library-source-panel"
          id="library-source-panel-all"
          role="tabpanel"
          aria-label={t('library.groups.all')}
          data-page-transition={pageTransitionDirection}
        >
          <div className="library-page-panel" key={`${typeScope}-${page}`}>
            {activeItemsLength > 0 ? (
              <LibraryEntityGrid
                groups={pageGroups}
                onDeleteArticle={(article) => void deleteArticle(article.id)}
                onOpenArticle={onOpenArticle}
                onOpenWeReadBook={onOpenWeReadBook}
                onOpenWeReadExternal={onOpenWeReadExternal}
                onSetPinned={(entity, pinned) =>
                  void onSetLibraryPin({ target: libraryEntityPinTarget(entity), pinned })
                }
              />
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

function LibraryEntityGrid({
  groups,
  onDeleteArticle,
  onOpenArticle,
  onOpenWeReadBook,
  onOpenWeReadExternal,
  onSetPinned,
}: {
  groups: { pinned: LibraryEntity[]; rest: LibraryEntity[] };
  onDeleteArticle: (article: ArticleSummaryRecord) => void;
  onOpenArticle: (article: ArticleSummaryRecord) => void;
  onOpenWeReadBook: (book: WeReadBook) => void;
  onOpenWeReadExternal: (book: WeReadBook) => void;
  onSetPinned: (entity: LibraryEntity, pinned: boolean) => void;
}) {
  const { t } = useTranslation();
  const sections = [
    { key: 'pinned', title: t('library.groups.pinned'), entities: groups.pinned },
    { key: 'rest', title: t('library.groups.all'), entities: groups.rest },
  ].filter((section) => section.entities.length > 0);

  return (
    <div className="library-entity-scroll">
      {sections.map((section) => (
        <section className="library-card-group" key={section.key} aria-label={section.title}>
          {section.key === 'pinned' ? (
            <h3 className="library-card-group-title">{section.title}</h3>
          ) : null}
          <div className="library-entity-grid">
            {section.entities.map((entity) => (
              <LibraryEntityCard
                entity={entity}
                key={libraryEntityKey(entity)}
                onDeleteArticle={onDeleteArticle}
                onOpenArticle={onOpenArticle}
                onOpenWeReadBook={onOpenWeReadBook}
                onOpenWeReadExternal={onOpenWeReadExternal}
                onSetPinned={(pinned) => onSetPinned(entity, pinned)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function LibraryEntityCard({
  entity,
  onDeleteArticle,
  onOpenArticle,
  onOpenWeReadBook,
  onOpenWeReadExternal,
  onSetPinned,
}: {
  entity: LibraryEntity;
  onDeleteArticle: (article: ArticleSummaryRecord) => void;
  onOpenArticle: (article: ArticleSummaryRecord) => void;
  onOpenWeReadBook: (book: WeReadBook) => void;
  onOpenWeReadExternal: (book: WeReadBook) => void;
  onSetPinned: (pinned: boolean) => void;
}) {
  if (entity.kind === 'col') {
    return (
      <LibraryCollectionCard entity={entity} onSetPinned={onSetPinned} pinned={entity.pinned} />
    );
  }

  if (entity.article) {
    return (
      <ArticleLibraryCard
        article={entity.article}
        onDelete={() => onDeleteArticle(entity.article!)}
        onOpen={() => onOpenArticle(entity.article!)}
        onSetPinned={onSetPinned}
        pinned={entity.pinned}
      />
    );
  }

  if (entity.weread) {
    return (
      <WeReadLibraryCard
        book={entity.weread}
        pinned={entity.pinned}
        onOpen={() => onOpenWeReadBook(entity.weread!)}
        onOpenExternal={() => onOpenWeReadExternal(entity.weread!)}
        onSetPinned={onSetPinned}
      />
    );
  }

  return null;
}

function WeReadLibraryCard({
  book,
  onOpen,
  onOpenExternal,
  onSetPinned,
  pinned,
}: {
  book: WeReadBook;
  onOpen: () => void;
  onOpenExternal: () => void;
  onSetPinned: (pinned: boolean) => void;
  pinned: boolean;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const statsLabel = t('library.stats.label', {
    annotations: book.noteCount,
    distillations: 0,
  });

  return (
    <article className="library-list-item library-article-list-item library-ebook-list-item library-weread-list-item">
      <button
        className="library-list-item-open"
        type="button"
        aria-label={t('library.actions.openWeRead', { title: book.title })}
        onClick={onOpen}
      />
      {pinned ? (
        <div className="library-item-top-meta">
          <PinnedIndicator pinned={pinned} />
        </div>
      ) : null}
      <div className="library-item-actions">
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <div className="library-card-menu">
            <DropdownMenuTrigger asChild>
              <button
                className={menuOpen ? 'library-card-more is-active' : 'library-card-more'}
                type="button"
                aria-label={t('library.actions.more', { title: book.title })}
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal size={17} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="library-card-menu-popover"
              onClick={(event) => event.stopPropagation()}
            >
              <LibraryPinMenuItem
                pinned={pinned}
                onSelect={() => {
                  setMenuOpen(false);
                  onSetPinned(!pinned);
                }}
              />
              <DropdownMenuItem asChild>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenExternal();
                  }}
                >
                  <Smartphone size={14} />
                  <span>{t('library.actions.openWeReadExternal')}</span>
                </button>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </div>
        </DropdownMenu>
      </div>
      <div className="library-ebook-cover-column" aria-hidden="true">
        <WeReadCover book={book} />
        <LibraryCoverProgress progress={book.readingProgress / 100} />
      </div>
      <div className="library-ebook-list-copy">
        <p className="library-card-author">
          <span>{book.author || t('library.fallback.weread')}</span>
        </p>
        <div className="library-ebook-list-main">
          <h3 title={book.title}>{book.title}</h3>
        </div>
        <div className="library-ebook-list-meta">
          <span className="library-item-date-source">
            <time dateTime={book.updatedAt}>{formatLibraryShortDate(book.updatedAt)}</time>
            <span className="library-source-badge">{t('library.sources.wereadShort')}</span>
          </span>
          <div className="library-count-stats" aria-label={statsLabel} data-tooltip={statsLabel}>
            <span className="library-count-stat">
              <Highlighter size={13} />
              <span className="library-count-value">{book.noteCount}</span>
            </span>
            <span className="library-count-stat">
              <Layers2 size={13} />
              <span className="library-count-value">0</span>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function LibraryCollectionCard({
  entity,
  onSetPinned,
  pinned,
}: {
  entity: LibraryCollectionEntity;
  onSetPinned: (pinned: boolean) => void;
  pinned: boolean;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const title = entity.collection.name;
  const statsLabel = t('library.collection.memberCount', { count: entity.memberCount });

  return (
    <article className="library-card library-collection-card" aria-label={title}>
      <div className="library-card-top-actions">
        <PinnedIndicator pinned={pinned} />
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <div className="library-card-menu">
            <DropdownMenuTrigger asChild>
              <button
                className={menuOpen ? 'library-card-more is-active' : 'library-card-more'}
                type="button"
                aria-label={t('library.actions.more', { title })}
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal size={17} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="library-card-menu-popover"
              onClick={(event) => event.stopPropagation()}
            >
              <LibraryPinMenuItem
                pinned={pinned}
                onSelect={() => {
                  setMenuOpen(false);
                  onSetPinned(!pinned);
                }}
              />
            </DropdownMenuContent>
          </div>
        </DropdownMenu>
      </div>
      <div className="library-card-main">
        <div className="library-collection-cover-stack" aria-hidden="true">
          {entity.coverMembers.length > 0 ? (
            entity.coverMembers.slice(0, 3).map((item) => (
              <div
                className="library-collection-cover-item"
                key={`${item.ref.kind}:${item.ref.id}`}
              >
                {item.article ? <ArticleBook article={item.article} /> : null}
                {item.weread ? <WeReadCover book={item.weread} variant="cover" /> : null}
              </div>
            ))
          ) : (
            <div className="library-collection-empty-cover">
              <BookOpen size={24} />
            </div>
          )}
        </div>
        <div className="library-card-copy">
          <div>
            <div className="library-card-status-row">
              <span className="library-status-badge is-collection">
                {t('library.sources.collection')}
              </span>
              <span>{statsLabel}</span>
            </div>
            <h3 title={title}>{title}</h3>
            {entity.collection.desc ? (
              <p className="library-card-author">
                <span>{entity.collection.desc}</span>
              </p>
            ) : null}
            <time dateTime={entity.collection.updatedAt}>
              {t('library.meta.updatedAt', { date: formatLibraryShortDate(entity.sortTime) })}
            </time>
          </div>
        </div>
      </div>
      <footer className="library-card-footer">
        <div className="library-card-meta" aria-label={statsLabel} data-tooltip={statsLabel}>
          <span>
            <BookOpen size={13} />
            {statsLabel}
          </span>
        </div>
        <span className="library-source-badge">{t('library.sources.collectionShort')}</span>
      </footer>
    </article>
  );
}

function LibraryPinMenuItem({ pinned, onSelect }: { pinned: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  return (
    <DropdownMenuItem asChild>
      <button type="button" onClick={onSelect}>
        {pinned ? <PinOff size={14} /> : <Pin size={14} />}
        <span>{pinned ? t('library.actions.unpin') : t('library.actions.pin')}</span>
      </button>
    </DropdownMenuItem>
  );
}

function PinnedIndicator({ pinned }: { pinned: boolean }) {
  const { t } = useTranslation();
  if (!pinned) return null;
  return (
    <span
      className="library-card-pin-indicator"
      aria-label={t('library.actions.pinned')}
      data-tooltip={t('library.actions.pinned')}
    >
      <Pin size={15} />
    </span>
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

function normalizeLibraryPageSize(value: unknown) {
  return LIBRARY_PAGE_SIZE_OPTIONS.includes(value as (typeof LIBRARY_PAGE_SIZE_OPTIONS)[number])
    ? (value as (typeof LIBRARY_PAGE_SIZE_OPTIONS)[number])
    : 12;
}

function libraryEntityKey(entity: LibraryEntity) {
  if (entity.kind === 'col') return `collection:${entity.collection.id}`;
  return `${entity.ref.kind}:${entity.ref.id}`;
}

function coverProgressStyle(value: number) {
  const progress = Math.min(1, Math.max(0, value));
  return { '--ebook-progress': `${Math.round(progress * 100)}%` } as React.CSSProperties;
}

function emptyLibraryReason({
  filteredLength,
  itemsLength,
  searchQuery,
  t,
  typeScope,
  wereadConfigured,
}: {
  filteredLength: number;
  itemsLength: number;
  searchQuery: string;
  t: ReturnType<typeof useTranslation>['t'];
  typeScope: LibraryTypeScope;
  wereadConfigured: boolean;
}) {
  if (typeScope === 'weread' && !wereadConfigured) {
    return {
      description: t('library.weReadSetupDescription'),
      icon: <Smartphone size={32} />,
      title: t('library.weReadSetupTitle'),
    };
  }

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

  if (typeScope === 'web') {
    return {
      description: t('library.empty.webDescription'),
      icon: <FileText size={32} />,
      title: t('library.empty.webTitle'),
    };
  }

  if (typeScope === 'pdf') {
    return {
      description: t('library.empty.pdfDescription'),
      icon: <FileText size={32} />,
      title: t('library.empty.pdfTitle'),
    };
  }

  if (typeScope === 'weread') {
    return {
      description: t('library.empty.wereadDescription'),
      icon: <Smartphone size={32} />,
      title: t('library.empty.wereadTitle'),
    };
  }

  if (typeScope === 'ebook') {
    return {
      description: t('library.empty.ebookDescription'),
      icon: <BookText size={32} />,
      title: t('library.empty.ebookTitle'),
    };
  }

  return {
    description: t('library.empty.noMatchDescription'),
    icon: <Search size={32} />,
    title: t('library.empty.noMatchTitle'),
  };
}
