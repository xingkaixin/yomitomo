import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupE2ePath, createE2eUserDataDir } from '../helpers/e2e-data';

const require = createRequire(import.meta.url);
const electronPath = require('electron') as string;

type ElectronSmokeResult = {
  desktopVersion: string | null;
  hasPreloadApi: boolean;
  hasShowMainWindow: boolean;
  rootHasContent: boolean;
};

let userDataDir = '';

describe('electron launch smoke', () => {
  beforeEach(async () => {
    userDataDir = await createE2eUserDataDir('electron-smoke');
  });

  afterEach(async () => {
    await cleanupE2ePath(userDataDir);
  });

  it('starts the real Electron app with preload IPC and renderer mounted', async () => {
    const result = await runElectronLaunchSmoke();

    expect(result).toMatchObject({
      hasPreloadApi: true,
      hasShowMainWindow: true,
      rootHasContent: true,
    });
    expect(result.desktopVersion).toEqual(expect.any(String));
  });
});

function runElectronLaunchSmoke() {
  return new Promise<ElectronSmokeResult>((resolve, reject) => {
    const child = spawn(electronPath, ['--no-sandbox', '.'], {
      cwd: join(import.meta.dirname, '../..'),
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: '1',
        YOMITOMO_ELECTRON_SMOKE: '1',
        YOMITOMO_USER_DATA_DIR: userDataDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output: string[] = [];
    let result: ElectronSmokeResult | null = null;
    let settled = false;
    const timeout = setTimeout(() => {
      finish(new Error(`Electron smoke timed out\n${output.join('')}`));
      child.kill();
    }, 20_000);

    const finish = (value: ElectronSmokeResult | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (value instanceof Error) {
        reject(value);
        return;
      }
      resolve(value);
    };

    const readOutput = (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      output.push(text);
      const resultLine = output
        .join('')
        .split(/\r?\n/)
        .find((line) => line.startsWith('YOMITOMO_ELECTRON_SMOKE_RESULT '));
      if (!resultLine) return;
      result = parseSmokeResult(resultLine);
    };

    child.stdout.on('data', readOutput);
    child.stderr.on('data', readOutput);
    child.once('error', finish);
    child.once('exit', (code, signal) => {
      if (settled) return;
      if (result) {
        finish(result);
        return;
      }
      finish(
        new Error(`Electron exited before smoke result: ${code ?? signal}\n${output.join('')}`),
      );
    });
  });
}

function parseSmokeResult(line: string): ElectronSmokeResult {
  const payload = line.slice('YOMITOMO_ELECTRON_SMOKE_RESULT '.length);
  return JSON.parse(payload) as ElectronSmokeResult;
}
