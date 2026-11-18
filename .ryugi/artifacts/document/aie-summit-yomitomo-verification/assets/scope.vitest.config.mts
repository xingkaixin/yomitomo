import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const desktopModules = new URL('../../../../../apps/desktop/node_modules/', import.meta.url);
const modules = {
  '@earendil-works/chord/context': '@earendil-works/chord/dist/context/index.js',
  '@earendil-works/pi-ai/models': '@earendil-works/pi-ai/dist/models.js',
  '@earendil-works/pi-ai/providers/faux': '@earendil-works/pi-ai/dist/providers/faux.js',
  '@earendil-works/pi-durable': '@earendil-works/pi-durable/dist/index.js',
};

export default defineConfig({
  resolve: {
    alias: Object.entries(modules).map(([name, path]) => ({
      find: new RegExp(`^${name}$`),
      replacement: fileURLToPath(new URL(path, desktopModules)),
    })),
  },
  test: {
    include: [fileURLToPath(new URL('./reading-scope.test.ts', import.meta.url))],
    testTimeout: 15_000,
  },
});
