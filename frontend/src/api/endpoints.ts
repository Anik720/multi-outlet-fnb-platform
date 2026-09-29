import { apiRequest } from './client';
import type {
  InventoryMovement,
  InventoryRow,
  MenuItem,
  MovementReason,
  Outlet,
  OutletMenuItem,
  Paginated,
  RevenueReport,
  Sale,
  TopItemsReport,
  User,
} from './types';

type Data<T> = { data: T };
const unwrap = <T>(p: Promise<Data<T>>) => p.then((r) => r.data);

export interface DateRange {
  from?: string;
  to?: string;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      unwrap(apiRequest<Data<{ token: string; user: User }>>('/auth/login', { method: 'POST', body: { email, password } })),
    me: () => unwrap(apiRequest<Data<User>>('/auth/me')),
  },

  outlets: {
    list: () => unwrap(apiRequest<Data<Outlet[]>>('/outlets')),
    get: (id: string) => unwrap(apiRequest<Data<Outlet>>(`/outlets/${id}`)),
    create: (body: { code: string; name: string; address?: string }) =>
      unwrap(apiRequest<Data<Outlet>>('/outlets', { method: 'POST', body })),
    update: (id: string, body: Partial<Pick<Outlet, 'name' | 'address' | 'isActive'>>) =>
      unwrap(apiRequest<Data<Outlet>>(`/outlets/${id}`, { method: 'PATCH', body })),
  },

  menuItems: {
    list: (query: { search?: string; page?: number; pageSize?: number } = {}) =>
      apiRequest<Paginated<MenuItem>>('/menu-items', { query }),
    create: (body: { sku: string; name: string; category?: string; description?: string; basePrice: number }) =>
      unwrap(apiRequest<Data<MenuItem>>('/menu-items', { method: 'POST', body })),
    update: (id: string, body: Partial<Pick<MenuItem, 'name' | 'category' | 'description' | 'basePrice' | 'isActive'>>) =>
      unwrap(apiRequest<Data<MenuItem>>(`/menu-items/${id}`, { method: 'PATCH', body })),
  },

  outletMenu: {
    list: (outletId: string, availableOnly = false) =>
      unwrap(apiRequest<Data<OutletMenuItem[]>>(`/outlets/${outletId}/menu-items`, { query: { availableOnly } })),
    assign: (outletId: string, menuItemId: string, body: { priceOverride?: number | null; isAvailable?: boolean }) =>
      unwrap(
        apiRequest<Data<OutletMenuItem>>(`/outlets/${outletId}/menu-items/${menuItemId}`, { method: 'PUT', body }),
      ),
    unassign: (outletId: string, menuItemId: string) =>
      apiRequest<void>(`/outlets/${outletId}/menu-items/${menuItemId}`, { method: 'DELETE' }),
  },

  inventory: {
    list: (outletId: string) => unwrap(apiRequest<Data<InventoryRow[]>>(`/outlets/${outletId}/inventory`)),
    adjust: (
      outletId: string,
      menuItemId: string,
      body: { change: number; reason: Exclude<MovementReason, 'SALE'>; note?: string },
    ) =>
      unwrap(
        apiRequest<Data<InventoryRow>>(`/outlets/${outletId}/inventory/${menuItemId}/adjustments`, {
          method: 'POST',
          body,
        }),
      ),
    movements: (outletId: string, limit = 50) =>
      unwrap(apiRequest<Data<InventoryMovement[]>>(`/outlets/${outletId}/inventory/movements`, { query: { limit } })),
  },

  sales: {
    list: (outletId: string, query: DateRange & { page?: number; pageSize?: number } = {}) =>
      apiRequest<Paginated<Sale>>(`/outlets/${outletId}/sales`, { query: { ...query } }),
    create: (outletId: string, items: { menuItemId: string; quantity: number }[], idempotencyKey: string) =>
      unwrap(
        apiRequest<Data<Sale>>(`/outlets/${outletId}/sales`, {
          method: 'POST',
          body: { items, clientCreatedAt: new Date().toISOString() },
          headers: { 'Idempotency-Key': idempotencyKey },
        }),
      ),
  },

  reports: {
    revenueByOutlet: (range: DateRange) =>
      unwrap(apiRequest<Data<RevenueReport>>('/reports/revenue-by-outlet', { query: { ...range } })),
    topItems: (range: DateRange & { limit?: number }) =>
      unwrap(apiRequest<Data<TopItemsReport>>('/reports/top-items', { query: { ...range } })),
  },
};
