const { readdir, rm } = require('node:fs/promises');
const { join } = require('node:path');

const retainedElectronLocaleBases = new Set(['en', 'en_GB', 'zh_CN', 'zh_TW']);

function electronLocaleBase(name) {
  return name.replace(/\.lproj$/, '').replace(/_(FEMININE|MASCULINE|NEUTER)$/, '');
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

module.exports = {
  appId: 'app.yomitomo.desktop',
  productName: 'Yomitomo',
  forceCodeSigning: process.env.YOMITOMO_FORCE_CODE_SIGNING === '1',
  directories: {
    buildResources: 'resources',
    output: '../../dist/app',
  },
  files: [
    'dist/main/**',
    'dist/preload/**',
    'dist/renderer/**',
    'resources/**',
    'package.json',
    '!resources/entitlements*.plist',
    '!resources/icon.icns',
    '!resources/licenses/**',
    '!node_modules/@embedpdf/fonts-*/fonts/**',
    '!node_modules/**/*.map',
    '!node_modules/**/*.d.ts',
    '!node_modules/**/*.d.mts',
    '!node_modules/**/*.d.cts',
    '!node_modules/better-sqlite3/**',
    '!node_modules/effect/src/**',
    '!node_modules/@embedpdf/pdfium/dist/pdfium.wasm',
    '!node_modules/zod/src/**',
  ],
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
  afterPack: pruneElectronFrameworkLocales,
  asar: {
    smartUnpack: false,
  },
  asarUnpack: ['node_modules/@napi-rs/**/*.node'],
  publish: [
    {
      provider: 'generic',
      url: 'https://download.yomitomo.app/updates/',
    },
  ],
  mac: {
    artifactName: '${productName}-${version}-mac-${arch}.${ext}',
    category: 'public.app-category.productivity',
    entitlements: 'resources/entitlements.mac.plist',
    entitlementsInherit: 'resources/entitlements.mac.inherit.plist',
    hardenedRuntime: true,
    icon: 'resources/icon.icns',
    notarize: process.env.YOMITOMO_MAC_NOTARIZE === '1',
    target: ['dmg', 'zip'],
  },
  win: {
    artifactName: '${productName}-${version}-win-${arch}.${ext}',
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
  },
};
