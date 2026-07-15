import { describe, expect, it, vi } from 'vitest';
import { registerLibraryCollectionIpc } from './ipc-library-collection';

const ipcMocks = vi.hoisted(() => ({
  ipcMainHandle: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMocks.ipcMainHandle,
  },
}));

describe('library collection IPC', () => {
  it('routes distillation library reads through collection persistence', async () => {
    ipcMocks.ipcMainHandle.mockClear();
    const library = {
      items: [],
      page: 1,
      pageSize: 12,
      query: '',
      totalCount: 0,
      unfilteredCount: 0,
    };
    const listDistillationLibrary = vi.fn(async () => library);
    registerLibraryCollectionIpc(libraryCollectionIpcContext({ listDistillationLibrary }, {}));
    const handler = ipcMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'distillation-library:list',
    )?.[1];
    const input = { page: 1, pageSize: 12 };

    const result = await handler({}, input);

    expect(result).toEqual({ ok: true, value: library });
    expect(listDistillationLibrary).toHaveBeenCalledWith(input);
  });

  it('routes paged catalog reads through collection persistence', async () => {
    ipcMocks.ipcMainHandle.mockClear();
    const catalog = {
      entities: [],
      itemCounts: { web: 0, ebook: 0, pdf: 0, text: 0, weread: 0 },
      page: 1,
      pageSize: 12,
      query: '',
      totalCount: 0,
      unfilteredCount: 0,
    };
    const listLibraryCatalog = vi.fn(async () => catalog);
    registerLibraryCollectionIpc(libraryCollectionIpcContext({ listLibraryCatalog }, {}));
    const handler = ipcMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'library-catalog:list',
    )?.[1];
    const input = { scope: { kind: 'library' as const }, page: 1, pageSize: 12 };

    const result = await handler({}, input);

    expect(result).toEqual({ ok: true, value: catalog });
    expect(listLibraryCatalog).toHaveBeenCalledWith(input);
  });

  it('broadcasts collection patches after creating a collection', async () => {
    ipcMocks.ipcMainHandle.mockClear();
    const patch = {
      type: 'collection-upsert' as const,
      collection: {
        id: 'collection_1',
        name: '合集',
        createdAt: '2026-06-21T00:00:00.000Z',
        updatedAt: '2026-06-21T00:00:00.000Z',
      },
    };
    const createCollection = vi.fn().mockResolvedValue({
      collection: patch.collection,
      patch,
    });
    const sendCollectionPatched = vi.fn();

    registerLibraryCollectionIpc(
      libraryCollectionIpcContext({ createCollection }, { sendCollectionPatched }),
    );

    const handler = ipcMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'library-collection:create',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    const result = await handler({}, { name: '合集' });

    expect(result).toEqual({ ok: true, value: { collection: patch.collection, patch } });
    expect(createCollection).toHaveBeenCalledWith({ name: '合集' });
    expect(sendCollectionPatched).toHaveBeenCalledWith(patch);
  });

  it('broadcasts library pin patches after setting a pin', async () => {
    ipcMocks.ipcMainHandle.mockClear();
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
    const sendLibraryPinPatched = vi.fn();

    registerLibraryCollectionIpc(
      libraryCollectionIpcContext({ setLibraryPin }, { sendLibraryPinPatched }),
    );

    const handler = ipcMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'library-pin:set',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    const input = { target: { kind: 'article', id: 'article_1' }, pinned: true };
    const result = await handler({}, input);

    expect(result).toEqual({ ok: true, value: patch });
    expect(setLibraryPin).toHaveBeenCalledWith(input);
    expect(sendLibraryPinPatched).toHaveBeenCalledWith(patch);
  });
});

type LibraryCollectionIpcContext = Parameters<typeof registerLibraryCollectionIpc>[0];
type CollectionPersistence = Awaited<
  ReturnType<LibraryCollectionIpcContext['getPersistenceModule']>
>['collectionPersistence'];

function libraryCollectionIpcContext(
  persistenceOverrides: Partial<CollectionPersistence>,
  contextOverrides: Partial<LibraryCollectionIpcContext>,
): LibraryCollectionIpcContext {
  return {
    getPersistenceModule: async () => ({
      collectionPersistence: {
        addCollectionMembers: vi.fn(),
        createCollection: vi.fn(),
        deleteCollection: vi.fn(),
        listDistillationLibrary: vi.fn(),
        listLibraryCatalog: vi.fn(),
        listCollections: vi.fn(),
        listLibraryPins: vi.fn(),
        removeCollectionMember: vi.fn(),
        renameCollection: vi.fn(),
        setLibraryPin: vi.fn(),
        ...persistenceOverrides,
      },
    }),
    sendCollectionPatched: vi.fn(),
    sendLibraryPinPatched: vi.fn(),
    ...contextOverrides,
  };
}
