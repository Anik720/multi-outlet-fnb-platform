import { withTransaction } from '../db/prisma';
import { inventoryRepository } from '../repositories/inventory.repository';
import { outletService } from './outlet.service';
import { toInventoryDto } from '../mappers';
import { insufficientStock, notFound } from '../utils/errors';
import type { AdjustInventoryBody, ListMovementsQuery } from '../validators/inventory.validator';

export const inventoryService = {
  async list(outletId: string) {
    await outletService.assertExists(outletId);
    const rows = await inventoryRepository.listForOutlet(outletId);
    return rows.map(toInventoryDto);
  },

  /**
   * Manual stock change (restock / wastage / correction). The conditional
   * UPDATE rejects anything that would take stock below zero, and every change
   * is written to the movement ledger in the same transaction.
   */
  async adjust(outletId: string, menuItemId: string, body: AdjustInventoryBody, userId: string) {
    return withTransaction(async (tx) => {
      const applied = await inventoryRepository.applyChange(outletId, menuItemId, body.change, tx);
      const row = await inventoryRepository.find(outletId, menuItemId, tx);
      if (!row) throw notFound('Inventory for this outlet/menu item (is the item assigned?)');
      if (!applied) {
        throw insufficientStock([
          {
            menuItemId,
            name: row.assignment.menuItem.name,
            requested: -body.change,
            available: row.quantity,
          },
        ]);
      }

      await inventoryRepository.createMovements(
        [
          {
            outletId,
            menuItemId,
            change: body.change,
            quantityAfter: row.quantity,
            reason: body.reason,
            note: body.note ?? null,
            createdById: userId,
          },
        ],
        tx,
      );
      return toInventoryDto(row);
    });
  },

  async listMovements(outletId: string, query: ListMovementsQuery) {
    await outletService.assertExists(outletId);
    const rows = await inventoryRepository.listMovements(outletId, query);
    return rows.map((m) => ({
      id: Number(m.id),
      menuItemId: m.menuItemId,
      name: m.menuItem.name,
      sku: m.menuItem.sku,
      change: m.change,
      quantityAfter: m.quantityAfter,
      reason: m.reason,
      saleId: m.saleId,
      note: m.note,
      createdById: m.createdById,
      createdAt: m.createdAt,
    }));
  },
};
