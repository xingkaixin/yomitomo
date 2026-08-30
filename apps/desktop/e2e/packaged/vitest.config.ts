import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'e2e/ui/tests/reading-relations.test.ts',
      'e2e/ui/tests/reading-library-question.test.ts',
      'e2e/ui/tests/reading-review.test.ts',
      'e2e/ui/tests/reading-memory-acceptance.test.ts',
    ],
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
