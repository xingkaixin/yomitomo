import { createHash, type Hash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { Transform, type Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { request as undiciRequest } from 'undici';
import {
  parseReadingMemoryModelManifest,
  readingMemoryModelFiles,
  readingMemoryModelRelease,
  type ReadingMemoryModelFile,
  type ReadingMemoryModelManifest,
} from './reading-memory-model-manifest';

const defaultRequestTimeoutMs = 5 * 60 * 1000;
const manifestFileName = 'manifest.json';
const storageErrorCodes = new Set([
  'EACCES',
  'EBUSY',
  'EDQUOT',
  'EEXIST',
  'EIO',
  'EISDIR',
  'ELOOP',
  'EMFILE',
  'ENAMETOOLONG',
  'ENFILE',
  'ENOENT',
  'ENOTDIR',
  'ENOTEMPTY',
  'ENOSPC',
  'EPERM',
  'EROFS',
]);

export type ReadingMemoryModelFailureCode =
  | 'integrity'
  | 'network'
  | 'storage'
  | 'timeout'
  | 'unsupported-platform';

type ReadingMemoryModelStateBase = {
  internalId: string;
  downloadSizeBytes: number;
};

export type ReadingMemoryModelLifecycleState =
  | (ReadingMemoryModelStateBase & { status: 'checking' })
  | (ReadingMemoryModelStateBase & { status: 'not-installed'; resumeBytes: number })
  | (ReadingMemoryModelStateBase & {
      status: 'downloading';
      downloadedBytes: number;
    })
  | (ReadingMemoryModelStateBase & {
      status: 'available';
      directory: string;
      manifest: ReadingMemoryModelManifest;
    })
  | (ReadingMemoryModelStateBase & {
      status: 'failed';
      failure: ReadingMemoryModelFailureCode;
      resumeBytes: number;
    });

export type ReadingMemoryModelLifecycle = {
  getState(): ReadingMemoryModelLifecycleState;
  reconcile(reason?: string): Promise<ReadingMemoryModelLifecycleState>;
  download(): Promise<ReadingMemoryModelLifecycleState>;
  cancelDownload(): Promise<ReadingMemoryModelLifecycleState>;
  remove(): Promise<ReadingMemoryModelLifecycleState>;
  dispose(): void;
};

type ModelRelease = {
  internalId: string;
  manifestUrl: string;
  manifestSizeBytes: number;
  manifestSha256: string;
  distributionDownloadSizeBytes: number;
};

type ModelHttpResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: Readable;
};

type ModelHttpRequest = (
  url: string,
  options: {
    headers: Record<string, string>;
    headersTimeout: number;
    bodyTimeout: number;
    signal: AbortSignal;
  },
) => Promise<ModelHttpResponse>;

export type ReadingMemoryModelLifecycleOptions = {
  userDataPath: string;
  platform?: string;
  requestTimeoutMs?: number;
  request?: ModelHttpRequest;
  createFileWriteStream?: (path: string, flags: 'a' | 'w') => Writable;
  release?: ModelRelease;
  parseManifest?: (value: unknown) => ReadingMemoryModelManifest;
  logInfo?: (event: string, data?: Record<string, unknown>) => void;
  logError?: (event: string, error: unknown, data?: Record<string, unknown>) => void;
};

type LifecycleContext = {
  release: ModelRelease;
  platform: string;
  modelRoot: string;
  finalDirectory: string;
  partialDirectory: string;
  requestTimeoutMs: number;
  request: ModelHttpRequest;
  createFileWriteStream: (path: string, flags: 'a' | 'w') => Writable;
  parseManifest: (value: unknown) => ReadingMemoryModelManifest;
  logInfo: (event: string, data?: Record<string, unknown>) => void;
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => void;
};

type Inspection =
  | { status: 'missing' }
  | { status: 'invalid'; error: unknown }
  | { status: 'available'; manifest: ReadingMemoryModelManifest };

class ModelLifecycleError extends Error {
  readonly failure: ReadingMemoryModelFailureCode;

  constructor(failure: ReadingMemoryModelFailureCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ModelLifecycleError';
    this.failure = failure;
  }
}

class ModelDownloadCanceledError extends Error {
  constructor() {
    super('Model download canceled');
    this.name = 'ModelDownloadCanceledError';
  }
}

export function createReadingMemoryModelLifecycle(
  options: ReadingMemoryModelLifecycleOptions,
): ReadingMemoryModelLifecycle {
  const release = options.release ?? readingMemoryModelRelease;
  assertSafeInternalId(release.internalId);
  const modelRoot = join(options.userDataPath, 'models');
  const context: LifecycleContext = {
    release,
    platform: options.platform ?? `${process.platform}-${process.arch}`,
    modelRoot,
    finalDirectory: join(modelRoot, release.internalId),
    partialDirectory: join(modelRoot, `.${release.internalId}.partial`),
    requestTimeoutMs: options.requestTimeoutMs ?? defaultRequestTimeoutMs,
    request: options.request ?? requestModelAsset,
    createFileWriteStream:
      options.createFileWriteStream ??
      ((path, flags) => createWriteStream(path, { flags, flush: true })),
    parseManifest: options.parseManifest ?? parseReadingMemoryModelManifest,
    logInfo: options.logInfo ?? (() => {}),
    logError: options.logError ?? (() => {}),
  };
  let state: ReadingMemoryModelLifecycleState = baseState(context, 'checking');
  let operationTail = Promise.resolve();
  let downloadPromise: Promise<ReadingMemoryModelLifecycleState> | null = null;
  let reconcilePromise: Promise<ReadingMemoryModelLifecycleState> | null = null;
  let pendingReconcileReason: string | null = null;
  let downloadController: AbortController | null = null;
  let reconcileController: AbortController | null = null;
  let disposed = false;

  const setState = (next: ReadingMemoryModelLifecycleState) => {
    if (disposed) return state;
    state = next;
    return next;
  };

  const enqueue = <T>(operation: () => Promise<T>) => {
    const result = operationTail.then(operation, operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const reconcile = (reason = 'manual') => {
    if (disposed) return Promise.resolve(state);
    pendingReconcileReason = reason;
    if (reconcilePromise) return reconcilePromise;
    const controller = new AbortController();
    reconcileController = controller;
    if (!downloadPromise) setState(baseState(context, 'checking'));
    reconcilePromise = enqueue(async () => {
      try {
        let result = state;
        while (pendingReconcileReason !== null) {
          const currentReason = pendingReconcileReason;
          pendingReconcileReason = null;
          result = await reconcileInstallation(context, currentReason, controller.signal, setState);
        }
        return result;
      } catch (error) {
        if (isCanceled(error, controller.signal)) {
          pendingReconcileReason = null;
          return state;
        }
        throw error;
      } finally {
        reconcilePromise = null;
        reconcileController = null;
      }
    });
    return reconcilePromise;
  };

  const download = () => {
    if (disposed) return Promise.resolve(state);
    if (downloadPromise) return downloadPromise;
    const controller = new AbortController();
    downloadController = controller;
    let tracked: Promise<ReadingMemoryModelLifecycleState>;
    tracked = enqueue(async () => {
      if (disposed || controller.signal.aborted) {
        return setState(notInstalledState(context, await inspectResumeBytes(context)));
      }
      try {
        const installed = await inspectInstallation(
          context,
          context.finalDirectory,
          controller.signal,
        );
        throwIfCanceled(controller.signal);
        if (installed.status === 'available') {
          return setState(availableState(context, installed.manifest));
        }
        setState(downloadingState(context, 0));
        const { bytes: manifestBytes, manifest } = await downloadManifest(
          context,
          controller.signal,
        );
        assertSupportedPlatform(context, manifest);
        await preparePartialDirectory(context);
        const partialManifestPath = join(context.partialDirectory, manifestFileName);
        await rm(partialManifestPath, { force: true });
        await writeFile(partialManifestPath, manifestBytes, { flush: true });
        await downloadModelFiles(context, manifest, controller.signal, (downloadedBytes) => {
          setState(downloadingState(context, downloadedBytes));
        });
        throwIfCanceled(controller.signal);
        await rm(context.finalDirectory, { recursive: true, force: true });
        await rename(context.partialDirectory, context.finalDirectory);
        context.logInfo('reading_memory.model_downloaded', {
          internalId: context.release.internalId,
          downloadSizeBytes: context.release.distributionDownloadSizeBytes,
        });
        return setState(availableState(context, manifest));
      } catch (error) {
        const resumeBytes = await inspectResumeBytes(context);
        if (isCanceled(error, controller.signal)) {
          context.logInfo('reading_memory.model_download_canceled', { resumeBytes });
          return setState(notInstalledState(context, resumeBytes));
        }
        const failure = modelFailure(error);
        context.logError('reading_memory.model_download_failed', error, { failure, resumeBytes });
        return setState(failedState(context, failure, resumeBytes));
      }
    }).finally(() => {
      if (downloadPromise === tracked) {
        downloadPromise = null;
        downloadController = null;
      }
    });
    downloadPromise = tracked;
    return tracked;
  };

  return {
    getState: () => state,
    reconcile,
    download,
    cancelDownload: async () => {
      const activeDownload = downloadPromise;
      downloadController?.abort();
      if (activeDownload) await activeDownload;
      return state;
    },
    remove: () => {
      downloadController?.abort();
      reconcileController?.abort();
      pendingReconcileReason = null;
      return enqueue(async () => {
        try {
          const modelRootInspection = await inspectDirectory(context.modelRoot);
          if (modelRootInspection === 'missing') {
            return setState(notInstalledState(context, 0));
          }
          if (modelRootInspection === 'invalid') {
            throw new ModelLifecycleError(
              'storage',
              `${context.modelRoot} is not a writable model directory`,
            );
          }
          await rm(context.finalDirectory, { recursive: true, force: true });
          await rm(context.partialDirectory, { recursive: true, force: true });
          context.logInfo('reading_memory.model_removed', {
            internalId: context.release.internalId,
          });
          return setState(notInstalledState(context, 0));
        } catch (error) {
          context.logError('reading_memory.model_remove_failed', error);
          return setState(failedState(context, 'storage', 0));
        }
      });
    },
    dispose: () => {
      disposed = true;
      pendingReconcileReason = null;
      downloadController?.abort();
      reconcileController?.abort();
    },
  };
}

async function reconcileInstallation(
  context: LifecycleContext,
  reason: string,
  signal: AbortSignal,
  setState: (state: ReadingMemoryModelLifecycleState) => ReadingMemoryModelLifecycleState,
) {
  const inspection = await inspectInstallation(context, context.finalDirectory, signal);
  throwIfCanceled(signal);
  if (inspection.status === 'available') {
    context.logInfo('reading_memory.model_reconciled', { reason, status: 'available' });
    return setState(availableState(context, inspection.manifest));
  }
  const resumeBytes = await inspectResumeBytes(context);
  if (inspection.status === 'invalid') {
    const failure = modelFailure(inspection.error);
    context.logError('reading_memory.model_reconcile_failed', inspection.error, {
      reason,
      failure,
    });
    return setState(failedState(context, failure, resumeBytes));
  }
  context.logInfo('reading_memory.model_reconciled', { reason, status: 'not-installed' });
  return setState(notInstalledState(context, resumeBytes));
}

async function downloadManifest(context: LifecycleContext, signal: AbortSignal) {
  const response = await requestWithFailureMapping(
    context,
    context.release.manifestUrl,
    {
      'Accept-Encoding': 'identity',
    },
    signal,
  );
  try {
    if (response.statusCode !== 200) {
      throw new ModelLifecycleError(
        'network',
        `Model manifest returned HTTP ${response.statusCode}`,
      );
    }
    assertIdentityEncoding(response);
    const contentLength = headerSafeInteger(response.headers, 'content-length');
    if (contentLength !== null && contentLength !== context.release.manifestSizeBytes) {
      throw new ModelLifecycleError('integrity', 'Model manifest length does not match');
    }
    const bytes = await readBoundedBody(response.body, context.release.manifestSizeBytes, signal);
    if (
      bytes.byteLength !== context.release.manifestSizeBytes ||
      sha256(bytes) !== context.release.manifestSha256
    ) {
      throw new ModelLifecycleError('integrity', 'Model manifest digest does not match');
    }
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (error) {
      throw new ModelLifecycleError('integrity', 'Model manifest is not valid JSON', error);
    }
    let manifest: ReadingMemoryModelManifest;
    try {
      manifest = context.parseManifest(value);
    } catch (error) {
      throw new ModelLifecycleError('integrity', 'Model manifest is invalid', error);
    }
    if (
      manifest.internalId !== context.release.internalId ||
      manifest.distributionDownloadSizeBytes !== context.release.distributionDownloadSizeBytes
    ) {
      throw new ModelLifecycleError('integrity', 'Model manifest identity does not match');
    }
    return { bytes, manifest };
  } catch (error) {
    await closeResponseBody(response.body);
    throw error;
  }
}

async function downloadModelFiles(
  context: LifecycleContext,
  manifest: ReadingMemoryModelManifest,
  signal: AbortSignal,
  reportProgress: (downloadedBytes: number) => void,
) {
  const prepared = [] as Array<{ file: ReadingMemoryModelFile; offset: number }>;
  let downloadedBytes = 0;
  for (const file of readingMemoryModelFiles(manifest)) {
    const filePath = safeModelPath(context.partialDirectory, file.path);
    await ensureSafeParentDirectory(context.partialDirectory, filePath);
    const offset = await preparePartialFile(filePath, file, signal);
    downloadedBytes = safeAdd(downloadedBytes, offset);
    prepared.push({ file, offset });
  }
  reportProgress(downloadedBytes);

  for (const item of prepared) {
    throwIfCanceled(signal);
    if (item.offset === item.file.sizeBytes) continue;
    const before = item.offset;
    downloadedBytes = await downloadModelFile(
      context,
      item.file,
      before,
      downloadedBytes,
      signal,
      reportProgress,
    );
  }
  if (downloadedBytes !== manifest.distributionDownloadSizeBytes) {
    throw new ModelLifecycleError('integrity', 'Installed model size does not match the manifest');
  }
}

async function downloadModelFile(
  context: LifecycleContext,
  file: ReadingMemoryModelFile,
  initialOffset: number,
  initialDownloadedBytes: number,
  signal: AbortSignal,
  reportProgress: (downloadedBytes: number) => void,
): Promise<number> {
  const filePath = safeModelPath(context.partialDirectory, file.path);
  await ensureSafeParentDirectory(context.partialDirectory, filePath);
  const headers: Record<string, string> = { 'Accept-Encoding': 'identity' };
  if (initialOffset > 0) headers.Range = `bytes=${initialOffset}-`;
  const response = await requestWithFailureMapping(context, file.url, headers, signal);
  let offset = initialOffset;
  let downloadedBytes = initialDownloadedBytes;
  try {
    assertIdentityEncoding(response);
    if (offset > 0 && response.statusCode === 416) {
      await closeResponseBody(response.body);
      return downloadModelFile(context, file, 0, downloadedBytes - offset, signal, reportProgress);
    }
    if (offset > 0 && response.statusCode === 200) {
      downloadedBytes -= offset;
      offset = 0;
    } else if (offset > 0 && response.statusCode === 206) {
      const expectedRange = `bytes ${offset}-${file.sizeBytes - 1}/${file.sizeBytes}`;
      if (responseHeader(response.headers, 'content-range') !== expectedRange) {
        throw new ModelLifecycleError('integrity', `${file.path} returned an invalid range`);
      }
    } else if (offset === 0 && response.statusCode !== 200) {
      throw new ModelLifecycleError('network', `${file.path} returned HTTP ${response.statusCode}`);
    } else if (offset > 0) {
      throw new ModelLifecycleError('network', `${file.path} returned HTTP ${response.statusCode}`);
    }

    const expectedResponseBytes = file.sizeBytes - offset;
    const contentLength = headerSafeInteger(response.headers, 'content-length');
    if (contentLength !== null && contentLength !== expectedResponseBytes) {
      throw new ModelLifecycleError('integrity', `${file.path} returned an invalid length`);
    }

    throwIfCanceled(signal);
    const hash = createHash('sha256');
    if (offset > 0) await hashFilePrefix(filePath, offset, hash, signal);
    const output = context.createFileWriteStream(filePath, offset > 0 ? 'a' : 'w');
    if (initialOffset > 0 && offset === 0) reportProgress(downloadedBytes);
    let fileBytes = offset;
    const verifier = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        const bytes = Buffer.from(chunk);
        const nextFileBytes = fileBytes + bytes.byteLength;
        if (!Number.isSafeInteger(nextFileBytes) || nextFileBytes > file.sizeBytes) {
          callback(new ModelLifecycleError('integrity', `${file.path} exceeded its size`));
          return;
        }
        fileBytes = nextFileBytes;
        downloadedBytes = initialDownloadedBytes - initialOffset + fileBytes;
        hash.update(bytes);
        reportProgress(downloadedBytes);
        callback(null, bytes);
      },
    });
    await pipeline(response.body, verifier, output, { signal });
    if (fileBytes !== file.sizeBytes) {
      throw new ModelLifecycleError('network', `${file.path} ended before its expected size`);
    }
    if (hash.digest('hex') !== file.sha256) {
      await rm(filePath, { force: true });
      reportProgress(downloadedBytes - file.sizeBytes);
      throw new ModelLifecycleError('integrity', `${file.path} digest does not match`);
    }
    return downloadedBytes;
  } catch (error) {
    await closeResponseBody(response.body);
    throw error;
  }
}

