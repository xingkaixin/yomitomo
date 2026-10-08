const { readdir, rm } = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');
const { Arch } = require('electron-builder');

const retainedElectronLocaleBases = new Set(['en', 'en_GB', 'zh_CN', 'zh_TW']);

function electronLocaleBase(name) {
  return name.replace(/\.lproj$/, '').replace(/_(FEMININE|MASCULINE|NEUTER)$/, '');
}

function prepareMacUpdater(context) {
  if (context.electronPlatformName !== 'darwin') return;
  execFileSync(
    process.execPath,
    [join(__dirname, 'scripts/prepare-sparkle.mjs'), `--arch=${Arch[context.arch]}`],
    { stdio: 'inherit' },
  );
}

async function pruneElectronFrameworkLocales(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const resourcesDir = join(
    context.appOutDir,
    appName,
    'Contents',
    'Frameworks',
    'Electron Framework.framework',
    'Versions',
    'A',
    'Resources',
  );
  const entries = await readdir(resourcesDir, { withFileTypes: true });
  let removed = 0;
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory() || !entry.name.endsWith('.lproj')) return;
      if (retainedElectronLocaleBases.has(electronLocaleBase(entry.name))) return;
      await rm(join(resourcesDir, entry.name), { recursive: true, force: true });
      removed += 1;
    }),
  );
  console.log(`Pruned ${removed} Electron locale directories`);
}

const appFiles = [
  'dist/main/**',
  'dist/preload/**',
  'dist/renderer/**',
  'resources/**',
  'package.json',
  '!resources/entitlements*.plist',
  '!resources/icon.icns',
  '!resources/icon.ico',
  '!resources/licenses/**',
  '!resources/dmg/**',
  '!node_modules/@embedpdf/fonts-*/fonts/**',
  '!node_modules/**/*.map',
  '!node_modules/**/*.d.ts',
  '!node_modules/**/*.d.mts',
  '!node_modules/**/*.d.cts',
  '!node_modules/better-sqlite3/**',
  '!node_modules/effect/src/**',
  '!node_modules/@embedpdf/pdfium/dist/pdfium.wasm',
  '!node_modules/onnxruntime-node/bin/napi-v6/linux/**',
  '!node_modules/onnxruntime-node/bin/napi-v6/win32/arm64/**',
  '!node_modules/onnxruntime-node/lib/**',
  '!node_modules/onnxruntime-node/script/**',
  '!node_modules/onnxruntime-web/**',
  '!node_modules/sharp/install/**',
  '!node_modules/sharp/src/**',
  '!node_modules/zod/src/**',
];

module.exports = {
  appId: 'app.yomitomo.desktop',
  productName: 'Yomitomo',
  forceCodeSigning: process.env.YOMITOMO_FORCE_CODE_SIGNING === '1',
  directories: {
    buildResources: 'resources',
    output: '../../dist/app',
  },
  npmRebuild: false,
  files: appFiles,
  extraResources: [
    {
      from: 'node_modules/@embedpdf/pdfium/dist/pdfium.wasm',
      to: 'pdfium/pdfium.wasm',
    },
    {
      from: 'electron-native',
      to: 'electron-native',
      filter: ['package.json'],
    },
    {
      from: 'electron-native/node_modules',
      to: 'electron-native/node_modules',
      filter: [
        '**/*',
        '!node_modules/**/*.map',
        '!**/*.d.ts',
        '!**/*.d.mts',
        '!**/*.d.cts',
        '!better-sqlite3/deps/**',
        '!better-sqlite3/src/**',
        '!.pnpm/better-sqlite3@*/node_modules/better-sqlite3/deps/**',
        '!.pnpm/better-sqlite3@*/node_modules/better-sqlite3/src/**',
      ],
    },
  ],
  beforePack: prepareMacUpdater,
  afterPack: pruneElectronFrameworkLocales,
  asar: {
    smartUnpack: false,
  },
  asarUnpack: [
    'node_modules/@napi-rs/**/*.node',
    'node_modules/onnxruntime-node/bin/**',
    'node_modules/@img/sharp-*/lib/**',
    'node_modules/@img/sharp-libvips-*/lib/**',
  ],
  publish: [
    {
      provider: 'generic',
      url: 'https://download.yomitomo.app/updates/',
      useMultipleRangeRequest: false,
    },
  ],
  mac: {
    files: [...appFiles, '!node_modules/onnxruntime-node/bin/napi-v6/win32/**'],
    artifactName: '${productName}-${version}-mac-${arch}.${ext}',
    category: 'public.app-category.productivity',
    entitlements: 'resources/entitlements.mac.plist',
    entitlementsInherit: 'resources/entitlements.mac.inherit.plist',
    hardenedRuntime: true,
    icon: 'resources/icon.icns',
    notarize: process.env.YOMITOMO_MAC_NOTARIZE === '1',
    target: ['dmg', 'zip'],
    extraFiles: [
      { from: '.cache/sparkle/Sparkle.framework', to: 'Frameworks/Sparkle.framework' },
      { from: '.cache/sparkle/sparkle.node', to: 'Resources/sparkle.node' },
      { from: '.cache/sparkle/LICENSE', to: 'Resources/Sparkle-LICENSE.txt' },
    ],
    extendInfo: {
      SUFeedURL: 'https://download.yomitomo.app/updates/appcast-mac-arm64.xml',
      SUPublicEDKey: '87a6aKP7MeF4C7IkoHWrmD4M36q0PVi/KUdj1NF4iWQ=',
      SUEnableAutomaticChecks: false,
      SUAutomaticallyUpdate: false,
      SURequireSignedFeed: true,
      SUVerifyUpdateBeforeExtraction: true,
    },
  },
  dmg: {
    background: 'dmg/background.png',
    window: { width: 640, height: 400 },
    iconSize: 84,
    iconTextSize: 14,
    contents: [
      { x: 170, y: 190, type: 'file' },
      { x: 470, y: 190, type: 'link', path: '/Applications' },
    ],
  },
  win: {
    files: [...appFiles, '!node_modules/onnxruntime-node/bin/napi-v6/darwin/**'],
    artifactName: '${productName}-${version}-win-${arch}.${ext}',
    icon: 'resources/icon.ico',
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
  },
};
