import { reportRepository } from '../repositories/report.repository';
import { outletRepository } from '../repositories/outlet.repository';
import { resolveRange } from '../utils/dateRange';
import { fromCents, money, toCents } from '../utils/money';
import { notFound } from '../utils/errors';
import type { RevenueReportQuery, TopItemsReportQuery } from '../validators/report.validator';

export const reportService = {
  async revenueByOutlet(query: RevenueReportQuery) {
    const rows = await reportRepository.revenueByOutlet(resolveRange(query.from, query.to));

    let totalCents = 0;
    let totalTransactions = 0;
    const outlets = rows.map((r) => {
      const revenueCents = toCents(r.revenue);
      totalCents += revenueCents;
      totalTransactions += r.transactionCount;
      return {
        outletId: r.outletId,
        outletCode: r.outletCode,
        outletName: r.outletName,
        isActive: r.isActive,
        revenue: fromCents(revenueCents),
        transactionCount: r.transactionCount,
        itemsSold: r.itemsSold,
        averageTicket: r.transactionCount ? fromCents(Math.round(revenueCents / r.transactionCount)) : 0,
      };
    });

    return {
      range: { from: query.from ?? null, to: query.to ?? null },
      totals: { revenue: fromCents(totalCents), transactionCount: totalTransactions },
      outlets,
    };
  },

  async topItemsByOutlet(query: TopItemsReportQuery) {
    const outlets = query.outletId
      ? [await outletRepository.findById(query.outletId)]
      : await outletRepository.list({});
    if (outlets.some((o) => !o)) throw notFound('Outlet');

    const rows = await reportRepository.topItemsByOutlet(
      resolveRange(query.from, query.to),
      query.limit,
      query.outletId,
    );

    // Every outlet appears in the response, even with no sales in the range.
    return {
      range: { from: query.from ?? null, to: query.to ?? null },
      limit: query.limit,
      outlets: outlets.map((o) => ({
        outletId: o!.id,
        outletCode: o!.code,
        outletName: o!.name,
        items: rows
          .filter((r) => r.outletId === o!.id)
          .map((r) => ({
            rank: r.rank,
            menuItemId: r.menuItemId,
            sku: r.sku,
            name: r.name,
            quantitySold: r.quantitySold,
            revenue: money(r.revenue),
          })),
      })),
    };
  },
};
