import type { IpcMainInvokeEvent } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

type WindowEventHandler = (...args: unknown[]) => void;
type WindowOpenHandler = (details: { url: string }) => { action: string };
type NavigationHandler = (event: { preventDefault: () => void }, url: string) => void;

const electronMocks = vi.hoisted(() => {
  let nextWindowId = 1;
  const instances: MockBrowserWindow[] = [];
  const ipcMainHandle = vi.fn();

  class MockBrowserWindow {
    static fromWebContents = vi.fn(() => null);

    readonly id = nextWindowId++;
    readonly handlers = new Map<string, WindowEventHandler[]>();
    readonly navigationHandlers = new Map<string, NavigationHandler>();
    readonly options: unknown;
    destroyed = false;
    minimized = false;
    visible = true;
    windowOpenHandler: WindowOpenHandler | undefined;

    readonly webContents = {
      send: vi.fn(),
      getURL: vi.fn(() => 'file:///app/index.html?window=annotation-discussion'),
      setWindowOpenHandler: vi.fn((handler: WindowOpenHandler) => {
        this.windowOpenHandler = handler;
      }),
      on: vi.fn((event: string, handler: NavigationHandler) => {
        this.navigationHandlers.set(event, handler);
        return this.webContents;
      }),
    };

    readonly loadFile = vi.fn().mockResolvedValue(undefined);
    readonly loadURL = vi.fn().mockResolvedValue(undefined);
    readonly restore = vi.fn(() => {
      this.minimized = false;
      this.emit('restore');
    });
    readonly show = vi.fn(() => {
      this.visible = true;
      this.emit('show');
    });
    readonly focus = vi.fn(() => this.emit('focus'));
    readonly minimize = vi.fn(() => {
      this.minimized = true;
      this.emit('minimize');
    });
    readonly close = vi.fn(() => {
      this.destroyed = true;
      this.emit('closed');
    });

    constructor(options: unknown) {
      this.options = options;
      instances.push(this);
    }

    once(event: string, handler: WindowEventHandler) {
      this.handlers.set(event, [...(this.handlers.get(event) || []), handler]);
      return this;
    }

    on(event: string, handler: WindowEventHandler) {
      this.handlers.set(event, [...(this.handlers.get(event) || []), handler]);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      for (const handler of this.handlers.get(event) || []) handler(...args);
    }

    isDestroyed() {
      return this.destroyed;
    }

    isMinimized() {
      return this.minimized;
    }

    isVisible() {
      return this.visible;
    }
  }

  function reset() {
    for (const window of instances) {
      if (!window.destroyed) window.emit('closed');
    }
    instances.length = 0;
    nextWindowId = 1;
  }

  return { BrowserWindow: MockBrowserWindow, instances, ipcMainHandle, reset };
});

vi.mock('electron', () => ({
  BrowserWindow: electronMocks.BrowserWindow,
  ipcMain: { handle: electronMocks.ipcMainHandle },
}));

import {
  annotationWindowRoutes,
  closeAnnotationWindow,
  consumeAnnotationThoughtDraft,
  openAnnotationWindow,
  type AnnotationWindowConfiguration,
  type AnnotationWindowIpcContext,
} from './annotation-window-lifecycle';
import { registerAnnotationDiscussionWindowIpc } from './annotation-discussion-window';

type TestWindowInput = {
  articleId: string;
  annotationId: string;
};

const configuration = {
  route: annotationWindowRoutes.discussion,
  dimensions: {
    width: 920,
    height: 680,
    minWidth: 720,
    minHeight: 520,
  },
  initialTitle: ({ annotationId }) => `Discussion - ${annotationId}`,
} satisfies AnnotationWindowConfiguration<TestWindowInput>;

afterEach(() => {
  electronMocks.reset();
  vi.clearAllMocks();
});

