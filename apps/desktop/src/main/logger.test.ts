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

import { getLogPath, logInfo, loggerTestApi, pruneLogFile } from './app/logger';

describe('desktop logger retention', () => {
  beforeEach(async () => {
    const root = await mkdtemp(join(tmpdir(), 'yomitomo-logger-test-'));
    testPaths.appData = join(root, 'app-data');
    testPaths.userData = join(root, 'user-data');
    loggerTestApi.setSizeLimits();
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

  it('rotates oversized logs on append while keeping recent complete utf-8 lines', async () => {
    loggerTestApi.setSizeLimits({ maxBytes: 700, retainedBytes: 420 });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    for (let index = 0; index < 10; index += 1) {
      logInfo(`rotate.event.${index}`, { text: `中文日志记录-${index}-payload` });
    }
    await loggerTestApi.flush();

    const content = await readFile(getLogPath(), 'utf8');
    const bytes = Buffer.byteLength(content, 'utf8');
    expect(bytes).toBeLessThanOrEqual(700);
    const lines = content.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    const parsed = lines.map((line) => JSON.parse(line) as { event: string });
    expect(parsed.at(-1)?.event).toBe('rotate.event.9');
    expect(parsed.some((entry) => entry.event === 'rotate.event.0')).toBe(false);
    expect(content).not.toContain('\uFFFD');
  });

  it('serializes pruning of oversized log files with concurrent appends', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-19T00:00:00.000Z'));
    loggerTestApi.setSizeLimits({ maxBytes: 500, retainedBytes: 320 });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const logPath = getLogPath();
    await mkdir(testPaths.userData, { recursive: true });
    const oldPrefix = Array.from({ length: 12 }, (_, index) =>
      JSON.stringify({
        at: '2026-03-01T00:00:00.000Z',
        level: 'info',
        event: `ancient.${index}`,
      }),
    ).join('\n');
    const recentTail = JSON.stringify({
      at: '2026-05-18T00:00:00.000Z',
      level: 'info',
      event: 'kept.before.prune',
    });
    await writeFile(logPath, `${oldPrefix}\n${recentTail}\n`, 'utf8');

    const prunePromise = pruneLogFile(30);
    logInfo('concurrent.append.1');
    logInfo('concurrent.append.2');
    await prunePromise;
    await loggerTestApi.flush();

    const retained = await readFile(logPath, 'utf8');
    const events = retained
      .trim()
      .split('\n')
      .map((line) => (JSON.parse(line) as { event: string }).event);
    expect(events).toContain('kept.before.prune');
    expect(events).toContain('concurrent.append.1');
    expect(events).toContain('concurrent.append.2');
    expect(events.some((event) => event.startsWith('ancient.'))).toBe(false);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    loggerTestApi.setSizeLimits();
    await loggerTestApi.flush();
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
