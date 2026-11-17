import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/finder/__harness__/**/*.report.test.ts'],
    testTimeout: 1_800_000,
  },
});
