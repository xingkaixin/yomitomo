import { app, type BaseWindow, type BrowserWindow } from 'electron';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mainPath } from '../app/main-paths';

type NativeWindowControls = {
  install: (handle: Buffer, onMinimize: () => void) => void;
  uninstall: (handle: Buffer) => void;
  requestMinimize: (handle: Buffer) => void;
};

const windows = new Map<number, { controls: NativeWindowControls; handle: Buffer }>();

export function installNativeWindowMinimize(window: BrowserWindow, onMinimize: () => void) {
  if (process.platform !== 'darwin' && process.platform !== 'win32') return;
  const path = app.isPackaged
    ? join(process.resourcesPath, 'window_controls.node')
    : mainPath('../../.cache/window-controls', process.arch, 'window_controls.node');
  const controls = createRequire(import.meta.url)(path) as NativeWindowControls;
  const handle = window.getNativeWindowHandle();
  controls.install(handle, onMinimize);
  windows.set(window.id, { controls, handle });
  window.once('closed', () => {
    windows.delete(window.id);
    controls.uninstall(handle);
  });
}

export function minimizeWindowFromMenu(window: BaseWindow) {
  const native = windows.get(window.id);
  if (native) native.controls.requestMinimize(native.handle);
  else window.minimize();
}
