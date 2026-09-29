import { withTransaction } from '../db/prisma';
import { menuItemRepository } from '../repositories/menuItem.repository';
import { outletMenuRepository, type AssignmentData } from '../repositories/outletMenu.repository';
import { outletService } from './outlet.service';
import { toOutletMenuItemDto } from '../mappers';
import { notFound, unprocessable } from '../utils/errors';
import type { AssignMenuItemBody, ListOutletMenuQuery } from '../validators/outletMenu.validator';

export const outletMenuService = {
  /** The outlet's menu: only items HQ assigned to it, with effective price + stock. */
  async list(outletId: string, query: ListOutletMenuQuery) {
    await outletService.assertExists(outletId);
    const rows = await outletMenuRepository.listForOutlet(outletId, { availableOnly: query.availableOnly });
    return rows.map(toOutletMenuItemDto);
  },

  /**
   * Idempotent upsert (PUT): assigns a master menu item to an outlet, or
   * updates the price override / availability of an existing assignment.
   */
  async assign(outletId: string, menuItemId: string, body: AssignMenuItemBody) {
    await outletService.assertExists(outletId);
    const menuItem = await menuItemRepository.findById(menuItemId);
    if (!menuItem) throw notFound('Menu item');

    const data: AssignmentData = {
      isAvailable: body.isAvailable,
      priceOverride:
        body.priceOverride === undefined ? undefined : body.priceOverride === null ? null : body.priceOverride.toFixed(2),
    };

    return withTransaction(async (tx) => {
      const existing = await outletMenuRepository.find(outletId, menuItemId, tx);
      if (existing) {
        const updated = await outletMenuRepository.update(outletId, menuItemId, data, tx);
        return { created: false, item: toOutletMenuItemDto(updated) };
      }
      if (!menuItem.isActive) {
        throw unprocessable('MENU_ITEM_INACTIVE', 'Inactive menu items cannot be assigned to outlets');
      }
      const created = await outletMenuRepository.create(outletId, menuItemId, data, tx);
      return { created: true, item: toOutletMenuItemDto(created) };
    });
  },

  async unassign(outletId: string, menuItemId: string) {
    const removed = await outletMenuRepository.delete(outletId, menuItemId);
    if (!removed) throw notFound('Menu item assignment');
  },
};
