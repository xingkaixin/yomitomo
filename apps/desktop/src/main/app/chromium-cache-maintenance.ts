import { performance } from 'node:perf_hooks';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app, session as electronSession, type Session } from 'electron';

const DEFAULT_THRESHOLD_BYTES = 200 * 1024 * 1024;
const MARKER_VERSION = 1;
const MAX_CLEANUP_ATTEMPTS = 3;
const MARKER_PATH = ['maintenance', 'chromium-cache-maintenance.json'] as const;
const STATIC_CACHE_DIRECTORIES = [
  { key: 'http-cache', relativePath: ['Cache'], removeOnCleanup: true },
  { key: 'code-cache', relativePath: ['Code Cache'], removeOnCleanup: true },
  { key: 'gpu-cache', relativePath: ['GPUCache'], removeOnCleanup: true },
  { key: 'dawn-cache', relativePath: ['DawnCache'], removeOnCleanup: true },
  { key: 'shader-cache', relativePath: ['ShaderCache'], removeOnCleanup: true },
  { key: 'gr-shader-cache', relativePath: ['GrShaderCache'], removeOnCleanup: true },
] as const;

type ChromiumCacheSession = Pick<Session, 'clearCache' | 'clearCodeCaches'>;
type ChromiumCacheLogger = {
  info?: (event: string, data?: Record<string, unknown>) => void;
  error?: (event: string, error: unknown, data?: Record<string, unknown>) => void;
};

type ChromiumCacheMaintenanceOptions = {
  delayMs?: number;
  logger?: ChromiumCacheLogger;
  now?: () => Date;
  session?: ChromiumCacheSession;
  thresholdBytes?: number;
  userDataPath?: string;
};

type CacheDirectorySpec = {
  key: string;
  path: string;
  removeOnCleanup: boolean;
};

export type ChromiumCacheDirectoryReport = {
  bytes: number;
  error?: string;
  exists: boolean;
  failed: boolean;
  key: string;
  path: string;
  removeOnCleanup: boolean;
};

type PendingCleanupMarker = {
  attemptCount: number;
  detectedAt: string;
  lastAttemptAt?: string;
  pendingCleanup: true;
  reason: 'chromium_cache_over_threshold';
  thresholdBytes: number;
  totalBytes: number;
  version: typeof MARKER_VERSION;
};

type CacheFootprint = {
  directories: ChromiumCacheDirectoryReport[];
  failedDirectoryCount: number;
  totalBytes: number;
};

export function chromiumCacheMaintenanceMarkerPath(userDataPath = app.getPath('userData')) {
  return join(userDataPath, ...MARKER_PATH);
}

export function scheduleChromiumCacheInspection(options: ChromiumCacheMaintenanceOptions = {}) {
  const timer = setTimeout(() => {
    void inspectChromiumCache(options).catch((error) => {
      options.logger?.error?.('chromium_cache.inspect_failed', error);
    });
  }, options.delayMs ?? 1_000);
  timer.unref?.();
  return timer;
}

export async function inspectChromiumCache(options: ChromiumCacheMaintenanceOptions = {}) {
  const startedAt = performance.now();
  const thresholdBytes = options.thresholdBytes ?? DEFAULT_THRESHOLD_BYTES;
  const logger = options.logger;
  const userDataPath = options.userDataPath ?? app.getPath('userData');

  logger?.info?.('chromium_cache.inspect_start', { thresholdBytes });
  const footprint = await chromiumCacheFootprint(userDataPath);
  const summary = cacheFootprintSummary(footprint, thresholdBytes, startedAt);
  logger?.info?.('chromium_cache.inspect_complete', summary);

  if (footprint.totalBytes < thresholdBytes) {
    logger?.info?.('chromium_cache.maintenance_skipped', {
      ...summary,
      reason: 'below_threshold',
    });
    return { status: 'skipped' as const, ...footprint, thresholdBytes };
  }

  const marker = pendingCleanupMarker(footprint.totalBytes, thresholdBytes, options.now?.());
  await writePendingCleanupMarker(userDataPath, marker);
  logger?.info?.('chromium_cache.large_cache_detected', summary);
  logger?.info?.('chromium_cache.cleanup_pending', {
    ...summary,
    markerPath: chromiumCacheMaintenanceMarkerPath(userDataPath),
  });
  return { status: 'pending_cleanup' as const, marker, ...footprint, thresholdBytes };
}

