import { defineConfig } from 'wxt';
import packageJson from './package.json' with { type: 'json' };

const icons = {
  16: 'icon/16.png',
  32: 'icon/32.png',
  48: 'icon/48.png',
  96: 'icon/96.png',
  128: 'icon/128.png',
};

export default defineConfig({
  outDir: process.env.YOMITOMO_EXT_OUT_DIR || 'dist',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    optimizeDeps: {
      entries: ['entrypoints/**/*.{ts,tsx,html}', '!dist/**'],
    },
  }),
  webExt: {
    disabled: true,
  },
  manifest: {
    name: 'Yomitomo',
    description: '把网页文章变成可高亮、可批注的阅读器。',
    version: packageJson.version,
    minimum_chrome_version: '116',
    permissions: ['storage', 'scripting', 'activeTab'],
    host_permissions: ['http://127.0.0.1/*', 'ws://127.0.0.1/*'],
    icons,
    action: {
      default_title: 'Yomitomo',
      default_popup: 'popup.html',
      default_icon: icons,
    },
  },
});
