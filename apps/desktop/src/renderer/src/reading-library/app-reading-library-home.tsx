import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReaderTooltip } from '@yomitomo/reader-ui/reader-component-primitives';
import {
  ArrowLeft,
  BookOpen,
  BookText,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  Globe2,
  GripVertical,
  Highlighter,
  Layers2,
  LibraryBig,
  MoreHorizontal,
  PencilLine,
  Pin,
  PinOff,
  Plus,
  Search,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AppSettings,
  ArticleSummaryRecord,
  Collection,
  CollectionMember,
  ContentRef,
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
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../components/ui/dialog';
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
import { SettingsConfirmDialog } from '../settings/app-settings-confirm-dialog';
import {
  ArticleBook,
  BookCoverFrame,
  nativeBookCoverStyle,
  useNativeCoverRatio,
} from '../shell/app-article-book';
import { libraryContentSourceBaseOptions } from './app-library-content-sources';
import {
  LibraryImportControls,
  useLibraryImportDialogs,
  type ArticleImportResult,
} from './app-reading-library-imports';
import { ArticleLibraryCard } from './app-reading-library-card';
import {
  articleDisplayTitle,
  formatLibraryShortDate,
  weReadBookLibraryDate,
} from './app-reading-library-utils';
import {
  buildCollectionMemberEntities,
  buildLibraryEntities,
  libraryEntityPinTarget,
} from './app-reading-library-entities';
import type {
  LibraryCollectionEntity,
  LibraryEntity,
  LibraryItemEntity,
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
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onAddCollectionMembers,
  onRemoveCollectionMember,
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
  onCreateCollection: (name: string) => Promise<Collection>;
  onRenameCollection: (collectionId: string, name: string) => Promise<void> | void;
  onDeleteCollection: (collectionId: string) => Promise<void> | void;
  onAddCollectionMembers: (collectionId: string, members: ContentRef[]) => Promise<void> | void;
  onRemoveCollectionMember: (collectionId: string, member: ContentRef) => Promise<void> | void;
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
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [collectionNameDialog, setCollectionNameDialog] =
    useState<CollectionNameDialogState | null>(null);
  const [pickerCollectionId, setPickerCollectionId] = useState<string | null>(null);
  const [draggedRef, setDraggedRef] = useState<ContentRef | null>(null);
  const wereadAvailable = wereadSettings.configured || wereadBooks.length > 0;
  const activeCollection = activeCollectionId
    ? collections.find((collection) => collection.id === activeCollectionId) || null
    : null;
  const pickerCollection = pickerCollectionId
    ? collections.find((collection) => collection.id === pickerCollectionId) || null
    : null;
  const availableTypes = useMemo<LibraryItemType[]>(
    () => (wereadAvailable ? [...LOCAL_LIBRARY_TYPES, 'weread'] : LOCAL_LIBRARY_TYPES),
    [wereadAvailable],
  );
  const activeCollectionMemberCount = activeCollection
    ? collectionMembers.filter((member) => member.collectionId === activeCollection.id).length
    : 0;
  const itemTypeOptions = useMemo(
    () =>
      libraryContentSourceBaseOptions()
        .filter((option) => availableTypes.includes(option.value))
        .map((option) => ({ value: option.value as LibraryTypeScope, label: option.label })),
    [availableTypes],
  );
  const typeOptions = useMemo(() => {
    if (activeCollection)
      return [{ value: 'all' as const, label: t('library.typeFilter.all') }, ...itemTypeOptions];
    return [
      { value: 'all' as const, label: t('library.typeFilter.all') },
      { value: 'collection' as const, label: t('library.sources.collection') },
      ...itemTypeOptions,
    ];
  }, [activeCollection, itemTypeOptions, t]);
  const pickerTypeOptions = useMemo(
    () => [{ value: 'all' as const, label: t('library.typeFilter.all') }, ...itemTypeOptions],
    [itemTypeOptions, t],
  );
  const unfilteredEntities = useMemo(() => {
    if (activeCollection) {
      return buildCollectionMemberEntities({
        articles: sortedArticles,
        collectionId: activeCollection.id,
        collectionMembers,
        enabledTypes: availableTypes,
        pins,
        query: '',
        typeScope,
        wereadBooks,
      });
    }

    return buildLibraryEntities({
      articles: sortedArticles,
      collectionMembers,
      collections,
      enabledTypes: availableTypes,
      pins,
      query: '',
      typeScope,
      wereadBooks,
    });
  }, [
    activeCollection,
    availableTypes,
    collectionMembers,
    collections,
    pins,
    sortedArticles,
    typeScope,
    wereadBooks,
  ]);
  const filteredEntities = useMemo(() => {
    if (activeCollection) {
      return buildCollectionMemberEntities({
        articles: sortedArticles,
        collectionId: activeCollection.id,
        collectionMembers,
        enabledTypes: availableTypes,
        pins,
        query: searchQuery,
        typeScope,
        wereadBooks,
      });
    }

    return buildLibraryEntities({
      articles: sortedArticles,
      collectionMembers,
      collections,
      enabledTypes: availableTypes,
      pins,
      query: searchQuery,
      typeScope,
      wereadBooks,
    });
  }, [
    activeCollection,
    collectionMembers,
    collections,
    availableTypes,
    pins,
    searchQuery,
    sortedArticles,
    typeScope,
    wereadBooks,
  ]);
  const activeItemsLength = filteredEntities.length;
  const pageCount = Math.max(1, Math.ceil(activeItemsLength / pageSize));
  const pageEntities = filteredEntities.slice((page - 1) * pageSize, page * pageSize);
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
  const footerCountLabel = activeCollection
    ? t('library.collection.total', { count: activeItemsLength })
    : typeScope === 'all'
      ? t('library.total.all', { count: activeItemsLength })
      : t(`library.total.${typeScope}`, { count: activeItemsLength });
  const libraryHasItems = sortedArticles.length > 0 || wereadBooks.length > 0;
  const emptyReason = activeCollection
    ? emptyCollectionReason({
        filteredLength: activeItemsLength,
        libraryHasItems,
        searchQuery,
        t,
      })
    : emptyLibraryReason({
        filteredLength: activeItemsLength,
        itemsLength: unfilteredEntities.length,
        searchQuery,
        t,
        typeScope,
        wereadConfigured: wereadSettings.configured,
      });

  useEffect(() => {
    if (typeOptions.some((option) => option.value === typeScope)) return;
    setTypeScope('all');
  }, [typeOptions, typeScope]);

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
  }, [activeCollectionId, pageSize, searchQuery, typeScope]);

  useEffect(() => {
    setPageSize(normalizeLibraryPageSize(settings.libraryPageSize));
  }, [settings.libraryPageSize]);

  useEffect(() => {
    if (!activeCollectionId) return;
    if (collections.some((collection) => collection.id === activeCollectionId)) return;
    setActiveCollectionId(null);
  }, [activeCollectionId, collections]);

  const deleteArticle = async (articleId: string) => {
    await onDeleteArticle(articleId);
  };
  const importArticleUrl = async (url: string, requestId?: string) =>
    onImportArticleUrl(url, requestId);
  const importEbookFile = async (file: File, onProgress?: EbookImportProgressCallback) =>
    onImportEbookFile(file, onProgress);
  const importPdfFile = async (file: File, onProgress?: PdfImportProgressCallback) =>
    onImportPdfFile(file, onProgress);
  const importDialogs = useLibraryImportDialogs({
    settings,
    onImportArticleUrl: importArticleUrl,
    onImportEbookFile: importEbookFile,
    onImportPdfFile: importPdfFile,
    onCancelArticleImport,
    onOpenArticle,
  });
  const createCollection = async (name: string) => {
    const collection = await onCreateCollection(name);
    setActiveCollectionId(collection.id);
  };
  const renameCollection = async (collectionId: string, name: string) => {
    await onRenameCollection(collectionId, name);
  };
  const deleteCollection = async (collectionId: string) => {
    await onDeleteCollection(collectionId);
    if (activeCollectionId === collectionId) setActiveCollectionId(null);
  };
  const addCollectionMembers = async (collectionId: string, members: ContentRef[]) => {
    if (members.length === 0) return;
    await onAddCollectionMembers(collectionId, members);
  };
  const removeCollectionMember = async (collectionId: string, member: ContentRef) => {
    await onRemoveCollectionMember(collectionId, member);
  };
  const startLibraryDrag = (ref: ContentRef, event: React.DragEvent<HTMLElement>) => {
    setDraggedRef(ref);
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-yomitomo-ref', JSON.stringify(ref));
  };
  const endLibraryDrag = () => setDraggedRef(null);

  return (
    <section className="library-home is-mixed" aria-label={t('library.title')}>
      <header className="library-home-header">
        <div className="library-home-header-main">
          {activeCollection ? (
            <button
              className="library-collection-inline-back"
              type="button"
              aria-label={t('library.collection.back')}
              onClick={() => setActiveCollectionId(null)}
            >
              <ArrowLeft size={16} />
              <span>{t('library.title')}</span>
            </button>
          ) : null}
          <div className="library-search library-search-combo">
            <Search size={16} />
            <Input
              type="search"
              value={searchQuery}
              placeholder={
                activeCollection
                  ? t('library.collection.searchPlaceholder')
                  : t('library.searchPlaceholder')
              }
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
              weReadSyncDisabled={!wereadSettings.configured || wereadSyncing}
              weReadSyncVisible={wereadAvailable}
              weReadSyncing={wereadSyncing}
              onAddWebArticle={importDialogs.openArticleImport}
              onAddEbook={importDialogs.openEbookImport}
              onAddPdf={importDialogs.openPdfImport}
              onCreateCollection={
                activeCollection ? undefined : () => setCollectionNameDialog({ type: 'create' })
              }
              onOpenCollectionPicker={
                activeCollection ? () => setPickerCollectionId(activeCollection.id) : undefined
              }
              onSyncWeRead={onSyncWeRead}
            />
            {wereadOpenMessage ? <p className="library-inline-error">{wereadOpenMessage}</p> : null}
          </div>
        </div>
      </header>
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
                activeCollectionId={activeCollection?.id || null}
                draggedRef={draggedRef}
                entities={pageEntities}
                onDeleteArticle={(article) => void deleteArticle(article.id)}
                onOpenCollection={(collection) => setActiveCollectionId(collection.id)}
                onOpenArticle={onOpenArticle}
                onOpenWeReadBook={onOpenWeReadBook}
                onOpenWeReadExternal={onOpenWeReadExternal}
                onRenameCollection={(collection) =>
                  setCollectionNameDialog({ type: 'rename', collection })
                }
                onDeleteCollection={(collection) => void deleteCollection(collection.id)}
                onOpenCollectionPicker={(collection) => setPickerCollectionId(collection.id)}
                onAddCollectionMembers={(collectionId, members) =>
                  void addCollectionMembers(collectionId, members)
                }
                onRemoveCollectionMember={
                  activeCollection
                    ? (entity) => void removeCollectionMember(activeCollection.id, entity.ref)
                    : undefined
                }
                onSetPinned={(entity, pinned) =>
                  void onSetLibraryPin({ target: libraryEntityPinTarget(entity), pinned })
                }
                onDragStart={startLibraryDrag}
                onDragEnd={endLibraryDrag}
              />
            ) : emptyReason.variant === 'first-use' ? (
              <LibraryFirstUseEmpty
                weReadConfigured={wereadSettings.configured}
                weReadSyncing={wereadSyncing}
                onAddWebArticle={importDialogs.openArticleImport}
                onAddEbook={importDialogs.openEbookImport}
                onAddPdf={importDialogs.openPdfImport}
                onSyncWeRead={onSyncWeRead}
              />
            ) : emptyReason.variant === 'collection' ? (
              <LibraryCollectionEmpty
                libraryHasItems={emptyReason.libraryHasItems}
                weReadConfigured={wereadSettings.configured}
                weReadSyncing={wereadSyncing}
                onAddExisting={
                  activeCollection ? () => setPickerCollectionId(activeCollection.id) : undefined
                }
                onBackToAll={() => setActiveCollectionId(null)}
                onAddWebArticle={importDialogs.openArticleImport}
                onAddEbook={importDialogs.openEbookImport}
                onAddPdf={importDialogs.openPdfImport}
                onSyncWeRead={onSyncWeRead}
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
          {activeCollection ? (
            <span className="library-collection-footer-label">
              <strong>{activeCollection.name}</strong>
              <span className="library-count-stat">
                <LibraryBig size={13} />
                <span className="library-count-value">{activeCollectionMemberCount}</span>
              </span>
            </span>
          ) : (
            <span>{footerCountLabel}</span>
          )}
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
      {collectionNameDialog ? (
        <CollectionNameDialog
          dialog={collectionNameDialog}
          onClose={() => setCollectionNameDialog(null)}
          onCreate={createCollection}
          onRename={renameCollection}
        />
      ) : null}
      {pickerCollection ? (
        <CollectionPickerDialog
          articles={sortedArticles}
          availableTypes={availableTypes}
          collection={pickerCollection}
          collectionMembers={collectionMembers}
          pins={pins}
          typeOptions={pickerTypeOptions}
          wereadBooks={wereadBooks}
          onAddMembers={(members) => addCollectionMembers(pickerCollection.id, members)}
          onClose={() => setPickerCollectionId(null)}
        />
      ) : null}
      {importDialogs.dialogs}
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
  activeCollectionId,
  draggedRef,
  entities,
  onDeleteArticle,
  onOpenCollection,
  onOpenArticle,
  onOpenWeReadBook,
  onOpenWeReadExternal,
  onRenameCollection,
  onDeleteCollection,
  onOpenCollectionPicker,
  onAddCollectionMembers,
  onRemoveCollectionMember,
  onSetPinned,
  onDragStart,
  onDragEnd,
}: {
  activeCollectionId: string | null;
  draggedRef: ContentRef | null;
  entities: LibraryEntity[];
  onDeleteArticle: (article: ArticleSummaryRecord) => void;
  onOpenCollection: (collection: Collection) => void;
  onOpenArticle: (article: ArticleSummaryRecord) => void;
  onOpenWeReadBook: (book: WeReadBook) => void;
  onOpenWeReadExternal: (book: WeReadBook) => void;
  onRenameCollection: (collection: Collection) => void;
  onDeleteCollection: (collection: Collection) => void;
  onOpenCollectionPicker: (collection: Collection) => void;
  onAddCollectionMembers: (collectionId: string, members: ContentRef[]) => void;
  onRemoveCollectionMember?: (entity: LibraryItemEntity) => void;
  onSetPinned: (entity: LibraryEntity, pinned: boolean) => void;
  onDragStart: (ref: ContentRef, event: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <div className="library-entity-scroll">
      <div className="library-entity-grid">
        {entities.map((entity) => (
          <LibraryEntityCard
            activeCollectionId={activeCollectionId}
            draggedRef={draggedRef}
            entity={entity}
            key={libraryEntityKey(entity)}
            onDeleteArticle={onDeleteArticle}
            onOpenCollection={onOpenCollection}
            onOpenArticle={onOpenArticle}
            onOpenWeReadBook={onOpenWeReadBook}
            onOpenWeReadExternal={onOpenWeReadExternal}
            onRenameCollection={onRenameCollection}
            onDeleteCollection={onDeleteCollection}
            onOpenCollectionPicker={onOpenCollectionPicker}
            onAddCollectionMembers={onAddCollectionMembers}
            onRemoveCollectionMember={onRemoveCollectionMember}
            onSetPinned={(pinned) => onSetPinned(entity, pinned)}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </div>
  );
}

function LibraryEntityCard({
  activeCollectionId,
  draggedRef,
  entity,
  onDeleteArticle,
  onOpenCollection,
  onOpenArticle,
  onOpenWeReadBook,
  onOpenWeReadExternal,
  onRenameCollection,
  onDeleteCollection,
  onOpenCollectionPicker,
  onAddCollectionMembers,
  onRemoveCollectionMember,
  onSetPinned,
  onDragStart,
  onDragEnd,
}: {
  activeCollectionId: string | null;
  draggedRef: ContentRef | null;
  entity: LibraryEntity;
  onDeleteArticle: (article: ArticleSummaryRecord) => void;
  onOpenCollection: (collection: Collection) => void;
  onOpenArticle: (article: ArticleSummaryRecord) => void;
  onOpenWeReadBook: (book: WeReadBook) => void;
  onOpenWeReadExternal: (book: WeReadBook) => void;
  onRenameCollection: (collection: Collection) => void;
  onDeleteCollection: (collection: Collection) => void;
  onOpenCollectionPicker: (collection: Collection) => void;
  onAddCollectionMembers: (collectionId: string, members: ContentRef[]) => void;
  onRemoveCollectionMember?: (entity: LibraryItemEntity) => void;
  onSetPinned: (pinned: boolean) => void;
  onDragStart: (ref: ContentRef, event: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  if (entity.kind === 'col') {
    return (
      <LibraryCollectionCard
        draggedRef={draggedRef}
        entity={entity}
        pinned={entity.pinned}
        onAddMembers={(members) => onAddCollectionMembers(entity.collection.id, members)}
        onDelete={() => onDeleteCollection(entity.collection)}
        onOpen={() => onOpenCollection(entity.collection)}
        onOpenPicker={() => onOpenCollectionPicker(entity.collection)}
        onRename={() => onRenameCollection(entity.collection)}
        onSetPinned={onSetPinned}
        onDragEnd={onDragEnd}
      />
    );
  }

  if (entity.article) {
    return (
      <ArticleLibraryCard
        article={entity.article}
        draggable={!activeCollectionId}
        onDelete={() => onDeleteArticle(entity.article!)}
        onDragEnd={onDragEnd}
        onDragStart={(event) => onDragStart(entity.ref, event)}
        onOpen={() => onOpenArticle(entity.article!)}
        onRemoveFromCollection={
          activeCollectionId ? () => onRemoveCollectionMember?.(entity) : undefined
        }
        onSetPinned={onSetPinned}
        pinned={entity.pinned}
      />
    );
  }

  if (entity.weread) {
    return (
      <WeReadLibraryCard
        book={entity.weread}
        draggable={!activeCollectionId}
        pinned={entity.pinned}
        onDragEnd={onDragEnd}
        onDragStart={(event) => onDragStart(entity.ref, event)}
        onOpen={() => onOpenWeReadBook(entity.weread!)}
        onOpenExternal={() => onOpenWeReadExternal(entity.weread!)}
        onRemoveFromCollection={
          activeCollectionId ? () => onRemoveCollectionMember?.(entity) : undefined
        }
        onSetPinned={onSetPinned}
      />
    );
  }

  return null;
}

function WeReadLibraryCard({
  book,
  draggable,
  onDragEnd,
  onDragStart,
  onOpen,
  onOpenExternal,
  onRemoveFromCollection,
  onSetPinned,
  pinned,
}: {
  book: WeReadBook;
  draggable: boolean;
  onDragEnd: () => void;
  onDragStart: (event: React.DragEvent<HTMLElement>) => void;
  onOpen: () => void;
  onOpenExternal: () => void;
  onRemoveFromCollection?: () => Promise<void> | void;
  onSetPinned: (pinned: boolean) => void;
  pinned: boolean;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const statsLabel = t('library.stats.label', {
    annotations: book.noteCount,
    distillations: 0,
  });
  const libraryDate = weReadBookLibraryDate(book);

  return (
    <article
      className="library-list-item library-article-list-item library-ebook-list-item library-weread-list-item"
      draggable={draggable}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
    >
      <button
        className="library-list-item-open"
        type="button"
        aria-label={t('library.actions.openWeRead', { title: book.title })}
        onClick={onOpen}
      />
      <div className={menuOpen ? 'library-item-actions is-active' : 'library-item-actions'}>
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
              {onRemoveFromCollection ? (
                <DropdownMenuItem asChild>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      void onRemoveFromCollection();
                    }}
                  >
                    <Layers2 size={14} />
                    <span>{t('library.collection.removeMember')}</span>
                  </button>
                </DropdownMenuItem>
              ) : null}
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
            <time dateTime={libraryDate}>{formatLibraryShortDate(libraryDate)}</time>
            <span className="library-source-badge">{t('library.sources.wereadShort')}</span>
            <PinnedIndicator pinned={pinned} />
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
  draggedRef,
  entity,
  onAddMembers,
  onDelete,
  onOpen,
  onOpenPicker,
  onRename,
  onSetPinned,
  onDragEnd,
  pinned,
}: {
  draggedRef: ContentRef | null;
  entity: LibraryCollectionEntity;
  onAddMembers: (members: ContentRef[]) => void;
  onDelete: () => void;
  onOpen: () => void;
  onOpenPicker: () => void;
  onRename: () => void;
  onSetPinned: (pinned: boolean) => void;
  onDragEnd: () => void;
  pinned: boolean;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const title = entity.collection.name;
  const statsLabel = t('library.collection.memberCount', { count: entity.memberCount });
  const canDrop =
    draggedRef && !entity.memberRefs.some((member) => contentRefsEqual(member, draggedRef));
  const className = canDrop
    ? 'library-list-item library-collection-list-item is-drop-target'
    : 'library-list-item library-collection-list-item';

  return (
    <article
      className={className}
      aria-label={title}
      onDragOver={(event) => {
        if (!canDrop) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        if (!canDrop || !draggedRef) return;
        event.preventDefault();
        onAddMembers([draggedRef]);
        onDragEnd();
      }}
    >
      <button
        className="library-list-item-open"
        type="button"
        aria-label={t('library.collection.open', { name: title })}
        onClick={onOpen}
      />
      <div className="library-item-actions">
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
              <DropdownMenuItem asChild>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onRename();
                  }}
                >
                  <PencilLine size={14} />
                  <span>{t('library.collection.rename')}</span>
                </button>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenPicker();
                  }}
                >
                  <FolderOpen size={14} />
                  <span>{t('library.collection.addMembers')}</span>
                </button>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <button
                  className="library-item-delete"
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setDeleteConfirmOpen(true);
                  }}
                >
                  <Trash2 size={14} />
                  <span>{t('library.collection.delete')}</span>
                </button>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </div>
        </DropdownMenu>
      </div>
      <div className="library-collection-card-body">
        <div
          className="library-collection-cover-stack"
          aria-hidden="true"
          style={{ '--cover-count': entity.coverMembers.length } as React.CSSProperties}
        >
          {entity.coverMembers.length > 0 ? (
            entity.coverMembers.map((item, index) => (
              <div
                className="library-collection-cover-item"
                key={`${item.ref.kind}:${item.ref.id}`}
                style={{ '--cover-index': index } as React.CSSProperties}
              >
                {item.article ? <ArticleBook article={item.article} /> : null}
                {item.weread ? <WeReadCover book={item.weread} variant="cover" /> : null}
              </div>
            ))
          ) : (
            <div className="library-collection-empty-cover">
              <BookOpen size={24} />
              <span>{t('library.collection.emptyCover')}</span>
            </div>
          )}
          <div className="library-collection-cover-copy">
            <h3 title={title}>
              <span>{title}</span>
              <PinnedIndicator pinned={pinned} />
            </h3>
            <div
              className="library-count-stats library-collection-member-stats"
              aria-label={statsLabel}
              data-tooltip={statsLabel}
            >
              <span className="library-count-stat">
                <LibraryBig size={13} />
                <span className="library-count-value">{entity.memberCount}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
      <SettingsConfirmDialog
        cancelLabel={t('settings.confirm.cancel')}
        confirmLabel={t('library.collection.deleteConfirm')}
        description={t('library.collection.deleteConfirmDescription')}
        open={deleteConfirmOpen}
        title={t('library.collection.deleteConfirmTitle', { name: title })}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          onDelete();
        }}
      />
    </article>
  );
}

