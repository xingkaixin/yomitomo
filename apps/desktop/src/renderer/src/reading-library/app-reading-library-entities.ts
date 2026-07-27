import type { ContentRef, LibraryPinTargetKind } from '@yomitomo/shared';
import {
  libraryCatalogItemRef,
  type LibraryCatalogEntity,
  type LibraryCatalogItem,
} from '../../../ipc-contract';
import { articleDisplayTitle } from './app-reading-library-utils';

export function libraryEntityPinTarget(entity: LibraryCatalogEntity): {
  kind: LibraryPinTargetKind;
  id: string;
} {
  if (entity.kind === 'col') return { kind: 'collection', id: entity.collection.id };
  return libraryCatalogItemRef(entity);
}

export function libraryItemTitle(item: LibraryCatalogItem) {
  return item.source === 'article' ? articleDisplayTitle(item.article) : item.weread.title;
}

export function contentRefKey(ref: ContentRef) {
  return `${ref.kind}:${ref.id}`;
}
