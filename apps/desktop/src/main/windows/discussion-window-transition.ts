import {
  BrowserWindow,
  type HandlerDetails,
  type NativeImage,
  type Rectangle,
  type WindowOpenHandlerResponse,
} from 'electron';
import type {
  AnnotationDiscussionTransitionResponse,
  AnnotationDiscussionWindowState,
  AnnotationDiscussionWindowTransition,
} from '../../ipc-contract';
import { logInfo } from '../app/logger';
import { sendDesktopIpcRendererEvent } from '../ipc/ipc-events';

type Direction = 'minimize' | 'restore';
type TransitionIdentity = Pick<AnnotationDiscussionWindowState, 'articleId' | 'annotationId'>;
type Transition = {
  id: number;
  direction: Direction;
  operation: Promise<void>;
  reply?: (response: AnnotationDiscussionTransitionResponse | null) => void;
  abortHandlers: Set<() => void>;
  aborted: boolean;
  mainWindow: BrowserWindow;
  phase: 'preparing' | 'animating' | 'showing';
  overlay?: { name: string; bounds: Rectangle; window?: BrowserWindow };
};
type TransitionMessage = AnnotationDiscussionWindowTransition extends infer Message
  ? Message extends AnnotationDiscussionWindowTransition
    ? Omit<Message, 'windowId' | 'transitionId'>
    : never
  : never;

const TRANSITION_TIMEOUT_MS = 1000;
const transitions = new Map<number, Transition>();
let nextTransitionId = 0;

export function openDiscussionTransitionOverlay(
  host: BrowserWindow,
  { url, frameName }: HandlerDetails,
): WindowOpenHandlerResponse | undefined {
  if (url !== 'about:blank') return;
  for (const transition of transitions.values()) {
    const overlay = transition.overlay;
    if (transition.mainWindow !== host || !overlay || overlay.name !== frameName || overlay.window)
      continue;
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        ...overlay.bounds,
        parent: host,
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        hasShadow: false,
        resizable: false,
        focusable: false,
        skipTaskbar: true,
        enableLargerThanScreen: true,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          zoomFactor: host.webContents.getZoomFactor(),
          backgroundThrottling: false,
        },
      },
      createWindow(options) {
        const window = new BrowserWindow(options);
        window.setIgnoreMouseEvents(true);
        window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        window.webContents.on('will-navigate', (event) => event.preventDefault());
        overlay.window = window;
        return window.webContents;
      },
    };
  }
}

export function respondToDiscussionWindowTransition(
  sender: BrowserWindow | null,
  response: AnnotationDiscussionTransitionResponse,
) {
  const current = transitions.get(response.windowId);
  if (!current || current.id !== response.transitionId) return;
  const expectedSender = response.type === 'measured' ? response.windowId : current.mainWindow.id;
  if (sender?.id !== expectedSender) throw new Error('Unexpected transition response sender');
  current.reply?.(response);
  if (response.type === 'finished') return current.operation;
}

