import { z } from 'zod';
import { booleanQuery, outletParams } from './common';

export { outletParams };

export const createOutletBody = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, 'Use 2-20 characters: A-Z, 0-9 or "-"'),
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(500).optional(),
});
export type CreateOutletBody = z.infer<typeof createOutletBody>;

// `code` is immutable: it is baked into issued receipt numbers.
export const updateOutletBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    address: z.string().trim().max(500).nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'Provide at least one field to update' });
export type UpdateOutletBody = z.infer<typeof updateOutletBody>;

export const listOutletsQuery = z.object({
  isActive: booleanQuery.optional(),
});
export type ListOutletsQuery = z.infer<typeof listOutletsQuery>;
