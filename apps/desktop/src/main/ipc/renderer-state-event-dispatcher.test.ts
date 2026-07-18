import type { WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import type {
  ArticleStorePatch,
  CollectionStorePatch,
  DesktopStore,
  LibraryPinPatch,
} from '@yomitomo/shared';
import { createRendererStateEventDispatcher } from './renderer-state-event-dispatcher';

vi.mock('electron', () => ({
  ipcMain: { on: vi.fn() },
}));

describe('renderer state event dispatcher', () => {
  it('sends article patches to every relevant window except the sender', () => {
    const dispatcher = createRendererStateEventDispatcher();
    const main = rendererTarget(1);
    const sourceAnnotation = rendererTarget(2);
    const otherAnnotation = rendererTarget(3);
    dispatcher.registerTarget('main', main.webContents);
    dispatcher.registerTarget('annotation', sourceAnnotation.webContents);
    dispatcher.registerTarget('annotation', otherAnnotation.webContents);
    const patch = articlePatch();

    dispatcher.dispatch(sourceAnnotation.webContents, 'article:patched', patch);

    expect(main.send).toHaveBeenCalledWith('article:patched', patch);
    expect(sourceAnnotation.send).not.toHaveBeenCalled();
    expect(otherAnnotation.send).toHaveBeenCalledWith('article:patched', patch);
  });

  it('does not echo full store updates to their main-window sender', () => {
    const dispatcher = createRendererStateEventDispatcher();
    const main = rendererTarget(1);
    const annotation = rendererTarget(2);
    dispatcher.registerTarget('main', main.webContents);
    dispatcher.registerTarget('annotation', annotation.webContents);

    dispatcher.dispatch(main.webContents, 'store:updated', desktopStore());

    expect(main.send).not.toHaveBeenCalled();
    expect(annotation.send).not.toHaveBeenCalled();
  });

  it('sends collection patches to other main windows except the sender', () => {
    const dispatcher = createRendererStateEventDispatcher();
    const sourceMain = rendererTarget(1);
    const otherMain = rendererTarget(2);
    dispatcher.registerTarget('main', sourceMain.webContents);
    dispatcher.registerTarget('main', otherMain.webContents);
    const patch: CollectionStorePatch = {
      type: 'collection-delete',
      collectionId: 'collection_1',
    };

    dispatcher.dispatch(sourceMain.webContents, 'collection:patched', patch);

    expect(sourceMain.send).not.toHaveBeenCalled();
    expect(otherMain.send).toHaveBeenCalledWith('collection:patched', patch);
  });

  it('sends library pin patches to other main windows except the sender', () => {
    const dispatcher = createRendererStateEventDispatcher();
    const sourceMain = rendererTarget(1);
    const otherMain = rendererTarget(2);
    dispatcher.registerTarget('main', sourceMain.webContents);
    dispatcher.registerTarget('main', otherMain.webContents);
    const patch: LibraryPinPatch = {
      type: 'library-pin',
      pinned: true,
      pin: {
        targetKind: 'article',
        targetId: 'article_1',
        pinnedAt: '2026-07-18T00:00:00.000Z',
      },
    };

    dispatcher.dispatch(sourceMain.webContents, 'library-pin:patched', patch);

    expect(sourceMain.send).not.toHaveBeenCalled();
    expect(otherMain.send).toHaveBeenCalledWith('library-pin:patched', patch);
  });

  it('removes closed and explicitly unregistered targets', () => {
    const dispatcher = createRendererStateEventDispatcher();
    const closed = rendererTarget(1, true);
    const removed = rendererTarget(2);
    dispatcher.registerTarget('main', closed.webContents);
    const unregister = dispatcher.registerTarget('main', removed.webContents);
    unregister();

    dispatcher.dispatch(null, 'article:patched', articlePatch());

    expect(closed.send).not.toHaveBeenCalled();
    expect(removed.send).not.toHaveBeenCalled();
  });
});

function rendererTarget(id: number, destroyed = false) {
  const send = vi.fn();
  const webContents = {
    id,
    isDestroyed: vi.fn(() => destroyed),
    send,
  } as unknown as WebContents;
  return { send, webContents };
}

function articlePatch(): ArticleStorePatch {
  return {
    type: 'article-delete',
    articleId: 'article_1',
  };
}

function desktopStore(): DesktopStore {
  return {
    agents: [],
    articles: [],
    collectionMembers: [],
    collections: [],
    pins: [],
    providers: [],
    settings: {},
    user: {
      id: 'user_1',
      nickname: 'User',
      username: 'user',
      avatar: '',
      annotationColor: '#000000',
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
  };
}
