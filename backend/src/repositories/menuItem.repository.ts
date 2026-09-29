import { prisma, type Db, type Prisma } from '../db/prisma';
import type { MenuItem } from '../generated/prisma/client';
import { toOffset, type Pagination } from '../utils/pagination';

export interface MenuItemFilter {
  search?: string;
  category?: string;
  isActive?: boolean;
}

export interface CreateMenuItemData {
  sku: string;
  name: string;
  description?: string | null;
  category?: string | null;
  basePrice: string; // NUMERIC as string, e.g. "12.50"
  isActive?: boolean;
}

export type UpdateMenuItemData = Partial<Omit<CreateMenuItemData, 'sku'>>;

export const menuItemRepository = {
  async list(
    filter: MenuItemFilter,
    page: Pagination,
    db: Db = prisma,
  ): Promise<{ rows: MenuItem[]; total: number }> {
    const where: Prisma.MenuItemWhereInput = {
      isActive: filter.isActive,
      category: filter.category ? { equals: filter.category, mode: 'insensitive' } : undefined,
      OR: filter.search
        ? [
            { name: { contains: filter.search, mode: 'insensitive' } },
            { sku: { contains: filter.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [rows, total] = await Promise.all([
      db.menuItem.findMany({
        where,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        skip: toOffset(page),
        take: page.pageSize,
      }),
      db.menuItem.count({ where }),
    ]);
    return { rows, total };
  },

  findById(id: string, db: Db = prisma): Promise<MenuItem | null> {
    return db.menuItem.findUnique({ where: { id } });
  },

  create(data: CreateMenuItemData, db: Db = prisma): Promise<MenuItem> {
    return db.menuItem.create({ data });
  },

  update(id: string, data: UpdateMenuItemData, db: Db = prisma): Promise<MenuItem> {
    return db.menuItem.update({ where: { id }, data });
  },
};