describe('annotation window lifecycle', () => {
  it('retains a new draft until its own discussion window consumes it, not until ready-to-show', () => {
    const { context } = createContext();
    const input = {
      articleId: 'article-1',
      annotationId: 'annotation-1',
      thoughtDraft: 'A draft from the reading library',
    };
    openAnnotationWindow(context, { sender: {} } as IpcMainInvokeEvent, input, configuration);
    const window = electronMocks.instances[0];
    const sender = window.webContents as unknown as IpcMainInvokeEvent['sender'];
    const unrelated = {} as IpcMainInvokeEvent['sender'];

    window.emit('ready-to-show');
    expect(consumeAnnotationThoughtDraft(unrelated)).toBeNull();
    expect(consumeAnnotationThoughtDraft(sender)).toBe(input.thoughtDraft);
    expect(consumeAnnotationThoughtDraft(sender)).toBeNull();
    expect(window.loadFile).toHaveBeenCalledWith(expect.any(String), {
      query: {
        articleId: input.articleId,
        annotationId: input.annotationId,
        window: annotationWindowRoutes.discussion,
      },
    });
    expect(window.webContents.send).not.toHaveBeenCalled();
  });

  it('notifies a reused window without broadcasting the draft and never overwrites pending text', () => {
    const { context } = createContext();
    const event = { sender: {} } as IpcMainInvokeEvent;
    const target = { articleId: 'article-1', annotationId: 'annotation-1' };
    openAnnotationWindow(context, event, target, configuration);
    const window = electronMocks.instances[0];
    const sender = window.webContents as unknown as IpcMainInvokeEvent['sender'];

    expect(
      openAnnotationWindow(
        context,
        event,
        { ...target, thoughtDraft: 'First draft' },
        configuration,
      ),
    ).toEqual({ reused: true, windowId: window.id });
    expect(window.webContents.send).toHaveBeenCalledExactlyOnceWith(
      'annotation-discussion:thought-draft-available',
    );
    expect(() =>
      openAnnotationWindow(
        context,
        event,
        { ...target, thoughtDraft: 'Second draft' },
        configuration,
      ),
    ).toThrow('A thought draft is already awaiting delivery');
    expect(consumeAnnotationThoughtDraft(sender)).toBe('First draft');
    expect(electronMocks.instances).toHaveLength(1);
  });

  it('drops a pending draft when its window closes', () => {
    const { context } = createContext();
    const event = { sender: {} } as IpcMainInvokeEvent;
    const target = { articleId: 'article-1', annotationId: 'annotation-1' };
    openAnnotationWindow(
      context,
      event,
      { ...target, thoughtDraft: 'Unsaved draft' },
      configuration,
    );
    const previous = electronMocks.instances[0];

    closeAnnotationWindow(annotationWindowRoutes.discussion, target);
    openAnnotationWindow(context, event, target, configuration);

    expect(
      consumeAnnotationThoughtDraft(
        previous.webContents as unknown as IpcMainInvokeEvent['sender'],
      ),
    ).toBeNull();
    expect(
      consumeAnnotationThoughtDraft(
        electronMocks.instances[1].webContents as unknown as IpcMainInvokeEvent['sender'],
      ),
    ).toBeNull();
  });

  it('checks the selected annotation before opening a draft and preserves the existing open result', async () => {
    const { context } = createContext();
    const readArticle = vi.fn().mockResolvedValue(null);
    registerAnnotationDiscussionWindowIpc({
      ...context,
      getPersistenceModules: vi.fn().mockResolvedValue({ storeArticles: { readArticle } }),
    });
    const open = electronMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'annotation-discussion:open',
    )?.[1];
    const consume = electronMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'annotation-discussion:consume-thought-draft',
    )?.[1];
    const input = { articleId: 'article-1', annotationId: 'annotation-1', thoughtDraft: 'Draft' };

    expect(await open({ sender: {} }, input)).toMatchObject({ ok: false });
    readArticle.mockResolvedValueOnce({ annotations: [{ id: 'another-annotation' }] });
    expect(await open({ sender: {} }, input)).toMatchObject({ ok: false });
    expect(electronMocks.instances).toHaveLength(0);

    readArticle.mockResolvedValueOnce({ annotations: [{ id: input.annotationId }] });
    const opened = await open({ sender: {} }, input);
    const window = electronMocks.instances[0];
    expect(opened).toEqual({ ok: true, value: { reused: false, windowId: window.id } });
    expect(readArticle).toHaveBeenLastCalledWith(input.articleId);
    expect(await consume({ sender: window.webContents })).toEqual({ ok: true, value: 'Draft' });
  });

  it('restores and focuses an existing window instead of creating another one', () => {
    const { context } = createContext();
    const event = { sender: {} } as IpcMainInvokeEvent;
    const input = { articleId: 'article-1', annotationId: 'annotation-1' };

    const first = openAnnotationWindow(context, event, input, configuration);
    const window = electronMocks.instances[0];
    window.minimized = true;
    window.visible = false;
    const reused = openAnnotationWindow(context, event, input, configuration);

    expect(first).toEqual({ reused: false, windowId: window.id });
    expect(reused).toEqual({ reused: true, windowId: window.id });
    expect(electronMocks.instances).toHaveLength(1);
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
  });

  it('loads the configured route and guards external navigation', () => {
    const { context, openExternalUrl } = createContext();
    const event = { sender: {} } as IpcMainInvokeEvent;
    const input = { articleId: 'article-2', annotationId: 'annotation-2' };

    openAnnotationWindow(context, event, input, configuration);
    const window = electronMocks.instances[0];

    expect(window.loadFile).toHaveBeenCalledWith(
      expect.stringMatching(/renderer[/\\]index\.html$/),
      {
        query: {
          articleId: input.articleId,
          annotationId: input.annotationId,
          window: annotationWindowRoutes.discussion,
        },
      },
    );
    expect(window.windowOpenHandler?.({ url: 'https://example.com/popup' })).toEqual({
      action: 'deny',
    });

    const navigate = window.navigationHandlers.get('will-navigate');
    const sameRendererNavigation = { preventDefault: vi.fn() };
    navigate?.(sameRendererNavigation, 'file:///app/index.html?window=annotation-sedimentation');
    expect(sameRendererNavigation.preventDefault).not.toHaveBeenCalled();

    const externalNavigation = { preventDefault: vi.fn() };
    navigate?.(externalNavigation, 'https://example.com/page');
    expect(externalNavigation.preventDefault).toHaveBeenCalledOnce();
    expect(openExternalUrl).toHaveBeenNthCalledWith(1, 'https://example.com/popup');
    expect(openExternalUrl).toHaveBeenNthCalledWith(2, 'https://example.com/page');
  });
});

function createContext() {
  const openExternalUrl = vi.fn().mockResolvedValue(undefined);
  const context = {
    getMainWindow: () => null,
    openExternalUrl,
    registerRendererStateEventTarget: vi.fn(() => vi.fn()),
  } as unknown as AnnotationWindowIpcContext;
  return { context, openExternalUrl };
}
