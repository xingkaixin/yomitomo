import { HugeiconsIcon } from '@hugeicons/react';
import {
  Delete02Icon,
  FolderOpenIcon,
  HighlighterIcon,
  Layers02Icon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  PinIcon,
  PinOffIcon,
  SmartPhone01Icon,
} from '@hugeicons/core-free-icons';
import React, { useReducer } from 'react';
import type { ArticleSummaryRecord, Collection, WeReadBook } from '@yomitomo/shared';
import {
  libraryCatalogItemRef,
  type LibraryCatalogCollection,
  type LibraryCatalogEntity,
  type LibraryCatalogItem,
} from '../../../ipc-contract';
import { useTranslation } from 'react-i18next';
import { SettingsConfirmDialog } from '../settings/app-settings-confirm-dialog';
import { ArticleBook } from '../shell/app-article-book';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  ArticleLibraryCard,
  LibraryCoverProgress,
  LibraryShelfItem,
} from './app-reading-library-card';
import { WeReadCover } from './app-reading-library-covers';
import { CollectionIcon } from './collection-icon';
import { contentRefKey } from './app-reading-library-entities';
import { formatLibraryShortDate, weReadBookLibraryDate } from './app-reading-library-utils';
import { libraryMenuReducer, type LibraryMenuEvent } from './library-menu-state';
export function LibraryEntityGrid({
  activeCollectionId,
  actions,
  entities,
}: {
  activeCollectionId: string | null;
  actions: LibraryEntityActions;
  entities: LibraryCatalogEntity[];
}) {
  return (
    <div className="library-entity-scroll">
      <div className="library-shelf-grid">
        {entities.map((entity) => {
          const key = libraryEntityKey(entity);
          return (
            <div className="library-shelf-slot" data-library-item={key} key={key}>
              <LibraryEntityCard
                activeCollectionId={activeCollectionId}
                actions={actions}
                entity={entity}
              />
            </div>
          );
        })}
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
  removeCollectionMember?: (entity: LibraryCatalogItem) => void;
  renameCollection: (collection: Collection) => void;
  setPinned: (entity: LibraryCatalogEntity, pinned: boolean) => void;
};

function LibraryEntityCard({
  activeCollectionId,
  actions,
  entity,
}: {
  activeCollectionId: string | null;
  actions: LibraryEntityActions;
  entity: LibraryCatalogEntity;
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

  if (entity.source === 'article') {
    const article = entity.article;
    return (
      <ArticleLibraryCard
        article={article}
        onDelete={() => actions.deleteArticle(article)}
        onOpen={() => actions.openArticle(article)}
        onRemoveFromCollection={
          activeCollectionId ? () => actions.removeCollectionMember?.(entity) : undefined
        }
        onSetPinned={(pinned) => actions.setPinned(entity, pinned)}
        pinned={entity.pinned}
      />
    );
  }

  const book = entity.weread;
  return (
    <WeReadLibraryCard
      book={book}
      pinned={entity.pinned}
      onOpen={() => actions.openWeReadBook(book)}
      onOpenExternal={() => actions.openWeReadExternal(book)}
      onRemoveFromCollection={
        activeCollectionId ? () => actions.removeCollectionMember?.(entity) : undefined
      }
      onSetPinned={(pinned) => actions.setPinned(entity, pinned)}
    />
  );
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
  const [menuOpen, dispatchMenu] = useReducer(libraryMenuReducer, false);
  const statsLabel = t('library.stats.label', {
    annotations: book.noteCount,
    distillations: 0,
  });
  const libraryDate = weReadBookLibraryDate(book);

  return (
    <LibraryShelfItem
      actions={
        <div className={menuOpen ? 'library-item-actions is-active' : 'library-item-actions'}>
          <DropdownMenu
            open={menuOpen}
            onOpenChange={(open) => dispatchMenu({ type: 'openChanged', open })}
          >
            <div className="library-card-menu">
              <DropdownMenuTrigger asChild>
                <button
                  className={menuOpen ? 'library-card-more is-active' : 'library-card-more'}
                  type="button"
                  aria-label={t('library.actions.more', { title: book.title })}
                  onClick={(event) => event.stopPropagation()}
                >
                  <HugeiconsIcon icon={MoreHorizontalIcon} size={17} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="library-card-menu-popover"
                onClick={(event) => event.stopPropagation()}
              >
                <LibraryPinMenuItem
                  pinned={pinned}
                  onSelect={() => {
                    dispatchMenu({ type: 'itemChosen' });
                    onSetPinned(!pinned);
                  }}
                />
                <DropdownMenuItem asChild>
                  <button
                    type="button"
                    onClick={() => {
                      dispatchMenu({ type: 'itemChosen' });
                      onOpenExternal();
                    }}
                  >
                    <HugeiconsIcon icon={SmartPhone01Icon} size={14} />
                    <span>{t('library.actions.openWeReadExternal')}</span>
                  </button>
                </DropdownMenuItem>
                {onRemoveFromCollection ? (
                  <DropdownMenuItem asChild>
                    <button
                      type="button"
                      onClick={() => {
                        dispatchMenu({ type: 'itemChosen' });
                        void onRemoveFromCollection();
                      }}
                    >
                      <HugeiconsIcon icon={Layers02Icon} size={14} />
                      <span>{t('library.collection.removeMember')}</span>
                    </button>
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </div>
          </DropdownMenu>
        </div>
      }
      cover={<WeReadCover book={book} />}
      openLabel={t('library.actions.openWeRead', { title: book.title })}
      progress={<LibraryCoverProgress progress={book.readingProgress / 100} />}
      onOpen={onOpen}
    >
      <p className="library-card-author">
        <span>{book.author || t('library.fallback.weread')}</span>
      </p>
      <h3 title={book.title}>{book.title}</h3>
      <div className="library-shelf-item-meta">
        <span className="library-item-date-source">
          <time dateTime={libraryDate}>{formatLibraryShortDate(libraryDate)}</time>
          <span className="library-source-badge">{t('library.sources.wereadShort')}</span>
          <PinnedIndicator pinned={pinned} />
        </span>
        <div className="library-count-stats" aria-label={statsLabel} data-tooltip={statsLabel}>
          <span className="library-count-stat">
            <HugeiconsIcon icon={HighlighterIcon} size={13} />
            <span className="library-count-value">{book.noteCount}</span>
          </span>
          <span className="library-count-stat">
            <HugeiconsIcon icon={Layers02Icon} size={13} />
            <span className="library-count-value">0</span>
          </span>
        </div>
      </div>
    </LibraryShelfItem>
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
  entity: LibraryCatalogCollection;
  onDelete: () => void;
  onOpen: () => void;
  onOpenPicker: () => void;
  onRename: () => void;
  onSetPinned: (pinned: boolean) => void;
  pinned: boolean;
}) {
  const { t } = useTranslation();
  const [{ menuOpen, deleteConfirmOpen }, dispatchMenu] = useReducer(collectionCardMenuReducer, {
    menuOpen: false,
    deleteConfirmOpen: false,
  });
  const title = entity.collection.name;
  const memberCount = entity.memberCount;
  const statsLabel = t('library.collection.memberCount', { count: memberCount });
  const previewMembers = entity.coverMembers.slice(0, 3);
  return (
    <LibraryShelfItem
      actions={
        <>
          <div className={menuOpen ? 'library-item-actions is-active' : 'library-item-actions'}>
            <DropdownMenu
              open={menuOpen}
              onOpenChange={(open) => dispatchMenu({ type: 'openChanged', open })}
            >
              <div className="library-card-menu">
                <DropdownMenuTrigger asChild>
                  <button
                    className={menuOpen ? 'library-card-more is-active' : 'library-card-more'}
                    type="button"
                    aria-label={t('library.actions.more', { title })}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <HugeiconsIcon icon={MoreHorizontalIcon} size={17} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="library-card-menu-popover"
                  onClick={(event) => event.stopPropagation()}
                >
                  <LibraryPinMenuItem
                    pinned={pinned}
                    onSelect={() => {
                      dispatchMenu({ type: 'itemChosen' });
                      onSetPinned(!pinned);
                    }}
                  />
                  <DropdownMenuItem asChild>
                    <button
                      type="button"
                      onClick={() => {
                        dispatchMenu({ type: 'itemChosen' });
                        onRename();
                      }}
                    >
                      <HugeiconsIcon icon={PencilEdit01Icon} size={14} />
                      <span>{t('library.collection.rename')}</span>
                    </button>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <button
                      type="button"
                      onClick={() => {
                        dispatchMenu({ type: 'itemChosen' });
                        onOpenPicker();
                      }}
                    >
                      <HugeiconsIcon icon={FolderOpenIcon} size={14} />
                      <span>{t('library.collection.addMembers')}</span>
                    </button>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <button
                      className="library-item-delete"
                      type="button"
                      onClick={() => {
                        dispatchMenu({ type: 'deleteRequested' });
                      }}
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={14} />
                      <span>{t('library.collection.delete')}</span>
                    </button>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </div>
            </DropdownMenu>
          </div>
          <SettingsConfirmDialog
            cancelLabel={t('settings.confirm.cancel')}
            confirmLabel={t('library.collection.deleteConfirm')}
            description={t('library.collection.deleteConfirmDescription')}
            open={deleteConfirmOpen}
            title={t('library.collection.deleteConfirmTitle', { name: title })}
            onCancel={() => dispatchMenu({ type: 'deleteDismissed' })}
            onConfirm={() => {
              dispatchMenu({ type: 'deleteDismissed' });
              onDelete();
            }}
          />
        </>
      }
      cover={
        <div
          className="library-collection-crate"
          style={{ '--crate-count': previewMembers.length } as React.CSSProperties}
        >
          <span className="library-collection-crate-back" />
          {previewMembers.map((item, index) => (
            <div
              className="library-collection-crate-member"
              key={contentRefKey(libraryCatalogItemRef(item))}
              style={{ '--crate-index': index } as React.CSSProperties}
            >
              {item.source === 'article' ? <ArticleBook article={item.article} /> : null}
              {item.source === 'weread' ? <WeReadCover book={item.weread} variant="cover" /> : null}
            </div>
          ))}
          <span className="library-collection-crate-front" />
        </div>
      }
      label={title}
      openLabel={t('library.collection.open', { name: title })}
      onOpen={onOpen}
    >
      <p className="library-shelf-item-kicker">{t('library.collection.coverKicker')}</p>
      <h3 title={title}>{title}</h3>
      <div className="library-shelf-item-meta">
        <span className="library-item-date-source">
          <span className="library-count-stat" aria-label={statsLabel}>
            <HugeiconsIcon icon={CollectionIcon} size={13} />
            <span className="library-count-value">{memberCount}</span>
          </span>
          <PinnedIndicator pinned={pinned} />
        </span>
      </div>
    </LibraryShelfItem>
  );
}

type CollectionCardMenu = { menuOpen: boolean; deleteConfirmOpen: boolean };

function collectionCardMenuReducer(
  menu: CollectionCardMenu,
  event: LibraryMenuEvent | { type: 'deleteRequested' } | { type: 'deleteDismissed' },
): CollectionCardMenu {
  switch (event.type) {
    case 'openChanged':
      return { ...menu, menuOpen: libraryMenuReducer(menu.menuOpen, event) };
    case 'itemChosen':
      return { ...menu, menuOpen: false };
    case 'deleteRequested':
      return { menuOpen: false, deleteConfirmOpen: true };
    case 'deleteDismissed':
      return { ...menu, deleteConfirmOpen: false };
  }
}

function LibraryPinMenuItem({ pinned, onSelect }: { pinned: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  return (
    <DropdownMenuItem asChild>
      <button type="button" onClick={onSelect}>
        {pinned ? (
          <HugeiconsIcon icon={PinOffIcon} size={14} />
        ) : (
          <HugeiconsIcon icon={PinIcon} size={14} />
        )}
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
      <HugeiconsIcon icon={PinIcon} size={15} />
    </span>
  );
}

function libraryEntityKey(entity: LibraryCatalogEntity) {
  if (entity.kind === 'col') return `collection:${entity.collection.id}`;
  return contentRefKey(libraryCatalogItemRef(entity));
}
