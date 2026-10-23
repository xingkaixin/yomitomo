// Usage: node scripts/startup-benchmark.mjs [--app <Yomitomo.app>] [--runs 10] [--output result.json]
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const stages = [
  'main.module_loaded',
  'app.ready',
  'store.initialize_success',
  'window.create_start',
  'window.created',
  'renderer.dom_ready',
  'window.show',
  'store.ready_for_ui',
  'library.catalog_ready',
  'contentVisible',
];
const doneEvents = ['performance.startup.window.show', 'performance.startup.store.ready_for_ui'];
const runTimeoutMs = 30_000;
const quitTimeoutMs = 10_000;
const lsregisterPath =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

const { values } = parseArgs({
  options: {
    app: { type: 'string' },
    output: { type: 'string' },
    runs: { default: '10', type: 'string' },
    warmup: { default: '1', type: 'string' },
  },
});
const runs = Number(values.runs);
const warmup = Number(values.warmup);
if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer');
if (!Number.isInteger(warmup) || warmup < 1) throw new Error('--warmup must be >= 1');

const executable = await resolveExecutable(values.app);
await registerHelperApps(executable);
const directory = await mkdtemp(join(tmpdir(), 'yomitomo-startup-'));
const userData = join(directory, 'user-data');
const logPath = join(userData, 'yomitomo-agent.log');
await mkdir(userData);

try {
  console.log(`app: ${executable}`);
  const samples = [];
  // The first launch creates and migrates the database, so it is not a normal startup. It
  // also stops at onboarding; completing it makes later launches open the library home.
  for (let run = -warmup; run < runs; run++) {
    const sample = await measureLaunch(run === -warmup);
    if (run === -warmup) completeOnboarding();
    if (run < 0) continue;
    samples.push(sample);
    console.log(
      `run ${run + 1}/${runs}: window.show ${format(sample.stages['window.show'])}, ` +
        `library.catalog_ready ${format(sample.stages['library.catalog_ready'])}, ` +
        `contentVisible ${format(sample.stages.contentVisible)}`,
    );
  }

  const medians = Object.fromEntries(
    stages.map((name) => [name, median(samples.map((sample) => sample.stages[name]))]),
  );
  console.log('\nmedian ms from spawn:');
  console.table(Object.fromEntries(stages.map((name) => [name, format(medians[name])])));

  if (values.output) {
    const outputPath = resolve(values.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      `${JSON.stringify({ app: executable, date: new Date().toISOString(), runs, medians, samples }, null, 2)}\n`,
    );
    console.log(`wrote ${outputPath}`);
  }
} finally {
  await rm(directory, { force: true, recursive: true });
}

async function measureLaunch(firstLaunch) {
  const logOffset = existsSync(logPath) ? (await stat(logPath)).size : 0;
  const spawnedAt = Date.now();
  const child = spawn(executable, [], {
    env: {
      ...process.env,
      YOMITOMO_DISABLE_TELEMETRY: '1',
      YOMITOMO_USER_DATA_DIR: userData,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));

  try {
    await waitForStdoutEvents(child, exited, firstLaunch ? doneEvents.slice(0, 1) : doneEvents);
  } finally {
    requestQuit(child);
    const forceKill = setTimeout(() => child.kill('SIGKILL'), quitTimeoutMs);
    await exited;
    clearTimeout(forceKill);
  }

  const entries = (await readFile(logPath))
    .subarray(logOffset)
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const at = (name) => {
    const entry = entries.find((item) => item.event === `performance.startup.${name}`);
    return entry ? Date.parse(entry.at) - spawnedAt : null;
  };
  const stageTimes = Object.fromEntries(stages.map((name) => [name, at(name)]));
  // Builds that do not log library.catalog_ready fall back to the store being ready for the UI.
  const contentReady = stageTimes['library.catalog_ready'] ?? stageTimes['store.ready_for_ui'];
  stageTimes.contentVisible =
    stageTimes['window.show'] === null || contentReady === null
      ? null
      : Math.max(stageTimes['window.show'], contentReady);
  return { stages: stageTimes };
}

function completeOnboarding() {
  const changes = execFileSync(
    'sqlite3',
    [
      join(userData, 'yomitomo.sqlite'),
      `UPDATE app_settings SET onboarding_completed_at = '${new Date().toISOString()}'; SELECT changes();`,
    ],
    { encoding: 'utf8' },
  ).trim();
  if (changes !== '1') throw new Error(`Expected one app_settings row, updated ${changes}`);
}

function requestQuit(child) {
  if (process.platform !== 'darwin') {
    child.kill();
    return;
  }
  // The packaged app ignores SIGTERM on macOS. A quit event addressed by pid runs the normal
  // before-quit shutdown and cannot reach a Yomitomo the user already has open.
  spawn(
    'osascript',
    [
      '-l',
      'JavaScript',
      '-e',
      `ObjC.import('AppKit'); $.NSRunningApplication.runningApplicationWithProcessIdentifier(${child.pid}).terminate`,
    ],
    { stdio: 'ignore' },
  );
}

function waitForStdoutEvents(child, exited, events) {
  return new Promise((resolveWait, rejectWait) => {
    const pending = new Set(events);
    let output = '';
    const timeout = setTimeout(() => {
      rejectWait(
        new Error(`Startup did not log ${[...pending].join(', ')} within ${runTimeoutMs}ms`),
      );
    }, runTimeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      // The trailing space keeps an event from matching a longer event name it prefixes.
      for (const event of pending) if (output.includes(`${event} `)) pending.delete(event);
      if (pending.size > 0) return;
      clearTimeout(timeout);
      resolveWait();
    });
    child.stderr.resume();
    void exited.then((code) => {
      clearTimeout(timeout);
      rejectWait(new Error(`App exited with ${code} before startup completed`));
    });
  });
}

async function resolveExecutable(appPath) {
  const target = appPath ? resolve(appPath) : await findBuiltApp();
  if (!target.endsWith('.app')) return target;
  const name = (await readdir(join(target, 'Contents/MacOS')))[0];
  return join(target, 'Contents/MacOS', name);
}

// Metal device creation in the GPU helper looks the helper bundle up in LaunchServices. An
// unregistered build output pays ~450ms for that on every launch, which an installed app does not.
async function registerHelperApps(executablePath) {
  if (process.platform !== 'darwin') return;
  const frameworks = resolve(executablePath, '../../Frameworks');
  if (!existsSync(frameworks)) return;
  for (const entry of await readdir(frameworks)) {
    if (!entry.endsWith('.app')) continue;
    execFileSync(lsregisterPath, ['-f', join(frameworks, entry)]);
  }
}

async function findBuiltApp() {
  const outputRoot = join(repositoryRoot, 'dist/app');
  const queue = existsSync(outputRoot) ? [outputRoot] : [];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(current, entry.name);
      if (entry.name === 'Yomitomo.app') return path;
      queue.push(path);
    }
  }
  throw new Error(
    'No packaged app under dist/app. Run `pnpm make:mac-arm` or pass --app /Applications/Yomitomo.app',
  );
}

function median(numbers) {
  const sorted = numbers.filter((value) => value !== null).toSorted((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function format(value) {
  return value === null ? '-' : `${Math.round(value)}ms`;
}
