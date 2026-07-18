import type { IpcMainInvokeEvent } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

type WindowEventHandler = (...args: unknown[]) => void;
type WindowOpenHandler = (details: { url: string }) => { action: string };
type NavigationHandler = (event: { preventDefault: () => void }, url: string) => void;

const electronMocks = vi.hoisted(() => {
  let nextWindowId = 1;
  const instances: MockBrowserWindow[] = [];

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

  return { BrowserWindow: MockBrowserWindow, instances, reset };
});

vi.mock('electron', () => ({ BrowserWindow: electronMocks.BrowserWindow }));

import {
  annotationWindowRoutes,
  openAnnotationWindow,
  type AnnotationWindowConfiguration,
  type AnnotationWindowIpcContext,
} from './annotation-window-lifecycle';

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
