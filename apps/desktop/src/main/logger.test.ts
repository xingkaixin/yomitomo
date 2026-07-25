import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testPaths = vi.hoisted(() => ({
  appData: '',
  userData: '',
}));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? testPaths.userData : testPaths.appData),
  },
}));

import { getLogPath, logInfo, pruneLogFile } from './app/logger';

describe('desktop logger retention', () => {
  beforeEach(async () => {
    const root = await mkdtemp(join(tmpdir(), 'yomitomo-logger-test-'));
    testPaths.appData = join(root, 'app-data');
    testPaths.userData = join(root, 'user-data');
  });

  it('removes structured log lines older than the retention window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T00:00:00.000Z'));
    const logPath = getLogPath();
    await mkdir(testPaths.userData, { recursive: true });
    await writeFile(
      logPath,
      [
        JSON.stringify({ at: '2026-04-10T00:00:00.000Z', level: 'info', event: 'old' }),
        JSON.stringify({ at: '2026-05-10T00:00:00.000Z', level: 'info', event: 'recent' }),
        'raw diagnostic line',
        '',
      ].join('\n'),
      'utf8',
    );

    await pruneLogFile(30);

    const retained = await readFile(logPath, 'utf8');
    expect(retained).not.toContain('old');
    expect(retained).toContain('recent');
    expect(retained).toContain('raw diagnostic line');
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(testPaths.appData, { recursive: true, force: true });
    await rm(testPaths.userData, { recursive: true, force: true });
  });
});

describe('desktop logger write failures', () => {
  beforeEach(async () => {
    const root = await mkdtemp(join(tmpdir(), 'yomitomo-logger-failure-test-'));
    testPaths.appData = join(root, 'app-data');
    testPaths.userData = join(root, 'user-data');
  });

  afterEach(async () => {
    await rm(testPaths.appData, { recursive: true, force: true });
    await rm(testPaths.userData, { recursive: true, force: true });
  });

  it('serializes circular, bigint, and deeply nested payloads without rejection', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let depth = 0; depth < 12; depth += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }

    const rejections = await observeUnhandledRejections(
      () => logInfo('logger.complex_payload', { circular, deep, value: 42n }),
      async () => {
        await vi.waitFor(async () => {
          const log = await readFile(getLogPath(), 'utf8');
          expect(log).toContain('[Circular]');
          expect(log).toContain('[MaxDepth]');
          expect(log).toContain('42n');
        });
      },
    );

    expect(rejections).toEqual([]);
  });

  it('falls back to minimal console output when filesystem writes fail', async () => {
    await mkdir(testPaths.userData, { recursive: true });
    testPaths.userData = join(testPaths.userData, 'not-a-directory');
    await writeFile(testPaths.userData, 'file', 'utf8');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const rejections = await observeUnhandledRejections(
      () => logInfo('logger.filesystem_failure', { apiKey: 'must-not-reach-fallback' }),
      async () => {
        await vi.waitFor(() => {
          expect(consoleError).toHaveBeenCalledWith(
            '[Yomitomo] logger.write_failed',
            expect.objectContaining({
              event: 'logger.filesystem_failure',
              level: 'info',
            }),
          );
        });
      },
    );

    expect(rejections).toEqual([]);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('must-not-reach-fallback');
    consoleError.mockRestore();
  });
});

async function observeUnhandledRejections(
  action: () => void,
  waitForCompletion: () => Promise<void>,
) {
  const rejections: unknown[] = [];
  const listener = (error: unknown) => rejections.push(error);
  process.on('unhandledRejection', listener);
  try {
    action();
    await waitForCompletion();
    await new Promise<void>((resolve) => setImmediate(resolve));
    return rejections;
  } finally {
    process.off('unhandledRejection', listener);
  }
}
