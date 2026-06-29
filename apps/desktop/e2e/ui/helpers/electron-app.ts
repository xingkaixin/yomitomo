import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron } from 'playwright-core';
import type { ElectronApplication, Page } from 'playwright-core';

const require = createRequire(import.meta.url);
const electronPath = require('electron') as string;
const desktopRoot = resolve(import.meta.dirname, '../../..');
const defaultArtifactsDir = resolve(desktopRoot, 'e2e/ui/artifacts');
const requiredBuildFiles = [
  'dist/main/index.js',
  'dist/preload/index.cjs',
  'dist/renderer/index.html',
] as const;

type DesktopPreloadProbe = {
  appInfo: { desktopVersion?: string } | null;
  hasPreloadApi: boolean;
  hasShowMainWindow: boolean;
  rootHasContent: boolean;
};

type DesktopE2eApp = {
  app: ElectronApplication;
  artifactsDir: string;
  captureFailure: (label: string) => Promise<void>;
  close: () => Promise<void>;
  page: Page;
  userDataDir: string;
};

export async function withDesktopE2eApp<T>(
  testName: string,
  run: (desktopApp: DesktopE2eApp) => Promise<T>,
): Promise<T> {
  const desktopApp = await launchDesktopE2eApp(testName);
  try {
    return await run(desktopApp);
  } catch (error) {
    await desktopApp.captureFailure('failure').catch(() => undefined);
    throw error;
  } finally {
    await desktopApp.close();
  }
}

export async function probeDesktopPreload(page: Page): Promise<DesktopPreloadProbe> {
  return page.evaluate(async () => {
    const desktop = (
      window as typeof window & {
        yomitomoDesktop?: {
          getAppInfo?: () => Promise<{ desktopVersion?: string }>;
          showMainWindow?: () => void;
        };
      }
    ).yomitomoDesktop;
    const root = document.getElementById('root');
    return {
      appInfo: typeof desktop?.getAppInfo === 'function' ? await desktop.getAppInfo() : null,
      hasPreloadApi: Boolean(desktop),
      hasShowMainWindow: typeof desktop?.showMainWindow === 'function',
      rootHasContent: Boolean(
        root && (root.childElementCount > 0 || root.textContent?.trim().length),
      ),
    };
  });
}

async function launchDesktopE2eApp(testName: string): Promise<DesktopE2eApp> {
  await assertDesktopBuildExists();
  const artifactsDir = process.env.YOMITOMO_E2E_ARTIFACTS_DIR || defaultArtifactsDir;
  await mkdir(artifactsDir, { recursive: true });
  const userDataDir = await mkdtemp(join(tmpdir(), 'yomitomo-e2e-ui-'));
  const output: string[] = [];
  const safeName = safeArtifactName(testName);
  let closed = false;

  const app = await electron.launch({
    args: ['--no-sandbox', '.'],
    cwd: desktopRoot,
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '1',
      YOMITOMO_DISABLE_TELEMETRY: '1',
      YOMITOMO_E2E: '1',
      YOMITOMO_USER_DATA_DIR: userDataDir,
    },
    executablePath: electronPath,
  });
  const child = app.process();
  child.stdout?.on('data', (chunk) => output.push(chunk.toString('utf8')));
  child.stderr?.on('data', (chunk) => output.push(chunk.toString('utf8')));

  let page: Page | null = null;
  try {
    page = await app.firstWindow({ timeout: 20_000 });
    page.on('console', (message) => {
      output.push(`renderer:${message.type()} ${message.text()}\n`);
    });
    await waitForRendererRoot(page);
    const readyPage = page;

    const captureFailure = async (label: string) => {
      await mkdir(artifactsDir, { recursive: true });
      await writeFile(join(artifactsDir, `${safeName}-${label}.log`), output.join(''), 'utf8');
      await readyPage.screenshot({
        fullPage: true,
        path: join(artifactsDir, `${safeName}-${label}.png`),
      });
    };

    const close = async () => {
      if (closed) return;
      closed = true;
      await app.close().catch(() => child.kill());
      await cleanupUserData(userDataDir);
    };

    return { app, artifactsDir, captureFailure, close, page: readyPage, userDataDir };
  } catch (error) {
    await writeFile(
      join(artifactsDir, `${safeName}-startup-failure.log`),
      `${output.join('')}\n${String(error)}\n`,
      'utf8',
    ).catch(() => undefined);
    await page
      ?.screenshot({
        fullPage: true,
        path: join(artifactsDir, `${safeName}-startup-failure.png`),
      })
      .catch(() => undefined);
    await app.close().catch(() => child.kill());
    await cleanupUserData(userDataDir);
    throw error;
  }
}

async function assertDesktopBuildExists() {
  const missing: string[] = [];
  for (const relativePath of requiredBuildFiles) {
    const absolutePath = resolve(desktopRoot, relativePath);
    await readFile(absolutePath).catch(() => missing.push(relativePath));
  }
  if (missing.length === 0) return;
  throw new Error(
    `Desktop UI E2E requires built app assets. Run "pnpm --filter @yomitomo/desktop build" first. Missing: ${missing.join(', ')}`,
  );
}

async function waitForRendererRoot(page: Page) {
  await page.waitForFunction(
    () => {
      const root = document.getElementById('root');
      return Boolean(root && (root.childElementCount > 0 || root.textContent?.trim().length));
    },
    undefined,
    { timeout: 20_000 },
  );
}

function safeArtifactName(value: string) {
  const safeName = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return safeName || 'desktop-e2e';
}

async function cleanupUserData(userDataDir: string) {
  if (process.env.YOMITOMO_E2E_KEEP_DATA === '1') {
    console.info(`YOMITOMO_E2E_USER_DATA_DIR=${userDataDir}`);
    return;
  }
  await rm(userDataDir, { recursive: true, force: true });
}
