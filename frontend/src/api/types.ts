export type Role = 'HQ_ADMIN' | 'OUTLET_STAFF';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  outletId: string | null;
}

export interface Outlet {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  basePrice: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OutletMenuItem {
  outletId: string;
  menuItemId: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  basePrice: number;
  priceOverride: number | null;
  effectivePrice: number;
  isAvailable: boolean;
  isMenuItemActive: boolean;
  isSellable: boolean;
  stock: number;
  updatedAt: string;
}

export interface InventoryRow {
  outletId: string;
  menuItemId: string;
  sku: string;
  name: string;
  category: string | null;
  quantity: number;
  isAvailable: boolean;
  updatedAt: string;
}

export type MovementReason = 'RESTOCK' | 'ADJUSTMENT' | 'WASTAGE' | 'SALE';

export interface InventoryMovement {
  id: number;
  menuItemId: string;
  name: string;
  sku: string;
  change: number;
  quantityAfter: number;
  reason: MovementReason;
  saleId: string | null;
  note: string | null;
  createdAt: string;
}

export interface SaleItem {
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  outletId: string;
  receiptNumber: string;
  receiptSeq: number;
  itemCount: number;
  totalAmount: number;
  clientCreatedAt: string | null;
  createdAt: string;
  items: SaleItem[];
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface RevenueReport {
  range: { from: string | null; to: string | null };
  totals: { revenue: number; transactionCount: number };
  outlets: {
    outletId: string;
    outletCode: string;
    outletName: string;
    isActive: boolean;
    revenue: number;
    transactionCount: number;
    itemsSold: number;
    averageTicket: number;
  }[];
}

export interface TopItemsReport {
  range: { from: string | null; to: string | null };
  limit: number;
  outlets: {
    outletId: string;
    outletCode: string;
    outletName: string;
    items: { rank: number; menuItemId: string; sku: string; name: string; quantitySold: number; revenue: number }[];
  }[];
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}
