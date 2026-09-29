/**
 * DB models -> API DTOs. Keeps persistence details (Decimal, BigInt, password
 * hashes, column naming) from leaking into HTTP responses.
 */
import type { MenuItem, Outlet, User } from '../generated/prisma/client';
import type { OutletMenuItemWithDetails } from '../repositories/outletMenu.repository';
import type { InventoryWithMenuItem } from '../repositories/inventory.repository';
import type { SaleWithItems } from '../repositories/sale.repository';
import { money } from '../utils/money';

export const toUserDto = (u: User) => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  role: u.role,
  outletId: u.outletId,
});

export const toOutletDto = (o: Outlet) => ({
  id: o.id,
  code: o.code,
  name: o.name,
  address: o.address,
  isActive: o.isActive,
  createdAt: o.createdAt,
  updatedAt: o.updatedAt,
});

export const toMenuItemDto = (m: MenuItem) => ({
  id: m.id,
  sku: m.sku,
  name: m.name,
  description: m.description,
  category: m.category,
  basePrice: money(m.basePrice),
  isActive: m.isActive,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
});

export const toOutletMenuItemDto = (row: OutletMenuItemWithDetails) => {
  const priceOverride = money(row.priceOverride);
  const basePrice = money(row.menuItem.basePrice);
  return {
    outletId: row.outletId,
    menuItemId: row.menuItemId,
    sku: row.menuItem.sku,
    name: row.menuItem.name,
    description: row.menuItem.description,
    category: row.menuItem.category,
    basePrice,
    priceOverride,
    effectivePrice: priceOverride ?? basePrice,
    isAvailable: row.isAvailable,
    isMenuItemActive: row.menuItem.isActive,
    // Sellable = assigned, switched on at the outlet, active in the master menu, in stock.
    isSellable: row.isAvailable && row.menuItem.isActive && (row.inventory?.quantity ?? 0) > 0,
    stock: row.inventory?.quantity ?? 0,
    updatedAt: row.updatedAt,
  };
};

export const toInventoryDto = (row: InventoryWithMenuItem) => ({
  outletId: row.outletId,
  menuItemId: row.menuItemId,
  sku: row.assignment.menuItem.sku,
  name: row.assignment.menuItem.name,
  category: row.assignment.menuItem.category,
  quantity: row.quantity,
  isAvailable: row.assignment.isAvailable,
  updatedAt: row.updatedAt,
});

export const toSaleDto = (s: SaleWithItems) => ({
  id: s.id,
  outletId: s.outletId,
  receiptNumber: s.receiptNumber,
  receiptSeq: Number(s.receiptSeq),
  itemCount: s.itemCount,
  totalAmount: money(s.totalAmount),
  clientCreatedAt: s.clientCreatedAt,
  createdAt: s.createdAt,
  createdById: s.createdById,
  items: s.items.map((i) => ({
    menuItemId: i.menuItemId,
    name: i.itemName,
    unitPrice: money(i.unitPrice),
    quantity: i.quantity,
    lineTotal: money(i.lineTotal),
  })),
});

export type SaleDto = ReturnType<typeof toSaleDto>;
