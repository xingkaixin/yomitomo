import { describe, expect, it, vi } from 'vitest';
import type { DesktopMainIpcContext } from './ipc';
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
  it('broadcasts collection patches after creating a collection', async () => {
    ipcMocks.ipcMainHandle.mockClear();
    const patch = {
      type: 'collection-upsert' as const,
      collection: {
        id: 'collection_1',
        name: '集合',
        createdAt: '2026-06-21T00:00:00.000Z',
        updatedAt: '2026-06-21T00:00:00.000Z',
      },
    };
    const createCollection = vi.fn().mockResolvedValue({
      collection: patch.collection,
      patch,
    });
    const sendCollectionPatched = vi.fn();

    registerLibraryCollectionIpc({
      getPersistenceModule: async () => ({
        collectionPersistence: { createCollection },
      }),
      sendCollectionPatched,
    } as unknown as DesktopMainIpcContext);

    const handler = ipcMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'library-collection:create',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    const result = await handler({}, { name: '集合' });

    expect(result).toEqual({ ok: true, value: { collection: patch.collection, patch } });
    expect(createCollection).toHaveBeenCalledWith({ name: '集合' });
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

    registerLibraryCollectionIpc({
      getPersistenceModule: async () => ({
        collectionPersistence: { setLibraryPin },
      }),
      sendLibraryPinPatched,
    } as unknown as DesktopMainIpcContext);

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