async function closeResponseBody(body: Readable) {
  if (body.destroyed || body.readableEnded) return;
  await new Promise<void>((resolveClose) => {
    const finish = () => {
      body.off('close', finish);
      body.off('error', finish);
      resolveClose();
    };
    body.once('close', finish);
    body.once('error', finish);
    body.destroy();
  });
}

async function requestWithFailureMapping(
  context: LifecycleContext,
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
) {
  throwIfCanceled(signal);
  try {
    return await context.request(url, {
      headers,
      headersTimeout: context.requestTimeoutMs,
      bodyTimeout: context.requestTimeoutMs,
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw new ModelDownloadCanceledError();
    if (isTimeoutError(error)) {
      throw new ModelLifecycleError('timeout', 'Model request timed out', error);
    }
    throw new ModelLifecycleError('network', 'Model request failed', error);
  }
}

async function inspectInstallation(
  context: LifecycleContext,
  directory: string,
  signal?: AbortSignal,
): Promise<Inspection> {
  throwIfCanceled(signal);
  const modelRootInspection = await inspectDirectory(context.modelRoot);
  if (modelRootInspection === 'missing') return { status: 'missing' };
  if (modelRootInspection === 'invalid') {
    return {
      status: 'invalid',
      error: new ModelLifecycleError(
        'storage',
        `${context.modelRoot} is not a readable model directory`,
      ),
    };
  }
  try {
    const directoryInfo = await lstat(directory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
      return {
        status: 'invalid',
        error: new ModelLifecycleError('integrity', 'Model installation is not a directory'),
      };
    }
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return { status: 'missing' };
    return {
      status: 'invalid',
      error: new ModelLifecycleError('storage', 'Model installation cannot be inspected', error),
    };
  }

  try {
    throwIfCanceled(signal);
    const manifest = await readInstalledManifest(context, directory, signal);
    assertSupportedPlatform(context, manifest);
    for (const file of readingMemoryModelFiles(manifest)) {
      throwIfCanceled(signal);
      const filePath = safeModelPath(directory, file.path);
      await assertSafeParentDirectory(directory, filePath);
      const digest = await digestFile(filePath, signal);
      if (digest.sizeBytes !== file.sizeBytes || digest.sha256 !== file.sha256) {
        throw new ModelLifecycleError('integrity', `${file.path} is not a verified model file`);
      }
    }
    return { status: 'available', manifest };
  } catch (error) {
    return { status: 'invalid', error: installationInspectionError(error) };
  }
}

async function readInstalledManifest(
  context: LifecycleContext,
  directory: string,
  signal?: AbortSignal,
) {
  const manifestPath = safeModelPath(directory, manifestFileName);
  const info = await lstat(manifestPath);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== context.release.manifestSizeBytes) {
    throw new ModelLifecycleError('integrity', 'Installed model manifest is invalid');
  }
  throwIfCanceled(signal);
  const bytes = await readFile(manifestPath, signal ? { signal } : undefined);
  if (sha256(bytes) !== context.release.manifestSha256) {
    throw new ModelLifecycleError('integrity', 'Installed model manifest digest does not match');
  }
  try {
    return context.parseManifest(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown,
    );
  } catch (error) {
    throw new ModelLifecycleError('integrity', 'Installed model manifest is invalid', error);
  }
}

async function inspectResumeBytes(context: LifecycleContext) {
  try {
    if ((await inspectDirectory(context.modelRoot)) !== 'directory') return 0;
    const partialInfo = await lstat(context.partialDirectory);
    if (!partialInfo.isDirectory() || partialInfo.isSymbolicLink()) return 0;
    const manifest = await readInstalledManifest(context, context.partialDirectory);
    let total = 0;
    for (const file of readingMemoryModelFiles(manifest)) {
      try {
        const filePath = safeModelPath(context.partialDirectory, file.path);
        await assertSafeParentDirectory(context.partialDirectory, filePath);
        const info = await lstat(filePath);
        if (info.isFile() && !info.isSymbolicLink() && info.size <= file.sizeBytes) {
          total = safeAdd(total, info.size);
        }
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') throw error;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

async function inspectDirectory(path: string) {
  try {
    const info = await lstat(path);
    return info.isDirectory() && !info.isSymbolicLink() ? 'directory' : 'invalid';
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return 'missing';
    return 'invalid';
  }
}

async function preparePartialDirectory(context: LifecycleContext) {
  await ensureDirectory(context.modelRoot);
  try {
    const info = await lstat(context.partialDirectory);
    if (info.isDirectory() && !info.isSymbolicLink()) return;
    await rm(context.partialDirectory, { recursive: true, force: true });
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
  await mkdir(context.partialDirectory);
}

async function ensureDirectory(path: string) {
  try {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new ModelLifecycleError('storage', `${path} is not a writable model directory`);
    }
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
    await mkdir(path, { recursive: true });
  }
}

async function ensureSafeParentDirectory(baseDirectory: string, filePath: string) {
  const parentPath = dirname(filePath);
  const parentRelativePath = relative(baseDirectory, parentPath);
  if (!parentRelativePath) return;

  let currentPath = baseDirectory;
  for (const segment of parentRelativePath.split(sep)) {
    currentPath = join(currentPath, segment);
    try {
      const info = await lstat(currentPath);
      if (info.isDirectory() && !info.isSymbolicLink()) continue;
      await rm(currentPath, { recursive: true, force: true });
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
    await mkdir(currentPath);
  }
}

async function assertSafeParentDirectory(baseDirectory: string, filePath: string) {
  const parentRelativePath = relative(baseDirectory, dirname(filePath));
  if (!parentRelativePath) return;

  let currentPath = baseDirectory;
  for (const segment of parentRelativePath.split(sep)) {
    currentPath = join(currentPath, segment);
    const info = await lstat(currentPath);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new ModelLifecycleError('integrity', `${currentPath} is not a model directory`);
    }
  }
}

async function preparePartialFile(
  filePath: string,
  file: ReadingMemoryModelFile,
  signal: AbortSignal,
) {
  try {
    const info = await lstat(filePath);
    if (!info.isFile() || info.isSymbolicLink() || info.size > file.sizeBytes) {
      await rm(filePath, { recursive: true, force: true });
      return 0;
    }
    if (info.size < file.sizeBytes) return info.size;
    const digest = await digestFile(filePath, signal);
    if (digest.sha256 === file.sha256) return info.size;
    await rm(filePath, { force: true });
    return 0;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return 0;
    throw error;
  }
}

async function digestFile(path: string, signal?: AbortSignal) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new ModelLifecycleError('integrity', `${path} is not a regular file`);
  }
  const hash = createHash('sha256');
  let sizeBytes = 0;
  const stream = createReadStream(path);
  try {
    for await (const chunk of stream) {
      if (signal?.aborted) throw new ModelDownloadCanceledError();
      const bytes = Buffer.from(chunk);
      sizeBytes = safeAdd(sizeBytes, bytes.byteLength);
      hash.update(bytes);
    }
  } finally {
    stream.destroy();
  }
  return { sizeBytes, sha256: hash.digest('hex') };
}

async function hashFilePrefix(
  path: string,
  expectedBytes: number,
  hash: Hash,
  signal: AbortSignal,
) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== expectedBytes) {
    throw new ModelLifecycleError('integrity', `${path} changed during resume`);
  }
  let sizeBytes = 0;
  const stream = createReadStream(path);
  try {
    for await (const chunk of stream) {
      throwIfCanceled(signal);
      const bytes = Buffer.from(chunk);
      sizeBytes = safeAdd(sizeBytes, bytes.byteLength);
      if (sizeBytes > expectedBytes) {
        throw new ModelLifecycleError('integrity', `${path} changed during resume`);
      }
      hash.update(bytes);
    }
  } finally {
    stream.destroy();
  }
  if (sizeBytes !== expectedBytes) {
    throw new ModelLifecycleError('integrity', `${path} changed during resume`);
  }
}

async function readBoundedBody(
  body: AsyncIterable<Uint8Array>,
  maximumBytes: number,
  signal: AbortSignal,
) {
  const chunks: Buffer[] = [];
  let sizeBytes = 0;
  for await (const chunk of body) {
    throwIfCanceled(signal);
    const bytes = Buffer.from(chunk);
    sizeBytes = safeAdd(sizeBytes, bytes.byteLength);
    if (sizeBytes > maximumBytes) {
      throw new ModelLifecycleError('integrity', 'Model manifest exceeds its expected size');
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, sizeBytes);
}

function assertSupportedPlatform(context: LifecycleContext, manifest: ReadingMemoryModelManifest) {
  if (!manifest.supportedPlatforms.includes(context.platform)) {
    throw new ModelLifecycleError(
      'unsupported-platform',
      `Model does not support ${context.platform}`,
    );
  }
}

function assertSafeInternalId(internalId: string) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$/.test(internalId)) {
    throw new ModelLifecycleError('integrity', 'Model internal ID is not a safe path segment');
  }
}

