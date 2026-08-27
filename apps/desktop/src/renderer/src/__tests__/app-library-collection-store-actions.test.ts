// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopStore } from '@yomitomo/shared';
import { initializeAppI18n } from '../i18n/app-i18n';
import { emptyStore } from '../settings/app-settings';
import { useLibraryCatalog } from '../reading-library/use-library-catalog';
import { useDesktopStoreState } from '../shell/app-desktop-store-state';
import { appToast } from '../shell/app-toast';
import {
  applyCollectionStorePatch,
  applyLibraryPinPatch,
  useAppCollectionStoreActions,
} from '../shell/app-library-collection-store-actions';

vi.mock('../shell/app-toast', () => ({
  appToast: { success: vi.fn() },
}));

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
});

describe('useAppCollectionStoreActions', () => {
  it('applies returned collection patches before resolving', async () => {
    const collection = {
      id: 'collection_1',
      name: '合集',
      createdAt: '2026-06-21T00:00:00.000Z',
      updatedAt: '2026-06-21T00:00:00.000Z',
    };
    const patch = { type: 'collection-upsert' as const, collection };
    const createCollection = vi.fn().mockResolvedValue({ collection, patch });
    const { actions, applyStore, storeRef } = renderActions({
      library: { collections: { create: createCollection } },
    });

    let result!: Awaited<ReturnType<typeof actions.current.createCollection>>;
    await act(async () => {
      result = await actions.current.createCollection(collection.name);
    });

    expect(result).toEqual(collection);
    expect(createCollection).toHaveBeenCalledWith({ name: collection.name });
    expect(storeRef.current.collections).toEqual([collection]);
    expect(applyStore).toHaveBeenCalledWith(storeRef.current);
    expect(appToast.success).toHaveBeenCalledWith('合集已创建', {
      description: collection.name,
    });
  });

  it('applies returned pin patches locally', async () => {
    const patch = {
      type: 'library-pin' as const,
      pinned: true,
      pin: {
        targetKind: 'article' as const,
        targetId: 'article_1',
        pinnedAt: '2026-06-21T00:00:00.000Z',
      },
    };
    const setLibraryPin = vi.fn().mockResolvedValue(patch);
    const { actions, applyStore, storeRef } = renderActions({
      library: { pins: { set: setLibraryPin } },
    });
    const input = { target: { kind: 'article' as const, id: 'article_1' }, pinned: true };

    await act(async () => {
      await actions.current.setLibraryPin(input);
    });

    expect(setLibraryPin).toHaveBeenCalledWith(input);
    expect(storeRef.current.pins).toEqual([patch.pin]);
    expect(applyStore).toHaveBeenCalledWith(storeRef.current);
  });

  it.each(['rename', 'pin'] as const)(
    'refreshes the catalog after a local %s without an event echo',
    async (action) => {
      const collection = {
        id: 'collection_1',
        name: 'Before',
        createdAt: '2026-06-21T00:00:00.000Z',
        updatedAt: '2026-06-21T00:00:00.000Z',
      };
      let serverCollection = collection;
      let serverPinned = false;
      Object.defineProperty(window, 'yomitomoDesktop', {
        configurable: true,
        value: {
          store: {
            getStateResult: async () => ({
              ok: true,
              store: { ...emptyStore, collections: [collection] },
            }),
            onUpdated: () => () => undefined,
          },
          library: {
            catalog: {
              list: async () => ({
                entities: [
                  {
                    kind: 'col',
                    collection: serverCollection,
                    pinned: serverPinned,
                    sortTime: collection.updatedAt,
                    memberCount: 0,
                    coverMembers: [],
                  },
                ],
                itemCounts: { web: 0, ebook: 0, pdf: 0, text: 0, weread: 0 },
                page: 1,
                pageSize: 12,
                query: '',
                totalCount: 1,
                unfilteredCount: 1,
              }),
            },
            collections: {
              rename: async ({ name }: { name: string }) => {
                serverCollection = { ...collection, name };
                return { type: 'collection-upsert', collection: serverCollection };
              },
            },
            pins: {
              set: async ({ pinned }: { pinned: boolean }) => {
                serverPinned = pinned;
                return {
                  type: 'library-pin',
                  pinned,
                  pin: {
                    targetKind: 'collection',
                    targetId: collection.id,
                    pinnedAt: collection.updatedAt,
                  },
                };
              },
            },
          },
        },
      });
      const { result } = renderHook(() => {
        const state = useDesktopStoreState();
        const actions = useAppCollectionStoreActions(state);
        const catalog = useLibraryCatalog(
          { scope: { kind: 'library' }, page: 1, pageSize: 12 },
          state.status === 'ready' ? state.libraryCatalogRevision : 0,
        );
        return { state, actions, catalog };
      });
      await waitFor(() => {
        expect(result.current.state.status).toBe('ready');
        expect(result.current.catalog).toMatchObject({
          status: 'ready',
          result: { entities: [{ collection: { name: 'Before' }, pinned: false }] },
        });
      });

      await act(async () => {
        if (action === 'rename') {
          await result.current.actions.renameCollection(collection.id, 'After');
        } else {
          await result.current.actions.setLibraryPin({
            target: { kind: 'collection', id: collection.id },
            pinned: true,
          });
        }
      });

      await waitFor(() => {
        expect(result.current.catalog).toMatchObject({
          status: 'ready',
          result: { entities: [{ collection: serverCollection, pinned: serverPinned }] },
        });
      });
    },
  );
});

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

function renderActions(desktop: Record<string, unknown>) {
  const storeRef: { current: DesktopStore } = { current: emptyStore };
  const applyStore = vi.fn((store: DesktopStore) => {
    storeRef.current = store;
    return store;
  });
  const actions: { current: ReturnType<typeof useAppCollectionStoreActions> } = {
    current: undefined as never,
  };
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: desktop,
  });
  render(
    createElement(function Harness() {
      actions.current = useAppCollectionStoreActions({ storeRef, applyStore });
      return null;
    }),
  );
  return { actions, applyStore, storeRef };
}