export function transitionDiscussionWindow(
  mainWindow: BrowserWindow | null,
  window: BrowserWindow,
  direction: Direction,
  identity: TransitionIdentity,
): Promise<void> {
  if (window.isDestroyed()) return Promise.resolve();
  const current = transitions.get(window.id);
  if (current) {
    if (isWindowsDirectRestore(direction)) {
      current.direction = 'restore';
      abortTransition(current);
      return current.operation.then(() => {
        if (!window.isDestroyed() && (!window.isVisible() || window.isMinimized())) {
          settleWindow(window, 'restore', mainWindow, identity);
        }
      });
    }
    if (current.phase === 'showing') {
      return current.operation.then(() =>
        transitionDiscussionWindow(mainWindow, window, direction, identity),
      );
    }
    current.direction = direction;
    if (current.phase === 'animating')
      send(current.mainWindow, window.id, current, { type: 'animate', direction });
    return current.operation;
  }
  if (window.isVisible() === (direction === 'restore') && !window.isMinimized()) {
    if (direction === 'restore') {
      focusRestoredWindow(window);
      notifyWindowState(mainWindow, window, identity, false);
    }
    return Promise.resolve();
  }
  if (
    isWindowsDirectRestore(direction) ||
    window.isMinimized() ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !mainWindow.isVisible() ||
    mainWindow.isMinimized()
  ) {
    settleWindow(window, direction, mainWindow, identity);
    return Promise.resolve();
  }
  const host = mainWindow;
  const transition: Transition = {
    id: ++nextTransitionId,
    direction,
    operation: Promise.resolve(),
    abortHandlers: new Set(),
    aborted: false,
    mainWindow: host,
    phase: 'preparing',
  };
  transitions.set(window.id, transition);
  const closed = () => abortTransition(transition);
  window.once('closed', closed);
  transition.operation = perform().finally(() => {
    window.removeListener('closed', closed);
    const overlay = transition.overlay?.window;
    const destroyedOverlay = Boolean(overlay && !overlay.isDestroyed());
    if (overlay && !overlay.isDestroyed()) overlay.destroy();
    transitions.delete(window.id);
    send(host, window.id, transition, { type: 'cancel' });
    if (
      destroyedOverlay &&
      transition.direction === 'restore' &&
      !window.isDestroyed() &&
      window.isVisible()
    ) {
      // Destroying an owned overlay on Windows can re-activate the main window above the discussion.
      focusRestoredWindow(window);
      notifyWindowState(host, window, identity, false);
    }
  });
  return transition.operation;

  async function perform() {
    const imagePromise = captureWindowPage(window, transition);
    const measured = await exchange(transition, 'measured', () =>
      send(window, window.id, transition, { type: 'measure' }),
    );
    const image = await imagePromise;
    if (window.isDestroyed()) return;
    if (isWindowsDirectRestore(transition.direction)) {
      settleWindow(window, 'restore', host, identity);
      return;
    }
    if (!measured || !image || image.isEmpty() || host.isDestroyed()) {
      if (!transition.aborted) {
        logInfo('discussion.transition.fallback', {
          platform: process.platform,
          direction: transition.direction,
          windowId: window.id,
          hasMeasured: Boolean(measured),
          hasImage: Boolean(image && !image.isEmpty()),
        });
      }
      settleWindow(window, transition.direction, host, identity);
      return;
    }
    if (transition.direction === 'minimize') {
      notifyWindowState(host, window, identity, true);
    }
    const mainBounds = host.getContentBounds();
    const bounds = window.getContentBounds();
    const zoom = host.webContents.getZoomFactor();
    const x = Math.min(mainBounds.x, bounds.x);
    const y = Math.min(mainBounds.y, bounds.y);
    const width = Math.max(mainBounds.x + mainBounds.width, bounds.x + bounds.width) - x;
    const height = Math.max(mainBounds.y + mainBounds.height, bounds.y + bounds.height) - y;
    if (width > mainBounds.width || height > mainBounds.height) {
      transition.overlay = {
        name: `discussion-transition-${transition.id}`,
        bounds: { x, y, width, height },
      };
    }
    const ready = await exchange(transition, 'ready', () =>
      send(host, window.id, transition, {
        type: 'prepare',
        direction: transition.direction,
        expanded: window.isVisible() && !window.isMinimized(),
        overlayName: transition.overlay?.name,
        image: image.toDataURL(),
        bounds: {
          x: (bounds.x - mainBounds.x) / zoom,
          y: (bounds.y - mainBounds.y) / zoom,
          width: bounds.width / zoom,
          height: bounds.height / zoom,
        },
        view: measured.view,
      }),
    );
    if (window.isDestroyed()) return;
    if (isWindowsDirectRestore(transition.direction)) {
      settleWindow(window, 'restore', host, identity);
      return;
    }
    if (ready?.prepared) {
      const overlay = transition.overlay?.window;
      if (overlay && !overlay.isDestroyed()) overlay.showInactive();
      transition.phase = 'animating';
      if (transition.direction === 'minimize') settleWindow(window, 'minimize', host, identity);
      await exchange(transition, 'finished', () =>
        send(host, window.id, transition, { type: 'animate', direction: transition.direction }),
      );
      if (
        !isWindowsDirectRestore(transition.direction) &&
        transition.direction === 'restore' &&
        !window.isDestroyed() &&
        !window.isVisible()
      ) {
        transition.phase = 'showing';
        await restoreWindowAndWaitForShow(window, host, identity);
        return;
      }
    }
    settleWindow(window, transition.direction, host, identity);
  }
}

