import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReadingMemoryModelLifecycle } from './reading-memory-model-lifecycle';
import { readingMemoryModelFileUrl } from '../../reading-memory-model-sources';
import type { ReadingMemoryModelManifest } from './reading-memory-model-manifest';

type LifecycleOptions = Parameters<typeof createReadingMemoryModelLifecycle>[0];
type ModelRequest = NonNullable<LifecycleOptions['request']>;
type ModelResponse = Awaited<ReturnType<ModelRequest>>;

const platform = 'test-platform';
const modelBytes = Buffer.from('small reading memory model payload');
const modelFile = {
  path: 'model.bin',
  sizeBytes: modelBytes.byteLength,
  sha256: digest(modelBytes),
};
const manifest = {
  internalId: 'reading-memory-test-model',
  supportedPlatforms: [platform],
  distributionDownloadSizeBytes: modelFile.sizeBytes,
  artifact: { files: [modelFile] },
  legal: { files: [] },
} as unknown as ReadingMemoryModelManifest;
const manifestBytes = Buffer.from(JSON.stringify({ schemaVersion: 1, test: true }));
const release = {
  internalId: manifest.internalId,
  manifestText: manifestBytes.toString('utf8'),
  downloadSizeBytes: modelFile.sizeBytes,
  manifestSizeBytes: manifestBytes.byteLength,
  manifestSha256: digest(manifestBytes),
  distributionDownloadSizeBytes: modelFile.sizeBytes,
};

let userDataPath = '';

describe('reading memory model lifecycle', () => {
  beforeEach(async () => {
    userDataPath = await mkdtemp(join(tmpdir(), 'yomitomo-model-lifecycle-test-'));
  });

  afterEach(async () => {
    await rm(userDataPath, { recursive: true, force: true });
  });

  it.each(['..', '.', '../reading-memory-test-model', '/tmp/model'])(
    'rejects a destructive release directory %s',
    (internalId) => {
      expect(() => createManager({ release: { ...release, internalId } })).toThrow(
        'Model internal ID is not a safe path segment',
      );
    },
  );

  it('keeps partial bytes after cancellation and resumes them with a new manager', async () => {
    const partialBytes = modelBytes.subarray(0, 11);
    const stalled = deferred<void>();
    const fileRequests: Array<Record<string, string>> = [];
    const request = createRequest(({ headers, signal }) => {
      fileRequests.push({ ...headers });
      if (headers.Range) return rangedModelResponse(headers.Range);
      return response(stalledBody(partialBytes, signal, stalled.resolve), modelBytes.byteLength);
    });
    const manager = createManager({ request });

    const download = manager.download();
    await stalled.promise;
    await vi.waitFor(async () => {
      expect(manager.getState()).toMatchObject({
        status: 'downloading',
        downloadedBytes: partialBytes.byteLength,
      });
      expect((await stat(partialModelPath())).size).toBe(partialBytes.byteLength);
      expect(await pathExists(finalDirectory())).toBe(false);
    });

    await expect(manager.cancelDownload()).resolves.toMatchObject({
      status: 'not-installed',
      resumeBytes: partialBytes.byteLength,
    });
    await expect(download).resolves.toMatchObject({
      status: 'not-installed',
      resumeBytes: partialBytes.byteLength,
    });
    expect(await readFile(partialModelPath())).toEqual(partialBytes);

    const resumedManager = createManager({ request });
    await expect(resumedManager.reconcile('startup')).resolves.toMatchObject({
      status: 'not-installed',
      resumeBytes: partialBytes.byteLength,
    });
    await expect(resumedManager.download('huggingface')).resolves.toMatchObject({
      status: 'available',
    });

    expect(fileRequests).toHaveLength(2);
    expect(fileRequests[1]).toMatchObject({ Range: `bytes=${partialBytes.byteLength}-` });
    expect(await readFile(finalModelPath())).toEqual(modelBytes);
    expect(await pathExists(partialDirectory())).toBe(false);

    let networkRequested = false;
    const offlineManager = createManager({
      request: async () => {
        networkRequested = true;
        throw new Error('cold-start reconciliation must stay offline');
      },
    });
    await expect(offlineManager.reconcile('cold-start')).resolves.toMatchObject({
      status: 'available',
      directory: finalDirectory(),
    });
    expect(networkRequested).toBe(false);
  });

  it('does not publish a file with a bad digest and allows a clean retry', async () => {
    let corrupt = true;
    const wrongBytes = Buffer.alloc(modelBytes.byteLength, 0x78);
    const request = createRequest(() =>
      response(corrupt ? wrongBytes : modelBytes, modelBytes.byteLength),
    );
    const manager = createManager({ request });

    await expect(manager.download()).resolves.toMatchObject({
      status: 'failed',
      failure: 'integrity',
      resumeBytes: 0,
    });
    expect(await pathExists(finalDirectory())).toBe(false);
    expect(await pathExists(partialModelPath())).toBe(false);

    corrupt = false;
    await expect(manager.download()).resolves.toMatchObject({ status: 'available' });
    expect(await readFile(finalModelPath())).toEqual(modelBytes);
  });

  it('rejects bundled manifest bytes before parsing when the trust anchor does not match', async () => {
    const parseManifest = vi.fn(() => manifest);
    const request = vi.fn(createRequest());
    const manager = createManager({
      request,
      parseManifest,
      release: { ...release, manifestText: 'x'.repeat(manifestBytes.byteLength) },
    });

    await expect(manager.download()).resolves.toMatchObject({
      status: 'failed',
      failure: 'integrity',
    });
    expect(parseManifest).not.toHaveBeenCalled();
    expect(await pathExists(finalDirectory())).toBe(false);
  });

  it('follows the CDN redirect and preserves the resume range', async () => {
    await seedPartialModel(modelBytes.subarray(0, 11));
    const cdnUrl = 'https://cdn-lfs-cn-1.modelscope.cn/model.bin?signature=temporary';
    const request = vi.fn<ModelRequest>(async (url, options) => {
      if (!options.headers['User-Agent']) {
        return { statusCode: 403, headers: {}, body: Readable.from([]) };
      }
      if (url !== cdnUrl) {
        return { statusCode: 302, headers: { location: cdnUrl }, body: Readable.from([]) };
      }
      return rangedModelResponse(options.headers.Range);
    });
    const manager = createManager({ request });
    await expect(manager.download()).resolves.toMatchObject({ status: 'available' });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1][1].headers.Range).toBe('bytes=11-');
    expect(await readFile(finalModelPath())).toEqual(modelBytes);
  });

  it.each([
    'http://cdn-lfs-cn-1.modelscope.cn/model.bin',
    'https://modelscope.cn.attacker.example/model.bin',
    'https://user:password@huggingface.co/model.bin',
    'https://127.0.0.1/model.bin',
  ])('does not follow an untrusted model redirect to %s', async (location) => {
    const request = vi.fn<ModelRequest>(async () => ({
      statusCode: 302,
      headers: { location },
      body: Readable.from([]),
    }));
    const manager = createManager({ request });
    await expect(manager.download()).resolves.toMatchObject({
      status: 'failed',
      failure: 'network',
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(await pathExists(finalDirectory())).toBe(false);
  });

  it('removes an installed model without touching unrelated user data', async () => {
    await writeUserDataSentinels();
    const manager = createManager({ request: createRequest() });
    await expect(manager.download()).resolves.toMatchObject({ status: 'available' });

    await expect(manager.remove()).resolves.toMatchObject({
      status: 'not-installed',
      resumeBytes: 0,
    });

    expect(await pathExists(finalDirectory())).toBe(false);
    expect(await pathExists(partialDirectory())).toBe(false);
    await expectUserDataSentinels();
  });
});

