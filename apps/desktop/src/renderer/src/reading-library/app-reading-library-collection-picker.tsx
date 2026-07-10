import React, { useMemo, useState } from 'react';
import {
  ReaderTooltip,
  ReaderTooltipProvider,
} from '@yomitomo/reader-ui/reader-component-primitives';
import { GripVertical, LibraryBig, Plus, Search, X } from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../components/ui/dialog';
import { ArticleBook } from '../shell/app-article-book';
import {
  buildLibraryEntities,
  contentRefKey,
  libraryItemTitle,
  libraryTypeFilterFromScope,
} from './app-reading-library-entities';
import { formatLibraryShortDate } from './app-reading-library-utils';
import { WeReadCover } from './app-reading-library-covers';
import {
  LibraryDndProvider,
  useLibraryDraggable,
  useLibraryDroppable,
} from './app-reading-library-dnd';
import type { LibraryItemEntity, LibraryItemType, LibraryTypeScope } from './library-entity-types';

type CollectionPickerDialogProps = {
  articles: ArticleSummaryRecord[];
  availableTypes: LibraryItemType[];
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
  availableTypes,
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
  const [selectedRefs, setSelectedRefs] = useState<Map<string, ContentRef>>(() => new Map());
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
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
        typeFilter: libraryTypeFilterFromScope('all'),
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
        typeFilter: libraryTypeFilterFromScope(typeScope),
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
  const { isDropTarget: selectionDragOver, ref: selectionDropRef } = useLibraryDroppable({
    id: `picker-selection:${collection.id}`,
    label: t('library.collection.pendingMembers', { count: selectedItems.length }),
    onDrop: toggleItem,
  });

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
                    pickerItems.map((item) => (
                      <CollectionPickerItem
                        item={item}
                        key={contentRefKey(item.ref)}
                        onSelect={() => toggleItem(item.ref)}
                      />
                    ))
                  ) : (
                    <p>{t('library.collection.pickerNoItems')}</p>
                  )}
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
    </ReaderTooltipProvider>
  );
}

function CollectionPickerItem({
  item,
  onSelect,
}: {
  item: LibraryItemEntity;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const title = libraryItemTitle(item);
  const { handleRef, isDragging, ref } = useLibraryDraggable({
    ref: item.ref,
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
        <GripVertical size={15} aria-hidden="true" />
      </button>
      <CollectionPickerCover item={item} className="library-collection-picker-cover" />
      <span className="library-collection-picker-copy">
        <strong>{title}</strong>
        <span className="library-collection-picker-meta">
          <span className="library-source-badge">{libraryTypeLabel(item.type, t)}</span>
          <time dateTime={item.sortTime}>{formatLibraryShortDate(item.sortTime)}</time>
        </span>
      </span>
      <button
        type="button"
        className="library-collection-picker-add"
        aria-label={`${t('library.collection.addMembers')}：${title}`}
        onClick={onSelect}
      >
        <Plus size={15} />
      </button>
    </div>
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

function libraryTypeLabel(type: LibraryItemType, t: ReturnType<typeof useTranslation>['t']) {
  if (type === 'web') return t('library.sources.webShort');
  if (type === 'ebook') return t('library.sources.ebookShort');
  if (type === 'pdf') return t('library.sources.pdfShort');
  if (type === 'text') return t('library.sources.textShort');
  return t('library.sources.wereadShort');
}
