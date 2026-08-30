import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertNativeSqliteVersionAligned,
  resolveNativeSqliteBinding,
} from './native-sqlite-version.mjs';

const desktopRoot = dirname(import.meta.dirname);
const requireFromDesktop = createRequire(join(desktopRoot, 'package.json'));
const electronNativeRoot = join(desktopRoot, 'electron-native');

assertNativeSqliteVersionAligned();
verifyNodeRoot();
verifyElectronRoot();
verifyEmbeddingRuntimeRoot();
verifyBuilderConfig();

function verifyNodeRoot() {
  const packagePath = requireFromDesktop.resolve('better-sqlite3/package.json');
  const addonPath = resolveNativeSqliteBinding(packagePath);

  smokeSQLite(requireFromDesktop('better-sqlite3'));
  console.log(`verified workspace better-sqlite3: ${addonPath}`);
}

function verifyElectronRoot() {
  const packagePath = join(electronNativeRoot, 'node_modules/better-sqlite3/package.json');
  const bindingsPath = join(electronNativeRoot, 'node_modules/bindings/package.json');
  const fileUriPath = join(electronNativeRoot, 'node_modules/file-uri-to-path/package.json');
  const addonPath = resolveNativeSqliteBinding(packagePath);

  if (!existsSync(bindingsPath)) {
    throw new Error(`Electron native root is missing bindings: ${bindingsPath}`);
  }
  if (!existsSync(fileUriPath)) {
    throw new Error(`Electron native root is missing file-uri-to-path: ${fileUriPath}`);
  }
  const electron = requireFromDesktop('electron');

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
  const asarUnpack = Array.isArray(config.asarUnpack) ? config.asarUnpack : [];

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

  for (const pattern of [
    'node_modules/onnxruntime-node/bin/**',
    'node_modules/@img/sharp-*/lib/**',
    'node_modules/@img/sharp-libvips-*/lib/**',
  ]) {
    if (!asarUnpack.includes(pattern)) {
      throw new Error(`electron-builder must unpack ${pattern}`);
    }
  }
  if (!files.includes('!node_modules/onnxruntime-web/**')) {
    throw new Error('electron-builder must exclude the unused browser ONNX runtime');
  }

  console.log('verified electron-builder native root inputs');
}

function verifyEmbeddingRuntimeRoot() {
  const desktopPackage = readPackage(join(desktopRoot, 'package.json'));
  if (desktopPackage.dependencies?.['@huggingface/transformers'] !== '4.2.0') {
    throw new Error('Desktop must pin @huggingface/transformers to 4.2.0');
  }

  const transformersEntry = requireFromDesktop.resolve('@huggingface/transformers');
  const requireFromTransformers = createRequire(transformersEntry);
  const onnxRuntimeEntry = requireFromTransformers.resolve('onnxruntime-node');
  const sharpEntry = requireFromTransformers.resolve('sharp');
  const transformersRoot = dirname(dirname(transformersEntry));
  const onnxRuntimeRoot = dirname(dirname(onnxRuntimeEntry));
  const sharpRoot = dirname(dirname(sharpEntry));
  const transformersPackage = readPackage(join(transformersRoot, 'package.json'));
  const onnxRuntimePackage = readPackage(join(onnxRuntimeRoot, 'package.json'));
  const sharpPackage = readPackage(join(sharpRoot, 'package.json'));

  if (transformersPackage.version !== '4.2.0') {
    throw new Error(`Unexpected Transformers runtime: ${transformersPackage.version}`);
  }
  if (onnxRuntimePackage.version !== '1.24.3') {
    throw new Error(`Unexpected ONNX Runtime: ${onnxRuntimePackage.version}`);
  }

  const onnxRuntimeNativeRoot = join(
    onnxRuntimeRoot,
    'bin',
    'napi-v6',
    process.platform,
    process.arch,
  );
  const onnxRuntimeBinding = join(onnxRuntimeNativeRoot, 'onnxruntime_binding.node');
  if (!existsSync(onnxRuntimeBinding)) {
    throw new Error(`ONNX Runtime binding is missing: ${onnxRuntimeBinding}`);
  }

  const electron = requireFromDesktop('electron');
  execFileSync(
    electron,
    [
      '-e',
      `
(async () => {
  const transformers = await import(${JSON.stringify(pathToFileURL(transformersEntry).href)});
  const onnxRuntime = require(${JSON.stringify(onnxRuntimeEntry)});
  const sharp = require(${JSON.stringify(sharpEntry)});
  if (typeof transformers.pipeline !== 'function') throw new Error('Transformers pipeline missing');
  if (typeof onnxRuntime.InferenceSession?.create !== 'function') {
    throw new Error('ONNX Runtime session factory missing');
  }
  if (!sharp.versions?.vips) throw new Error('sharp native runtime missing');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
    ],
    {
      cwd: desktopRoot,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'inherit',
    },
  );

  console.log(
    `verified Electron embedding runtime: Transformers ${transformersPackage.version}, ONNX Runtime ${onnxRuntimePackage.version}, sharp ${sharpPackage.version}`,
  );
}

function readPackage(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function smokeSQLite(Database) {
  const db = new Database(':memory:');
  const row = db.prepare('select 1 as ok').get();
  db.close();

  if (row.ok !== 1) throw new Error('better-sqlite3 smoke failed');
}
