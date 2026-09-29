import { z } from 'zod';
import { dateRangeQuery, refineDateRange, uuid } from './common';

export const revenueReportQuery = z
  .object({ ...dateRangeQuery })
  .refine(refineDateRange, { message: '`from` must be before `to`', path: ['from'] });
export type RevenueReportQuery = z.infer<typeof revenueReportQuery>;

export const topItemsReportQuery = z
  .object({
    ...dateRangeQuery,
    outletId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(5),
  })
  .refine(refineDateRange, { message: '`from` must be before `to`', path: ['from'] });
export type TopItemsReportQuery = z.infer<typeof topItemsReportQuery>;
