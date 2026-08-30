import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const desktopRoot = process.argv[2] ? resolve(process.argv[2]) : dirname(import.meta.dirname);
const requiredFiles = [
  'dist/main/index.js',
  'dist/main/article-import-worker.js',
  'dist/main/reading-memory-embedding-worker.js',
  'dist/main/reading-memory-embedding-service.js',
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

const embeddingWorker = await readFile(
  join(desktopRoot, 'dist/main/reading-memory-embedding-worker.js'),
  'utf8',
);
if (!/\bimport\s*\(\s*["']@huggingface\/transformers["']\s*\)/.test(embeddingWorker)) {
  throw new Error(
    'Embedding worker must keep Transformers external to preserve native runtime paths',
  );
}
const embeddingService = await import(
  pathToFileURL(join(desktopRoot, 'dist/main/reading-memory-embedding-service.js')).href
);
if (typeof embeddingService.createReadingMemoryEmbeddingService !== 'function') {
  throw new Error('Desktop dist is missing the embedding service factory export');
}

for (const directory of ['dist/main', 'dist/preload', 'dist/renderer']) {
  await rejectFixtureOutputs(join(desktopRoot, directory));
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

async function rejectFixtureOutputs(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await rejectFixtureOutputs(path);
    } else if (/\.(?:js|cjs|mjs)$/.test(entry.name)) {
      const code = await readFile(path, 'utf8');
      if (
        /YOMITOMO_READING_MEMORY_FIXTURE_|YOMITOMO_FIXTURE_NETWORK_BLOCKED|reading-memory-fixture-worker/.test(
          code,
        )
      ) {
        throw new Error(`Production dist contains reading memory fixture code: ${path}`);
      }
    }
  }
}
