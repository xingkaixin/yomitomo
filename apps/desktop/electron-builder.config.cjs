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
    '!node_modules/@embedpdf/fonts-*/fonts/**',
    '!node_modules/**/*.map',
    '!node_modules/**/*.d.ts',
    '!node_modules/**/*.d.mts',
    '!node_modules/**/*.d.cts',
    '!node_modules/better-sqlite3/**',
  ],
  extraResources: [
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
