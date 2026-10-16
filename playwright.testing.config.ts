import {defineConfig,devices} from '@playwright/test';

/** Isolated accelerated test build; never targets the public Layero app. */
export default defineConfig({
  testDir:'./e2e-testing',
  timeout:60_000,
  expect:{timeout:12_000},
  workers:1,
  reporter:[['list']],
  use:{
    baseURL:'http://127.0.0.1:4175/',
    trace:'off',
    video:'off',
  },
  projects:[{name:'virtual-clock-mobile',use:{...devices['Pixel 7'],channel:'chrome'}}],
  webServer:{
    command:'npm run build:testing && npm run preview:web -- --port 4175',
    url:'http://127.0.0.1:4175/',
    reuseExistingServer:false,
    timeout:120_000,
  },
});
