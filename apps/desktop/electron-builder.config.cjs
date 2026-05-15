module.exports = {
  appId: 'app.yomitomo.desktop',
  productName: 'Yomitomo',
  directories: {
    buildResources: 'resources',
    output: '../../dist/app',
  },
  files: ['dist/main/**', 'dist/preload/**', 'dist/renderer/**', 'resources/**', 'package.json'],
  asarUnpack: ['node_modules/better-sqlite3/**'],
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
