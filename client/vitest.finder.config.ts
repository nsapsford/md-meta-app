import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/finder/__harness__/**/*.parity.test.ts'],
    testTimeout: 1_800_000,
  },
});