export async function runPendingChromiumCacheCleanup(
  options: ChromiumCacheMaintenanceOptions = {},
) {
  const userDataPath = options.userDataPath ?? app.getPath('userData');
  const logger = options.logger;
  let marker: PendingCleanupMarker | null;
  try {
    marker = await readPendingCleanupMarker(userDataPath);
  } catch (error) {
    logger?.error?.('chromium_cache.marker_read_failed', error, {
      markerPath: chromiumCacheMaintenanceMarkerPath(userDataPath),
    });
    if (error instanceof SyntaxError) {
      try {
        await removePendingCleanupMarker(userDataPath);
      } catch (removeError) {
        logger?.error?.('chromium_cache.marker_remove_failed', removeError, {
          markerPath: chromiumCacheMaintenanceMarkerPath(userDataPath),
        });
      }
    }
    return { status: 'failed' as const, reason: 'marker_read_failed' as const };
  }
  if (!marker) return { status: 'skipped' as const, reason: 'no_pending_cleanup' as const };

  const startedAt = performance.now();
  const session = options.session ?? electronSession.defaultSession;
  const before = await chromiumCacheFootprint(userDataPath);
  logger?.info?.('chromium_cache.cleanup_start', {
    attemptCount: marker.attemptCount,
    markerTotalBytes: marker.totalBytes,
    totalBytesBefore: before.totalBytes,
  });

  const result = await clearChromiumCaches(userDataPath, session);
  const after = await chromiumCacheFootprint(userDataPath);
  const details = {
    ...result,
    durationMs: elapsedMs(startedAt),
    failedDirectoryCount: result.failedDirectoryCount + after.failedDirectoryCount,
    recoveredBytes: Math.max(0, before.totalBytes - after.totalBytes),
    totalBytesAfter: after.totalBytes,
    totalBytesBefore: before.totalBytes,
  };

  if (result.failed) {
    logger?.error?.('chromium_cache.cleanup_failed', result.error, details);
    await updateFailedCleanupMarker(userDataPath, marker, options.now?.());
    return { status: 'failed' as const, ...details };
  }

  await removePendingCleanupMarker(userDataPath);
  logger?.info?.('chromium_cache.cleanup_complete', details);
  return { status: 'cleaned' as const, ...details };
}

async function clearChromiumCaches(userDataPath: string, session: ChromiumCacheSession) {
  let clearedSessionCache = false;
  let clearedCodeCache = false;
  let removedDirectoryCount = 0;
  let failedDirectoryCount = 0;
  const errors: unknown[] = [];

  try {
    await session.clearCache();
    clearedSessionCache = true;
  } catch (error) {
    errors.push(error);
  }

  try {
    await session.clearCodeCaches({ urls: [] });
    clearedCodeCache = true;
  } catch (error) {
    errors.push(error);
  }

  const specs = await chromiumCacheDirectorySpecs(userDataPath);
  for (const spec of specs) {
    if (!spec.removeOnCleanup || !(await pathExists(spec.path))) continue;
    try {
      await rm(spec.path, { force: true, recursive: true });
      removedDirectoryCount += 1;
    } catch (error) {
      failedDirectoryCount += 1;
      errors.push(error);
    }
  }

  return {
    clearedCodeCache,
    clearedSessionCache,
    error: errors[0],
    failed: errors.length > 0,
    failedDirectoryCount,
    removedDirectoryCount,
  };
}

async function chromiumCacheFootprint(userDataPath: string): Promise<CacheFootprint> {
  const specs = await chromiumCacheDirectorySpecs(userDataPath);
  const directories: ChromiumCacheDirectoryReport[] = [];

  for (const spec of specs) {
    try {
      const size = await pathSize(spec.path);
      directories.push({
        ...spec,
        bytes: size.bytes,
        exists: size.exists,
        failed: false,
      });
    } catch (error) {
      directories.push({
        ...spec,
        bytes: 0,
        error: errorMessage(error),
        exists: false,
        failed: true,
      });
    }
  }

  return {
    directories,
    failedDirectoryCount: directories.filter((item) => item.failed).length,
    totalBytes: directories.reduce((total, item) => total + item.bytes, 0),
  };
}

