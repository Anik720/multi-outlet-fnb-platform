import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/db/prisma';

export const app = createApp();
export const api = () => request(app);
export const PASSWORD = 'Password123!';

export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE inventory_movements, sale_items, sales, inventory, outlet_menu_items,
             outlet_receipt_counters, users, menu_items, outlets RESTART IDENTITY CASCADE`);
}

const passwordHash = bcrypt.hashSync(PASSWORD, 4);

export async function login(email: string): Promise<string> {
  const res = await api().post('/api/v1/auth/login').send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  return res.body.data.token as string;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface Fixture {
  hqToken: string;
  outlets: { a: { id: string; code: string; token: string }; b: { id: string; code: string; token: string } };
  items: { coffee: string; burger: string; cake: string; unassigned: string };
}

/**
 * Two outlets (A, B), each with a staff user, and a small master menu:
 *  - coffee 200.00  -> assigned to A (override 250.00) and B (base price)
 *  - burger 450.00  -> assigned to A only
 *  - cake   300.00  -> assigned to A only
 *  - unassigned     -> in the master menu, assigned nowhere
 */
export async function createFixture(stock: { coffee?: number; burger?: number; cake?: number } = {}) {
  await prisma.user.create({
    data: { email: 'hq@test.io', fullName: 'HQ', role: 'HQ_ADMIN', passwordHash },
  });

  const mk = (sku: string, name: string, basePrice: string) =>
    prisma.menuItem.create({ data: { sku, name, basePrice, category: 'Test' } });
  const coffee = await mk('T-COF', 'Coffee', '200.00');
  const burger = await mk('T-BRG', 'Burger', '450.00');
  const cake = await mk('T-CAK', 'Cake', '300.00');
  const unassigned = await mk('T-UNA', 'Unassigned', '100.00');

  const mkOutlet = async (code: string, email: string) => {
    const outlet = await prisma.outlet.create({
      data: { code, name: `Outlet ${code}`, receiptCounter: { create: {} } },
    });
    await prisma.user.create({
      data: { email, fullName: `${code} staff`, role: 'OUTLET_STAFF', outletId: outlet.id, passwordHash },
    });
    return outlet;
  };
  const a = await mkOutlet('OUT-A', 'a@test.io');
  const b = await mkOutlet('OUT-B', 'b@test.io');

  const assign = (outletId: string, menuItemId: string, quantity: number, priceOverride?: string) =>
    prisma.outletMenuItem.create({
      data: { outletId, menuItemId, priceOverride, inventory: { create: { quantity } } },
    });
  await assign(a.id, coffee.id, stock.coffee ?? 100, '250.00');
  await assign(a.id, burger.id, stock.burger ?? 100);
  await assign(a.id, cake.id, stock.cake ?? 100);
  await assign(b.id, coffee.id, stock.coffee ?? 100);

  const fixture: Fixture = {
    hqToken: await login('hq@test.io'),
    outlets: {
      a: { id: a.id, code: a.code, token: await login('a@test.io') },
      b: { id: b.id, code: b.code, token: await login('b@test.io') },
    },
    items: { coffee: coffee.id, burger: burger.id, cake: cake.id, unassigned: unassigned.id },
  };
  return fixture;
}

export async function stockOf(outletId: string, menuItemId: string) {
  const row = await prisma.inventory.findUnique({
    where: { outletId_menuItemId: { outletId, menuItemId } },
  });
  return row?.quantity;
}
