import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/tests/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
