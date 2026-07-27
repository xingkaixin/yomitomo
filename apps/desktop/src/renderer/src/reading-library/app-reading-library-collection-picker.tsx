import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  DragDropVerticalIcon,
  LibraryIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons';
import React, { useMemo, useState } from 'react';
import {
  ReaderTooltip,
  ReaderTooltipProvider,
} from '@yomitomo/reader-ui/reader-component-primitives';
import type {
  ArticleSummaryRecord,
  Collection,
  CollectionMember,
  ContentRef,
  LibraryPin,
  WeReadBook,
} from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from '../components/ui/select';
import { Button } from '../components/ui/button';
import {
  libraryCatalogItemRef,
  libraryCatalogItemType,
  type LibraryCatalogItem,
  type LibraryCatalogItemType,
  type LibraryCatalogListInput,
} from '../../../ipc-contract';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../components/ui/dialog';
import { ArticleBook } from '../shell/app-article-book';
import { contentRefKey, libraryItemTitle } from './app-reading-library-entities';
import { formatLibraryShortDate } from './app-reading-library-utils';
import { WeReadCover } from './app-reading-library-covers';
import {
  LibraryDndProvider,
  useLibraryDraggable,
  useLibraryDroppable,
} from './app-reading-library-dnd';
import type { LibraryTypeScope } from './library-filter-types';
import { useLibraryCatalog } from './use-library-catalog';

const PICKER_PAGE_SIZE = 30;

type CollectionPickerDialogProps = {
  articles: ArticleSummaryRecord[];
  collection: Collection;
  collectionMembers: CollectionMember[];
  pins: LibraryPin[];
  typeOptions: { value: LibraryTypeScope; label: string }[];
  wereadBooks: WeReadBook[];
  onAddMembers: (members: ContentRef[]) => Promise<void> | void;
  onClose: () => void;
};

export function CollectionPickerDialog(props: CollectionPickerDialogProps) {
  return (
    <LibraryDndProvider>
      <CollectionPickerDialogContent {...props} />
    </LibraryDndProvider>
  );
}

