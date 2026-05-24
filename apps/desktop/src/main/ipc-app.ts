import { BrowserWindow, ipcMain } from 'electron';
import type { DesktopMainIpcContext } from './ipc';
import { handleDesktopIpc } from './ipc';

export function registerAppIpc(context: DesktopMainIpcContext) {
  handleDesktopIpc('app:info', () => ({ desktopVersion: context.getAppVersion() }));
  ipcMain.on('app:renderer-ready', (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    if (browserWindow && !browserWindow.isDestroyed()) {
      context.recordStartupTiming('window.show');
      browserWindow.show();
    }
  });
  handleDesktopIpc('performance:timing', (_event, input) => context.recordPerformanceTiming(input));
  handleDesktopIpc('url:open', (_event, value) => context.openExternalUrl(value));
}
