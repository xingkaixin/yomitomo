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

  it('exposes circular payload serialization as an unhandled rejection', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const rejection = nextUnhandledRejection();

    logInfo('logger.circular_payload', circular);

    await expect(rejection).resolves.toBeInstanceOf(TypeError);
  });

  it('exposes filesystem failures as an unhandled rejection', async () => {
    await mkdir(testPaths.userData, { recursive: true });
    testPaths.userData = join(testPaths.userData, 'not-a-directory');
    await writeFile(testPaths.userData, 'file', 'utf8');
    const rejection = nextUnhandledRejection();

    logInfo('logger.filesystem_failure');

    await expect(rejection).resolves.toMatchObject({ code: 'EEXIST' });
  });
});

function nextUnhandledRejection() {
  return new Promise<unknown>((resolve) => {
    process.once('unhandledRejection', resolve);
  });
}
