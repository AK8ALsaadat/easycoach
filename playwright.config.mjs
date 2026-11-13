import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  timeout: 120000,
  reporter: [['list', { printSteps: true }]],
  outputDir: 'artifacts/playwright',
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3200',
    reuseExistingServer: true,
    timeout: 120000,
  },
  use: {
    baseURL: 'http://127.0.0.1:3200',
    ...(process.env.AUTOMATION_BROWSER_STORAGE_STATE
      ? { storageState: process.env.AUTOMATION_BROWSER_STORAGE_STATE }
      : {}),
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    launchOptions: process.platform === 'win32' ? { channel: 'msedge' } : {},
  },
});
