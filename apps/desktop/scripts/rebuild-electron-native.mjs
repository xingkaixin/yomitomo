import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const desktopRoot = dirname(import.meta.dirname);
const electronNativeRoot = join(desktopRoot, 'electron-native');
const electronRebuild = join(
  desktopRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-rebuild.cmd' : 'electron-rebuild',
);

execFileSync(
  electronRebuild,
  ['-f', '-w', 'better-sqlite3', '--module-dir', '.'],
  {
    cwd: electronNativeRoot,
    stdio: 'inherit',
  },
);
