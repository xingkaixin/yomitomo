import type { ContentRef, LibraryPinTargetKind } from '@yomitomo/shared';
import { articleDisplayTitle } from './app-reading-library-utils';
import type { LibraryEntity, LibraryItemEntity } from './library-entity-types';

export function libraryEntityPinTarget(entity: LibraryEntity): {
  kind: LibraryPinTargetKind;
  id: string;
} {
  if (entity.kind === 'col') return { kind: 'collection', id: entity.collection.id };
  return {
    kind: entity.ref.kind,
    id: entity.ref.id,
  };
}

export function libraryItemTitle(item: LibraryItemEntity) {
  if (item.article) return articleDisplayTitle(item.article);
  return item.weread?.title || '';
}

export function contentRefKey(ref: ContentRef) {
  return `${ref.kind}:${ref.id}`;
}
