import { defineConfig, devices } from '@playwright/test';

// Runs against the mock gateway (:4010) and `next dev` (:3004). Fixture IDs come from shared/fixtures.
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts/,
  timeout: 45_000,
  expect: { timeout: 15_000 }, // `next dev` compiles each route on its first visit
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3004', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node ../shared/mock/server.mjs --quiet', url: 'http://localhost:4010/health', reuseExistingServer: true },
    { command: 'pnpm dev', url: 'http://localhost:3004/login', reuseExistingServer: true, timeout: 120_000 },
  ],
});
