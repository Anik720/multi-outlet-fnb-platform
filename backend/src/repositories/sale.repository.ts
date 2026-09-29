import { prisma, Prisma, type Db } from '../db/prisma';
import { toOffset, type Pagination } from '../utils/pagination';
import type { ResolvedRange } from '../utils/dateRange';

export interface LockedStockRow {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: string; // effective price as NUMERIC string
  isAvailable: boolean;
  isActive: boolean;
}

export interface NewSaleItem {
  menuItemId: string;
  itemName: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface NewSale {
  outletId: string;
  receiptSeq: number;
  receiptNumber: string;
  idempotencyKey: string | null;
  itemCount: number;
  totalAmount: string;
  createdById: string | null;
  clientCreatedAt: Date | null;
  items: NewSaleItem[];
}

const withItems = {
  items: { orderBy: { id: 'asc' } },
} satisfies Prisma.SaleInclude;

export type SaleWithItems = Prisma.SaleGetPayload<{ include: typeof withItems }>;

export const saleRepository = {
  /**
   * Locks the outlet's stock rows for the requested items (SELECT ... FOR UPDATE)
   * and returns them with their effective price. Rows are locked in a fixed
   * order (menu_item_id) so two sales touching the same items can never
   * deadlock each other. Items that are not assigned to the outlet are simply
   * absent from the result.
   */
  lockStockForSale(tx: Prisma.TransactionClient, outletId: string, menuItemIds: string[]) {
    return tx.$queryRaw<LockedStockRow[]>`
      SELECT i.menu_item_id                                       AS "menuItemId",
             m.name                                               AS "name",
             i.quantity                                           AS "quantity",
             COALESCE(omi.price_override, m.base_price)::text     AS "unitPrice",
             omi.is_available                                     AS "isAvailable",
             m.is_active                                          AS "isActive"
        FROM inventory i
        JOIN outlet_menu_items omi
          ON omi.outlet_id = i.outlet_id AND omi.menu_item_id = i.menu_item_id
        JOIN menu_items m ON m.id = i.menu_item_id
       WHERE i.outlet_id = ${outletId}::uuid
         AND i.menu_item_id = ANY(${menuItemIds}::uuid[])
       ORDER BY i.menu_item_id
         FOR UPDATE OF i`;
  },

  /**
   * Deducts all line quantities in a single statement. The `quantity >= d.qty`
   * guard (plus the CHECK constraint) means stock can never go negative even if
   * a caller forgot to lock first. Returns the post-deduction quantities.
   */
  deductStock(
    tx: Prisma.TransactionClient,
    outletId: string,
    lines: { menuItemId: string; quantity: number }[],
  ) {
    const ids = lines.map((l) => l.menuItemId);
    const qtys = lines.map((l) => l.quantity);
    return tx.$queryRaw<{ menuItemId: string; quantity: number }[]>`
      UPDATE inventory AS i
         SET quantity = i.quantity - d.qty
        FROM unnest(${ids}::uuid[], ${qtys}::int[]) AS d(menu_item_id, qty)
       WHERE i.outlet_id = ${outletId}::uuid
         AND i.menu_item_id = d.menu_item_id
         AND i.quantity >= d.qty
   RETURNING i.menu_item_id AS "menuItemId", i.quantity AS "quantity"`;
  },

  /**
   * Allocates the next receipt number for the outlet. The UPDATE takes a row
   * lock held until COMMIT/ROLLBACK, which serialises concurrent sales of the
   * same outlet at this point only (other outlets are unaffected). Because it
   * is part of the sale transaction, a failed sale releases its number: the
   * sequence stays strictly sequential with no gaps and no duplicates.
   */
  async nextReceiptSeq(tx: Prisma.TransactionClient, outletId: string): Promise<number> {
    const rows = await tx.$queryRaw<{ lastValue: bigint }[]>`
      INSERT INTO outlet_receipt_counters (outlet_id, last_value)
      VALUES (${outletId}::uuid, 1)
      ON CONFLICT (outlet_id)
      DO UPDATE SET last_value = outlet_receipt_counters.last_value + 1
      RETURNING last_value AS "lastValue"`;
    return Number(rows[0]!.lastValue);
  },

  create(tx: Prisma.TransactionClient, sale: NewSale): Promise<SaleWithItems> {
    const { items, ...header } = sale;
    return tx.sale.create({
      data: { ...header, receiptSeq: BigInt(header.receiptSeq), items: { createMany: { data: items } } },
      include: withItems,
    });
  },

  findById(outletId: string, saleId: string, db: Db = prisma): Promise<SaleWithItems | null> {
    return db.sale.findFirst({ where: { id: saleId, outletId }, include: withItems });
  },

  findByIdempotencyKey(outletId: string, key: string, db: Db = prisma): Promise<SaleWithItems | null> {
    return db.sale.findUnique({
      where: { outletId_idempotencyKey: { outletId, idempotencyKey: key } },
      include: withItems,
    });
  },

  async list(outletId: string, range: ResolvedRange, page: Pagination, db: Db = prisma) {
    const where: Prisma.SaleWhereInput = {
      outletId,
      createdAt: { gte: range.from ?? undefined, lt: range.to ?? undefined },
    };
    const [rows, total] = await Promise.all([
      db.sale.findMany({
        where,
        include: withItems,
        orderBy: { createdAt: 'desc' },
        skip: toOffset(page),
        take: page.pageSize,
      }),
      db.sale.count({ where }),
    ]);
    return { rows, total };
  },
};
