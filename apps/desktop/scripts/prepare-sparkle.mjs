import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

export const sparkleVersion = '2.10.0';
export const sparkleRoot = join(dirname(import.meta.dirname), '.cache', 'sparkle');

export function prepareSparkle() {
  if (process.platform !== 'darwin') throw new Error('Sparkle packaging requires macOS');
  const archive = join(sparkleRoot, `Sparkle-${sparkleVersion}.tar.xz`);
  mkdirSync(sparkleRoot, { recursive: true });
  if (!existsSync(archive)) {
    execFileSync(
      'curl',
      [
        '--fail',
        '--location',
        '--retry',
        '3',
        '--output',
        archive,
        `https://github.com/sparkle-project/Sparkle/releases/download/${sparkleVersion}/Sparkle-${sparkleVersion}.tar.xz`,
      ],
      { stdio: 'inherit' },
    );
  }
  const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
  if (digest !== 'c2bf58aa8387266ac179357b1415d6f2635f044da8be41042af32425dae6da0c') {
    throw new Error('Sparkle distribution checksum mismatch');
  }
  execFileSync('tar', ['-xJf', archive, '-C', sparkleRoot]);
  return sparkleRoot;
}

if (process.argv[1] === import.meta.filename) {
  prepareSparkle();
  const desktopRoot = dirname(import.meta.dirname);
  const require = createRequire(join(desktopRoot, 'package.json'));
  const electronVersion = require('electron/package.json').version;
  const arch =
    process.argv.find((argument) => argument.startsWith('--arch='))?.slice(7) || process.arch;
  if (arch !== 'arm64' && arch !== 'x64')
    throw new Error(`Unsupported Sparkle architecture: ${arch}`);
  const headers = join(homedir(), '.electron-gyp', electronVersion, 'include', 'node');
  if (!existsSync(join(headers, 'node_api.h'))) {
    throw new Error('Electron headers missing; run the desktop build first');
  }
  execFileSync(
    'clang++',
    [
      '-std=c++17',
      '-shared',
      '-fobjc-arc',
      '-fblocks',
      '-mmacosx-version-min=12.0',
      '-arch',
      arch === 'x64' ? 'x86_64' : arch,
      '-undefined',
      'dynamic_lookup',
      '-I',
      headers,
      '-F',
      sparkleRoot,
      '-framework',
      'Cocoa',
      '-framework',
      'Sparkle',
      '-Wl,-rpath,@loader_path/../Frameworks',
      join(desktopRoot, 'native', 'sparkle.mm'),
      '-o',
      join(sparkleRoot, 'sparkle.node'),
    ],
    { stdio: 'inherit' },
  );
}
