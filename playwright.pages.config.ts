import {defineConfig, devices} from '@playwright/test';

/** Real-browser smoke test of the Pages-prefixed production build, not the dev root. */
export default defineConfig({
  testDir: './e2e-pages',
  timeout: 45_000,
  expect: {timeout: 10_000},
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4174/fizuha-3000m-engine/',
    trace: 'off',
    video: 'off',
  },
  projects: [{name: 'mobile-chrome-pages', use: {...devices['Pixel 7'], channel: 'chrome'}}],
  webServer: {
    command: 'npm run build:web && node scripts/prepare-pages.mjs && npm run preview:web -- --port 4174',
    url: 'http://127.0.0.1:4174/fizuha-3000m-engine/',
    env: {PWA_BASE: '/fizuha-3000m-engine/'},
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
