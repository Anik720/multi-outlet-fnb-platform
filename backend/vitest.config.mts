import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://fnb:fnb_password@localhost:5433/fnb_hq_test?schema=public';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.ts'],
    // Integration tests share one real database: run files sequentially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      DB_POOL_MAX: '10',
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      SEED_DEMO_DATA: 'false',
    },
  },
});
