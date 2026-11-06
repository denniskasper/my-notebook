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
          },
        },
      },
    ],
  },
});
