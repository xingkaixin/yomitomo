import { join } from 'node:path';
import { BrowserWindow } from 'electron';
import type {
  AnnotationDiscussionWindowOpenInput,
  AnnotationDiscussionWindowStateEvent,
  AnnotationDiscussionWindowsCloseArticleInput,
} from '../ipc-contract';
import { handleDesktopIpc, type DesktopMainIpcContext } from './ipc';

type DiscussionWindowEntry = {
  articleId: string;
  annotationId: string;
  window: BrowserWindow;
};

const discussionWindows = new Map<string, DiscussionWindowEntry>();

export function registerAnnotationDiscussionWindowIpc(context: DesktopMainIpcContext) {
  handleDesktopIpc('annotation-discussion:open', (_event, input) =>
    openAnnotationDiscussionWindow(context, input),
  );
  handleDesktopIpc('annotation-discussion:close-article', (_event, input) =>
    closeArticleDiscussionWindows(input),
  );
}

function openAnnotationDiscussionWindow(
  context: DesktopMainIpcContext,
  input: AnnotationDiscussionWindowOpenInput,
) {
  const key = discussionWindowKey(input.articleId, input.annotationId);
  const existing = discussionWindows.get(key);

  if (existing && !existing.window.isDestroyed()) {
    restoreAndFocus(existing.window);
    return {
      reused: true,
      windowId: existing.window.id,
    };
  }

  const window = new BrowserWindow({
    width: 920,
    height: 680,
    minWidth: 720,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    fullscreenable: false,
    frame: true,
    backgroundColor: '#ffffff',
    hasShadow: true,
    title: discussionWindowInitialTitle(input),
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  discussionWindows.set(key, {
    articleId: input.articleId,
    annotationId: input.annotationId,
    window,
  });

  window.once('ready-to-show', () => {
    if (window.isDestroyed()) return;
    window.show();
    window.focus();
    sendWindowState(context, input, window, false);
  });
  window.on('minimize', () => sendWindowState(context, input, window, true));
  window.on('restore', () => sendWindowState(context, input, window, false));
  window.on('show', () => sendWindowState(context, input, window, false));
  window.on('focus', () => sendWindowState(context, input, window, false));
  window.on('closed', () => {
    const current = discussionWindows.get(key);
    if (current?.window === window) discussionWindows.delete(key);
    sendWindowStateRemoved(context, input, window.id);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    void context.openExternalUrl(url).catch(() => undefined);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (isSameRendererNavigation(window.webContents.getURL(), url)) return;
    event.preventDefault();
    void context.openExternalUrl(url).catch(() => undefined);
  });

  void loadDiscussionWindow(window, input).catch(() => {
    if (!window.isDestroyed()) window.close();
  });

  return {
    reused: false,
    windowId: window.id,
  };
}

function sendWindowState(
  context: DesktopMainIpcContext,
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
  context: DesktopMainIpcContext,
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
  context: DesktopMainIpcContext,
  event: AnnotationDiscussionWindowStateEvent,
) {
  const mainWindow = context.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('annotation-discussion:window-state', event);
}

function closeArticleDiscussionWindows({
  articleId,
}: AnnotationDiscussionWindowsCloseArticleInput) {
  let closed = 0;
  for (const [key, entry] of discussionWindows) {
    if (entry.articleId !== articleId) continue;
    if (entry.window.isDestroyed()) {
      discussionWindows.delete(key);
      continue;
    }
    closed += 1;
    discussionWindows.delete(key);
    entry.window.close();
  }
  return { closed };
}

function restoreAndFocus(window: BrowserWindow) {
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
}

function loadDiscussionWindow(
  window: BrowserWindow,
  { annotationId, articleId }: AnnotationDiscussionWindowOpenInput,
) {
  const route = {
    window: 'annotation-discussion',
    articleId,
    annotationId,
  };

  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL);
    for (const [key, value] of Object.entries(route)) url.searchParams.set(key, value);
    return window.loadURL(url.toString());
  }

  return window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: route,
  });
}

function discussionWindowKey(articleId: string, annotationId: string) {
  return `${articleId}:${annotationId}`;
}

function discussionWindowInitialTitle({ annotationId }: AnnotationDiscussionWindowOpenInput) {
  return `批注讨论 - ${annotationId.slice(0, 8)}`;
}

function isSameRendererNavigation(currentValue: string, nextValue: string) {
  try {
    const current = new URL(currentValue);
    const next = new URL(nextValue);
    if (current.protocol === 'file:' || next.protocol === 'file:') {
      return current.protocol === next.protocol && current.pathname === next.pathname;
    }
    return current.origin === next.origin;
  } catch {
    return false;
  }
}
