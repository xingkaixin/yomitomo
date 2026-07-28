import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/ui/tests/**/*.test.ts'],
    testTimeout: 45_000,
    // Each case launches a real Electron instance; running the files in parallel
    // starves them and every case times out.
    fileParallelism: false,
  },
});
