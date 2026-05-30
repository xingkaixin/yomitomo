import type { BrowserWindowConstructorOptions } from 'electron';

export function windowChromeOptions(): BrowserWindowConstructorOptions {
  if (process.platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
    };
  }

  if (process.platform === 'win32') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#ffffff',
        symbolColor: '#151515',
        height: 36,
      },
    };
  }

  return {
    frame: false,
  };
}
