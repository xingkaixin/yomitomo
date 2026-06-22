import { describe, expect, it } from 'vitest';
import type { DesktopStore } from '@yomitomo/shared';
import { emptyStore } from '../settings/app-settings';
import {
  applyCollectionStorePatch,
  applyLibraryPinPatch,
} from '../shell/app-library-collection-store-actions';

describe('library collection store patch actions', () => {
  it('replaces members for the patched collection only', () => {
    const store: DesktopStore = {
      ...emptyStore,
      collectionMembers: [
        {
          collectionId: 'collection_1',
          member: { kind: 'article', id: 'old_article' },
          addedAt: '2026-06-21T00:00:00.000Z',
        },
        {
          collectionId: 'collection_2',
          member: { kind: 'weread', id: 'book_1' },
          addedAt: '2026-06-21T00:01:00.000Z',
        },
      ],
    };

    const nextStore = applyCollectionStorePatch(store, {
      type: 'collection-members',
      collectionId: 'collection_1',
      members: [
        {
          collectionId: 'collection_1',
          member: { kind: 'article', id: 'new_article' },
          addedAt: '2026-06-21T00:02:00.000Z',
        },
      ],
    });

    expect(nextStore.collectionMembers).toEqual([
      {
        collectionId: 'collection_1',
        member: { kind: 'article', id: 'new_article' },
        addedAt: '2026-06-21T00:02:00.000Z',
      },
      {
        collectionId: 'collection_2',
        member: { kind: 'weread', id: 'book_1' },
        addedAt: '2026-06-21T00:01:00.000Z',
      },
    ]);
  });

  it('removes collection members and collection pins when deleting a collection', () => {
    const store: DesktopStore = {
      ...emptyStore,
      collections: [
        {
          id: 'collection_1',
          name: '合集',
          createdAt: '2026-06-21T00:00:00.000Z',
          updatedAt: '2026-06-21T00:00:00.000Z',
        },
      ],
      collectionMembers: [
        {
          collectionId: 'collection_1',
          member: { kind: 'article', id: 'article_1' },
          addedAt: '2026-06-21T00:01:00.000Z',
        },
      ],
      pins: [
        {
          targetKind: 'collection',
          targetId: 'collection_1',
          pinnedAt: '2026-06-21T00:02:00.000Z',
        },
      ],
    };

    const nextStore = applyCollectionStorePatch(store, {
      type: 'collection-delete',
      collectionId: 'collection_1',
    });

    expect(nextStore.collections).toEqual([]);
    expect(nextStore.collectionMembers).toEqual([]);
    expect(nextStore.pins).toEqual([]);
  });

  it('upserts and removes library pins', () => {
    const pinnedStore = applyLibraryPinPatch(emptyStore, {
      type: 'library-pin',
      pinned: true,
      pin: {
        targetKind: 'article',
        targetId: 'article_1',
        pinnedAt: '2026-06-21T00:00:00.000Z',
      },
    });

    const unpinnedStore = applyLibraryPinPatch(pinnedStore, {
      type: 'library-pin',
      pinned: false,
      pin: pinnedStore.pins[0],
    });

    expect(pinnedStore.pins).toHaveLength(1);
    expect(unpinnedStore.pins).toEqual([]);
  });
});
