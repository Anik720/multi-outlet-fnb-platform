import { z } from 'zod';
import { dateRangeQuery, refineDateRange, uuid } from './common';
import { paginationQuery } from '../utils/pagination';

export const saleParams = z.object({ outletId: uuid, saleId: uuid });

export const createSaleBody = z.object({
  // Prices are NEVER accepted from the client; they are resolved server-side.
  items: z
    .array(
      z.object({
        menuItemId: uuid,
        quantity: z.number().int().min(1).max(1000),
      }),
    )
    .min(1, 'A sale needs at least one item')
    .max(100),
  // When the POS rang the sale up (useful for offline-synced sales).
  clientCreatedAt: z.string().datetime({ offset: true }).optional(),
});
export type CreateSaleBody = z.infer<typeof createSaleBody>;

export const idempotencyKeyHeader = z
  .string()
  .trim()
  .min(8)
  .max(100)
  .regex(/^[A-Za-z0-9_\-:.]+$/, 'Invalid Idempotency-Key format');

export const listSalesQuery = z
  .object({ ...dateRangeQuery, ...paginationQuery })
  .refine(refineDateRange, { message: '`from` must be before `to`', path: ['from'] });
export type ListSalesQuery = z.infer<typeof listSalesQuery>;
