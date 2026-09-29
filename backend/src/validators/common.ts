import { z } from 'zod';

export const uuid = z.string().uuid('Must be a valid UUID');

/** Non-negative money with at most 2 decimal places, as a JSON number. */
export const moneyAmount = z
  .number({ invalid_type_error: 'Must be a number' })
  .nonnegative()
  .max(9_999_999_999.99)
  .multipleOf(0.01, 'At most 2 decimal places');

export const booleanQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Optional ISO date/datetime range used by listing + reporting endpoints. */
export const dateRangeQuery = {
  from: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  to: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
};

export const refineDateRange = <T extends { from?: string; to?: string }>(q: T) =>
  !q.from || !q.to || new Date(q.from) <= new Date(q.to);

export const outletParams = z.object({ outletId: uuid });
