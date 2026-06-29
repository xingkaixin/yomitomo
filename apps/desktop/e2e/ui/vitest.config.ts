import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/ui/tests/**/*.test.ts'],
    testTimeout: 45_000,
  },
});
