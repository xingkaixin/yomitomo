import { HugeiconsIcon } from '@hugeicons/react';
import { FolderOpenIcon } from '@hugeicons/core-free-icons';
import React from 'react';
import type { Collection } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import {
  LibraryImportEntryGrid,
  type LibraryImportEntryHandlers,
} from './app-reading-library-import-entries';

type LibraryCollectionEmptyProps = LibraryImportEntryHandlers & {
  collection: Collection;
  libraryHasItems: boolean;
  onAddExisting: () => void;
};

export function LibraryCollectionEmpty({
  collection,
  libraryHasItems,
  onAddExisting,
  ...entryHandlers
}: LibraryCollectionEmptyProps) {
  const { t } = useTranslation();

  return (
    <section className="library-empty is-collection">
      <div className="library-empty-crate" aria-hidden="true">
        <span className="library-empty-crate-ghost" />
        <span className="library-empty-crate-ghost" />
        <span className="library-empty-crate-ghost" />
        <div
          className="library-collection-crate"
          style={{ '--crate-count': 1 } as React.CSSProperties}
        >
          <span className="library-collection-crate-back" />
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
