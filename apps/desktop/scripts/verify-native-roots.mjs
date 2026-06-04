import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const desktopRoot = dirname(import.meta.dirname);
const requireFromDesktop = createRequire(join(desktopRoot, 'package.json'));
const electronNativeRoot = join(desktopRoot, 'electron-native');

verifyNodeRoot();
verifyElectronRoot();
verifyBuilderConfig();

function verifyNodeRoot() {
  const packagePath = requireFromDesktop.resolve('better-sqlite3/package.json');
  const addonPath = join(dirname(packagePath), 'build/Release/better_sqlite3.node');

  if (!existsSync(addonPath)) {
    throw new Error(`Workspace better-sqlite3 native addon is missing: ${addonPath}`);
  }

  smokeSQLite(requireFromDesktop('better-sqlite3'));
  console.log(`verified workspace better-sqlite3: ${addonPath}`);
}

function verifyElectronRoot() {
  const packagePath = join(electronNativeRoot, 'node_modules/better-sqlite3/package.json');
  const addonPath = join(
    electronNativeRoot,
    'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
  );

  if (!existsSync(packagePath)) {
    throw new Error(`Electron native root is missing better-sqlite3: ${packagePath}`);
  }
  if (!existsSync(addonPath)) {
    throw new Error(`Electron better-sqlite3 native addon is missing: ${addonPath}`);
  }

  const electron = join(
    desktopRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron.cmd' : 'electron',
  );

  execFileSync(
    electron,
    [
      '-e',
      `
const { createRequire } = require('node:module');
const Database = createRequire(${JSON.stringify(packagePath)})('better-sqlite3');
const db = new Database(':memory:');
const row = db.prepare('select 1 as ok').get();
db.close();
if (row.ok !== 1) throw new Error('Electron better-sqlite3 smoke failed');
`,
    ],
    {
      cwd: desktopRoot,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'inherit',
    },
  );

  console.log(`verified Electron better-sqlite3: ${addonPath}`);
}

function verifyBuilderConfig() {
  const config = requireFromDesktop('./electron-builder.config.cjs');
  const files = Array.isArray(config.files) ? config.files : [];
  const extraResources = Array.isArray(config.extraResources) ? config.extraResources : [];

  if (!files.includes('!node_modules/better-sqlite3/**')) {
    throw new Error('electron-builder must exclude workspace node_modules/better-sqlite3/**');
  }

  const hasNativePackage = extraResources.some(
    (entry) => entry?.from === 'electron-native' && entry?.to === 'electron-native',
  );
  const hasNativeNodeModules = extraResources.some(
    (entry) =>
      entry?.from === 'electron-native/node_modules' &&
      entry?.to === 'electron-native/node_modules',
  );

  if (!hasNativePackage || !hasNativeNodeModules) {
    throw new Error('electron-builder must package electron-native and its node_modules');
  }

  console.log('verified electron-builder native root inputs');
}

function smokeSQLite(Database) {
  const db = new Database(':memory:');
  const row = db.prepare('select 1 as ok').get();
  db.close();

  if (row.ok !== 1) throw new Error('better-sqlite3 smoke failed');
}
