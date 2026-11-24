import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: '.artifacts/browser',
  workers: 1,
  use: { baseURL: 'http://localhost:3000', browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' },
  webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true },
});
