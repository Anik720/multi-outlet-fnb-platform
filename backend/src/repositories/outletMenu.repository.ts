import { prisma, type Db, type Prisma } from '../db/prisma';

const withDetails = {
  menuItem: true,
  inventory: { select: { quantity: true } },
} satisfies Prisma.OutletMenuItemInclude;

export type OutletMenuItemWithDetails = Prisma.OutletMenuItemGetPayload<{ include: typeof withDetails }>;

export interface AssignmentData {
  priceOverride?: string | null;
  isAvailable?: boolean;
}

export const outletMenuRepository = {
  listForOutlet(
    outletId: string,
    opts: { availableOnly: boolean },
    db: Db = prisma,
  ): Promise<OutletMenuItemWithDetails[]> {
    return db.outletMenuItem.findMany({
      where: {
        outletId,
        ...(opts.availableOnly ? { isAvailable: true, menuItem: { isActive: true } } : {}),
      },
      include: withDetails,
      orderBy: [{ menuItem: { category: 'asc' } }, { menuItem: { name: 'asc' } }],
    });
  },

  find(outletId: string, menuItemId: string, db: Db = prisma): Promise<OutletMenuItemWithDetails | null> {
    return db.outletMenuItem.findUnique({
      where: { outletId_menuItemId: { outletId, menuItemId } },
      include: withDetails,
    });
  },

  /** New assignments start with an empty stock row so stock can be adjusted immediately. */
  create(outletId: string, menuItemId: string, data: AssignmentData, db: Db = prisma) {
    return db.outletMenuItem.create({
      data: { outletId, menuItemId, ...data, inventory: { create: { quantity: 0 } } },
      include: withDetails,
    });
  },

  update(outletId: string, menuItemId: string, data: AssignmentData, db: Db = prisma) {
    return db.outletMenuItem.update({
      where: { outletId_menuItemId: { outletId, menuItemId } },
      data,
      include: withDetails,
    });
  },

  /** Removing an assignment cascades to its inventory row (history is kept in movements). */
  async delete(outletId: string, menuItemId: string, db: Db = prisma): Promise<boolean> {
    const { count } = await db.outletMenuItem.deleteMany({ where: { outletId, menuItemId } });
    return count > 0;
  },
};