async function chromiumCacheDirectorySpecs(userDataPath: string): Promise<CacheDirectorySpec[]> {
  const specs: CacheDirectorySpec[] = STATIC_CACHE_DIRECTORIES.map((spec) => ({
    key: spec.key,
    path: join(userDataPath, ...spec.relativePath),
    removeOnCleanup: spec.removeOnCleanup,
  }));
  const partitionPath = join(userDataPath, 'Partitions');

  let partitionEntries: Array<{ isDirectory(): boolean; name: string }>;
  try {
    partitionEntries = await readdir(partitionPath, { encoding: 'utf8', withFileTypes: true });
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return specs;
    throw error;
  }

  for (const entry of partitionEntries) {
    if (!entry.isDirectory() || !entry.name.startsWith('yomitomo-import')) continue;
    specs.push({
      key: `legacy-import-partition:${entry.name}`,
      path: join(partitionPath, entry.name),
      removeOnCleanup: true,
    });
  }

  return specs;
}

async function pathSize(path: string): Promise<{ bytes: number; exists: boolean }> {
  let entryStat: Awaited<ReturnType<typeof lstat>>;
  try {
    entryStat = await lstat(path);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return { bytes: 0, exists: false };
    throw error;
  }

  if (!entryStat.isDirectory()) return { bytes: entryStat.size, exists: true };

  let bytes = 0;
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) {
      bytes += (await pathSize(entryPath)).bytes;
      continue;
    }
    if (entry.isFile()) {
      bytes += (await lstat(entryPath)).size;
    }
  }
  return { bytes, exists: true };
}

async function pathExists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw error;
  }
}

function pendingCleanupMarker(
  totalBytes: number,
  thresholdBytes: number,
  now = new Date(),
): PendingCleanupMarker {
  return {
    attemptCount: 0,
    detectedAt: now.toISOString(),
    pendingCleanup: true,
    reason: 'chromium_cache_over_threshold',
    thresholdBytes,
    totalBytes,
    version: MARKER_VERSION,
  };
}

async function readPendingCleanupMarker(userDataPath: string) {
  try {
    const marker = JSON.parse(
      await readFile(chromiumCacheMaintenanceMarkerPath(userDataPath), 'utf8'),
    ) as unknown;
    return pendingCleanupMarkerFromJson(marker);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
}

function pendingCleanupMarkerFromJson(input: unknown): PendingCleanupMarker | null {
  if (!isRecord(input) || input.pendingCleanup !== true || input.version !== MARKER_VERSION) {
    return null;
  }
  if (
    typeof input.detectedAt !== 'string' ||
    typeof input.reason !== 'string' ||
    typeof input.thresholdBytes !== 'number' ||
    typeof input.totalBytes !== 'number'
  ) {
    return null;
  }
  return {
    attemptCount: typeof input.attemptCount === 'number' ? input.attemptCount : 0,
    detectedAt: input.detectedAt,
    lastAttemptAt: typeof input.lastAttemptAt === 'string' ? input.lastAttemptAt : undefined,
    pendingCleanup: true,
    reason: 'chromium_cache_over_threshold',
    thresholdBytes: input.thresholdBytes,
    totalBytes: input.totalBytes,
    version: MARKER_VERSION,
  };
}

async function writePendingCleanupMarker(userDataPath: string, marker: PendingCleanupMarker) {
  const markerPath = chromiumCacheMaintenanceMarkerPath(userDataPath);
  const temporaryPath = `${markerPath}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(dirname(markerPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, markerPath);
}

async function updateFailedCleanupMarker(
  userDataPath: string,
  marker: PendingCleanupMarker,
  now = new Date(),
) {
  const nextMarker = {
    ...marker,
    attemptCount: marker.attemptCount + 1,
    lastAttemptAt: now.toISOString(),
  };
  if (nextMarker.attemptCount >= MAX_CLEANUP_ATTEMPTS) {
    await removePendingCleanupMarker(userDataPath);
    return;
  }
  await writePendingCleanupMarker(userDataPath, nextMarker);
}

async function removePendingCleanupMarker(userDataPath: string) {
  await rm(chromiumCacheMaintenanceMarkerPath(userDataPath), { force: true });
}

function cacheFootprintSummary(
  footprint: CacheFootprint,
  thresholdBytes: number,
  startedAt: number,
) {
  return {
    directories: footprint.directories.map((item) => ({
      bytes: item.bytes,
      exists: item.exists,
      failed: item.failed,
      key: item.key,
    })),
    durationMs: elapsedMs(startedAt),
    failedDirectoryCount: footprint.failedDirectoryCount,
    thresholdBytes,
    totalBytes: footprint.totalBytes,
  };
}

function elapsedMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}

function errorCode(error: unknown) {
  return isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