function safeModelPath(directory: string, path: string) {
  const target = resolve(directory, path);
  const targetRelativePath = relative(directory, target);
  if (
    !targetRelativePath ||
    targetRelativePath === '..' ||
    targetRelativePath.startsWith(`..${sep}`)
  ) {
    throw new ModelLifecycleError('integrity', `Unsafe model path: ${path}`);
  }
  return target;
}

function assertIdentityEncoding(response: ModelHttpResponse) {
  const encoding = responseHeader(response.headers, 'content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity') {
    throw new ModelLifecycleError('integrity', 'Encoded model responses are not supported');
  }
}

function responseHeader(headers: Record<string, string | string[] | undefined>, name: string) {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(', ') : value;
}

function headerSafeInteger(headers: Record<string, string | string[] | undefined>, name: string) {
  const value = responseHeader(headers, name);
  if (value === undefined) return null;
  if (!/^\d+$/.test(value)) {
    throw new ModelLifecycleError('integrity', `Invalid ${name} header`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new ModelLifecycleError('integrity', `Unsafe ${name} header`);
  }
  return parsed;
}

function safeAdd(left: number, right: number) {
  const total = left + right;
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new ModelLifecycleError('integrity', 'Model byte count exceeds the safe integer range');
  }
  return total;
}

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function throwIfCanceled(signal?: AbortSignal) {
  if (signal?.aborted) throw new ModelDownloadCanceledError();
}

