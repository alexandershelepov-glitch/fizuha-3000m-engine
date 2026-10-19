import {defineConfig, devices} from '@playwright/test';

const stagingBaseURL=process.env.PLAYWRIGHT_BASE_URL;

/**
 * One real browser end-to-end run against the production build, on a mobile viewport.
 * Chrome is used from the system installation, so no browser download is required.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {timeout: 10_000},
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: stagingBaseURL ?? 'http://127.0.0.1:4173',
    trace: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: {...devices['Pixel 7'], channel: 'chrome'},
    },
  ],
  webServer: stagingBaseURL ? undefined : {
    // Always build first: running the suite against a stale `web/dist` would silently test old code.
    command: 'npm run build:layero && npm run preview:web',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
