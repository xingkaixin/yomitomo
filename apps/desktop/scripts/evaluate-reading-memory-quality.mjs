import { spawnSync } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { 'model-cache': { type: 'string' }, output: { type: 'string' } },
});
if (!values['model-cache'] || !values.output) {
  throw new Error(
    'Provide --model-cache and --output; this offline runner never builds or downloads',
  );
}
const modelCache = resolve(values['model-cache']);
if (!(await stat(modelCache)).isDirectory()) throw new Error('Model cache must be a directory');
await stat(new URL('../dist/main/reading-memory-embedding-worker.js', import.meta.url));
const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
    'run',
    'src/main/reading-memory/reading-memory-semantic-quality.test.ts',
  ],
  {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: {
      ...process.env,
      YOMITOMO_READING_MEMORY_QUALITY_MODEL_CACHE: modelCache,
      YOMITOMO_READING_MEMORY_QUALITY_OUTPUT: resolve(values.output),
    },
    stdio: 'inherit',
    windowsHide: true,
    timeout: 30 * 60_000,
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
