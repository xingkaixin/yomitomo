import type { WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import type { ArticleStorePatch } from '@yomitomo/shared';
import { createRendererRoleRegistry } from './renderer-role-registry';
import { createRendererStateEventDispatcher } from './renderer-state-event-dispatcher';

vi.mock('electron', () => ({
  ipcMain: { on: vi.fn() },
}));

describe('renderer state event dispatcher', () => {
  it('sends article patches to every relevant window except the sender', () => {
    const dispatcher = createRendererStateEventDispatcher(createRendererRoleRegistry());
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
