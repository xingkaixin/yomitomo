import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const PACKAGE_NAME = 'better-sqlite3';
const desktopRoot = dirname(import.meta.dirname);
const requireFromDesktop = createRequire(join(desktopRoot, 'package.json'));
const electronNativeRoot = join(desktopRoot, 'electron-native');
const electronNativeManifestPath = join(electronNativeRoot, 'package.json');
const electronNativeInstallPath = join(
  electronNativeRoot,
  'node_modules',
  PACKAGE_NAME,
  'package.json',
);

/**
 * The workspace install is the single authoritative version fact: unit tests and
 * workspace tooling load it, so the Electron runtime root must resolve the same
 * patch instead of shipping a second implementation.
 */
export function assertNativeSqliteVersionAligned() {
  const expected = requireFromDesktop(`${PACKAGE_NAME}/package.json`).version;
  const declared = readJson(electronNativeManifestPath).dependencies?.[PACKAGE_NAME];
  const installed = readInstalledVersion();

  const drifts = [];
  if (declared !== expected) {
    drifts.push(`${electronNativeManifestPath} declares ${declared ?? 'nothing'}`);
  }
  if (installed !== expected) {
    drifts.push(`${electronNativeInstallPath} resolves ${installed}`);
  }

  if (drifts.length > 0) {
    throw new Error(
      `${PACKAGE_NAME} version drift: workspace install resolves ${expected}, but ${drifts.join(', ')}. ` +
        `Pin the electron-native dependency to ${expected} and run pnpm --filter @yomitomo/desktop native:install.`,
    );
  }

  console.log(`verified ${PACKAGE_NAME} version fact: ${expected}`);
  return expected;
}

function readInstalledVersion() {
  if (!existsSync(electronNativeInstallPath)) {
    throw new Error(
      `Electron native root is missing ${PACKAGE_NAME}: ${electronNativeInstallPath}. ` +
        'Run pnpm --filter @yomitomo/desktop native:install.',
    );
  }

  return readJson(electronNativeInstallPath).version;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
