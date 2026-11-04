import { defineConfig, devices } from '@playwright/test';

// Runs against the mock gateway (:4010) and `next dev` (:3003). Fixture IDs come from shared/fixtures.
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3003', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node ../shared/mock/server.mjs --quiet', url: 'http://localhost:4010/health', reuseExistingServer: true },
    { command: 'pnpm dev', url: 'http://localhost:3003/login', reuseExistingServer: true, timeout: 120_000 },
  ],
});
