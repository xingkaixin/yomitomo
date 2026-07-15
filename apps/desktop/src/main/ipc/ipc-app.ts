import { pathToFileURL } from 'node:url';
import { BrowserWindow, ipcMain } from 'electron';
import type { DesktopMainIpcContext } from './ipc';
import { handleDesktopIpc } from './ipc';
import { onDesktopIpcMainEvent } from './ipc-events';
import { pdfiumWasmPath } from '../pdf/pdfium-resource';

type AppIpcContext = Pick<
  DesktopMainIpcContext,
  'getAppVersion' | 'openExternalUrl' | 'recordPerformanceTiming' | 'recordStartupTiming'
>;

export function registerAppIpc(context: AppIpcContext) {
  handleDesktopIpc('app:info', () => ({ desktopVersion: context.getAppVersion() }));
  ipcMain.on('app:pdfium-wasm-url', (event) => {
    event.returnValue = pathToFileURL(pdfiumWasmPath()).href;
  });
  onDesktopIpcMainEvent('app:renderer-ready', (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    if (browserWindow && !browserWindow.isDestroyed()) {
      context.recordStartupTiming('window.show');
      browserWindow.show();
    }
  });
  handleDesktopIpc('performance:timing', (_event, input) => context.recordPerformanceTiming(input));
  handleDesktopIpc('url:open', (_event, value) => context.openExternalUrl(value));
}
