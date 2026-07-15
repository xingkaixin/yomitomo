import { readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const desktopRoot = process.argv[2] ? resolve(process.argv[2]) : dirname(import.meta.dirname);
const requiredFiles = [
  'dist/main/index.js',
  'dist/main/article-import-worker.js',
  'dist/preload/index.cjs',
  'dist/renderer/index.html',
];
const requiredDirectories = ['dist/main/chunks', 'dist/renderer/assets'];
const missingPaths = [];

for (const path of requiredFiles) {
  if (!(await isFile(join(desktopRoot, path)))) missingPaths.push(path);
}

for (const path of requiredDirectories) {
  if (!(await isNonEmptyDirectory(join(desktopRoot, path)))) missingPaths.push(`${path}/`);
}

if (missingPaths.length > 0) {
  throw new Error(
    `Desktop dist is missing or incomplete: ${missingPaths.join(', ')}. Run "pnpm --filter @yomitomo/desktop build" first.`,
  );
}

console.log('verified desktop dist outputs');

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function isNonEmptyDirectory(path) {
  try {
    return (await readdir(path)).length > 0;
  } catch {
    return false;
  }
}
