import { defineConfig, devices } from '@playwright/test';

import { E2E_COMMIT } from './e2e/build';

const PORT = 3100;

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL must be set for e2e tests');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'de-DE',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The production build against the `_test` database, as close to the image as it gets.
    command: 'pnpm db:migrate && pnpm build && pnpm start',
    url: `http://localhost:${PORT}/api/health`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_URL: databaseUrl,
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
      IP_HASH_SECRET: 'e2e-ip-hash-secret-not-for-production',
      COMMIT: E2E_COMMIT,
      LOG_LEVEL: 'warn',
      // A tiny Daily allowance: a Visitor's first question uses it up (e2e/allowance.spec.ts).
      DAILY_ALLOWANCE_USD: '0.000001',
      // Every spec starts a new Visitor from localhost, so the default of 5 per IP would run out.
      NEW_VISITORS_PER_IP_PER_DAY: '10000',
    },
  },
});
