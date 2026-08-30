import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['e2e/ui/tests/**/*.test.ts'],
    // Run these enabled, isolated suites with pnpm reading-memory:acceptance instead.
    exclude: [
      'e2e/ui/tests/reading-relations.test.ts',
      'e2e/ui/tests/reading-library-question.test.ts',
      'e2e/ui/tests/reading-review.test.ts',
      'e2e/ui/tests/reading-memory-acceptance.test.ts',
    ],
    testTimeout: 45_000,
    // Each case launches a real Electron instance; running the files in parallel
    // starves them and every case times out.
    fileParallelism: false,
  },
});
