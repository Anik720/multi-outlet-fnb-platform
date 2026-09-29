import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_SSL: booleanString,

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('8h'),

  // Comma-separated list of allowed browser origins. Empty = same-origin only.
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),

  // Seeds demo data on start-up when the database is empty.
  SEED_DEMO_DATA: booleanString,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast: a misconfigured service should never start.
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
