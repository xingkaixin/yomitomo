import type { WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import type { ArticleStorePatch, CollectionStorePatch, DesktopStore } from '@yomitomo/shared';
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

  it('keeps collection patch echo centralized until renderer actions own their results', () => {
    const dispatcher = createRendererStateEventDispatcher();
    const main = rendererTarget(1);
    dispatcher.registerTarget('main', main.webContents);
    const patch: CollectionStorePatch = {
      type: 'collection-delete',
      collectionId: 'collection_1',
    };

    dispatcher.dispatch(main.webContents, 'collection:patched', patch);

    expect(main.send).toHaveBeenCalledWith('collection:patched', patch);
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
