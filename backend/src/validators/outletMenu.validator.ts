import { z } from 'zod';
import { booleanQuery, moneyAmount, uuid } from './common';

export const outletMenuItemParams = z.object({ outletId: uuid, menuItemId: uuid });

/** PUT is an upsert: assigns the item, or updates an existing assignment. */
export const assignMenuItemBody = z
  .object({
    // null clears the override (falls back to the master base price).
    priceOverride: moneyAmount.nullable().optional(),
    isAvailable: z.boolean().optional(),
  })
  .strict();
export type AssignMenuItemBody = z.infer<typeof assignMenuItemBody>;

export const listOutletMenuQuery = z.object({
  // true = only what the outlet can sell right now (available + active item).
  availableOnly: booleanQuery.default('false'),
});
export type ListOutletMenuQuery = z.infer<typeof listOutletMenuQuery>;
