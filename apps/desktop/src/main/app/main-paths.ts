import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const mainBundleDir = basename(moduleDir) === 'chunks' ? dirname(moduleDir) : moduleDir;

export function mainPath(...segments: string[]) {
  return join(mainBundleDir, ...segments);
}
