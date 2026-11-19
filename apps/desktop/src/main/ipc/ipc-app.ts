import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, type SaveDialogOptions } from 'electron';
import { sanitizeMarkdownFileName } from '@yomitomo/core';
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
  handleDesktopIpc('app:capture-region', async (event, rect) => {
    const image = await event.sender.capturePage(rect);
    if (image.isEmpty()) return null;
    const scaleFactor = Math.max(...image.getScaleFactors());
    const { width, height } = image.getSize(scaleFactor);
    const bitmap = image.toBitmap({ scaleFactor });
    return {
      width,
      height,
      pixels: new Uint8Array(bitmap.buffer, bitmap.byteOffset, bitmap.byteLength),
    };
  });
  handleDesktopIpc('app:pdfium-wasm-url', () => pathToFileURL(pdfiumWasmPath()).href);
  handleDesktopIpc('app:save-markdown-file', async (event, input) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const fileName = sanitizeMarkdownFileName(input.defaultFileName);
    const options: SaveDialogOptions = {
      defaultPath: join(app.getPath('documents'), fileName),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    };
    const result =
      parentWindow && !parentWindow.isDestroyed()
        ? await dialog.showSaveDialog(parentWindow, options)
        : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { canceled: true as const };
    await writeFile(result.filePath, input.content, 'utf8');
    return { canceled: false as const, filePath: result.filePath };
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
