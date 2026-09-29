import { execSync } from 'node:child_process';

/** Applies migrations to the dedicated test database once per run. */
export default function setup() {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgresql://fnb:fnb_password@localhost:5433/fnb_hq_test?schema=public',
    },
  });
}
