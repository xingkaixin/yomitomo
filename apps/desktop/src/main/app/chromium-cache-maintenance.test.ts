import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  userData: '',
  defaultSession: {
    clearCache: vi.fn(),
    clearCodeCaches: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => testState.userData,
  },
  session: {
    defaultSession: testState.defaultSession,
  },
}));

import {
  chromiumCacheMaintenanceMarkerPath,
  inspectChromiumCache,
  runPendingChromiumCacheCleanup,
} from './chromium-cache-maintenance';

describe('chromium cache maintenance', () => {
  beforeEach(async () => {
    testState.userData = await mkdtemp(join(tmpdir(), 'yomitomo-chromium-cache-test-'));
    testState.defaultSession.clearCache.mockReset();
    testState.defaultSession.clearCodeCaches.mockReset();
    testState.defaultSession.clearCache.mockResolvedValue(undefined);
    testState.defaultSession.clearCodeCaches.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await rm(testState.userData, { recursive: true, force: true });
    testState.userData = '';
  });

  it('clears pending cache and removes only generated cache directories', async () => {
    await writeBytes(join(testState.userData, 'Cache', 'entry.bin'), 64);
    await writeBytes(join(testState.userData, 'Code Cache', 'js', 'entry.bin'), 64);
    await writeBytes(join(testState.userData, 'GPUCache', 'shader.bin'), 32);
    await writeBytes(
      join(testState.userData, 'Partitions', 'yomitomo-import-old', 'cache.bin'),
      16,
    );
    await writeBytes(join(testState.userData, 'Partitions', 'other-partition', 'data.bin'), 16);
    await inspectChromiumCache({ thresholdBytes: 1, userDataPath: testState.userData });

    const result = await runPendingChromiumCacheCleanup({ userDataPath: testState.userData });

    expect(result.status).toBe('cleaned');
    expect(testState.defaultSession.clearCache).toHaveBeenCalledOnce();
    expect(testState.defaultSession.clearCodeCaches).toHaveBeenCalledWith({ urls: [] });
    expect(await pathExists(join(testState.userData, 'Cache'))).toBe(false);
    expect(await pathExists(join(testState.userData, 'Code Cache'))).toBe(false);
    expect(await pathExists(join(testState.userData, 'GPUCache'))).toBe(false);
    expect(await pathExists(join(testState.userData, 'Partitions', 'yomitomo-import-old'))).toBe(
      false,
    );
    expect(await pathExists(join(testState.userData, 'Partitions', 'other-partition'))).toBe(true);
    expect(await pathExists(chromiumCacheMaintenanceMarkerPath(testState.userData))).toBe(false);
  });

  it('does not block startup when the pending marker is corrupted', async () => {
    const logger = testLogger();
    await mkdir(dirname(chromiumCacheMaintenanceMarkerPath(testState.userData)), {
      recursive: true,
    });
    await writeFile(chromiumCacheMaintenanceMarkerPath(testState.userData), '{', 'utf8');

    const result = await runPendingChromiumCacheCleanup({
      logger,
      userDataPath: testState.userData,
    });

    expect(result).toEqual({ status: 'failed', reason: 'marker_read_failed' });
    expect(testState.defaultSession.clearCache).not.toHaveBeenCalled();
    expect(await pathExists(chromiumCacheMaintenanceMarkerPath(testState.userData))).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      'chromium_cache.marker_read_failed',
      expect.any(SyntaxError),
      expect.objectContaining({
        markerPath: chromiumCacheMaintenanceMarkerPath(testState.userData),
      }),
    );
  });
});

function testLogger() {
  return {
    error: vi.fn(),
    info: vi.fn(),
  };
}

async function writeBytes(path: string, byteLength: number) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.alloc(byteLength), 'binary');
}

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
