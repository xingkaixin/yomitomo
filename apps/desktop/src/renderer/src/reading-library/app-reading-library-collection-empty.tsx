import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, FolderOpenIcon, Tick01Icon } from '@hugeicons/core-free-icons';
import React, { useReducer } from 'react';
import type { Collection, ContentRef } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import {
  libraryCatalogItemRef,
  libraryCatalogItemType,
  type LibraryCatalogItem,
} from '../../../ipc-contract';
import { appToast } from '../shell/app-toast';
import { contentRefKey, libraryItemTitle } from './app-reading-library-entities';
import { CollectionPickerCover, libraryTypeLabel } from './app-reading-library-collection-picker';
import {
  LibraryImportEntryGrid,
  type LibraryImportEntryHandlers,
} from './app-reading-library-import-entries';
import { useLibraryCatalog } from './use-library-catalog';

const QUICK_ADD_COUNT = 4;

type DropEvent = { type: 'dropStarted'; item: LibraryCatalogItem } | { type: 'dropFailed' };

function droppingReducer(_: LibraryCatalogItem | null, event: DropEvent) {
  return event.type === 'dropStarted' ? event.item : null;
}

type LibraryCollectionEmptyProps = LibraryImportEntryHandlers & {
  catalogRevision: unknown;
  collection: Collection;
  libraryHasItems: boolean;
  onAddExisting: () => void;
  onAddMember: (member: ContentRef) => Promise<void>;
};

export function LibraryCollectionEmpty({
  catalogRevision,
  collection,
  libraryHasItems,
  onAddExisting,
  onAddMember,
  ...entryHandlers
}: LibraryCollectionEmptyProps) {
  const { t } = useTranslation();
  const [dropping, dispatch] = useReducer(droppingReducer, null);
  const quickAdd = useLibraryCatalog(
    {
      scope: { kind: 'picker', collectionId: collection.id },
      page: 1,
      pageSize: QUICK_ADD_COUNT,
    },
    catalogRevision,
    libraryHasItems,
  );
  const droppingKey = dropping ? contentRefKey(libraryCatalogItemRef(dropping)) : null;
  const quickAddItems =
    quickAdd.result?.entities.filter(
      (entity): entity is LibraryCatalogItem => entity.kind === 'item',
    ) || [];

  // The member is added only after the cover lands, so the grid replaces this view once the
  // drop has finished instead of cutting it off mid-flight.
  async function addDroppedItem(event: React.AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || !dropping) return;
    try {
      await onAddMember(libraryCatalogItemRef(dropping));
    } catch (cause) {
      dispatch({ type: 'dropFailed' });
      appToast.error(t('library.collection.saveFailed'), {
        description: cause instanceof Error ? cause.message : undefined,
      });
    }
  }

  return (
    <section className="library-empty is-collection">
      <div
        className={dropping ? 'library-empty-crate is-receiving' : 'library-empty-crate'}
        aria-hidden="true"
      >
        <span className="library-empty-crate-ghost" />
        <span className="library-empty-crate-ghost" />
        <span className="library-empty-crate-ghost" />
        <div
          className="library-collection-crate"
          style={{ '--crate-count': 1 } as React.CSSProperties}
        >
          <span className="library-collection-crate-back" />
          {dropping ? (
            <div
              className="library-collection-crate-member is-dropping"
              onAnimationEnd={addDroppedItem}
            >
              <CollectionPickerCover item={dropping} className="library-empty-crate-cover" />
            </div>
          ) : null}
          <span className="library-collection-crate-front" />
        </div>
      </div>
      <h3>{t('library.collection.emptyTitle', { name: collection.name })}</h3>
      {libraryHasItems ? (
        <>
          <p>{t('library.collection.emptyDescription')}</p>
          <div className="library-empty-actions">
            <Button type="button" size="sm" onClick={onAddExisting}>
              <HugeiconsIcon icon={FolderOpenIcon} size={15} />
              {t('library.collection.pickFromLibrary')}
            </Button>
          </div>
          {quickAddItems.length > 0 ? (
            <section className="library-empty-quick-add">
              <h4>{t('library.collection.quickAdd')}</h4>
              <ul style={{ '--quick-add-count': quickAddItems.length } as React.CSSProperties}>
                {quickAddItems.map((item) => {
                  const key = contentRefKey(libraryCatalogItemRef(item));
                  const title = libraryItemTitle(item);
                  return (
                    <li key={key}>
                      <CollectionPickerCover
                        item={item}
                        className="library-collection-picker-cover library-empty-quick-add-cover"
                      />
                      <span className="library-empty-quick-add-copy">
                        <strong title={title}>{title}</strong>
                        <span>{libraryTypeLabel(libraryCatalogItemType(item), t)}</span>
                      </span>
                      {key === droppingKey ? (
                        <span className="library-empty-quick-add-done">
                          <HugeiconsIcon icon={Tick01Icon} size={15} />
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="library-empty-quick-add-button"
                          aria-label={`${t('library.collection.addMembers')}：${title}`}
                          disabled={dropping !== null}
                          onClick={() => dispatch({ type: 'dropStarted', item })}
                        >
                          <HugeiconsIcon icon={Add01Icon} size={14} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
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
