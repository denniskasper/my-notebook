import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.int.test.ts'],
          environment: 'node',
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['src/**/*.int.test.ts'],
          environment: 'node',
          globalSetup: ['./src/test/integration-setup.ts'],
          // One real database: run files one after another.
          fileParallelism: false,
          env: {
            NODE_ENV: 'test',
            DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
            LOG_LEVEL: 'silent',
            LLM_MODE: 'fake',
            SOURCE_TOKEN_CAP: '1000',
            // Small caps so a few Sonnet-sized calls reach them (total above daily to tell them apart).
            DAILY_ALLOWANCE_USD: '0.01',
            DEMO_BUDGET_DAILY_USD: '0.03',
            DEMO_BUDGET_TOTAL_USD: '0.05',
            CHAT_RATE_LIMIT_PER_HOUR: '30',
            BRIEFING_RATE_LIMIT_PER_HOUR: '3',
            // Small holds, so one in-flight call doesn't use up the small caps above.
            CHAT_HOLD_USD: '0.001',
            BRIEFING_HOLD_USD: '0.001',
            AGENT_MAX_BUDGET_USD: '0.001',
            AGENT_CONCURRENCY_LIMIT: '2',
            NEW_VISITORS_PER_IP_PER_DAY: '5',
            // The URL Source tests serve their pages on this loopback port.
            URL_FETCH_TEST_LOOPBACK_PORT: '3198',
          },
        },
      },
    ],
  },
});
