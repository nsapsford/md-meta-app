import { defineConfig, configDefaults } from 'vitest/config';

// The finder's parity and report suites are slow; they run via vitest.finder.config.ts and
// vitest.report.config.ts, not in the default suite.
export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      'src/finder/__harness__/**/*.parity.test.ts',
      'src/finder/__harness__/**/*.report.test.ts',
    ],
  },
});
