import { app, type BrowserWindow } from 'electron';

export function installElectronSmokeProbe(browserWindow: BrowserWindow) {
  if (process.env.YOMITOMO_ELECTRON_SMOKE !== '1') return;

  const timeout = setTimeout(() => {
    console.error('YOMITOMO_ELECTRON_SMOKE_ERROR timeout');
    app.exit(1);
  }, 15_000);
  timeout.unref?.();

  const fail = (error: unknown) => {
    clearTimeout(timeout);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`YOMITOMO_ELECTRON_SMOKE_ERROR ${message}`);
    app.exit(1);
  };

  browserWindow.webContents.once('did-fail-load', (_event, code, description) => {
    fail(new Error(`renderer load failed ${code}: ${description}`));
  });
  browserWindow.webContents.on('console-message', (event) => {
    console.error(
      `YOMITOMO_ELECTRON_SMOKE_CONSOLE ${event.level} ${event.sourceId}:${event.lineNumber} ${event.message}`,
    );
  });
  browserWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    fail(new Error(`preload failed ${preloadPath}: ${error.message}`));
  });
  browserWindow.webContents.once('render-process-gone', (_event, details) => {
    fail(new Error(`renderer process gone: ${details.reason}`));
  });
  browserWindow.webContents.once('did-finish-load', () => {
    void runElectronSmokeProbe(browserWindow)
      .then((result) => {
        clearTimeout(timeout);
        console.log(`YOMITOMO_ELECTRON_SMOKE_RESULT ${JSON.stringify(result)}`);
        app.quit();
      })
      .catch(fail);
  });
}

async function runElectronSmokeProbe(browserWindow: BrowserWindow) {
  return browserWindow.webContents.executeJavaScript(`
    (async () => {
      const waitForRendererRoot = () =>
        new Promise((resolve, reject) => {
          const deadline = Date.now() + 10000;
          const check = () => {
            const root = document.getElementById('root');
            if (root && (root.childElementCount > 0 || root.textContent.trim().length > 0)) {
              resolve(true);
              return;
            }
            if (Date.now() >= deadline) {
              reject(new Error('renderer root did not mount'));
              return;
            }
            requestAnimationFrame(check);
          };
          check();
        });
      await waitForRendererRoot();
      const api = window.yomitomoDesktop;
      if (!api) throw new Error('preload api missing');
      if (typeof api.getAppInfo !== 'function') throw new Error('getAppInfo missing');
      if (typeof api.showMainWindow !== 'function') throw new Error('showMainWindow missing');
      const appInfo = await api.getAppInfo();
      return {
        desktopVersion: appInfo?.desktopVersion ?? null,
        hasPreloadApi: true,
        hasShowMainWindow: true,
        rootHasContent: true,
      };
    })()
  `);
}
