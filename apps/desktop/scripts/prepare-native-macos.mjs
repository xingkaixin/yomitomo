import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

if (process.platform !== 'darwin') process.exit(0);

const require = createRequire(import.meta.url);
const desktopRoot = dirname(import.meta.dirname);
const electronNativeRoot = join(desktopRoot, 'electron-native');

const nativeModules = [
  electronNativePath('better-sqlite3', 'build/Release/better_sqlite3.node'),
  nativePath('@napi-rs/keyring-darwin-arm64', 'keyring.darwin-arm64.node'),
].filter((file) => file && existsSync(file));

for (const file of nativeModules) {
  removeXattr(file, 'com.apple.quarantine');
  removeXattr(file, 'com.apple.provenance');
  execFileSync('codesign', ['--force', '--sign', '-', file], { stdio: 'ignore' });
  console.log(`prepared native addon: ${file}`);
}

function nativePath(packageName, relativePath) {
  try {
    return join(dirname(require.resolve(`${packageName}/package.json`)), relativePath);
  } catch {
    return null;
  }
}

function electronNativePath(packageName, relativePath) {
  return join(electronNativeRoot, 'node_modules', packageName, relativePath);
}

function removeXattr(file, name) {
  try {
    execFileSync('xattr', ['-d', name, file], { stdio: 'ignore' });
  } catch {
    // The attribute is optional and may be protected or absent.
  }
}
