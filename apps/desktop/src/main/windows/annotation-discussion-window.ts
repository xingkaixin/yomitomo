import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
import type {
  AnnotationDiscussionWindowOpenInput,
  AnnotationDiscussionWindowStateEvent,
  AnnotationDiscussionWindowsCloseArticleInput,
} from '../../ipc-contract';
import { handleDesktopIpc } from '../ipc/ipc';
import { sendDesktopIpcRendererEvent } from '../ipc/ipc-events';
import {
  annotationWindowRoutes,
  closeArticleAnnotationWindows,
  openAnnotationWindow,
  type AnnotationWindowConfiguration,
  type AnnotationWindowIpcContext,
} from './annotation-window-lifecycle';

const discussionWindowConfiguration = {
  route: annotationWindowRoutes.discussion,
  dimensions: {
    width: 920,
    height: 680,
    minWidth: 720,
    minHeight: 520,
  },
  initialTitle: ({ annotationId }) => `Annotation discussion - ${annotationId.slice(0, 8)}`,
  installDomainEvents: (context, input, window) => {
    window.once('ready-to-show', () => sendWindowState(context, input, window, false));
    window.on('minimize', () => sendWindowState(context, input, window, true));
    window.on('restore', () => sendWindowState(context, input, window, false));
    window.on('show', () => sendWindowState(context, input, window, false));
    window.on('focus', () => sendWindowState(context, input, window, false));
  },
  onRemoved: (context, input, windowId) => sendWindowStateRemoved(context, input, windowId),
} satisfies AnnotationWindowConfiguration<AnnotationDiscussionWindowOpenInput>;

export function registerAnnotationDiscussionWindowIpc(context: AnnotationWindowIpcContext) {
  handleDesktopIpc('annotation-discussion:open', (event, input) =>
    openAnnotationDiscussionWindow(context, input, event),
  );
  handleDesktopIpc('annotation-discussion:close-article', (_event, input) =>
    closeArticleDiscussionWindows(input),
  );
}

function openAnnotationDiscussionWindow(
  context: AnnotationWindowIpcContext,
  input: AnnotationDiscussionWindowOpenInput,
  event: IpcMainInvokeEvent,
) {
  return openAnnotationWindow(context, event, input, discussionWindowConfiguration);
}

function sendWindowState(
  context: AnnotationWindowIpcContext,
  input: AnnotationDiscussionWindowOpenInput,
  window: BrowserWindow,
  minimized: boolean,
) {
  sendStateEvent(context, {
    type: 'upsert',
    window: {
      articleId: input.articleId,
      annotationId: input.annotationId,
      windowId: window.id,
      minimized,
    },
  });
}

function sendWindowStateRemoved(
  context: AnnotationWindowIpcContext,
  input: AnnotationDiscussionWindowOpenInput,
  windowId: number,
) {
  sendStateEvent(context, {
    type: 'remove',
    articleId: input.articleId,
    annotationId: input.annotationId,
    windowId,
  });
}

function sendStateEvent(
  context: AnnotationWindowIpcContext,
  event: AnnotationDiscussionWindowStateEvent,
) {
  const mainWindow = context.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  sendDesktopIpcRendererEvent(mainWindow.webContents, 'annotation-discussion:window-state', event);
}

function closeArticleDiscussionWindows({
  articleId,
}: AnnotationDiscussionWindowsCloseArticleInput) {
  return { closed: closeArticleAnnotationWindows(annotationWindowRoutes.discussion, articleId) };
}
