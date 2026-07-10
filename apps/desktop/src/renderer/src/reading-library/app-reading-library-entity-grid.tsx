import React, { useState } from 'react';
import {
  FolderOpen,
  Highlighter,
  Layers2,
  LibraryBig,
  MoreHorizontal,
  PencilLine,
  Pin,
  PinOff,
  Smartphone,
  Trash2,
} from 'lucide-react';
import type { ArticleSummaryRecord, Collection, WeReadBook } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import { SettingsConfirmDialog } from '../settings/app-settings-confirm-dialog';
import { ArticleBook } from '../shell/app-article-book';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { ArticleLibraryCard } from './app-reading-library-card';
import { WeReadCover } from './app-reading-library-covers';
import { contentRefKey } from './app-reading-library-entities';
import { formatLibraryShortDate, weReadBookLibraryDate } from './app-reading-library-utils';
import type {
  LibraryCollectionEntity,
  LibraryEntity,
  LibraryItemEntity,
} from './library-entity-types';

export function LibraryEntityGrid({
  activeCollectionId,
  actions,
  entities,
}: {
  activeCollectionId: string | null;
  actions: LibraryEntityActions;
  entities: LibraryEntity[];
}) {
  return (
    <div className="library-entity-scroll">
      <div className="library-entity-grid">
        {entities.map((entity) => (
          <LibraryEntityCard
            activeCollectionId={activeCollectionId}
            actions={actions}
            entity={entity}
            key={libraryEntityKey(entity)}
          />
        ))}
      </div>
    </div>
  );
}

type LibraryEntityActions = {
  deleteArticle: (article: ArticleSummaryRecord) => void;
  deleteCollection: (collection: Collection) => void;
  openArticle: (article: ArticleSummaryRecord) => void;
  openCollection: (collection: Collection) => void;
  openCollectionPicker: (collection: Collection) => void;
  openWeReadBook: (book: WeReadBook) => void;
  openWeReadExternal: (book: WeReadBook) => void;
  removeCollectionMember?: (entity: LibraryItemEntity) => void;
  renameCollection: (collection: Collection) => void;
  setPinned: (entity: LibraryEntity, pinned: boolean) => void;
};

function LibraryEntityCard({
  activeCollectionId,
  actions,
  entity,
}: {
  activeCollectionId: string | null;
  actions: LibraryEntityActions;
  entity: LibraryEntity;
}) {
  if (entity.kind === 'col') {
    return (
      <LibraryCollectionCard
        entity={entity}
        pinned={entity.pinned}
        onDelete={() => actions.deleteCollection(entity.collection)}
        onOpen={() => actions.openCollection(entity.collection)}
        onOpenPicker={() => actions.openCollectionPicker(entity.collection)}
        onRename={() => actions.renameCollection(entity.collection)}
        onSetPinned={(pinned) => actions.setPinned(entity, pinned)}
      />
    );
  }

  if (entity.article) {
    return (
      <ArticleLibraryCard
        article={entity.article}
        onDelete={() => actions.deleteArticle(entity.article!)}
        onOpen={() => actions.openArticle(entity.article!)}
        onRemoveFromCollection={
          activeCollectionId ? () => actions.removeCollectionMember?.(entity) : undefined
        }
        onSetPinned={(pinned) => actions.setPinned(entity, pinned)}
        pinned={entity.pinned}
      />
    );
  }

  if (entity.weread) {
    return (
      <WeReadLibraryCard
        book={entity.weread}
        pinned={entity.pinned}
        onOpen={() => actions.openWeReadBook(entity.weread!)}
        onOpenExternal={() => actions.openWeReadExternal(entity.weread!)}
        onRemoveFromCollection={
          activeCollectionId ? () => actions.removeCollectionMember?.(entity) : undefined
        }
        onSetPinned={(pinned) => actions.setPinned(entity, pinned)}
      />
    );
  }

  return null;
}

function WeReadLibraryCard({
  book,
  onOpen,
  onOpenExternal,
  onRemoveFromCollection,
  onSetPinned,
  pinned,
}: {
  book: WeReadBook;
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
    <article className="library-list-item library-article-list-item library-ebook-list-item library-weread-list-item">
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
  entity,
  onDelete,
  onOpen,
  onOpenPicker,
  onRename,
  onSetPinned,
  pinned,
}: {
  entity: LibraryCollectionEntity;
  onDelete: () => void;
  onOpen: () => void;
  onOpenPicker: () => void;
  onRename: () => void;
  onSetPinned: (pinned: boolean) => void;
  pinned: boolean;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const title = entity.collection.name;
  const statsLabel = t('library.collection.memberCount', { count: entity.memberCount });
  return (
    <article className="library-list-item library-collection-list-item" aria-label={title}>
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
          style={{ '--cover-count': entity.coverMembers.length || 3 } as React.CSSProperties}
        >
          {entity.coverMembers.length > 0
            ? entity.coverMembers.map((item, index) => (
                <div
                  className="library-collection-cover-item"
                  key={contentRefKey(item.ref)}
                  style={{ '--cover-index': index } as React.CSSProperties}
                >
                  {item.article ? <ArticleBook article={item.article} /> : null}
                  {item.weread ? <WeReadCover book={item.weread} variant="cover" /> : null}
                </div>
              ))
            : [0, 1, 2].map((index) => (
                <div
                  className="library-collection-cover-item is-placeholder"
                  key={index}
                  style={{ '--cover-index': index } as React.CSSProperties}
                >
                  <span className="library-collection-cover-placeholder" />
                </div>
              ))}
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

function libraryEntityKey(entity: LibraryEntity) {
  if (entity.kind === 'col') return `collection:${entity.collection.id}`;
  return contentRefKey(entity.ref);
}

function coverProgressStyle(value: number) {
  const progress = Math.min(1, Math.max(0, value));
  return { '--ebook-progress': `${Math.round(progress * 100)}%` } as React.CSSProperties;
}
