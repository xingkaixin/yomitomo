import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, renameSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

if (process.platform !== 'darwin' && process.platform !== 'win32') process.exit(0);

const desktopRoot = dirname(import.meta.dirname);
const require = createRequire(join(desktopRoot, 'package.json'));
const arch =
  process.argv.find((argument) => argument.startsWith('--arch='))?.slice(7) || process.arch;
const electronVersion = require('electron/package.json').version;
const nodeGyp = createRequire(require.resolve('@electron/rebuild')).resolve(
  'node-gyp/bin/node-gyp.js',
);
const nativeRoot = join(desktopRoot, 'native/window-controls');

execFileSync(
  process.execPath,
  [
    nodeGyp,
    'rebuild',
    `--target=${electronVersion}`,
    `--arch=${arch}`,
    '--dist-url=https://www.electronjs.org/headers',
    `--devdir=${join(homedir(), '.electron-gyp')}`,
  ],
  { cwd: nativeRoot, stdio: 'inherit' },
);

const output = join(desktopRoot, '.cache/window-controls', arch);
mkdirSync(output, { recursive: true });
const temporary = join(output, 'window_controls.node.tmp');
copyFileSync(join(nativeRoot, 'build/Release/window_controls.node'), temporary);
// macOS caches code signatures by vnode; overwriting a loaded addon invalidates later loads.
renameSync(temporary, join(output, 'window_controls.node'));
