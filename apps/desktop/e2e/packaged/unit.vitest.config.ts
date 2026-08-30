import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/packaged/**/*.test.ts', 'e2e/ui/tests/e2e-data.test.ts'],
  },
});
