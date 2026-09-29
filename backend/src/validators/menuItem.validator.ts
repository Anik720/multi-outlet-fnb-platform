import { z } from 'zod';
import { booleanQuery, moneyAmount, uuid } from './common';
import { paginationQuery } from '../utils/pagination';

export const menuItemParams = z.object({ menuItemId: uuid });

export const createMenuItemBody = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,40}$/, 'Use 2-40 characters: A-Z, 0-9 or "-"'),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  basePrice: moneyAmount,
  isActive: z.boolean().default(true),
});
export type CreateMenuItemBody = z.infer<typeof createMenuItemBody>;

export const updateMenuItemBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).nullable(),
    category: z.string().trim().min(1).max(60).nullable(),
    basePrice: moneyAmount,
    isActive: z.boolean(),
  })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'Provide at least one field to update' });
export type UpdateMenuItemBody = z.infer<typeof updateMenuItemBody>;

export const listMenuItemsQuery = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  isActive: booleanQuery.optional(),
  ...paginationQuery,
});
export type ListMenuItemsQuery = z.infer<typeof listMenuItemsQuery>;
