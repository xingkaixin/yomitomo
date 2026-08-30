import { createHash } from 'node:crypto';
import { createWriteStream, renameSync } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReadingMemoryModelLifecycle } from './reading-memory-model-lifecycle';
import type { ReadingMemoryModelManifest } from './reading-memory-model-manifest';

type LifecycleOptions = Parameters<typeof createReadingMemoryModelLifecycle>[0];
type ModelRequest = NonNullable<LifecycleOptions['request']>;
type ModelResponse = Awaited<ReturnType<ModelRequest>>;

const platform = 'test-platform';
const modelBytes = Buffer.from('small reading memory model payload');
const modelFile = {
  path: 'model.bin',
  url: 'https://models.test/model.bin',
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
  manifestUrl: 'https://models.test/manifest.json',
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
    await expect(resumedManager.download()).resolves.toMatchObject({ status: 'available' });

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

  it('preserves a partial file when a full fallback response is invalid', async () => {
    const partialBytes = modelBytes.subarray(0, 13);
    await seedPartialModel(partialBytes);
    const manager = createManager({
      request: createRequest(({ headers }) => {
        expect(headers.Range).toBe(`bytes=${partialBytes.byteLength}-`);
        return response(modelBytes, modelBytes.byteLength - 1);
      }),
    });

    await expect(manager.download()).resolves.toMatchObject({
      status: 'failed',
      failure: 'integrity',
      resumeBytes: partialBytes.byteLength,
    });
    expect(await readFile(partialModelPath())).toEqual(partialBytes);
  });

  it('preserves a partial file when retrying after 416 fails', async () => {
    const partialBytes = modelBytes.subarray(0, 7);
    await seedPartialModel(partialBytes);
    let fileRequestCount = 0;
    const manager = createManager({
      request: createRequest(({ headers }) => {
        fileRequestCount += 1;
        if (headers.Range) return response(Buffer.alloc(0), 0, 416);
        throw new Error('full retry failed');
      }),
    });

    await expect(manager.download()).resolves.toMatchObject({
      status: 'failed',
      failure: 'network',
      resumeBytes: partialBytes.byteLength,
    });
    expect(fileRequestCount).toBe(2);
    expect(await readFile(partialModelPath())).toEqual(partialBytes);
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

  it('rejects manifest bytes before parsing when the trust anchor does not match', async () => {
    const parseManifest = vi.fn(() => manifest);
    const request: ModelRequest = async () =>
      response(Buffer.alloc(manifestBytes.byteLength, 0x78), manifestBytes.byteLength);
    const manager = createManager({ request, parseManifest });

    await expect(manager.download()).resolves.toMatchObject({
      status: 'failed',
      failure: 'integrity',
    });
    expect(parseManifest).not.toHaveBeenCalled();
    expect(await pathExists(finalDirectory())).toBe(false);
  });

  it('classifies ENOSPC as storage failure and retries the download', async () => {
    let failNextWrite = true;
    const manager = createManager({
      request: createRequest(),
      createFileWriteStream: (path, flags) => {
        if (failNextWrite) {
          failNextWrite = false;
          return new Writable({
            write(_chunk, _encoding, callback) {
              callback(Object.assign(new Error('disk full'), { code: 'ENOSPC' }));
            },
          });
        }
        return createWriteStream(path, { flags });
      },
    });

    await expect(manager.download()).resolves.toMatchObject({
      status: 'failed',
      failure: 'storage',
    });
    expect(await pathExists(finalDirectory())).toBe(false);

    await expect(manager.download()).resolves.toMatchObject({ status: 'available' });
    expect(await readFile(finalModelPath())).toEqual(modelBytes);
  });

  it('closes the response safely when opening the destination fails', async () => {
    const abortedResponse = new Readable({
      read() {},
      destroy(_error, callback) {
        callback(Object.assign(new Error('response aborted'), { code: 'UND_ERR_ABORTED' }));
      },
    });
    const manager = createManager({
      request: createRequest(() => response(abortedResponse, modelBytes.byteLength)),
      createFileWriteStream: () => {
        throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      },
    });

    await expect(manager.download()).resolves.toMatchObject({
      status: 'failed',
      failure: 'storage',
    });
    expect(abortedResponse.destroyed).toBe(true);
  });

  it('shares one in-flight download between concurrent callers', async () => {
    const requestedUrls: string[] = [];
    const request = createRequest(undefined, requestedUrls);
    const manager = createManager({ request });

    const first = manager.download();
    const second = manager.download();

    expect(first).toBe(second);
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ status: 'available' }),
      expect.objectContaining({ status: 'available' }),
    ]);
    expect(requestedUrls).toEqual([release.manifestUrl, modelFile.url]);
  });

  it('runs a trailing scan when restore reconciliation arrives during a scan', async () => {
    const reconciliations: Array<Record<string, unknown> | undefined> = [];
    let restoredReconcile: Promise<unknown> | undefined;
    let manager!: ReturnType<typeof createReadingMemoryModelLifecycle>;
    manager = createManager({
      request: createRequest(),
      logInfo: (event, data) => {
        if (event !== 'reading_memory.model_reconciled') return;
        reconciliations.push(data);
        if (data?.reason !== 'startup') return;
        renameSync(finalDirectory(), join(userDataPath, 'externally-moved-model'));
        restoredReconcile = manager.reconcile('database-restored');
      },
    });
    await expect(manager.download()).resolves.toMatchObject({ status: 'available' });

    const startupReconcile = manager.reconcile('startup');

    await expect(startupReconcile).resolves.toMatchObject({
      status: 'not-installed',
      resumeBytes: 0,
    });
    expect(restoredReconcile).toBe(startupReconcile);
    expect(reconciliations).toEqual([
      { reason: 'startup', status: 'available' },
      { reason: 'database-restored', status: 'not-installed' },
    ]);
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

  it('cancels an active download and removes only its model directories', async () => {
    await writeUserDataSentinels();
    const partialBytes = modelBytes.subarray(0, 9);
    const stalled = deferred<void>();
    const manager = createManager({
      request: createRequest(({ signal }) =>
        response(stalledBody(partialBytes, signal, stalled.resolve), modelBytes.byteLength),
      ),
    });

    const download = manager.download();
    await stalled.promise;
    await vi.waitFor(async () => {
      expect((await stat(partialModelPath())).size).toBe(partialBytes.byteLength);
    });

    await expect(manager.remove()).resolves.toMatchObject({
      status: 'not-installed',
      resumeBytes: 0,
    });
    await download;

    expect(await pathExists(finalDirectory())).toBe(false);
    expect(await pathExists(partialDirectory())).toBe(false);
    await expectUserDataSentinels();
  });

  it('stops reporting availability after installed files are damaged externally', async () => {
    const manager = createManager({ request: createRequest() });
    await expect(manager.download()).resolves.toMatchObject({ status: 'available' });
    await writeFile(finalModelPath(), Buffer.alloc(modelBytes.byteLength, 0x78));

    await expect(manager.reconcile('external-change')).resolves.toMatchObject({
      status: 'failed',
      failure: 'integrity',
    });
    expect(manager.getState().status).not.toBe('available');
  });

  it('classifies incomplete and invalid installation directories as integrity failures', async () => {
    const manager = createManager();
    await mkdir(finalDirectory(), { recursive: true });

    await expect(manager.reconcile('missing-manifest')).resolves.toMatchObject({
      status: 'failed',
      failure: 'integrity',
    });

    await rm(finalDirectory(), { recursive: true, force: true });
    await writeFile(finalDirectory(), 'not a directory');
    await expect(manager.reconcile('invalid-directory')).resolves.toMatchObject({
      status: 'failed',
      failure: 'integrity',
    });
  });

  it.each(['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT'])(
    'classifies %s request timeouts and allows a retry',
    async (timeoutCode) => {
      let timeout = true;
      const successfulRequest = createRequest();
      const request: ModelRequest = async (url, options) => {
        if (timeout) {
          throw Object.assign(new Error('headers timeout'), {
            code: timeoutCode,
          });
        }
        return successfulRequest(url, options);
      };
      const manager = createManager({ request });

      await expect(manager.download()).resolves.toMatchObject({
        status: 'failed',
        failure: 'timeout',
        resumeBytes: 0,
      });

      timeout = false;
      await expect(manager.download()).resolves.toMatchObject({ status: 'available' });
    },
  );

  it('classifies a body timeout while streaming a model file', async () => {
    const timedOutBody = new Readable({
      read() {
        this.destroy(Object.assign(new Error('body timeout'), { code: 'UND_ERR_BODY_TIMEOUT' }));
      },
    });
    const manager = createManager({
      request: createRequest(() => response(timedOutBody, modelBytes.byteLength)),
    });

    await expect(manager.download()).resolves.toMatchObject({
      status: 'failed',
      failure: 'timeout',
    });
    expect(await pathExists(finalDirectory())).toBe(false);
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
  requestedUrls: string[] = [],
): ModelRequest {
  return async (url, options) => {
    requestedUrls.push(url);
    if (url === release.manifestUrl) {
      return response(manifestBytes, manifestBytes.byteLength);
    }
    if (url !== modelFile.url) throw new Error(`Unexpected model URL: ${url}`);
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
