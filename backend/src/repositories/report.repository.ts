import { prisma, Prisma, type Db } from '../db/prisma';
import type { ResolvedRange } from '../utils/dateRange';

export interface RevenueRow {
  outletId: string;
  outletCode: string;
  outletName: string;
  isActive: boolean;
  revenue: string;
  transactionCount: number;
  itemsSold: number;
}

export interface TopItemRow {
  outletId: string;
  rank: number;
  menuItemId: string;
  sku: string;
  name: string;
  quantitySold: number;
  revenue: string;
}

/** Builds `s.created_at >= $from AND s.created_at < $to` for the given range. */
function dateFilter(range: ResolvedRange): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];
  if (range.from) conditions.push(Prisma.sql`s.created_at >= ${range.from}`);
  if (range.to) conditions.push(Prisma.sql`s.created_at < ${range.to}`);
  return conditions.length ? Prisma.join(conditions, ' AND ') : Prisma.sql`TRUE`;
}

export const reportRepository = {
  /**
   * Revenue per outlet. LEFT JOIN keeps outlets with no sales in the report.
   * Served by sales_outlet_created_at_idx (outlet_id, created_at).
   */
  revenueByOutlet(range: ResolvedRange, db: Db = prisma) {
    return db.$queryRaw<RevenueRow[]>`
      SELECT o.id                                    AS "outletId",
             o.code                                  AS "outletCode",
             o.name                                  AS "outletName",
             o.is_active                             AS "isActive",
             COALESCE(SUM(s.total_amount), 0)::text  AS "revenue",
             COUNT(s.id)::int                        AS "transactionCount",
             COALESCE(SUM(s.item_count), 0)::int     AS "itemsSold"
        FROM outlets o
        LEFT JOIN sales s
          ON s.outlet_id = o.id AND ${dateFilter(range)}
       GROUP BY o.id
       ORDER BY SUM(s.total_amount) DESC NULLS LAST, o.code`;
  },

  /**
   * Top N items per outlet by quantity sold (revenue as tie-breaker).
   * Aggregate once, then rank inside each outlet with a window function
   * instead of running one query per outlet.
   */
  topItemsByOutlet(range: ResolvedRange, limit: number, outletId: string | undefined, db: Db = prisma) {
    const outletFilter = outletId ? Prisma.sql`AND s.outlet_id = ${outletId}::uuid` : Prisma.empty;
    return db.$queryRaw<TopItemRow[]>`
      WITH totals AS (
        SELECT s.outlet_id,
               si.menu_item_id,
               SUM(si.quantity)   AS quantity_sold,
               SUM(si.line_total) AS revenue
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
         WHERE ${dateFilter(range)} ${outletFilter}
         GROUP BY s.outlet_id, si.menu_item_id
      ),
      ranked AS (
        SELECT t.*,
               ROW_NUMBER() OVER (
                 PARTITION BY t.outlet_id
                 ORDER BY t.quantity_sold DESC, t.revenue DESC, t.menu_item_id
               ) AS rank
          FROM totals t
      )
      SELECT r.outlet_id           AS "outletId",
             r.rank::int           AS "rank",
             r.menu_item_id        AS "menuItemId",
             m.sku                 AS "sku",
             m.name                AS "name",
             r.quantity_sold::int  AS "quantitySold",
             r.revenue::text       AS "revenue"
        FROM ranked r
        JOIN menu_items m ON m.id = r.menu_item_id
       WHERE r.rank <= ${limit}
       ORDER BY r.outlet_id, r.rank`;
  },
};
