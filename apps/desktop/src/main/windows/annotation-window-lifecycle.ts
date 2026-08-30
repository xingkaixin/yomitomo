import {
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron';
import type { WindowAnimationSourceRect } from '../../ipc-contract';
import { mainPath } from '../app/main-paths';
import type { DesktopMainIpcContext } from '../ipc/ipc';
import { sendDesktopIpcRendererEvent } from '../ipc/ipc-events';
import { secureRendererWebPreferences } from './renderer-window-security';
import { installRendererNavigationGuard } from './renderer-navigation';
import {
  appendWindowAnimationSourceSearchParams,
  installWindowCloseAnimation,
  windowAnimationSourceFromInput,
  windowAnimationSourceQuery,
} from './window-animation-source';

const DEFERRED_WINDOW_CLOSE_DELAY_MS = 0;

export const annotationWindowRoutes = {
  discussion: 'annotation-discussion',
  sedimentation: 'annotation-sedimentation',
} as const;

type AnnotationWindowRoute = (typeof annotationWindowRoutes)[keyof typeof annotationWindowRoutes];

type AnnotationWindowIdentity = {
  articleId: string;
  annotationId: string;
};

type AnnotationWindowOpenInput = AnnotationWindowIdentity & {
  thoughtDraft?: string;
  sourceRect?: WindowAnimationSourceRect;
};

type AnnotationWindowDimensions = Required<
  Pick<BrowserWindowConstructorOptions, 'height' | 'minHeight' | 'minWidth' | 'width'>
>;

export type AnnotationWindowIpcContext = Pick<
  DesktopMainIpcContext,
  'getMainWindow' | 'openExternalUrl' | 'registerRendererStateEventTarget'
>;

export type AnnotationWindowConfiguration<Input extends AnnotationWindowOpenInput> = {
  route: AnnotationWindowRoute;
  dimensions: AnnotationWindowDimensions;
  initialTitle: (input: Input) => string;
  installDomainEvents?: (
    context: AnnotationWindowIpcContext,
    input: Input,
    window: BrowserWindow,
  ) => void;
  onRemoved?: (context: AnnotationWindowIpcContext, input: Input, windowId: number) => void;
};

type AnnotationWindowEntry = AnnotationWindowIdentity & {
  route: AnnotationWindowRoute;
  window: BrowserWindow;
  pendingThoughtDraft: string | null;
  finalize: () => void;
};

const annotationWindows = new Map<string, AnnotationWindowEntry>();

export function openAnnotationWindow<Input extends AnnotationWindowOpenInput>(
  context: AnnotationWindowIpcContext,
  event: IpcMainInvokeEvent,
  input: Input,
  configuration: AnnotationWindowConfiguration<Input>,
) {
  const key = annotationWindowKey(configuration.route, input);
  const existing = annotationWindows.get(key);
  if (existing && !existing.window.isDestroyed()) {
    if (input.thoughtDraft !== undefined) {
      if (existing.pendingThoughtDraft !== null) {
        throw new Error('A thought draft is already awaiting delivery');
      }
      existing.pendingThoughtDraft = input.thoughtDraft;
      sendDesktopIpcRendererEvent(
        existing.window.webContents,
        'annotation-discussion:thought-draft-available',
      );
    }
    restoreAndFocus(existing.window);
    return { reused: true, windowId: existing.window.id };
  }
  if (existing) removeDestroyedWindow(key, existing);

  const window = new BrowserWindow({
    ...configuration.dimensions,
    show: false,
    autoHideMenuBar: true,
    fullscreenable: false,
    frame: true,
    backgroundColor: '#ffffff',
    hasShadow: true,
    title: configuration.initialTitle(input),
    icon: mainPath('../../resources/icon.png'),
    webPreferences: secureRendererWebPreferences(),
  });
  const unregisterRendererStateTarget = context.registerRendererStateEventTarget(
    'annotation',
    window.webContents,
  );
  let isFinalized = false;
  const entry: AnnotationWindowEntry = {
    articleId: input.articleId,
    annotationId: input.annotationId,
    route: configuration.route,
    window,
    pendingThoughtDraft: input.thoughtDraft ?? null,
    finalize: () => {
      if (isFinalized) return;
      isFinalized = true;
      unregisterRendererStateTarget();
      configuration.onRemoved?.(context, input, window.id);
    },
  };
  annotationWindows.set(key, entry);

  installWindowCloseAnimation(window);
  window.once('ready-to-show', () => {
    if (window.isDestroyed()) return;
    window.show();
    window.focus();
  });
  window.on('closed', () => {
    const current = annotationWindows.get(key);
    if (current?.window === window) annotationWindows.delete(key);
    entry.finalize();
  });
  installRendererNavigationGuard(window.webContents, context.openExternalUrl);
  configuration.installDomainEvents?.(context, input, window);

  const animationSource = windowAnimationSourceFromInput(event, window, input.sourceRect);
  void loadAnnotationWindow(window, configuration.route, input, animationSource).catch(() => {
    if (!window.isDestroyed()) window.close();
  });

  return { reused: false, windowId: window.id };
}

export function consumeAnnotationThoughtDraft(sender: WebContents): string | null {
  for (const entry of annotationWindows.values()) {
    if (
      entry.route !== annotationWindowRoutes.discussion ||
      entry.window.webContents !== sender ||
      entry.window.isDestroyed()
    ) {
      continue;
    }
    const draft = entry.pendingThoughtDraft;
    entry.pendingThoughtDraft = null;
    return draft;
  }
  return null;
}

export function closeAnnotationWindow(
  route: AnnotationWindowRoute,
  input: AnnotationWindowIdentity,
) {
  const key = annotationWindowKey(route, input);
  const entry = annotationWindows.get(key);
  if (!entry) return 0;
  annotationWindows.delete(key);
  if (entry.window.isDestroyed()) {
    entry.finalize();
    return 0;
  }
  entry.window.close();
  return 1;
}

export function scheduleCloseAnnotationWindow(
  route: AnnotationWindowRoute,
  input: AnnotationWindowIdentity,
  fallbackWindow: BrowserWindow | null,
) {
  const key = annotationWindowKey(route, input);
  const entry = annotationWindows.get(key);
  const window = entry?.window || fallbackWindow;
  if (!window || window.isDestroyed()) {
    if (entry) {
      annotationWindows.delete(key);
      entry.finalize();
    }
    return 0;
  }
  if (entry) annotationWindows.delete(key);
  setTimeout(() => {
    if (!window.isDestroyed()) window.close();
  }, DEFERRED_WINDOW_CLOSE_DELAY_MS);
  return 1;
}

export function minimizeOtherAnnotationWindows(
  route: AnnotationWindowRoute,
  input: AnnotationWindowIdentity,
) {
  let minimized = 0;
  for (const [key, entry] of annotationWindows) {
    if (
      entry.route !== route ||
      entry.articleId !== input.articleId ||
      entry.annotationId === input.annotationId
    ) {
      continue;
    }
    if (entry.window.isDestroyed()) {
      annotationWindows.delete(key);
      entry.finalize();
      continue;
    }
    if (entry.window.isMinimized()) continue;
    minimized += 1;
    entry.window.minimize();
  }
  return minimized;
}

export function closeArticleAnnotationWindows(route: AnnotationWindowRoute, articleId: string) {
  let closed = 0;
  for (const [key, entry] of annotationWindows) {
    if (entry.route !== route || entry.articleId !== articleId) continue;
    annotationWindows.delete(key);
    if (entry.window.isDestroyed()) {
      entry.finalize();
      continue;
    }
    closed += 1;
    entry.window.close();
  }
  return closed;
}

function removeDestroyedWindow(key: string, entry: AnnotationWindowEntry) {
  annotationWindows.delete(key);
  entry.finalize();
}

function restoreAndFocus(window: BrowserWindow) {
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
}

function loadAnnotationWindow(
  window: BrowserWindow,
  route: AnnotationWindowRoute,
  input: AnnotationWindowIdentity,
  animationSource?: ReturnType<typeof windowAnimationSourceFromInput>,
) {
  const query = {
    window: route,
    articleId: input.articleId,
    annotationId: input.annotationId,
  };
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    appendWindowAnimationSourceSearchParams(url.searchParams, animationSource);
    return window.loadURL(url.toString());
  }
  return window.loadFile(mainPath('../renderer/index.html'), {
    query: {
      ...query,
      ...windowAnimationSourceQuery(animationSource),
    },
  });
}

function annotationWindowKey(route: AnnotationWindowRoute, input: AnnotationWindowIdentity) {
  return `${route}:${input.articleId}:${input.annotationId}`;
}
