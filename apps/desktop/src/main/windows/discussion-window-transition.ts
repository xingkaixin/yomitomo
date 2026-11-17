import { BrowserWindow } from 'electron';
import type {
  AnnotationDiscussionTransitionResponse,
  AnnotationDiscussionWindowState,
  AnnotationDiscussionWindowTransition,
} from '../../ipc-contract';
import { sendDesktopIpcRendererEvent } from '../ipc/ipc-events';

type Direction = 'minimize' | 'restore';
type Transition = {
  id: number;
  direction: Direction;
  operation: Promise<void>;
  reply?: (response: AnnotationDiscussionTransitionResponse | null) => void;
  mainWindow: BrowserWindow;
};
type TransitionMessage = AnnotationDiscussionWindowTransition extends infer Message
  ? Message extends AnnotationDiscussionWindowTransition
    ? Omit<Message, 'windowId' | 'transitionId'>
    : never
  : never;

const transitions = new Map<number, Transition>();
let nextTransitionId = 0;

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
  identity: Pick<AnnotationDiscussionWindowState, 'articleId' | 'annotationId'>,
): Promise<void> {
  if (window.isDestroyed()) return Promise.resolve();
  const current = transitions.get(window.id);
  if (current) {
    current.direction = direction;
    send(current.mainWindow, window.id, current, { type: 'animate', direction });
    return current.operation;
  }
  if (window.isVisible() === (direction === 'restore') && !window.isMinimized()) {
    if (direction === 'restore') window.focus();
    return Promise.resolve();
  }
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !mainWindow.isVisible() ||
    mainWindow.isMinimized()
  ) {
    settleWindow(window, direction);
    return Promise.resolve();
  }
  const host = mainWindow;
  const transition: Transition = {
    id: ++nextTransitionId,
    direction,
    operation: Promise.resolve(),
    mainWindow: host,
  };
  transitions.set(window.id, transition);
  const closed = () => transition.reply?.(null);
  window.once('closed', closed);
  transition.operation = perform().finally(() => {
    window.removeListener('closed', closed);
    transitions.delete(window.id);
    send(host, window.id, transition, { type: 'cancel' });
  });
  return transition.operation;

  async function perform() {
    const imagePromise = window.webContents
      .capturePage(undefined, { stayHidden: true })
      .catch(() => null);
    const measured = await exchange(transition, 'measured', () =>
      send(window, window.id, transition, { type: 'measure' }),
    );
    const image = await imagePromise;
    if (window.isDestroyed()) return;
    if (!measured || !image || image.isEmpty() || host.isDestroyed()) {
      settleWindow(window, transition.direction);
      return;
    }
    if (transition.direction === 'minimize') {
      sendDesktopIpcRendererEvent(host.webContents, 'annotation-discussion:window-state', {
        type: 'upsert',
        window: {
          articleId: identity.articleId,
          annotationId: identity.annotationId,
          windowId: window.id,
          minimized: true,
        },
      });
    }
    const mainBounds = host.getContentBounds();
    const bounds = window.getContentBounds();
    const zoom = host.webContents.getZoomFactor();
    const ready = await exchange(transition, 'ready', () =>
      send(host, window.id, transition, {
        type: 'prepare',
        direction: transition.direction,
        expanded: window.isVisible() && !window.isMinimized(),
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
    if (ready?.prepared) {
      if (transition.direction === 'minimize') settleWindow(window, 'minimize');
      await exchange(transition, 'finished', () =>
        send(host, window.id, transition, { type: 'animate', direction: transition.direction }),
      );
    }
    settleWindow(window, transition.direction);
  }
}

function exchange<Type extends AnnotationDiscussionTransitionResponse['type']>(
  transition: Transition,
  type: Type,
  deliver: () => void,
): Promise<Extract<AnnotationDiscussionTransitionResponse, { type: Type }> | null> {
  return new Promise((resolve) => {
    const finish = (response: AnnotationDiscussionTransitionResponse | null) => {
      if (response && response.type !== type) return;
      clearTimeout(timeout);
      transition.reply = undefined;
      resolve(response as Extract<AnnotationDiscussionTransitionResponse, { type: Type }> | null);
    };
    // Reloading either renderer must not leave the discussion waiting for an acknowledgement.
    const timeout = setTimeout(() => finish(null), 1000);
    transition.reply = finish;
    deliver();
  });
}

function settleWindow(window: BrowserWindow, direction: Direction) {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  if (direction === 'minimize') window.hide();
  else {
    window.show();
    window.focus();
  }
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
