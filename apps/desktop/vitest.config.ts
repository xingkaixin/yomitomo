import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./vitest.setup.ts'],
    deps: {
      optimizer: {
        client: {
          enabled: true,
          include: ['@hugeicons/core-free-icons'],
        },
      },
    },
  },
});
