import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import releaseManifest from '../../../download/model-releases/reading-memory-embedding-v1/manifest.json';
import { createReadingMemoryEmbeddingService } from '../../src/main/reading-memory/reading-memory-embedding-service';
import { createReadingMemoryModelLifecycle as createModelLifecycle } from '../../src/main/reading-memory/reading-memory-model-lifecycle';
import type { ReadingMemoryModelManifest } from '../../src/main/reading-memory/reading-memory-model-manifest';
import { createReadingMemorySemanticIndex as createSemanticIndex } from '../../src/main/reading-memory/reading-memory-semantic-index';

type LifecycleOptions = Parameters<typeof createModelLifecycle>[0];
type ModelRequest = NonNullable<LifecycleOptions['request']>;
type FixtureScenario = 'available' | 'not-installed' | 'download-failed' | 'embedding-failed';

const modelBytes = Buffer.from('RD-973 fixture bytes; this is not an ONNX model.\n'.repeat(256));
const modelUrl = 'https://reading-memory-fixture.invalid/model.bin';
const manifestUrl = 'https://reading-memory-fixture.invalid/manifest.json';
const manifest = {
  ...releaseManifest,
  internalId: 'reading-memory-fixture-v1',
  supportedPlatforms: ['darwin-arm64', 'win32-x64', 'linux-x64'],
  artifact: {
    ...releaseManifest.artifact,
    downloadSizeBytes: modelBytes.byteLength,
    files: [
      {
        path: 'onnx/model_q4.onnx',
        url: modelUrl,
        sizeBytes: modelBytes.byteLength,
        sha256: digest(modelBytes),
      },
    ],
  },
  legal: { downloadSizeBytes: 0, files: [] },
  distributionDownloadSizeBytes: modelBytes.byteLength,
} as unknown as ReadingMemoryModelManifest;
const manifestJson = JSON.stringify(manifest);
const manifestBytes = Buffer.from(manifestJson);
const release = {
  internalId: manifest.internalId,
  manifestUrl,
  manifestSizeBytes: manifestBytes.byteLength,
  manifestSha256: digest(manifestBytes),
  distributionDownloadSizeBytes: modelBytes.byteLength,
};

export function createReadingMemoryModelLifecycle(
  options: LifecycleOptions,
): ReturnType<typeof createModelLifecycle> {
  const scenario = fixtureScenario();
  const lifecycle = createModelLifecycle({
    ...options,
    release,
    parseManifest(value) {
      if (JSON.stringify(value) !== manifestJson) throw new Error('Unknown fixture manifest');
      return manifest;
    },
    request: (url, requestOptions) => {
      if (scenario === 'download-failed') {
        return Promise.reject(new Error('Controlled model download failure'));
      }
      return requestFixtureAsset(url, requestOptions);
    },
  });
  let installOnFirstReconcile = scenario !== 'not-installed' && scenario !== 'download-failed';

  return {
    ...lifecycle,
    async reconcile(reason) {
      const install = installOnFirstReconcile;
      installOnFirstReconcile = false;
      const state = await lifecycle.reconcile(reason);
      return install && state.status === 'not-installed' ? lifecycle.download() : state;
    },
  };
}

export function createReadingMemorySemanticIndex(
  options: Parameters<typeof createSemanticIndex>[0],
): ReturnType<typeof createSemanticIndex> {
  const scenario = fixtureScenario();
  return createSemanticIndex({
    ...options,
    createEmbedding: (installation) =>
      createReadingMemoryEmbeddingService(installation, {
        createProcess: (workerUrl, processOptions) =>
          fork(
            new URL('reading-memory-fixture-worker.js', workerUrl),
            scenario === 'embedding-failed' ? ['--embedding-failed'] : [],
            processOptions,
          ),
      }),
  });
}

const requestFixtureAsset: ModelRequest = async (url, { headers, signal }) => {
  signal.throwIfAborted();
  const bytes = url === manifestUrl ? manifestBytes : url === modelUrl ? modelBytes : null;
  if (!bytes) throw new Error('Fixture transport refuses unknown URLs');
  const range = headers.Range;
  const match = range?.match(/^bytes=(\d+)-$/);
  const offset = match ? Number(match[1]) : 0;
  if (range && (!match || !Number.isSafeInteger(offset) || offset >= bytes.byteLength)) {
    return { statusCode: 416, headers: { 'content-length': '0' }, body: Readable.from([]) };
  }
  return {
    statusCode: range ? 206 : 200,
    headers: {
      'content-length': String(bytes.byteLength - offset),
      ...(range
        ? { 'content-range': `bytes ${offset}-${bytes.byteLength - 1}/${bytes.byteLength}` }
        : {}),
    },
    body: Readable.from(streamBytes(bytes, offset, signal)),
  };
};

async function* streamBytes(bytes: Buffer, offset: number, signal: AbortSignal) {
  for (let position = offset; position < bytes.byteLength; position += 1024) {
    signal.throwIfAborted();
    yield bytes.subarray(position, position + 1024);
    await delay(5, undefined, { signal });
  }
}

function fixtureScenario(): FixtureScenario {
  const scenario = process.env.YOMITOMO_READING_MEMORY_FIXTURE_SCENARIO ?? 'available';
  if (
    scenario === 'available' ||
    scenario === 'not-installed' ||
    scenario === 'download-failed' ||
    scenario === 'embedding-failed'
  ) {
    return scenario;
  }
  throw new Error('Unknown reading memory fixture scenario');
}

function digest(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}
