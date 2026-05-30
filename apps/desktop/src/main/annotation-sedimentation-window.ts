import { join } from 'node:path';
import { BrowserWindow } from 'electron';
import type { AnnotationSedimentationWindowOpenInput } from '../ipc-contract';
import { handleDesktopIpc, type DesktopMainIpcContext } from './ipc';

type SedimentationWindowEntry = {
  articleId: string;
  annotationId: string;
  window: BrowserWindow;
};

const sedimentationWindows = new Map<string, SedimentationWindowEntry>();

export function registerAnnotationSedimentationWindowIpc(context: DesktopMainIpcContext) {
  handleDesktopIpc('annotation-sedimentation:open', (_event, input) =>
    openAnnotationSedimentationWindow(context, input),
  );
}

function openAnnotationSedimentationWindow(
  context: DesktopMainIpcContext,
  input: AnnotationSedimentationWindowOpenInput,
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
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
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
  window.webContents.on('will-navigate', (event, url) => {
    if (isSameRendererNavigation(window.webContents.getURL(), url)) return;
    event.preventDefault();
    void context.openExternalUrl(url).catch(() => undefined);
  });

  void loadSedimentationWindow(window, input).catch(() => {
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

function loadSedimentationWindow(
  window: BrowserWindow,
  { annotationId, articleId }: AnnotationSedimentationWindowOpenInput,
) {
  const route = {
    window: 'annotation-sedimentation',
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
