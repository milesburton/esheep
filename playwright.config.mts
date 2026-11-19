import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  outputDir: 'test-results',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['json', { outputFile: process.env.PW_REPORT ?? 'reports/playwright.json' }],
  ],
  projects: [
    {
      name: 'demo',
      testMatch: 'e2e/demo.spec.ts',
      use: {
        baseURL: 'http://localhost:4173',
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
    },
    // Real Electron under a virtual display: `xvfb-run -a npx playwright test --project=electron`.
    { name: 'electron', testMatch: 'e2e/app.spec.ts' },
    // Not part of the default run: regenerates docs/screenshots for the README.
    {
      name: 'screenshots',
      testMatch: 'screenshots/*.spec.ts',
      use: {
        baseURL: 'http://localhost:4173',
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: 'node scripts/serve.mjs dist/demo 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
