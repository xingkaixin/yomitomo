import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createPrivateKey, createPublicKey, randomBytes } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { prepareSparkle } from './prepare-sparkle.mjs';

const desktopRoot = dirname(import.meta.dirname);
const require = createRequire(join(desktopRoot, 'package.json'));
const electronApp = dirname(dirname(dirname(require('electron'))));
const tools = prepareSparkle();
const root = mkdtempSync(join(tmpdir(), 'yomitomo-sparkle-smoke-'));
const archives = join(root, 'archives');
mkdirSync(archives);
const seed = randomBytes(32);
const privateKey = createPrivateKey({
  key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]),
  type: 'pkcs8',
  format: 'der',
});
const publicKey = createPublicKey(privateKey)
  .export({ type: 'spki', format: 'der' })
  .subarray(-32)
  .toString('base64');
const requests = [];
let corruptDelta = false;
const server = createServer((request, response) => {
  const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname.slice(1));
  requests.push(name);
  if (!name || name.includes('/') || !existsSync(join(archives, name))) {
    response.writeHead(404).end();
    return;
  }
  const data =
    corruptDelta && name.endsWith('.delta')
      ? Buffer.from('invalid delta')
      : readFileSync(join(archives, name));
  response.writeHead(200, {
    'Content-Type': name.endsWith('.xml') ? 'application/xml' : 'application/octet-stream',
    'Content-Length': data.length,
  });
  response.end(data);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}/`;

function plist(file, key, type, value) {
  execFileSync('/usr/libexec/PlistBuddy', ['-c', `Delete :${key}`, file], { stdio: 'ignore' });
  execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} ${type} ${value}`, file]);
}

function setPlist(file, key, type, value) {
  try {
    plist(file, key, type, value);
  } catch {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} ${type} ${value}`, file]);
  }
}

function fixture(version) {
  const app = join(root, version, 'Yomitomo Sparkle Smoke.app');
  cpSync(electronApp, app, { recursive: true, verbatimSymlinks: true });
  const contents = join(app, 'Contents');
  cpSync(join(tools, 'Sparkle.framework'), join(contents, 'Frameworks/Sparkle.framework'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  cpSync(join(tools, 'sparkle.node'), join(contents, 'Resources/sparkle.node'));
  const info = join(contents, 'Info.plist');
  for (const [key, type, value] of [
    ['CFBundleIdentifier', 'string', 'app.yomitomo.sparkle-smoke'],
    ['CFBundleVersion', 'string', version],
    ['CFBundleShortVersionString', 'string', version],
    ['SUFeedURL', 'string', `${origin}appcast.xml`],
    ['SUPublicEDKey', 'string', publicKey],
    ['SUEnableAutomaticChecks', 'bool', 'false'],
    ['SUAutomaticallyUpdate', 'bool', 'false'],
    ['SURequireSignedFeed', 'bool', 'true'],
    ['SUVerifyUpdateBeforeExtraction', 'bool', 'true'],
  ])
    setPlist(info, key, type, value);
  setPlist(info, 'NSAppTransportSecurity', 'dict', '');
  setPlist(info, 'NSAppTransportSecurity:NSAllowsArbitraryLoads', 'bool', 'true');
  const resources = join(contents, 'Resources/app');
  mkdirSync(resources, { recursive: true });
  writeFileSync(
    join(resources, 'package.json'),
    JSON.stringify({ name: 'sparkle-smoke', version, main: 'main.cjs' }),
  );
  writeFileSync(
    join(resources, 'main.cjs'),
    `
const {app} = require('electron');
const {appendFileSync,mkdirSync} = require('node:fs');
const {join} = require('node:path');
const installRoot=join(process.resourcesPath,'../../..');
const profile=join(installRoot,'profile');
mkdirSync(profile,{recursive:true});
app.setPath('userData',profile);
function record(event) { appendFileSync(join(installRoot,'run.ndjson'), JSON.stringify(event)+'\\n'); }
app.whenReady().then(() => {
  if (app.getVersion() === '1.0.1') { record({updated:true,version:app.getVersion()}); app.quit(); return; }
  const native = require(join(process.resourcesPath,'sparkle.node'));
  native.initialize((json) => {
    const event=JSON.parse(json); record(event);
    if (event.type==='check-complete') {
      if (event.error) { app.exit(1); return; }
      setTimeout(() => { record({downloadRequested:true}); native.download(); },100);
    }
    if (event.type==='update-downloaded') { record({installRequested:true}); native.install(); }
    if (event.type==='error') app.exit(1);
  });
  native.check();
});
`,
  );
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'ignore' });
  return app;
}

let child;
try {
  const old = fixture('1.0.0');
  const target = fixture('1.0.1');
  for (const [app, version] of [
    [old, '1.0.0'],
    [target, '1.0.1'],
  ]) {
    execFileSync('ditto', [
      '-c',
      '-k',
      '--sequesterRsrc',
      '--keepParent',
      app,
      join(archives, `Yomitomo-Smoke-${version}.zip`),
    ]);
  }
  execFileSync(
    join(tools, 'bin/generate_appcast'),
    [
      '--ed-key-file',
      '-',
      '-o',
      join(archives, 'appcast.xml'),
      '--versions',
      '1.0.1',
      '--maximum-versions',
      '1',
      '--maximum-deltas',
      '2',
      '--download-url-prefix',
      origin,
      archives,
    ],
    { input: seed.toString('base64'), stdio: ['pipe', 'inherit', 'inherit'] },
  );
  assert(
    readdirSync(archives).some((name) => name.endsWith('.delta')),
    'Smoke fixture must have an actual delta',
  );
  for (const fallback of [false, true]) {
    corruptDelta = fallback;
    requests.length = 0;
    const install = join(root, fallback ? 'fallback' : 'delta', 'Yomitomo Sparkle Smoke.app');
    cpSync(old, install, { recursive: true, verbatimSymlinks: true });
    const log = join(dirname(install), 'run.ndjson');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(join(install, 'Contents/MacOS/Electron'), [], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stderr.on('data', (data) => {
      output += data;
    });
    let events = [];
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      await delay(250);
      if (existsSync(log))
        events = readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line));
      if (events.some((event) => event.updated)) break;
      if (events.some((event) => event.type === 'error')) throw new Error(JSON.stringify(events));
    }
    assert(
      events.some((event) => event.updated),
      `Sparkle did not relaunch the updated app: ${output}\n${JSON.stringify(events)}`,
    );
    const requested = events.findIndex((event) => event.downloadRequested);
    assert(
      requested >= 0 &&
        events.slice(0, requested).every((event) => event.type !== 'download-progress'),
    );
    assert(
      requests.some((name) => name.endsWith('.delta')),
      'Sparkle must download a delta',
    );
    assert.equal(
      requests.includes('Yomitomo-Smoke-1.0.1.zip'),
      fallback,
      'Corrupted delta must fall back to the signed full ZIP',
    );
    console.log(`Sparkle ${fallback ? 'full fallback' : 'delta'} install and relaunch passed`);
  }
} finally {
  child?.kill();
  server.close();
  rmSync(root, { recursive: true, force: true });
}