function isCanceled(error: unknown, signal: AbortSignal) {
  return (
    signal.aborted ||
    error instanceof ModelDownloadCanceledError ||
    errorName(error) === 'AbortError'
  );
}

function modelFailure(error: unknown): ReadingMemoryModelFailureCode {
  if (error instanceof ModelLifecycleError) return error.failure;
  if (isTimeoutError(error)) return 'timeout';
  if (isStorageError(error)) return 'storage';
  return 'network';
}

function isTimeoutError(error: unknown) {
  return (
    errorCode(error) === 'UND_ERR_HEADERS_TIMEOUT' ||
    errorCode(error) === 'UND_ERR_BODY_TIMEOUT' ||
    errorCode(error) === 'UND_ERR_CONNECT_TIMEOUT'
  );
}

function installationInspectionError(error: unknown) {
  if (error instanceof ModelLifecycleError) return error;
  const code = errorCode(error);
  if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'ELOOP') {
    return new ModelLifecycleError('integrity', 'Model installation is incomplete', error);
  }
  if (isStorageError(error)) {
    return new ModelLifecycleError('storage', 'Model installation cannot be read', error);
  }
  return new ModelLifecycleError('integrity', 'Model installation is invalid', error);
}

function isStorageError(error: unknown) {
  return storageErrorCodes.has(errorCode(error) ?? '');
}

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
}

