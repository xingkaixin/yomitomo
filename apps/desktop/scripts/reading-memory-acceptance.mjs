import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as buildDesktop } from 'electron-vite';
import { Arch, build as packageDesktop, Platform } from 'electron-builder';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(desktopRoot, '../..');
const require = createRequire(import.meta.url);
const productName = 'Yomitomo Reading Memory Fixture';
const platform = `${process.platform}-${process.arch}`;
const supportedPlatforms = ['darwin-arm64', 'win32-x64'];
const args = process.argv.slice(2);
for (const arg of args) {
  if (!/^(?:--(?:package-output|from-package|report)=.+|--build-only)$/.test(arg)) {
    throw new Error(`Unsupported fixture acceptance argument: ${arg}`);
  }
}
if (!supportedPlatforms.includes(platform))
  throw new Error(`Unsupported fixture platform: ${platform}`);
const existingPackage = argument('from-package');
const packageOutput = await isolatedDirectory(
  existingPackage ??
    argument('package-output') ??
    (await mkdtemp(join(tmpdir(), 'yomitomo-reading-memory-fixture-'))),
);
if (!existingPackage && (await readdir(packageOutput)).length > 0) {
  throw new Error('Fixture packaging requires an empty output directory');
}
const reportPath = resolve(argument('report') ?? join(packageOutput, 'fixture-gui-report.json'));
const resourcesDirectory =
  process.platform === 'darwin'
    ? join(packageOutput, 'mac-arm64', `${productName}.app`, 'Contents', 'Resources')
    : join(packageOutput, 'win-unpacked', 'resources');
const executable =
  process.platform === 'darwin'
    ? join(resourcesDirectory, '../MacOS', productName)
    : join(resourcesDirectory, '..', `${productName}.exe`);
const report = {
  label: 'fixture-package-gui',
  formalRelease: false,
  humanReleaseEvidence: false,
  platform,
  packageOutput,
  status: 'failed',
};

try {
  if (!existingPackage) await buildFixturePackage();
  const marker = JSON.parse(
    await readFile(join(resourcesDirectory, 'reading-memory-fixture.json'), 'utf8'),
  );
  if (
    marker.label !== report.label ||
    marker.formalRelease !== false ||
    marker.platform !== platform
  ) {
    throw new Error('Refusing to launch a package without the fixture-only marker');
  }
  if (!(await stat(executable)).isFile()) throw new Error('Fixture Electron executable is missing');
  if (args.includes('--build-only')) {
    report.status = 'built';
  } else {
    const artifactsDirectory = join(packageOutput, 'gui-artifacts');
    const testsReportPath = join(artifactsDirectory, 'tests.json');
    await mkdir(artifactsDirectory, { recursive: true });
    console.info('Running all four reading memory suites in the isolated fixture package');
    await runNode(
      join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs'),
      [
        'run',
        '--config',
        'e2e/packaged/vitest.config.ts',
        '--reporter=default',
        '--reporter=json',
        `--outputFile=${testsReportPath}`,
      ],
      {
        ...process.env,
        YOMITOMO_E2E_PACKAGED_EXECUTABLE: executable,
        YOMITOMO_E2E_ARTIFACTS_DIR: artifactsDirectory,
      },
    );
    const tests = JSON.parse(await readFile(testsReportPath, 'utf8'));
    const expectedSuites = new Set([
      'reading-relations.test.ts',
      'reading-library-question.test.ts',
      'reading-review.test.ts',
      'reading-memory-acceptance.test.ts',
    ]);
    for (const suite of tests.testResults ?? []) expectedSuites.delete(basename(suite.name));
    if (
      expectedSuites.size > 0 ||
      !Number.isSafeInteger(tests.numTotalTests) ||
      tests.numTotalTests < 13 ||
      tests.numPassedTests !== tests.numTotalTests
    ) {
      throw new Error(
        'Fixture GUI acceptance must execute all suites and at least 13 cases without skips',
      );
    }
    report.caseCount = tests.numTotalTests;
    report.status = 'passed';
  }
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  throw error;
} finally {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.info(`Fixture-only GUI report: ${reportPath}`);
}

async function buildFixturePackage() {
  const buildDirectory = await mkdtemp(join(tmpdir(), 'yomitomo-reading-memory-fixture-build-'));
  const distDirectory = join(buildDirectory, 'dist');
  process.env.YOMITOMO_READING_MEMORY_FIXTURE_DIR = distDirectory;
  const previousDirectory = process.cwd();
  process.chdir(desktopRoot);
  try {
    await buildDesktop({
      configFile: join(desktopRoot, 'e2e/packaged/electron.vite.config.ts'),
      envDir: false,
    });
  } finally {
    process.chdir(previousDirectory);
    delete process.env.YOMITOMO_READING_MEMORY_FIXTURE_DIR;
  }
  const markerPath = join(buildDirectory, 'reading-memory-fixture.json');
  await writeFile(
    markerPath,
    `${JSON.stringify({ label: report.label, formalRelease: false, platform })}\n`,
  );
  const production = require('../electron-builder.config.cjs');
  await packageDesktop({
    projectDir: desktopRoot,
    targets:
      process.platform === 'darwin'
        ? Platform.MAC.createTarget(['dir'], Arch.arm64)
        : Platform.WINDOWS.createTarget(['dir'], Arch.x64),
    publish: 'never',
    config: {
      ...production,
      appId: 'app.yomitomo.reading-memory-fixture',
      productName,
      forceCodeSigning: false,
      directories: { ...production.directories, output: packageOutput },
      extraMetadata: { readingMemoryFixture: true },
      files: [
        ...production.files.filter((path) => !path.startsWith('dist/')),
        { from: distDirectory, to: 'dist', filter: ['**/*'] },
      ],
      extraResources: [
        ...production.extraResources,
        { from: markerPath, to: 'reading-memory-fixture.json' },
      ],
      publish: null,
      mac: { ...production.mac, identity: null, notarize: false },
      win: { ...production.win, signAndEditExecutable: false },
    },
  });
}

function argument(name) {
  return args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function isolatedDirectory(value) {
  const directory = resolve(value);
  assertOutsideRepository(directory);
  assertOutsideRepository(join(await realpath(dirname(directory)), basename(directory)));
  await mkdir(directory, { recursive: true });
  const actual = await realpath(directory);
  assertOutsideRepository(actual);
  return actual;
}

function assertOutsideRepository(directory) {
  const withinRepository = relative(repositoryRoot, directory);
  if (
    withinRepository !== '..' &&
    !withinRepository.startsWith(`..${sep}`) &&
    !isAbsolute(withinRepository)
  ) {
    throw new Error('Fixture packages must be outside the repository');
  }
}

function runNode(script, arguments_, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [script, ...arguments_], {
      cwd: desktopRoot,
      env,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else reject(new Error(`Fixture GUI tests failed (exit=${code}, signal=${signal})`));
    });
  });
}
