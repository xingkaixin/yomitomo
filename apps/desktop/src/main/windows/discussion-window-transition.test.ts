import type { BrowserWindow, NativeImage } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

const logInfoMock = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
}));

vi.mock('../app/logger', () => ({
  logInfo: logInfoMock,
}));

import {
  respondToDiscussionWindowTransition,
  transitionDiscussionWindow,
} from './discussion-window-transition';

type Listener = (...args: unknown[]) => void;

class FakeBrowserWindow {
  static nextId = 1;

  readonly id = FakeBrowserWindow.nextId++;
  destroyed = false;
  visible = true;
  minimized = false;
  contentBounds = { x: 100, y: 100, width: 800, height: 600 };
  readonly listeners = new Map<string, Listener[]>();

  readonly webContents = {
    send: vi.fn(),
    getZoomFactor: vi.fn(() => 1),
    capturePage: vi.fn<() => Promise<NativeImage>>(),
  };

  readonly show = vi.fn(() => {
    this.visible = true;
    this.emit('show');
  });
  readonly hide = vi.fn(() => {
    this.visible = false;
    this.emit('hide');
  });
  readonly restore = vi.fn(() => {
    this.minimized = false;
    this.emit('restore');
  });
  readonly moveTop = vi.fn();
  readonly focus = vi.fn(() => this.emit('focus'));

  once(event: string, listener: Listener) {
    const wrapped: Listener = (...args) => {
      this.removeListener(event, wrapped);
      listener(...args);
    };
    this.listeners.set(event, [...(this.listeners.get(event) || []), wrapped]);
    return this;
  }

  removeListener(event: string, listener: Listener) {
    this.listeners.set(
      event,
      (this.listeners.get(event) || []).filter((item) => item !== listener),
    );
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    const handlers = (this.listeners.get(event) || []).slice();
    for (const listener of handlers) listener(...args);
  }

  isDestroyed() {
    return this.destroyed;
  }

  isVisible() {
    return this.visible;
  }

  isMinimized() {
    return this.minimized;
  }

  getContentBounds() {
    return this.contentBounds;
  }
}

const identity = { articleId: 'article-1', annotationId: 'annotation-1' };
const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

afterEach(() => {
  setPlatform(originalPlatform);
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('discussion window transition', () => {
  it('restores a hidden discussion directly on Windows without capturing the hidden window', async () => {
    setPlatform('win32');
    const host = new FakeBrowserWindow();
    const discussion = new FakeBrowserWindow();
    discussion.visible = false;

    await transitionDiscussionWindow(
      host as unknown as BrowserWindow,
      discussion as unknown as BrowserWindow,
      'restore',
      identity,
    );

    expect(discussion.webContents.capturePage).not.toHaveBeenCalled();
    expect(discussion.show).toHaveBeenCalledOnce();
    expect(discussion.moveTop).toHaveBeenCalledOnce();
    expect(discussion.focus).toHaveBeenCalledOnce();
    expect(discussion.isVisible()).toBe(true);
    expect(host.webContents.send).toHaveBeenCalledWith('annotation-discussion:window-state', {
      type: 'upsert',
      window: {
        ...identity,
        windowId: discussion.id,
        minimized: false,
      },
    });
  });

  it('aborts an in-flight minimize on Windows when restoring from the capsule', async () => {
    setPlatform('win32');
    const host = new FakeBrowserWindow();
    const discussion = new FakeBrowserWindow();
    discussion.webContents.capturePage.mockReturnValue(new Promise<NativeImage>(() => {}));

    const minimizing = transitionDiscussionWindow(
      host as unknown as BrowserWindow,
      discussion as unknown as BrowserWindow,
      'minimize',
      identity,
    );
    const restoring = transitionDiscussionWindow(
      host as unknown as BrowserWindow,
      discussion as unknown as BrowserWindow,
      'restore',
      identity,
    );

    await Promise.all([minimizing, restoring]);

    expect(discussion.hide).not.toHaveBeenCalled();
    expect(discussion.show).toHaveBeenCalled();
    expect(discussion.moveTop).toHaveBeenCalled();
    expect(discussion.focus).toHaveBeenCalled();
    expect(discussion.isVisible()).toBe(true);
  });

  it('falls back after a hanging capturePage instead of locking future restores', async () => {
    vi.useFakeTimers();
    setPlatform('darwin');
    const host = new FakeBrowserWindow();
    const discussion = new FakeBrowserWindow();
    discussion.visible = false;
    discussion.webContents.capturePage.mockReturnValue(new Promise<NativeImage>(() => {}));

    const firstRestore = transitionDiscussionWindow(
      host as unknown as BrowserWindow,
      discussion as unknown as BrowserWindow,
      'restore',
      identity,
    );

    const measureCall = discussion.webContents.send.mock.calls.find(
      ([channel]) => channel === 'annotation-discussion:transition',
    );
    expect(measureCall).toBeDefined();
    const transitionId = (measureCall![1] as { transitionId: number }).transitionId;
    void respondToDiscussionWindowTransition(discussion as unknown as BrowserWindow, {
      type: 'measured',
      windowId: discussion.id,
      transitionId,
      view: { width: 800, background: 'rgb(255, 255, 255)', quote: null },
    });

    await vi.advanceTimersByTimeAsync(1000);
    await firstRestore;

    expect(discussion.show).toHaveBeenCalledOnce();
    expect(discussion.focus).toHaveBeenCalledOnce();
    expect(discussion.isVisible()).toBe(true);
    expect(logInfoMock).toHaveBeenCalledWith(
      'discussion.transition.capture_timeout',
      expect.objectContaining({ windowId: discussion.id, direction: 'restore' }),
    );

    // The transition slot must be released so the window can minimize again later.
    discussion.webContents.capturePage.mockResolvedValue({
      isEmpty: () => true,
      toDataURL: () => '',
    } as NativeImage);
    const nextMinimize = transitionDiscussionWindow(
      host as unknown as BrowserWindow,
      discussion as unknown as BrowserWindow,
      'minimize',
      identity,
    );
    await vi.advanceTimersByTimeAsync(1000);
    await nextMinimize;
    expect(discussion.hide).toHaveBeenCalledOnce();
  });

  it('settles OS-minimized windows immediately without capturing or animating', async () => {
    setPlatform('win32');
    const host = new FakeBrowserWindow();
    const discussion = new FakeBrowserWindow();
    discussion.minimized = true;

    await transitionDiscussionWindow(
      host as unknown as BrowserWindow,
      discussion as unknown as BrowserWindow,
      'minimize',
      identity,
    );

    expect(discussion.webContents.capturePage).not.toHaveBeenCalled();
    expect(discussion.restore).toHaveBeenCalledOnce();
    expect(discussion.hide).toHaveBeenCalledOnce();
    expect(discussion.isMinimized()).toBe(false);
    expect(discussion.isVisible()).toBe(false);
  });
});
