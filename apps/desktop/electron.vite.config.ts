import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

const root = dirname(fileURLToPath(import.meta.url));
const rendererRoot = resolve(root, 'src/renderer');
const workspaceDeps = ['@yomitomo/core', '@yomitomo/shared'];

export default defineConfig({
  main: {
    build: {
      outDir: resolve(root, 'dist/main'),
    },
    plugins: [externalizeDepsPlugin({ exclude: workspaceDeps })],
  },
  preload: {
    build: {
      outDir: resolve(root, 'dist/preload'),
    },
    plugins: [externalizeDepsPlugin({ exclude: workspaceDeps })],
  },
  renderer: {
    root: rendererRoot,
    build: {
      outDir: resolve(root, 'dist/renderer'),
      rollupOptions: {
        input: resolve(rendererRoot, 'index.html'),
      },
    },
    plugins: [react()],
  },
});