function createManager(overrides: Partial<LifecycleOptions> = {}) {
  return createReadingMemoryModelLifecycle({
    userDataPath,
    platform,
    release,
    parseManifest: () => manifest,
    request: createRequest(),
    ...overrides,
  });
}

function createRequest(
  fileResponse?: (options: Parameters<ModelRequest>[1]) => ModelResponse,
): ModelRequest {
  return async (url, options) => {
    if (
      ![
        readingMemoryModelFileUrl(modelFile.path, 'modelscope'),
        readingMemoryModelFileUrl(modelFile.path, 'huggingface'),
      ].includes(url)
    )
      throw new Error(`Unexpected model URL: ${url}`);
    if (fileResponse) return fileResponse(options);
    if (options.headers.Range) return rangedModelResponse(options.headers.Range);
    return response(modelBytes, modelBytes.byteLength);
  };
}

function rangedModelResponse(range: string) {
  const match = /^bytes=(\d+)-$/.exec(range);
  if (!match) throw new Error(`Unexpected range: ${range}`);
  const offset = Number(match[1]);
  return response(modelBytes.subarray(offset), modelBytes.byteLength - offset, 206, {
    'content-range': `bytes ${offset}-${modelBytes.byteLength - 1}/${modelBytes.byteLength}`,
  });
}

function response(
  body: Uint8Array | Readable,
  contentLength: number,
  statusCode = 200,
  headers: Record<string, string> = {},
): ModelResponse {
  return {
    statusCode,
    headers: { 'content-length': String(contentLength), ...headers },
    body: body instanceof Readable ? body : Readable.from([body]),
  };
}

function stalledBody(bytes: Uint8Array, signal: AbortSignal, onChunk: () => void) {
  let sent = false;
  const body = new Readable({
    read() {
      if (sent) return;
      sent = true;
      this.push(bytes);
      onChunk();
    },
  });
  signal.addEventListener(
    'abort',
    () => {
      body.destroy(Object.assign(new Error('download aborted'), { name: 'AbortError' }));
    },
    { once: true },
  );
  return body;
}

async function writeUserDataSentinels() {
  await writeFile(join(userDataPath, 'sentinel.txt'), 'keep user data');
  const unrelatedDirectory = join(userDataPath, 'models', 'unrelated-model');
  await mkdir(unrelatedDirectory, { recursive: true });
  await writeFile(join(unrelatedDirectory, 'sentinel.txt'), 'keep unrelated model');
}

async function seedPartialModel(bytes: Uint8Array) {
  await mkdir(partialDirectory(), { recursive: true });
  await writeFile(join(partialDirectory(), 'manifest.json'), manifestBytes);
  await writeFile(partialModelPath(), bytes);
}

async function expectUserDataSentinels() {
  expect(await readFile(join(userDataPath, 'sentinel.txt'), 'utf8')).toBe('keep user data');
  expect(
    await readFile(join(userDataPath, 'models', 'unrelated-model', 'sentinel.txt'), 'utf8'),
  ).toBe('keep unrelated model');
}

function finalDirectory() {
  return join(userDataPath, 'models', release.internalId);
}

function partialDirectory() {
  return join(userDataPath, 'models', `.${release.internalId}.partial`);
}

function finalModelPath() {
  return join(finalDirectory(), modelFile.path);
}

function partialModelPath() {
  return join(partialDirectory(), modelFile.path);
}

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function digest(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
