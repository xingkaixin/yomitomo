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
  outDir: 'dist',
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
    description: 'Yomitomo reader mode with persistent highlights and threaded annotations.',
    version: packageJson.version,
    minimum_chrome_version: '116',
    permissions: ['storage', 'scripting'],
    host_permissions: ['<all_urls>', 'http://127.0.0.1/*', 'ws://127.0.0.1/*'],
    web_accessible_resources: [
      {
        resources: ['icon/128.png'],
        matches: ['<all_urls>'],
      },
    ],
    icons,
    action: {
      default_title: 'Yomitomo',
      default_popup: 'popup.html',
      default_icon: icons,
    },
  },
});
