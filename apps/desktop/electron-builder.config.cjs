module.exports = {
  appId: 'app.yomitomo.desktop',
  productName: 'Yomitomo',
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
    '!node_modules/better-sqlite3/deps/**',
    '!node_modules/better-sqlite3/src/**',
  ],
  asar: {
    smartUnpack: false,
  },
  asarUnpack: [
    'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    'node_modules/@napi-rs/**/*.node',
  ],
  publish: [
    {
      provider: 'github',
      owner: 'xingkaixin',
      repo: 'yomitomo',
    },
  ],
  mac: {
    artifactName: '${productName}-${version}-mac-${arch}.${ext}',
    category: 'public.app-category.productivity',
    icon: 'resources/icon.icns',
    identity: '-',
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