function errorName(error: unknown) {
  return error && typeof error === 'object' && 'name' in error ? String(error.name) : undefined;
}

function baseState(
  context: LifecycleContext,
  status: 'checking',
): ReadingMemoryModelLifecycleState {
  return {
    status,
    internalId: context.release.internalId,
    downloadSizeBytes: context.release.distributionDownloadSizeBytes,
  };
}

function notInstalledState(
  context: LifecycleContext,
  resumeBytes: number,
): ReadingMemoryModelLifecycleState {
  return {
    status: 'not-installed',
    internalId: context.release.internalId,
    downloadSizeBytes: context.release.distributionDownloadSizeBytes,
    resumeBytes,
  };
}

function downloadingState(
  context: LifecycleContext,
  downloadedBytes: number,
): ReadingMemoryModelLifecycleState {
  return {
    status: 'downloading',
    internalId: context.release.internalId,
    downloadSizeBytes: context.release.distributionDownloadSizeBytes,
    downloadedBytes,
  };
}

function availableState(
  context: LifecycleContext,
  manifest: ReadingMemoryModelManifest,
): ReadingMemoryModelLifecycleState {
  return {
    status: 'available',
    internalId: context.release.internalId,
    downloadSizeBytes: context.release.distributionDownloadSizeBytes,
    directory: context.finalDirectory,
    manifest,
  };
}

function failedState(
  context: LifecycleContext,
  failure: ReadingMemoryModelFailureCode,
  resumeBytes: number,
): ReadingMemoryModelLifecycleState {
  return {
    status: 'failed',
    internalId: context.release.internalId,
    downloadSizeBytes: context.release.distributionDownloadSizeBytes,
    failure,
    resumeBytes,
  };
}

const requestModelAsset: ModelHttpRequest = async (url, options) =>
  undiciRequest(url, {
    method: 'GET',
    headers: options.headers,
    headersTimeout: options.headersTimeout,
    bodyTimeout: options.bodyTimeout,
    signal: options.signal,
  });
