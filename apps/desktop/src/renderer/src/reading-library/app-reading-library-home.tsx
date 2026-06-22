import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookText,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  Globe2,
  LibraryBig,
  Search,
  Smartphone,
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
import type {
  EbookImportProgressCallback,
  PdfImportProgressCallback,
} from '../shell/app-reading-types';
import type { SetLibraryPinInput } from '../../../ipc-contract';
import { libraryContentSourceBaseOptions } from './app-library-content-sources';
import { CollectionPickerDialog } from './app-reading-library-collection-picker';
import { LibraryEntityGrid } from './app-reading-library-entity-grid';
import {
  LibraryImportControls,
  useLibraryImportDialogs,
  type ArticleImportResult,
} from './app-reading-library-imports';
import {
  buildCollectionMemberEntities,
  buildLibraryEntities,
  libraryEntityPinTarget,
} from './app-reading-library-entities';
import type { LibraryItemType, LibraryTypeScope } from './library-entity-types';

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
  onOpenDataSources,
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
  onOpenDataSources?: () => void;
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
                onConnectWeRead={onOpenDataSources}
              />
            ) : emptyReason.variant === 'collection' ? (
              <LibraryCollectionEmpty
                libraryHasItems={emptyReason.libraryHasItems}
                weReadConfigured={wereadSettings.configured}
                weReadSyncing={wereadSyncing}
                onAddExisting={
                  activeCollection ? () => setPickerCollectionId(activeCollection.id) : undefined
                }
                onAddWebArticle={importDialogs.openArticleImport}
                onAddEbook={importDialogs.openEbookImport}
                onAddPdf={importDialogs.openPdfImport}
                onSyncWeRead={onSyncWeRead}
                onConnectWeRead={onOpenDataSources}
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
  onConnectWeRead?: () => void;
};

function LibraryImportEntryGrid({
  weReadConfigured,
  weReadSyncing,
  onAddWebArticle,
  onAddEbook,
  onAddPdf,
  onSyncWeRead,
  onConnectWeRead,
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
        disabled={weReadConfigured && weReadSyncing}
        onClick={weReadConfigured ? onSyncWeRead : onConnectWeRead}
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
  ...entryHandlers
}: LibraryImportEntryHandlers & {
  libraryHasItems: boolean;
  onAddExisting?: () => void;
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
          {onAddExisting ? (
            <div className="library-empty-actions">
              <Button type="button" variant="secondary" onClick={onAddExisting}>
                <FolderOpen size={15} />
                {t('library.collection.addExisting')}
              </Button>
            </div>
          ) : null}
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

function normalizeLibraryPageSize(value: unknown) {
  return LIBRARY_PAGE_SIZE_OPTIONS.includes(value as (typeof LIBRARY_PAGE_SIZE_OPTIONS)[number])
    ? (value as (typeof LIBRARY_PAGE_SIZE_OPTIONS)[number])
    : 12;
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
