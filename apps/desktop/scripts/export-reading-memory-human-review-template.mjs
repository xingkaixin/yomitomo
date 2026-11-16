import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';

const desktopRoot = fileURLToPath(new URL('../', import.meta.url));
const repositoryRoot = resolve(desktopRoot, '../..');

const { values } = parseArgs({
  options: {
    db: { type: 'string' },
    queries: { type: 'string' },
    'output-dir': { type: 'string' },
    'evaluation-id': { type: 'string' },
    'system-revision': { type: 'string' },
    'model-cache': { type: 'string' },
    'allow-keyword-fallback': { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

if (!values.db || !values.queries || !values['output-dir'] || !values['evaluation-id']) {
  throw new Error(
    'Usage: --db <sqlite-path> --queries <queries.json> --output-dir <dir-outside-repo> --evaluation-id <id> [--system-revision <40-hex>] [--model-cache <dir> | --allow-keyword-fallback]',
  );
}

const dbPath = resolve(values.db);
const queriesPath = resolve(values.queries);
const outputDir = resolve(values['output-dir']);
const evaluationId = values['evaluation-id'];
const systemRevision = values['system-revision'] ?? readGitHeadRevision();
const modelCachePath = values['model-cache'] ? resolve(values['model-cache']) : undefined;
const queries = parseQueriesJson(await readFile(queriesPath, 'utf8'));

const server = await createServer({
  root: desktopRoot,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  ssr: {
    noExternal: ['electron'],
  },
  plugins: [
    {
      name: 'offline-electron-stub',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'electron') return '\0offline-electron-stub';
      },
      load(id) {
        if (id === '\0offline-electron-stub') {
          return 'export const app = { getPath() { throw new Error("Offline exporter must not access Electron userData"); } }; export default { app };';
        }
      },
    },
  ],
});

try {
  const exporter = await server.ssrLoadModule(
    './src/evaluation/reading-memory-human-review-export.ts',
  );
  const summary = await exporter.exportReadingMemoryHumanReviewTemplates({
    dbPath,
    queries,
    outputDir,
    evaluationId,
    systemRevision,
    modelCachePath,
    allowKeywordFallback: values['allow-keyword-fallback'],
    protectedInputPaths: [queriesPath],
  });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
  await server.close();
}

function readGitHeadRevision() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Failed to resolve HEAD via git rev-parse HEAD: ${result.stderr?.trim() || 'unknown error'}`,
    );
  }
  return result.stdout.trim();
}

function parseQueriesJson(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('--queries must contain valid JSON');
  }
  if (Array.isArray(parsed)) return parsed;
  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    Object.keys(parsed).length === 1 &&
    Array.isArray(parsed.queries)
  ) {
    return parsed.queries;
  }
  throw new Error('--queries must contain a JSON array or an object with a single queries array');
}