function isWindowsDirectRestore(direction: Direction) {
  return process.platform === 'win32' && direction === 'restore';
}

function abortTransition(transition: Transition) {
  transition.aborted = true;
  for (const cancel of transition.abortHandlers) cancel();
}

function captureWindowPage(
  window: BrowserWindow,
  transition: Transition,
): Promise<NativeImage | null> {
  if (window.isDestroyed() || transition.aborted) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (image: NativeImage | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      transition.abortHandlers.delete(cancel);
      resolve(image);
    };
    const cancel = () => finish(null);
    // capturePage can remain pending indefinitely when a window surface is hidden or suspended.
    const timeout = setTimeout(() => {
      logInfo('discussion.transition.capture_timeout', {
        platform: process.platform,
        direction: transition.direction,
        windowId: window.id,
        visible: !window.isDestroyed() && window.isVisible(),
        minimized: !window.isDestroyed() && window.isMinimized(),
      });
      finish(null);
    }, TRANSITION_TIMEOUT_MS);
    transition.abortHandlers.add(cancel);
    window.webContents.capturePage(undefined, { stayHidden: true }).then(
      (image) => finish(image),
      () => finish(null),
    );
  });
}

function restoreWindowAndWaitForShow(
  window: BrowserWindow,
  host: BrowserWindow,
  identity: TransitionIdentity,
): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      window.removeListener('show', finish);
      window.removeListener('closed', finish);
      resolve();
    };
    // show() can return before the window manager presents the restored window.
    const timeout = setTimeout(finish, TRANSITION_TIMEOUT_MS);
    window.once('show', finish);
    window.once('closed', finish);
    settleWindow(window, 'restore', host, identity);
  });
}

function exchange<Type extends AnnotationDiscussionTransitionResponse['type']>(
  transition: Transition,
  type: Type,
  deliver: () => void,
): Promise<Extract<AnnotationDiscussionTransitionResponse, { type: Type }> | null> {
  if (transition.aborted) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (response: AnnotationDiscussionTransitionResponse | null) => {
      if (settled || (response && response.type !== type)) return;
      settled = true;
      clearTimeout(timeout);
      transition.abortHandlers.delete(cancel);
      if (transition.reply === finish) transition.reply = undefined;
      resolve(response as Extract<AnnotationDiscussionTransitionResponse, { type: Type }> | null);
    };
    const cancel = () => finish(null);
    // Reloading either renderer must not leave the discussion waiting for an acknowledgement.
    const timeout = setTimeout(() => finish(null), TRANSITION_TIMEOUT_MS);
    transition.abortHandlers.add(cancel);
    transition.reply = finish;
    deliver();
  });
}

function settleWindow(
  window: BrowserWindow,
  direction: Direction,
  host: BrowserWindow | null,
  identity: TransitionIdentity,
) {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  if (direction === 'minimize') window.hide();
  else {
    window.show();
    focusRestoredWindow(window);
    notifyWindowState(host, window, identity, false);
  }
}

function focusRestoredWindow(window: BrowserWindow) {
  if (window.isDestroyed()) return;
  window.moveTop?.();
  window.focus();
}

function notifyWindowState(
  host: BrowserWindow | null,
  window: BrowserWindow,
  identity: TransitionIdentity,
  minimized: boolean,
) {
  if (!host || host.isDestroyed() || window.isDestroyed()) return;
  sendDesktopIpcRendererEvent(host.webContents, 'annotation-discussion:window-state', {
    type: 'upsert',
    window: {
      articleId: identity.articleId,
      annotationId: identity.annotationId,
      windowId: window.id,
      minimized,
    },
  });
}

function send(
  target: BrowserWindow,
  windowId: number,
  transition: Transition,
  message: TransitionMessage,
) {
  if (target.isDestroyed()) return;
  sendDesktopIpcRendererEvent(target.webContents, 'annotation-discussion:transition', {
    ...message,
    windowId,
    transitionId: transition.id,
  });
}
