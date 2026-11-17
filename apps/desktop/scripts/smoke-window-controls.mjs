import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { _electron as electron } from 'playwright-core';

if (process.platform !== 'darwin' && process.platform !== 'win32') {
  console.log('Native minimize interception only applies to macOS and Windows');
  process.exit(0);
}

const desktopRoot = dirname(import.meta.dirname);
const require = createRequire(import.meta.url);
const directory = await mkdtemp(join(tmpdir(), 'yomitomo-window-controls-'));
const entry = join(directory, 'main.cjs');
await writeFile(entry, "require('electron').app.whenReady();\n");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({
  executablePath: require('electron'),
  args: [entry],
  env,
});
try {
  const result = await application.evaluate(
    async ({ app, BrowserWindow }, addonPath) => {
      await app.whenReady();
      const native = process.getBuiltinModule('node:module').createRequire(addonPath)(addonPath);
      const window = new BrowserWindow({ show: false, width: 400, height: 200 });
      const handle = window.getNativeWindowHandle();
      let systemMinimizations = 0;
      window.on('minimize', () => systemMinimizations++);
      const intercepted = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Native minimize callback timed out')),
          3000,
        );
        native.install(handle, () => {
          clearTimeout(timeout);
          window.hide();
          resolve();
        });
      });
    await window.loadURL('data:text/html,<p>Native window controls check</p>');
    window.show();
    native.requestMinimize(handle);
      await intercepted;
      const collapsed = {
        enabled: window.isMinimizable(),
        visible: window.isVisible(),
        minimized: window.isMinimized(),
        systemMinimizations,
      };
      window.show();
      native.uninstall(handle);
      const minimized = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('System minimize was not restored')),
          3000,
        );
        window.once('minimize', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      native.requestMinimize(handle);
      await minimized;
      const restoredNativeBehavior = window.isMinimized() && systemMinimizations === 1;
      window.restore();
      native.install(handle, () => {});
      window.destroy();
      native.uninstall(handle);
      return { collapsed, restoredNativeBehavior };
    },
    join(desktopRoot, '.cache/window-controls', process.arch, 'window_controls.node'),
  );
  assert.deepEqual(result, {
    collapsed: { enabled: true, visible: false, minimized: false, systemMinimizations: 0 },
    restoredNativeBehavior: true,
  });
  console.log(
    `Verified native minimize interception, removal and window cleanup on ${process.platform}`,
  );
} finally {
  await application.close();
  await rm(directory, { recursive: true, force: true });
}
