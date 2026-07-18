import type { WebContents } from 'electron';

type OpenExternalUrl = (url: string) => Promise<void>;

export function installRendererNavigationGuard(
  webContents: WebContents,
  openExternalUrl: OpenExternalUrl,
) {
  webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url).catch(() => undefined);
    return { action: 'deny' };
  });
  webContents.on('will-navigate', (event, url) => {
    if (isSameRendererNavigation(webContents.getURL(), url)) return;
    event.preventDefault();
    void openExternalUrl(url).catch(() => undefined);
  });
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
