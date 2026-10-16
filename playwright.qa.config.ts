import {defineConfig, devices} from '@playwright/test';

/**
 * Issue #23: autonomous 8–12 week full-cycle QA in a real browser.
 * Runs ONLY against the locally built isolated test build (VITE_TEST_MODE=1) served on 127.0.0.1;
 * it never targets the production site and never touches real users' localStorage
 * (every test starts from a fresh, empty browser context).
 */
export default defineConfig({
  testDir: './qa/issue-23',
  testMatch: /.*\.spec\.ts/,
  timeout: 900_000,
  expect: {timeout: 12_000},
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', {outputFile: process.env.QA_PLAYWRIGHT_JSON ?? 'reports/qa-issue-23/raw/playwright-results.json'}],
  ],
  outputDir: 'reports/qa-issue-23/raw/test-results',
  use: {
    baseURL: 'http://127.0.0.1:4176/',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  projects: [{name: 'qa-mobile-chrome', use: {...devices['Pixel 7'], channel: 'chrome'}}],
  webServer: {
    command: 'npm run build:testing && npm run preview:web -- --port 4176',
    url: 'http://127.0.0.1:4176/',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
