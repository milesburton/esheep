import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Tests are pure and short. A slow test is a bug: keep simulations small.
    testTimeout: 5_000,
    include: ['src/**/*.test.ts'],
    reporters: ['default', 'json'],
    outputFile: { json: 'reports/vitest.json' },
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      include: [
        'src/core/**/*.ts',
        'src/web/stage.ts',
        'src/main/pack.ts',
        'src/main/windows.ts',
        'src/tools/metrics.mts',
      ],
      // Thin DOM / Electron shells (sprites, sound, app, demo, main, preload) are covered by Playwright.
      exclude: ['src/**/*.test.ts'],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
