import { defineConfig } from '@playwright/test';

// Runs against the exported web build (pnpm build:mock) and the mock gateway on :4010.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3001', viewport: { width: 420, height: 900 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node ../shared/mock/server.mjs --quiet', url: 'http://localhost:4010/health', reuseExistingServer: true },
    { command: 'node scripts/serve-dist.mjs', url: 'http://localhost:3001', reuseExistingServer: true },
  ],
});