type CollectionNameDialogState = { type: 'create' } | { type: 'rename'; collection: Collection };

function CollectionNameDialog({
  dialog,
  onClose,
  onCreate,
  onRename,
}: {
  dialog: CollectionNameDialogState;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
  onRename: (collectionId: string, name: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(dialog.type === 'rename' ? dialog.collection.name : '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const isRename = dialog.type === 'rename';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) {
      setError(t('library.collection.nameRequired'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (isRename) await onRename(dialog.collection.id, nextName);
      else await onCreate(nextName);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('library.collection.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="library-collection-dialog-overlay">
          <DialogContent className="library-collection-dialog">
            <form onSubmit={submit}>
              <header>
                <DialogTitle>
                  {isRename ? t('library.collection.renameTitle') : t('library.collection.create')}
                </DialogTitle>
                <DialogDescription>
                  {isRename
                    ? t('library.collection.renameDescription')
                    : t('library.collection.createDescription')}
                </DialogDescription>
              </header>
              <label className="library-collection-name-field">
                <span>{t('library.collection.nameLabel')}</span>
                <Input
                  autoFocus
                  value={name}
                  placeholder={t('library.collection.namePlaceholder')}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              {error ? <p className="library-collection-dialog-error">{error}</p> : null}
              <footer>
                <Button type="button" variant="secondary" onClick={onClose}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={submitting}>
                  {isRename ? t('library.collection.saveName') : t('library.collection.create')}
                </Button>
              </footer>
            </form>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}

function CollectionPickerDialog({
  articles,
  availableTypes,
  collection,
  collectionMembers,
  pins,
  typeOptions,
  wereadBooks,
  onAddMembers,
  onClose,
}: {
  articles: ArticleSummaryRecord[];
  availableTypes: LibraryItemType[];
  collection: Collection;
  collectionMembers: CollectionMember[];
  pins: LibraryPin[];
  typeOptions: { value: LibraryTypeScope; label: string }[];
  wereadBooks: WeReadBook[];
  onAddMembers: (members: ContentRef[]) => Promise<void> | void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [typeScope, setTypeScope] = useState<LibraryTypeScope>('all');
  const [selectedRefs, setSelectedRefs] = useState<Map<string, ContentRef>>(() => new Map());
  const [draggedPickerKey, setDraggedPickerKey] = useState<string | null>(null);
  const [selectionDragOver, setSelectionDragOver] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const dragStateRef = useRef<{
    ref: ContentRef;
    key: string;
    ghost: HTMLElement;
    pointerId: number;
  } | null>(null);
  const pickerSelectionRef = useRef<HTMLDivElement | null>(null);
  const isOverPickerSelection = useCallback((x: number, y: number) => {
    if (typeof document.elementFromPoint !== 'function') return false;
    return Boolean(
      document.elementFromPoint(x, y)?.closest('.library-collection-picker-selection'),
    );
  }, []);
  const cleanupPickerDrag = useCallback(() => {
    const state = dragStateRef.current;
    if (state?.ghost.parentNode) state.ghost.parentNode.removeChild(state.ghost);
    dragStateRef.current = null;
    setDraggedPickerKey(null);
    setSelectionDragOver(false);
    document.body.classList.remove('library-picker-dragging');
  }, []);
  const currentMemberKeys = useMemo(
    () =>
      new Set(
        collectionMembers
          .filter((member) => member.collectionId === collection.id)
          .map((member) => contentRefKey(member.member)),
      ),
    [collection.id, collectionMembers],
  );
  const allAvailablePickerItems = useMemo(
    () =>
      buildLibraryEntities({
        articles,
        collectionMembers: [],
        collections: [],
        enabledTypes: availableTypes,
        pins,
        query: '',
        typeScope: 'all',
        wereadBooks,
      })
        .filter((entity): entity is LibraryItemEntity => entity.kind === 'item')
        .filter((entity) => !currentMemberKeys.has(contentRefKey(entity.ref))),
    [articles, availableTypes, currentMemberKeys, pins, wereadBooks],
  );
  const visiblePickerItems = useMemo(
    () =>
      buildLibraryEntities({
        articles,
        collectionMembers: [],
        collections: [],
        enabledTypes: availableTypes,
        pins,
        query,
        typeScope,
        wereadBooks,
      })
        .filter((entity): entity is LibraryItemEntity => entity.kind === 'item')
        .filter((entity) => !currentMemberKeys.has(contentRefKey(entity.ref))),
    [articles, availableTypes, currentMemberKeys, pins, query, typeScope, wereadBooks],
  );
  const selectedItems = useMemo(() => Array.from(selectedRefs.values()), [selectedRefs]);
  const selectedKeys = useMemo(() => new Set(selectedRefs.keys()), [selectedRefs]);
  const pickerItems = useMemo(
    () => visiblePickerItems.filter((item) => !selectedKeys.has(contentRefKey(item.ref))),
    [visiblePickerItems, selectedKeys],
  );
  const itemByRef = useMemo(
    () => new Map(allAvailablePickerItems.map((item) => [contentRefKey(item.ref), item])),
    [allAvailablePickerItems],
  );
  const selectedEntities = useMemo(
    () =>
      selectedItems
        .map((ref) => itemByRef.get(contentRefKey(ref)))
        .filter((item): item is LibraryItemEntity => Boolean(item)),
    [itemByRef, selectedItems],
  );
  const activeTypeLabel =
    typeOptions.find((option) => option.value === typeScope)?.label || t('library.typeFilter.all');

  function toggleItem(ref: ContentRef) {
    setSelectedRefs((current) => {
      const next = new Map(current);
      const key = contentRefKey(ref);
      if (next.has(key)) next.delete(key);
      else next.set(key, ref);
      return next;
    });
  }

  const startPickerDrag = useCallback(
    (item: LibraryItemEntity, event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      const card = event.currentTarget.parentElement;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const ghost = card.cloneNode(true) as HTMLElement;
      ghost.className = 'library-collection-picker-ghost';
      ghost.style.width = `${rect.width}px`;
      ghost.style.left = `${event.clientX}px`;
      ghost.style.top = `${event.clientY}px`;
      document.body.appendChild(ghost);
      document.body.classList.add('library-picker-dragging');
      dragStateRef.current = {
        ref: item.ref,
        key: contentRefKey(item.ref),
        ghost,
        pointerId: event.pointerId,
      };
      setDraggedPickerKey(contentRefKey(item.ref));
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // pointer capture may fail in some test environments; safe to ignore
      }
    },
    [],
  );

  const movePickerDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    state.ghost.style.left = `${event.clientX}px`;
    state.ghost.style.top = `${event.clientY}px`;
    const overSelection = isOverPickerSelection(event.clientX, event.clientY);
    setSelectionDragOver((prev) => (prev === overSelection ? prev : overSelection));
  }, []);

  const endPickerDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      const overSelection = isOverPickerSelection(event.clientX, event.clientY);
      if (overSelection) toggleItem(state.ref);
      cleanupPickerDrag();
    },
    [cleanupPickerDrag],
  );

  useEffect(() => {
    function handleGlobalPointerUp() {
      if (dragStateRef.current) cleanupPickerDrag();
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && dragStateRef.current) cleanupPickerDrag();
    }
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [cleanupPickerDrag]);

  async function confirm() {
    if (selectedItems.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      await onAddMembers(selectedItems);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('library.collection.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="library-collection-dialog-overlay">
          <DialogContent className="library-collection-picker-dialog">
            <header>
              <div>
                <DialogTitle>{t('library.collection.pickerTitle')}</DialogTitle>
                <DialogDescription>
                  {t('library.collection.pickerDescription', { name: collection.name })}
                </DialogDescription>
              </div>
            </header>
            <div className="library-collection-picker-toolbar">
              <div className="library-search library-search-combo">
                <Search size={16} />
                <Input
                  type="search"
                  value={query}
                  placeholder={t('library.collection.pickerSearchPlaceholder')}
                  aria-label={t('library.collection.pickerSearchLabel')}
                  onChange={(event) => setQuery(event.target.value)}
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
            </div>
            <div className="library-collection-picker-body">
              <div className="library-collection-picker-list">
                {pickerItems.length > 0 ? (
                  pickerItems.map((item) => {
                    const key = contentRefKey(item.ref);
                    return (
                      <div
                        className={`library-collection-picker-item${
                          draggedPickerKey === key ? ' is-dragging' : ''
                        }`}
                        key={key}
                      >
                        <span
                          className="library-collection-picker-drag-handle"
                          aria-hidden="true"
                          onPointerDown={(event) => startPickerDrag(item, event)}
                          onPointerMove={movePickerDrag}
                          onPointerUp={endPickerDrag}
                        >
                          <GripVertical size={15} />
                        </span>
                        <CollectionPickerCover
                          item={item}
                          className="library-collection-picker-cover"
                        />
                        <span className="library-collection-picker-copy">
                          <strong>{libraryItemTitle(item)}</strong>
                          <span className="library-collection-picker-meta">
                            <span className="library-source-badge">
                              {libraryTypeLabel(item.type, t)}
                            </span>
                            <time dateTime={item.sortTime}>
                              {formatLibraryShortDate(item.sortTime)}
                            </time>
                          </span>
                        </span>
                        <button
                          type="button"
                          className="library-collection-picker-add"
                          aria-label={`${t('library.collection.addMembers')}：${libraryItemTitle(item)}`}
                          onClick={() => toggleItem(item.ref)}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p>{t('library.collection.pickerNoItems')}</p>
                )}
              </div>
              <div
                ref={pickerSelectionRef}
                className={
                  selectionDragOver
                    ? 'library-collection-picker-selection is-drag-over'
                    : 'library-collection-picker-selection'
                }
              >
                <h3>{t('library.collection.pendingMembers', { count: selectedItems.length })}</h3>
                {selectedEntities.length > 0 ? (
                  <div className="library-collection-picker-selected-grid">
                    {selectedEntities.map((item) => {
                      const title = libraryItemTitle(item);
                      return (
                        <ReaderTooltip content={title} key={contentRefKey(item.ref)}>
                          <button
                            className="library-collection-picker-selected-item"
                            type="button"
                            aria-label={`${t('library.collection.removeMember')}：${title}`}
                            onClick={() => toggleItem(item.ref)}
                          >
                            <CollectionPickerCover
                              item={item}
                              className="library-collection-picker-selected-cover"
                            />
                            <span className="library-collection-picker-selected-remove">
                              <X size={12} />
                            </span>
                          </button>
                        </ReaderTooltip>
                      );
                    })}
                  </div>
                ) : (
                  <div className="library-collection-picker-empty-drop">
                    <LibraryBig size={26} />
                    <strong>{t('library.collection.dropHintTitle')}</strong>
                    <span>{t('library.collection.dropHint')}</span>
                  </div>
                )}
              </div>
            </div>
            {error ? <p className="library-collection-dialog-error">{error}</p> : null}
            <footer>
              <Button type="button" variant="secondary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                disabled={submitting || selectedItems.length === 0}
                onClick={confirm}
              >
                {t('library.collection.addSelected', { count: selectedItems.length })}
              </Button>
            </footer>
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
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

function CollectionPickerCover({
  className,
  item,
}: {
  className: string;
  item: LibraryItemEntity;
}) {
  return (
    <span className={className} aria-hidden="true">
      {item.article ? <ArticleBook article={item.article} /> : null}
      {item.weread ? <WeReadCover book={item.weread} variant="cover" /> : null}
    </span>
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
      <div className="library-empty-copy">{children}</div>
    </section>
  );
}

type LibraryImportEntryHandlers = {
  weReadConfigured: boolean;
  weReadSyncing: boolean;
  onAddWebArticle: () => void;
  onAddEbook: () => void;
  onAddPdf: () => void;
  onSyncWeRead: () => void;
};

function LibraryImportEntryGrid({
  weReadConfigured,
  weReadSyncing,
  onAddWebArticle,
  onAddEbook,
  onAddPdf,
  onSyncWeRead,
}: LibraryImportEntryHandlers) {
  const { t } = useTranslation();
  return (
    <div className="library-empty-entries">
      <button className="library-empty-entry" type="button" onClick={onAddWebArticle}>
        <span className="library-empty-entry-icon">
          <Globe2 size={18} />
        </span>
        <span className="library-empty-entry-copy">
          <strong>{t('library.empty.entry.webTitle')}</strong>
          <em>{t('library.empty.entry.webHint')}</em>
        </span>
      </button>
      <button className="library-empty-entry" type="button" onClick={onAddEbook}>
        <span className="library-empty-entry-icon">
          <BookText size={18} />
        </span>
        <span className="library-empty-entry-copy">
          <strong>{t('library.empty.entry.ebookTitle')}</strong>
          <em>{t('library.empty.entry.ebookHint')}</em>
        </span>
      </button>
      <button className="library-empty-entry" type="button" onClick={onAddPdf}>
        <span className="library-empty-entry-icon">
          <FileText size={18} />
        </span>
        <span className="library-empty-entry-copy">
          <strong>{t('library.empty.entry.pdfTitle')}</strong>
          <em>{t('library.empty.entry.pdfHint')}</em>
        </span>
      </button>
      <button
        className="library-empty-entry"
        type="button"
        disabled={!weReadConfigured || weReadSyncing}
        onClick={weReadConfigured ? onSyncWeRead : undefined}
      >
        <span className="library-empty-entry-icon">
          <Smartphone size={18} />
        </span>
        <span className="library-empty-entry-copy">
          <strong>{t('library.empty.entry.wereadTitle')}</strong>
          <em>
            {weReadConfigured
              ? t('library.empty.entry.wereadHintReady')
              : t('library.empty.entry.wereadHint')}
          </em>
        </span>
      </button>
    </div>
  );
}

function LibraryFirstUseEmpty(handlers: LibraryImportEntryHandlers) {
  const { t } = useTranslation();
  return (
    <section className="library-empty is-first-use">
      <div className="library-empty-marks" aria-hidden="true">
        {[-6, 3, -3, 6].map((angle, index) => (
          <i key={index} style={{ transform: `rotate(${angle}deg)` }} />
        ))}
      </div>
      <h3>{t('library.empty.libraryTitle')}</h3>
      <p>{t('library.empty.libraryDescription')}</p>
      <LibraryImportEntryGrid {...handlers} />
    </section>
  );
}

function LibraryCollectionEmpty({
  libraryHasItems,
  onAddExisting,
  onBackToAll,
  ...entryHandlers
}: LibraryImportEntryHandlers & {
  libraryHasItems: boolean;
  onAddExisting?: () => void;
  onBackToAll: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="library-empty is-collection">
      <div className="library-empty-pile" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <h3>{t('library.collection.emptyTitle')}</h3>
      {libraryHasItems ? (
        <>
          <p>{t('library.collection.emptyDescription')}</p>
          <div className="library-empty-actions">
            {onAddExisting ? (
              <button
                className="library-empty-action is-primary"
                type="button"
                onClick={onAddExisting}
              >
                <FolderOpen size={15} />
                {t('library.collection.addExisting')}
              </button>
            ) : null}
            <button className="library-empty-action" type="button" onClick={onBackToAll}>
              <ArrowLeft size={15} />
              {t('library.collection.emptyBackToDrag')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p>{t('library.collection.emptyNoLibraryDescription')}</p>
          <LibraryImportEntryGrid {...entryHandlers} />
        </>
      )}
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

function contentRefKey(ref: ContentRef) {
  return `${ref.kind}:${ref.id}`;
}

function contentRefsEqual(left: ContentRef, right: ContentRef) {
  return left.kind === right.kind && left.id === right.id;
}

function libraryItemTitle(item: LibraryItemEntity) {
  if (item.article) return articleDisplayTitle(item.article);
  return item.weread?.title || '';
}

function libraryTypeLabel(type: LibraryItemType, t: ReturnType<typeof useTranslation>['t']) {
  if (type === 'web') return t('library.sources.webShort');
  if (type === 'ebook') return t('library.sources.ebookShort');
  if (type === 'pdf') return t('library.sources.pdfShort');
  return t('library.sources.wereadShort');
}

function coverProgressStyle(value: number) {
  const progress = Math.min(1, Math.max(0, value));
  return { '--ebook-progress': `${Math.round(progress * 100)}%` } as React.CSSProperties;
}

type LibraryEmptyReason =
  | { variant: 'first-use' }
  | { variant: 'collection'; libraryHasItems: boolean }
  | { variant: 'message'; icon: React.ReactNode; title: string; description: string };

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
}): LibraryEmptyReason {
  if (typeScope === 'weread' && !wereadConfigured) {
    return {
      variant: 'message',
      description: t('library.weReadSetupDescription'),
      icon: <Smartphone size={32} />,
      title: t('library.weReadSetupTitle'),
    };
  }

  if (itemsLength === 0) {
    return { variant: 'first-use' };
  }

  if (filteredLength === 0 || searchQuery.trim()) {
    return {
      variant: 'message',
      description: t('library.empty.noMatchDescription'),
      icon: <Search size={32} />,
      title: t('library.empty.noMatchTitle'),
    };
  }

  if (typeScope === 'web') {
    return {
      variant: 'message',
      description: t('library.empty.webDescription'),
      icon: <FileText size={32} />,
      title: t('library.empty.webTitle'),
    };
  }

  if (typeScope === 'pdf') {
    return {
      variant: 'message',
      description: t('library.empty.pdfDescription'),
      icon: <FileText size={32} />,
      title: t('library.empty.pdfTitle'),
    };
  }

  if (typeScope === 'weread') {
    return {
      variant: 'message',
      description: t('library.empty.wereadDescription'),
      icon: <Smartphone size={32} />,
      title: t('library.empty.wereadTitle'),
    };
  }

  if (typeScope === 'ebook') {
    return {
      variant: 'message',
      description: t('library.empty.ebookDescription'),
      icon: <BookText size={32} />,
      title: t('library.empty.ebookTitle'),
    };
  }

  return {
    variant: 'message',
    description: t('library.empty.noMatchDescription'),
    icon: <Search size={32} />,
    title: t('library.empty.noMatchTitle'),
  };
}

function emptyCollectionReason({
  filteredLength,
  libraryHasItems,
  searchQuery,
  t,
}: {
  filteredLength: number;
  libraryHasItems: boolean;
  searchQuery: string;
  t: ReturnType<typeof useTranslation>['t'];
}): LibraryEmptyReason {
  if (filteredLength === 0 && searchQuery.trim()) {
    return {
      variant: 'message',
      description: t('library.empty.noMatchDescription'),
      icon: <Search size={32} />,
      title: t('library.empty.noMatchTitle'),
    };
  }

  return { variant: 'collection', libraryHasItems };
}
