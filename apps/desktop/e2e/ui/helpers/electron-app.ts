import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { _electron as electron } from 'playwright-core';
import type { ElectronApplication, Page } from 'playwright-core';
import {
  cleanupE2eData,
  createE2eDesktopEnv,
  createE2eRunData,
  safeE2eName,
  type E2eRunData,
} from '../../helpers/e2e-data';

const require = createRequire(import.meta.url);
const electronPath = require('electron') as string;
const desktopRoot = resolve(import.meta.dirname, '../../..');
const defaultArtifactsDir = resolve(desktopRoot, 'e2e/ui/artifacts');
const rendererReadySelector =
  '.app-masthead-date, .library-home, .onboarding-screen, .store-load-error-shell';
const requiredBuildFiles = [
  'dist/main/index.js',
  'dist/preload/index.cjs',
  'dist/renderer/index.html',
] as const;

type DesktopPreloadProbe = {
  appInfo: { desktopVersion?: string } | null;
  hasPreloadApi: boolean;
  hasRendererSurface: boolean;
  hasShowMainWindow: boolean;
  rootHasContent: boolean;
};

export type DesktopE2eApp = {
  app: ElectronApplication;
  artifactsDir: string;
  captureFailure: (label: string) => Promise<void>;
  close: () => Promise<void>;
  fixtureDir: string;
  page: Page;
  rootDir: string;
  userDataDir: string;
};

export type DesktopContentSize = {
  height: number;
  width: number;
};

export type DesktopResizeOptions = {
  settleMs?: number;
  timeout?: number;
  tolerance?: number;
};

export type DesktopResizeResult = {
  contentSize: DesktopContentSize;
  targetSize: DesktopContentSize;
  viewportSize: DesktopContentSize;
};

type DesktopE2eLaunchOptions = {
  cleanupOnClose?: boolean;
  runData?: E2eRunData;
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
  return page.evaluate(async (surfaceSelector) => {
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
      hasRendererSurface: Boolean(document.querySelector(surfaceSelector)),
      hasShowMainWindow: typeof desktop?.showMainWindow === 'function',
      rootHasContent: Boolean(
        root && (root.childElementCount > 0 || root.textContent?.trim().length),
      ),
    };
  }, rendererReadySelector);
}

export async function resizeDesktopContent(
  desktopApp: Pick<DesktopE2eApp, 'app' | 'page'>,
  size: DesktopContentSize,
  options: DesktopResizeOptions = {},
): Promise<DesktopResizeResult> {
  const targetSize = normalizedDesktopContentSize(size);
  const tolerance = options.tolerance ?? 2;
  const settleMs = options.settleMs ?? 100;

  await desktopApp.app.evaluate(({ BrowserWindow }, target) => {
    const browserWindow = BrowserWindow.getAllWindows()[0];
    if (!browserWindow) throw new Error('DESKTOP_E2E_WINDOW_UNAVAILABLE');
    if (browserWindow.isMinimized()) browserWindow.restore();
    browserWindow.show();
    browserWindow.setContentSize(target.width, target.height);
  }, targetSize);

  await desktopApp.page.waitForFunction(
    ({ allowedDelta, height, width }) =>
      Math.abs(window.innerWidth - width) <= allowedDelta &&
      Math.abs(window.innerHeight - height) <= allowedDelta,
    { ...targetSize, allowedDelta: tolerance },
    { timeout: options.timeout ?? 10_000 },
  );

  if (settleMs > 0) await desktopApp.page.waitForTimeout(settleMs);

  const [contentSize, viewportSize] = await Promise.all([
    desktopApp.app.evaluate(({ BrowserWindow }) => {
      const browserWindow = BrowserWindow.getAllWindows()[0];
      if (!browserWindow) throw new Error('DESKTOP_E2E_WINDOW_UNAVAILABLE');
      const [width, height] = browserWindow.getContentSize();
      return { height, width };
    }),
    desktopApp.page.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth })),
  ]);

  return { contentSize, targetSize, viewportSize };
}

export async function launchDesktopE2eApp(
  testName: string,
  options: DesktopE2eLaunchOptions = {},
): Promise<DesktopE2eApp> {
  await assertDesktopBuildExists();
  const artifactsDir = process.env.YOMITOMO_E2E_ARTIFACTS_DIR || defaultArtifactsDir;
  await mkdir(artifactsDir, { recursive: true });
  const runData = options.runData ?? (await createE2eRunData(testName));
  const cleanupOnClose = options.cleanupOnClose ?? true;
  const output: string[] = [];
  const safeName = safeE2eName(testName);
  let closed = false;

  const app = await electron.launch({
    args: ['--no-sandbox', '.'],
    cwd: desktopRoot,
    env: createE2eDesktopEnv(runData),
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
    await waitForRendererReady(page);
    const readyPage = page;

    const captureFailure = async (label: string) => {
      await mkdir(artifactsDir, { recursive: true });
      await writeFile(
        join(artifactsDir, `${safeName}-${label}.log`),
        `${output.join('')}\n${await readPageDiagnostics(readyPage)}`,
        'utf8',
      );
      await readyPage.screenshot({
        fullPage: true,
        path: join(artifactsDir, `${safeName}-${label}.png`),
      });
    };

    const close = async () => {
      if (closed) return;
      closed = true;
      await app.close().catch(() => child.kill());
      if (cleanupOnClose) await cleanupE2eData(runData);
    };

    return {
      app,
      artifactsDir,
      captureFailure,
      close,
      fixtureDir: runData.fixtureDir,
      page: readyPage,
      rootDir: runData.rootDir,
      userDataDir: runData.userDataDir,
    };
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
    if (cleanupOnClose) await cleanupE2eData(runData);
    throw error;
  }
}

function normalizedDesktopContentSize(size: DesktopContentSize) {
  const width = Math.round(size.width);
  const height = Math.round(size.height);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error(`Invalid desktop content size: ${size.width}x${size.height}`);
  }
  return { height, width };
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

async function waitForRendererReady(page: Page) {
  await page.waitForFunction(
    (surfaceSelector) => {
      const root = document.getElementById('root');
      if (!root) return false;
      return Boolean(document.querySelector(surfaceSelector));
    },
    rendererReadySelector,
    { timeout: 20_000 },
  );
}

async function readPageDiagnostics(page: Page) {
  return page
    .evaluate(() => {
      const root = document.getElementById('root');
      return {
        bodyHtmlLength: document.body.innerHTML.length,
        bodyText: document.body.innerText.slice(0, 500),
        readyState: document.readyState,
        rendererSurfaceCount: document.querySelectorAll(
          '.app-masthead-date, .library-home, .onboarding-screen, .store-load-error-shell',
        ).length,
        rootChildElementCount: root?.childElementCount ?? null,
        rootHtmlLength: root?.innerHTML.length ?? null,
        rootText: root?.textContent?.slice(0, 500) ?? null,
        title: document.title,
        url: window.location.href,
      };
    })
    .then(
      (diagnostics) => `\nYOMITOMO_E2E_PAGE_DIAGNOSTICS ${JSON.stringify(diagnostics, null, 2)}\n`,
    )
    .catch((error) => `\nYOMITOMO_E2E_PAGE_DIAGNOSTICS_FAILED ${String(error)}\n`);
}
