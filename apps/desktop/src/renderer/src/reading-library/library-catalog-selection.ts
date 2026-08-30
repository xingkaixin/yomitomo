import type { ContentRef } from '@yomitomo/shared';
import { contentRefKey } from './app-reading-library-entities';

export function toggleCatalogSelection<Item>(
  selection: ReadonlyMap<string, Item>,
  ref: ContentRef,
  item: Item,
): Map<string, Item> {
  const next = new Map(selection);
  const key = contentRefKey(ref);
  if (next.has(key)) next.delete(key);
  else next.set(key, item);
  return next;
}