function CollectionPickerDialogContent({
  articles,
  collection,
  collectionMembers,
  pins,
  typeOptions,
  wereadBooks,
  onAddMembers,
  onClose,
}: CollectionPickerDialogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [typeScope, setTypeScope] = useState<LibraryTypeScope>('all');
  const [page, setPage] = useState(1);
  const [selectedRefs, setSelectedRefs] = useState<Map<string, LibraryCatalogItem>>(
    () => new Map(),
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const catalogInput = useMemo<LibraryCatalogListInput>(
    () => ({
      scope: { kind: 'picker', collectionId: collection.id },
      types: typeScope === 'all' ? undefined : [typeScope],
      query,
      page,
      pageSize: PICKER_PAGE_SIZE,
    }),
    [collection.id, page, query, typeScope],
  );
  const catalogState = useLibraryCatalog(catalogInput, {
    articles,
    collectionMembers,
    collections: collection,
    pins,
    wereadBooks,
  });
  const remoteCatalog = catalogState.result;
  const selectedItems = useMemo(() => Array.from(selectedRefs.values()), [selectedRefs]);
  const selectedKeys = useMemo(() => new Set(selectedRefs.keys()), [selectedRefs]);
  const visiblePickerItems =
    remoteCatalog?.entities.filter(
      (entity): entity is LibraryCatalogItem => entity.kind === 'item',
    ) || [];
  const pickerItems = useMemo(
    () =>
      visiblePickerItems.filter(
        (item) => !selectedKeys.has(contentRefKey(libraryCatalogItemRef(item))),
      ),
    [visiblePickerItems, selectedKeys],
  );
  const totalCount = remoteCatalog?.totalCount || 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / PICKER_PAGE_SIZE));
  const activeTypeLabel =
    typeOptions.find((option) => option.value === typeScope)?.label || t('library.typeFilter.all');

  function toggleItem(item: LibraryCatalogItem) {
    setSelectedRefs((current) => {
      const next = new Map(current);
      const key = contentRefKey(libraryCatalogItemRef(item));
      if (next.has(key)) next.delete(key);
      else next.set(key, item);
      return next;
    });
  }
  function toggleItemRef(ref: ContentRef) {
    const key = contentRefKey(ref);
    const item =
      selectedRefs.get(key) ||
      visiblePickerItems.find((entry) => contentRefKey(libraryCatalogItemRef(entry)) === key);
    if (item) toggleItem(item);
  }
  const { isDropTarget: selectionDragOver, ref: selectionDropRef } = useLibraryDroppable({
    id: `picker-selection:${collection.id}`,
    label: t('library.collection.pendingMembers', { count: selectedItems.length }),
    onDrop: toggleItemRef,
  });

  async function confirm() {
    if (selectedItems.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      await onAddMembers(selectedItems.map(libraryCatalogItemRef));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('library.collection.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return (
    <ReaderTooltipProvider>
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
                  <HugeiconsIcon icon={Search01Icon} size={16} />
                  <Input
                    type="search"
                    value={query}
                    placeholder={t('library.collection.pickerSearchPlaceholder')}
                    aria-label={t('library.collection.pickerSearchLabel')}
                    onChange={(event) => {
                      setPage(1);
                      setQuery(event.target.value);
                    }}
                  />
                  <Select
                    value={typeScope}
                    onValueChange={(value) => {
                      setPage(1);
                      setTypeScope(value as LibraryTypeScope);
                    }}
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
                    pickerItems.map((item) => (
                      <CollectionPickerItem
                        item={item}
                        key={contentRefKey(libraryCatalogItemRef(item))}
                        onSelect={() => toggleItem(item)}
                      />
                    ))
                  ) : (
                    <p>
                      {catalogState.status === 'loading'
                        ? t('library.catalog.loading')
                        : catalogState.status === 'error'
                          ? t('library.catalog.loadFailed')
                          : t('library.collection.pickerNoItems')}
                    </p>
                  )}
                  {pageCount > 1 ? (
                    <div className="library-pagination" aria-label={t('library.pagination.label')}>
                      <button
                        type="button"
                        aria-label={t('library.pagination.previous')}
                        disabled={page === 1}
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                      >
                        <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
                      </button>
                      <span>{`${page} / ${pageCount}`}</span>
                      <button
                        type="button"
                        aria-label={t('library.pagination.next')}
                        disabled={page === pageCount}
                        onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                      >
                        <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
                      </button>
                    </div>
                  ) : null}
                </div>
                <div
                  ref={selectionDropRef}
                  className={
                    selectionDragOver
                      ? 'library-collection-picker-selection is-drag-over'
                      : 'library-collection-picker-selection'
                  }
                >
                  <h3>{t('library.collection.pendingMembers', { count: selectedItems.length })}</h3>
                  {selectedItems.length > 0 ? (
                    <div className="library-collection-picker-selected-grid">
                      {selectedItems.map((item) => {
                        const title = libraryItemTitle(item);
                        return (
                          <ReaderTooltip
                            content={title}
                            key={contentRefKey(libraryCatalogItemRef(item))}
                          >
                            <button
                              className="library-collection-picker-selected-item"
                              type="button"
                              aria-label={`${t('library.collection.removeMember')}：${title}`}
                              onClick={() => toggleItem(item)}
                            >
                              <CollectionPickerCover
                                item={item}
                                className="library-collection-picker-selected-cover"
                              />
                              <span className="library-collection-picker-selected-remove">
                                <HugeiconsIcon icon={Cancel01Icon} size={12} />
                              </span>
                            </button>
                          </ReaderTooltip>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="library-collection-picker-empty-drop">
                      <HugeiconsIcon icon={LibraryIcon} size={26} />
                      <strong>{t('library.collection.dropHintTitle')}</strong>
                      <span>{t('library.collection.dropHint')}</span>
                    </div>
                  )}
                </div>
              </div>
              {error || catalogState.status === 'error' ? (
                <p className="library-collection-dialog-error">
                  {error || t('library.catalog.loadFailedStale')}
                </p>
              ) : null}
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
    </ReaderTooltipProvider>
  );
}

function CollectionPickerItem({
  item,
  onSelect,
}: {
  item: LibraryCatalogItem;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const title = libraryItemTitle(item);
  const { handleRef, isDragging, ref } = useLibraryDraggable({
    ref: libraryCatalogItemRef(item),
    title,
  });

  return (
    <div ref={ref} className={`library-collection-picker-item${isDragging ? ' is-dragging' : ''}`}>
      <button
        ref={handleRef}
        className="library-collection-picker-drag-handle"
        type="button"
        aria-label={t('library.collection.dragItem', { title })}
      >
        <HugeiconsIcon icon={DragDropVerticalIcon} size={15} aria-hidden="true" />
      </button>
      <CollectionPickerCover item={item} className="library-collection-picker-cover" />
      <span className="library-collection-picker-copy">
        <strong>{title}</strong>
        <span className="library-collection-picker-meta">
          <span className="library-source-badge">
            {libraryTypeLabel(libraryCatalogItemType(item), t)}
          </span>
          <time dateTime={item.sortTime}>{formatLibraryShortDate(item.sortTime)}</time>
        </span>
      </span>
      <button
        type="button"
        className="library-collection-picker-add"
        aria-label={`${t('library.collection.addMembers')}：${title}`}
        onClick={onSelect}
      >
        <HugeiconsIcon icon={Add01Icon} size={15} />
      </button>
    </div>
  );
}

function CollectionPickerCover({
  className,
  item,
}: {
  className: string;
  item: LibraryCatalogItem;
}) {
  return (
    <span className={className} aria-hidden="true">
      {item.source === 'article' ? <ArticleBook article={item.article} /> : null}
      {item.source === 'weread' ? <WeReadCover book={item.weread} variant="cover" /> : null}
    </span>
  );
}

function libraryTypeLabel(type: LibraryCatalogItemType, t: ReturnType<typeof useTranslation>['t']) {
  if (type === 'web') return t('library.sources.webShort');
  if (type === 'ebook') return t('library.sources.ebookShort');
  if (type === 'pdf') return t('library.sources.pdfShort');
  if (type === 'text') return t('library.sources.textShort');
  return t('library.sources.wereadShort');
}
