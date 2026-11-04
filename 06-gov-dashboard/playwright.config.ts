import { defineConfig, devices } from '@playwright/test';

// Runs against the mock gateway (:4010) and `next dev` (:3006). Fixture IDs come from shared/fixtures.
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3006', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node ../shared/mock/server.mjs --quiet', url: 'http://localhost:4010/health', reuseExistingServer: true },
    { command: 'pnpm dev', url: 'http://localhost:3006/ledger', reuseExistingServer: true, timeout: 120_000 },
  ],
});
