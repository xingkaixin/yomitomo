#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const consumerManifests = [
  'apps/desktop/package.json',
  'packages/ai/package.json',
  'packages/core/package.json',
];
const sourceRoots = ['apps/desktop/src', 'packages/ai/src', 'packages/core/src'];
const migrationDocument = 'docs/effect-v4-runtime.md';
const exactBetaPattern = /^4\.0\.0-beta\.\d+$/;
const effectImportPattern = /\bfrom\s*['"]effect['"]/;
const effectApiPattern = /\b(?:Cause|Deferred|Effect|Exit|Fiber|Semaphore)\.[A-Za-z_$][\w$]*/g;
const retiredApis = ['Effect.async', 'Effect.catchAll', 'Effect.fork', 'Effect.makeSemaphore'];
const violations = [];

function readRepositoryFile(path) {
  return readFileSync(join(repositoryRoot, path), 'utf8');
}

function sourceFiles(path) {
  const entries = readdirSync(join(repositoryRoot, path), { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [entryPath] : [];
  });
}

const consumerVersions = consumerManifests.map((manifestPath) => {
  const manifest = JSON.parse(readRepositoryFile(manifestPath));
  const version = manifest.dependencies?.effect;
  if (typeof version !== 'string' || !exactBetaPattern.test(version)) {
    violations.push(`${manifestPath}: effect must use an exact 4.0.0-beta.x version`);
  }
  return { manifestPath, version };
});
const versions = new Set(consumerVersions.map(({ version }) => version));
if (versions.size !== 1) {
  violations.push(
    `Effect consumers must use one version: ${consumerVersions
      .map(({ manifestPath, version }) => `${manifestPath}=${String(version)}`)
      .join(', ')}`,
  );
}
const [effectVersion] = versions;

const lockfileVersions = new Set(
  Array.from(
    readRepositoryFile('pnpm-lock.yaml').matchAll(/^  effect@([^:\s]+):\s*$/gm),
    (match) => match[1],
  ),
);
if (lockfileVersions.size !== 1 || !lockfileVersions.has(effectVersion)) {
  violations.push(
    `pnpm-lock.yaml must resolve only effect@${String(effectVersion)}; found ${
      [...lockfileVersions].join(', ') || 'none'
    }`,
  );
}

const files = sourceRoots.flatMap(sourceFiles);
const productionEffectFiles = [];
const productionApis = new Set();
for (const file of files) {
  const source = readRepositoryFile(file);
  for (const api of retiredApis) {
    const pattern = new RegExp(`\\b${api.replace('.', '\\.')}\\b`);
    if (pattern.test(source)) {
      const line = source.slice(0, source.search(pattern)).split('\n').length;
      violations.push(`${file}:${line}: retired Effect v3 API ${api}`);
    }
  }
  if (/\.test\.[cm]?[jt]sx?$/.test(file) || !effectImportPattern.test(source)) continue;
  productionEffectFiles.push(file);
  for (const match of source.matchAll(effectApiPattern)) productionApis.add(match[0]);
}

const migrationSource = readRepositoryFile(migrationDocument);
const documentedVersion = migrationSource.match(/^Pinned Effect version: `([^`]+)`$/m)?.[1];
if (documentedVersion !== effectVersion) {
  violations.push(
    `${migrationDocument}: pinned version must be ${String(effectVersion)}, found ${String(documentedVersion)}`,
  );
}
const documentedModuleCount = Number(
  migrationSource.match(/^Production Effect modules: `(\d+)`$/m)?.[1],
);
if (documentedModuleCount !== productionEffectFiles.length) {
  violations.push(
    `${migrationDocument}: production module count must be ${productionEffectFiles.length}, found ${String(documentedModuleCount)}`,
  );
}
const documentedApis =
  migrationSource
    .match(/^Production API inventory: `([^`]+)`$/m)?.[1]
    .split(',')
    .filter(Boolean)
    .toSorted() ?? [];
const actualApis = [...productionApis].toSorted();
if (documentedApis.join(',') !== actualApis.join(',')) {
  violations.push(
    `${migrationDocument}: production API inventory is stale\n  expected: ${actualApis.join(',')}\n  documented: ${documentedApis.join(',')}`,
  );
}

if (violations.length > 0) {
  console.error('Effect v4 boundary check failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(
  `Effect v4 boundary check passed: effect@${effectVersion}, ${productionEffectFiles.length} production modules, ${actualApis.length} APIs.`,
);
