import { BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type {
  AnnotationSedimentationCommitInput,
  AnnotationSedimentationWindowOpenInput,
} from '../../ipc-contract';
import { handleDesktopIpc, type DesktopMainIpcContext } from '../ipc/ipc';
import {
  closeAnnotationDiscussionWindow,
  minimizeOtherAnnotationDiscussionWindows,
} from './annotation-discussion-window';
import { mainPath } from '../app/main-paths';
import {
  appendWindowAnimationSourceSearchParams,
  installWindowCloseAnimation,
  windowAnimationSourceFromInput,
  windowAnimationSourceQuery,
} from './window-animation-source';

type SedimentationWindowEntry = {
  articleId: string;
  annotationId: string;
  window: BrowserWindow;
};

const sedimentationWindows = new Map<string, SedimentationWindowEntry>();

export function registerAnnotationSedimentationWindowIpc(context: DesktopMainIpcContext) {
  handleDesktopIpc('annotation-sedimentation:open', (event, input) =>
    openAnnotationSedimentationWindow(context, input, event),
  );
  handleDesktopIpc('annotation-sedimentation:commit', (event, input) =>
    completeAnnotationSedimentation(context, input, BrowserWindow.fromWebContents(event.sender)),
  );
}

function openAnnotationSedimentationWindow(
  context: DesktopMainIpcContext,
  input: AnnotationSedimentationWindowOpenInput,
  event: IpcMainInvokeEvent,
) {
  const key = sedimentationWindowKey(input.articleId, input.annotationId);
  const existing = sedimentationWindows.get(key);

  if (existing && !existing.window.isDestroyed()) {
    restoreAndFocus(existing.window);
    return {
      reused: true,
      windowId: existing.window.id,
    };
  }

  const window = new BrowserWindow({
    width: 860,
    height: 700,
    minWidth: 720,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    fullscreenable: false,
    frame: true,
    backgroundColor: '#ffffff',
    hasShadow: true,
    title: sedimentationWindowInitialTitle(input),
    icon: mainPath('../../resources/icon.png'),
    webPreferences: {
      preload: mainPath('../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  sedimentationWindows.set(key, {
    articleId: input.articleId,
    annotationId: input.annotationId,
    window,
  });
  installWindowCloseAnimation(window);

  window.once('ready-to-show', () => {
    if (window.isDestroyed()) return;
    window.show();
    window.focus();
  });
  window.on('closed', () => {
    const current = sedimentationWindows.get(key);
    if (current?.window === window) sedimentationWindows.delete(key);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    void context.openExternalUrl(url).catch(() => undefined);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (navigationEvent, url) => {
    if (isSameRendererNavigation(window.webContents.getURL(), url)) return;
    navigationEvent.preventDefault();
    void context.openExternalUrl(url).catch(() => undefined);
  });

  const animationSource = windowAnimationSourceFromInput(event, window, input.sourceRect);

  void loadSedimentationWindow(window, input, animationSource).catch(() => {
    if (!window.isDestroyed()) window.close();
  });

  return {
    reused: false,
    windowId: window.id,
  };
}

function restoreAndFocus(window: BrowserWindow) {
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
}

function completeAnnotationSedimentation(
  context: DesktopMainIpcContext,
  input: AnnotationSedimentationCommitInput,
  sourceWindow: BrowserWindow | null,
) {
  const closedDiscussion = closeAnnotationDiscussionWindow(context, input);
  const minimized =
    minimizeOtherAnnotationDiscussionWindows(context, input) +
    minimizeOtherSedimentationWindows(input);
  const closedSedimentation = scheduleCloseSedimentationWindow(input, sourceWindow);
  notifyDistillationCommitted(context, input);
  restoreMainWindow(context);
  return {
    closed: closedDiscussion + closedSedimentation,
    minimized,
  };
}

function scheduleCloseSedimentationWindow(
  input: AnnotationSedimentationWindowOpenInput,
  sourceWindow: BrowserWindow | null,
) {
  const key = sedimentationWindowKey(input.articleId, input.annotationId);
  const entry = sedimentationWindows.get(key);
  const window = entry?.window || sourceWindow;
  if (!window || window.isDestroyed()) {
    sedimentationWindows.delete(key);
    return 0;
  }
  sedimentationWindows.delete(key);
  setTimeout(() => {
    if (!window.isDestroyed()) window.close();
  }, 0);
  return 1;
}

function minimizeOtherSedimentationWindows(input: AnnotationSedimentationWindowOpenInput) {
  let minimized = 0;
  for (const [key, entry] of sedimentationWindows) {
    if (entry.articleId !== input.articleId || entry.annotationId === input.annotationId) continue;
    if (entry.window.isDestroyed()) {
      sedimentationWindows.delete(key);
      continue;
    }
    if (entry.window.isMinimized()) continue;
    minimized += 1;
    entry.window.minimize();
  }
  return minimized;
}

function notifyDistillationCommitted(
  context: DesktopMainIpcContext,
  input: AnnotationSedimentationCommitInput,
) {
  const mainWindow = context.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('annotation-distillation:committed', input);
}

function restoreMainWindow(context: DesktopMainIpcContext) {
  const mainWindow = context.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function loadSedimentationWindow(
  window: BrowserWindow,
  { annotationId, articleId }: AnnotationSedimentationWindowOpenInput,
  animationSource?: ReturnType<typeof windowAnimationSourceFromInput>,
) {
  const route = {
    window: 'annotation-sedimentation',
    articleId,
    annotationId,
  };

  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL);
    for (const [key, value] of Object.entries(route)) url.searchParams.set(key, value);
    appendWindowAnimationSourceSearchParams(url.searchParams, animationSource);
    return window.loadURL(url.toString());
  }

  return window.loadFile(mainPath('../renderer/index.html'), {
    query: {
      ...route,
      ...windowAnimationSourceQuery(animationSource),
    },
  });
}

function sedimentationWindowKey(articleId: string, annotationId: string) {
  return `${articleId}:${annotationId}`;
}

function sedimentationWindowInitialTitle({ annotationId }: AnnotationSedimentationWindowOpenInput) {
  return `沉淀 - ${annotationId.slice(0, 8)}`;
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
