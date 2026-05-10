module.exports = {
  appId: 'app.yomitomo.desktop',
  productName: 'Yomitomo',
  directories: {
    buildResources: 'resources',
    output: '../../dist/app',
  },
  files: ['dist/main/**', 'dist/preload/**', 'dist/renderer/**', 'resources/**', 'package.json'],
  asarUnpack: ['node_modules/better-sqlite3/**'],
  artifactName: 'mac-arm64/${productName}-${version}-mac-${arch}.${ext}',
  mac: {
    category: 'public.app-category.productivity',
    identity: '-',
    target: ['dmg', 'zip'],
  },
};
