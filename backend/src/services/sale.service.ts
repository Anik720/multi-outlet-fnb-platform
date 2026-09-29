import { withTransaction } from '../db/prisma';
import { inventoryRepository } from '../repositories/inventory.repository';
import { saleRepository, type NewSaleItem } from '../repositories/sale.repository';
import { outletService } from './outlet.service';
import { toSaleDto, type SaleDto } from '../mappers';
import { isUniqueViolation } from '../utils/dbErrors';
import { resolveRange } from '../utils/dateRange';
import { centsToDecimalString, toCents } from '../utils/money';
import { paginate } from '../utils/pagination';
import { AppError, insufficientStock, notFound, unprocessable, type StockShortage } from '../utils/errors';
import type { AuthUser } from '../types/auth';
import type { CreateSaleBody, ListSalesQuery } from '../validators/sale.validator';

export interface CreateSaleResult {
  sale: SaleDto;
  /** true when an earlier sale with the same Idempotency-Key was returned. */
  replayed: boolean;
}

/** Receipt format: <OUTLET CODE>-<8 digit per-outlet sequence>, e.g. DHK-GUL-00000042 */
export const formatReceiptNumber = (outletCode: string, seq: number) =>
  `${outletCode}-${String(seq).padStart(8, '0')}`;

/** Merges duplicate lines (same item twice in the cart) into one line per item. */
function normaliseLines(items: CreateSaleBody['items']) {
  const merged = new Map<string, number>();
  for (const { menuItemId, quantity } of items) {
    merged.set(menuItemId, (merged.get(menuItemId) ?? 0) + quantity);
  }
  return [...merged.entries()]
    .map(([menuItemId, quantity]) => ({ menuItemId, quantity }))
    .sort((a, b) => a.menuItemId.localeCompare(b.menuItemId));
}

export const saleService = {
  /**
   * Creates a sale atomically. Inside ONE database transaction:
   *   1. lock the outlet's stock rows for the cart items (fixed order -> no deadlocks)
   *   2. validate assignment, availability and stock; resolve prices server-side
   *   3. deduct stock (guarded UPDATE + CHECK constraint -> never negative)
   *   4. allocate the next per-outlet receipt number (row-locked counter -> gap-free)
   *   5. insert the sale, its lines and the inventory ledger entries
   * Any failure rolls back everything, including the receipt number.
   *
   * Idempotency: if the client sends an Idempotency-Key (e.g. an offline POS
   * replaying its queue), a retry returns the original sale instead of
   * charging and deducting twice.
   */
  async create(
    outletId: string,
    body: CreateSaleBody,
    user: AuthUser,
    idempotencyKey?: string,
  ): Promise<CreateSaleResult> {
    const outlet = await outletService.assertExists(outletId, { active: true });

    if (idempotencyKey) {
      const existing = await saleRepository.findByIdempotencyKey(outletId, idempotencyKey);
      if (existing) return { sale: toSaleDto(existing), replayed: true };
    }

    const lines = normaliseLines(body.items);

    try {
      const sale = await withTransaction(async (tx) => {
        // 1. Lock
        const stockRows = await saleRepository.lockStockForSale(
          tx,
          outletId,
          lines.map((l) => l.menuItemId),
        );
        const stockById = new Map(stockRows.map((r) => [r.menuItemId, r]));

        // 2. Validate everything first so the client gets ALL problems at once
        const notAssigned = lines.filter((l) => !stockById.has(l.menuItemId)).map((l) => l.menuItemId);
        if (notAssigned.length) {
          throw unprocessable('ITEM_NOT_ASSIGNED', 'Some items are not on this outlet’s menu', {
            menuItemIds: notAssigned,
          });
        }

        const unavailable = lines
          .map((l) => stockById.get(l.menuItemId)!)
          .filter((r) => !r.isAvailable || !r.isActive)
          .map((r) => ({ menuItemId: r.menuItemId, name: r.name }));
        if (unavailable.length) {
          throw unprocessable('ITEM_UNAVAILABLE', 'Some items are currently unavailable', unavailable);
        }

        const shortages: StockShortage[] = [];
        for (const line of lines) {
          const row = stockById.get(line.menuItemId)!;
          if (row.quantity < line.quantity) {
            shortages.push({
              menuItemId: row.menuItemId,
              name: row.name,
              requested: line.quantity,
              available: row.quantity,
            });
          }
        }
        if (shortages.length) throw insufficientStock(shortages);

        // 3. Deduct
        const updated = await saleRepository.deductStock(tx, outletId, lines);
        if (updated.length !== lines.length) {
          // Unreachable while rows are locked; kept as a defensive invariant check.
          throw new AppError(409, 'INSUFFICIENT_STOCK', 'Stock changed during checkout, please retry');
        }
        const quantityAfter = new Map(updated.map((u) => [u.menuItemId, u.quantity]));

        // 4. Receipt number (taken as late as possible to keep the counter lock short)
        const receiptSeq = await saleRepository.nextReceiptSeq(tx, outletId);

        // 5. Persist
        let totalCents = 0;
        const items: NewSaleItem[] = lines.map((line) => {
          const row = stockById.get(line.menuItemId)!;
          const unitCents = toCents(row.unitPrice);
          const lineCents = unitCents * line.quantity;
          totalCents += lineCents;
          return {
            menuItemId: line.menuItemId,
            itemName: row.name,
            unitPrice: centsToDecimalString(unitCents),
            quantity: line.quantity,
            lineTotal: centsToDecimalString(lineCents),
          };
        });

        const created = await saleRepository.create(tx, {
          outletId,
          receiptSeq,
          receiptNumber: formatReceiptNumber(outlet.code, receiptSeq),
          idempotencyKey: idempotencyKey ?? null,
          itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
          totalAmount: centsToDecimalString(totalCents),
          createdById: user.id,
          clientCreatedAt: body.clientCreatedAt ? new Date(body.clientCreatedAt) : null,
          items,
        });

        await inventoryRepository.createMovements(
          lines.map((line) => ({
            outletId,
            menuItemId: line.menuItemId,
            change: -line.quantity,
            quantityAfter: quantityAfter.get(line.menuItemId)!,
            reason: 'SALE' as const,
            saleId: created.id,
            createdById: user.id,
          })),
          tx,
        );

        return created;
      });

      return { sale: toSaleDto(sale), replayed: false };
    } catch (err) {
      // Two requests with the same key raced past the pre-check: the loser's
      // transaction was rolled back entirely; return the winner's sale.
      if (idempotencyKey && isUniqueViolation(err, 'sales_outlet_idempotency_uq')) {
        const existing = await saleRepository.findByIdempotencyKey(outletId, idempotencyKey);
        if (existing) return { sale: toSaleDto(existing), replayed: true };
      }
      throw err;
    }
  },

  async getById(outletId: string, saleId: string) {
    const sale = await saleRepository.findById(outletId, saleId);
    if (!sale) throw notFound('Sale');
    return toSaleDto(sale);
  },

  async list(outletId: string, query: ListSalesQuery) {
    await outletService.assertExists(outletId);
    const { page, pageSize, from, to } = query;
    const { rows, total } = await saleRepository.list(outletId, resolveRange(from, to), { page, pageSize });
    return paginate(rows.map(toSaleDto), total, { page, pageSize });
  },
};
