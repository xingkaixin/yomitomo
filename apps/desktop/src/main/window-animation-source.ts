import { BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type { WindowAnimationSourceRect } from '../ipc-contract';

const WINDOW_CLOSE_ANIMATION_MS = 150;

export function installWindowCloseAnimation(window: BrowserWindow) {
  let forceClose = false;
  let closing = false;

  window.on('close', (event) => {
    if (forceClose || window.isDestroyed()) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    window.webContents.send('annotation-window:closing');
    setTimeout(() => {
      if (window.isDestroyed()) return;
      forceClose = true;
      window.close();
    }, WINDOW_CLOSE_ANIMATION_MS);
  });
}

export function windowAnimationSourceFromInput(
  event: IpcMainInvokeEvent,
  targetWindow: BrowserWindow,
  sourceRect: WindowAnimationSourceRect | undefined,
) {
  if (!sourceRect || !isValidWindowAnimationSourceRect(sourceRect)) return undefined;
  const sourceWindow = BrowserWindow.fromWebContents(event.sender);
  if (!sourceWindow || sourceWindow.isDestroyed()) return undefined;

  const sourceBounds = sourceWindow.getContentBounds();
  const targetBounds = targetWindow.getContentBounds();
  return {
    x: sourceBounds.x + sourceRect.x - targetBounds.x,
    y: sourceBounds.y + sourceRect.y - targetBounds.y,
    width: sourceRect.width,
    height: sourceRect.height,
  };
}

export function appendWindowAnimationSourceSearchParams(
  searchParams: URLSearchParams,
  source: WindowAnimationSourceRect | undefined,
) {
  for (const [key, value] of Object.entries(windowAnimationSourceQuery(source))) {
    searchParams.set(key, value);
  }
}

export function windowAnimationSourceQuery(
  source: WindowAnimationSourceRect | undefined,
): Record<string, string> {
  if (!source) return {};
  return {
    animationSourceX: String(Math.round(source.x)),
    animationSourceY: String(Math.round(source.y)),
    animationSourceWidth: String(Math.round(source.width)),
    animationSourceHeight: String(Math.round(source.height)),
  };
}

function isValidWindowAnimationSourceRect(rect: WindowAnimationSourceRect) {
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width >= 0 &&
    rect.height >= 0
  );
}
