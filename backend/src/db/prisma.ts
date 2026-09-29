import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { env } from '../config/env';

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  ssl: env.DB_SSL ? { rejectUnauthorized: false } : undefined,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const prisma = new PrismaClient({ adapter });

/**
 * Anything repositories can run queries on: the root client, or the
 * transaction-scoped client handed out by `prisma.$transaction`. Services
 * pass the latter down so several repository calls share one transaction.
 */
export type Db = PrismaClient | Prisma.TransactionClient;

export { Prisma };

/** Runs `fn` in a single interactive transaction (READ COMMITTED + row locks). */
export function withTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { maxWait: 5_000, timeout: 15_000 });
}
