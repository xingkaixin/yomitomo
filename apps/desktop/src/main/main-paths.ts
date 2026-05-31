import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mainBundleDir = dirname(fileURLToPath(import.meta.url));

export function mainPath(...segments: string[]) {
  return join(mainBundleDir, ...segments);
}
