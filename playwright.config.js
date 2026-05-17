'use strict';
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './playwright-tests',
  timeout:  30_000,
  retries:  1,
  reporter: 'list',
  use: {
    baseURL:   'http://localhost:3001',
    headless:  true,
    viewport:  { width: 1280, height: 720 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command:   'node node/src/server.js',
    url:       'http://localhost:3001/api/health',
    reuseExistingServer: true,
    timeout:   15_000,
  },
});
