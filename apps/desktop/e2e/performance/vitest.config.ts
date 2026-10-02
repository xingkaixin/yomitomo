import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/performance/*.test.ts'],
    testTimeout: 180_000,
    fileParallelism: false,
  },
});
