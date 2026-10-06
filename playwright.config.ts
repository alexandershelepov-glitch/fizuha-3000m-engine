import {defineConfig, devices} from '@playwright/test';

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
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: {...devices['Pixel 7'], channel: 'chrome'},
    },
  ],
  webServer: {
    command: 'npm run preview:web',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
