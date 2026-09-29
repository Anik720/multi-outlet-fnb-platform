import { Prisma } from '../db/prisma';

export const PG = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  INVALID_TEXT_REPRESENTATION: '22P02',
  SERIALIZATION_FAILURE: '40001',
  DEADLOCK_DETECTED: '40P01',
} as const;

export interface DbErrorInfo {
  /** PostgreSQL SQLSTATE, e.g. 23505. */
  sqlState?: string;
  /** Prisma error code, e.g. P2002. */
  prismaCode: string;
  constraint?: string;
}

interface DriverAdapterCause {
  originalCode?: string;
  originalMessage?: string;
  constraint?: { index?: string; fields?: string[] };
}

/**
 * Normalises Prisma errors (from both the query builder and $queryRaw, which
 * surface driver errors differently) into SQLSTATE + constraint name.
 */
export function dbErrorInfo(err: unknown): DbErrorInfo | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const cause = (err.meta?.driverAdapterError as { cause?: DriverAdapterCause } | undefined)?.cause;
  const constraintFromMessage = cause?.originalMessage?.match(/constraint "([^"]+)"/)?.[1];
  return {
    prismaCode: err.code,
    sqlState: cause?.originalCode,
    constraint: cause?.constraint?.index ?? constraintFromMessage,
  };
}

export const isUniqueViolation = (err: unknown, constraint?: string): boolean => {
  const info = dbErrorInfo(err);
  if (!info) return false;
  const unique = info.sqlState === PG.UNIQUE_VIOLATION || info.prismaCode === 'P2002';
  return unique && (!constraint || info.constraint === constraint);
};
