import { z } from 'zod';
import { uuid } from './common';

export const inventoryItemParams = z.object({ outletId: uuid, menuItemId: uuid });

export const ADJUSTMENT_REASONS = ['RESTOCK', 'ADJUSTMENT', 'WASTAGE'] as const;

export const adjustInventoryBody = z
  .object({
    change: z
      .number()
      .int()
      .min(-100_000)
      .max(100_000)
      .refine((v) => v !== 0, { message: 'Change must not be zero' }),
    reason: z.enum(ADJUSTMENT_REASONS),
    note: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.reason !== 'RESTOCK' || b.change > 0, {
    message: 'RESTOCK must increase stock',
    path: ['change'],
  })
  .refine((b) => b.reason !== 'WASTAGE' || b.change < 0, {
    message: 'WASTAGE must decrease stock',
    path: ['change'],
  });
export type AdjustInventoryBody = z.infer<typeof adjustInventoryBody>;

export const listMovementsQuery = z.object({
  menuItemId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListMovementsQuery = z.infer<typeof listMovementsQuery>;
