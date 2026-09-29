import { prisma, type Db, type Prisma } from '../db/prisma';
import type { InventoryMovementReason } from '../generated/prisma/client';

const withMenuItem = {
  assignment: { select: { isAvailable: true, menuItem: true } },
} satisfies Prisma.InventoryInclude;

export type InventoryWithMenuItem = Prisma.InventoryGetPayload<{ include: typeof withMenuItem }>;

export interface MovementData {
  outletId: string;
  menuItemId: string;
  change: number;
  quantityAfter: number;
  reason: InventoryMovementReason;
  saleId?: string | null;
  note?: string | null;
  createdById?: string | null;
}

export const inventoryRepository = {
  listForOutlet(outletId: string, db: Db = prisma): Promise<InventoryWithMenuItem[]> {
    return db.inventory.findMany({
      where: { outletId },
      include: withMenuItem,
      orderBy: { assignment: { menuItem: { name: 'asc' } } },
    });
  },

  find(outletId: string, menuItemId: string, db: Db = prisma) {
    return db.inventory.findUnique({
      where: { outletId_menuItemId: { outletId, menuItemId } },
      include: withMenuItem,
    });
  },

  /**
   * Atomic conditional update: applies `change` only if the result stays >= 0.
   * The check and the write happen in ONE statement under the row lock, so two
   * concurrent decrements can never both pass the check (no lost update).
   * Returns false when the guard rejected the change (or the row is missing).
   */
  async applyChange(outletId: string, menuItemId: string, change: number, db: Db = prisma): Promise<boolean> {
    const { count } = await db.inventory.updateMany({
      where: { outletId, menuItemId, quantity: { gte: -change } },
      data: { quantity: { increment: change } },
    });
    return count === 1;
  },

  createMovements(movements: MovementData[], db: Db = prisma) {
    return db.inventoryMovement.createMany({ data: movements });
  },

  listMovements(outletId: string, opts: { menuItemId?: string; limit: number }, db: Db = prisma) {
    return db.inventoryMovement.findMany({
      where: { outletId, menuItemId: opts.menuItemId },
      include: { menuItem: { select: { name: true, sku: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit,
    });
  },
};
