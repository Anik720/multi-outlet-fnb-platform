import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma';
import { api, auth, createFixture, resetDb, type Fixture } from './helpers';

let f: Fixture;

beforeAll(async () => {
  await resetDb();
  f = await createFixture();
  const sell = (outlet: { id: string; token: string }, items: { menuItemId: string; quantity: number }[]) =>
    api().post(`/api/v1/outlets/${outlet.id}/sales`).set(auth(outlet.token)).send({ items });

  // Outlet A: coffee 5 (5 x 250), burger 2 (2 x 450), cake 1 (300) => 2450.00
  await sell(f.outlets.a, [{ menuItemId: f.items.coffee, quantity: 3 }, { menuItemId: f.items.burger, quantity: 2 }]);
  await sell(f.outlets.a, [{ menuItemId: f.items.coffee, quantity: 2 }, { menuItemId: f.items.cake, quantity: 1 }]);
  // Outlet B: coffee 1 x 200 => 200.00
  await sell(f.outlets.b, [{ menuItemId: f.items.coffee, quantity: 1 }]);
});
afterAll(() => prisma.$disconnect());

describe('reports', () => {
  it('returns total revenue by outlet', async () => {
    const res = await api().get('/api/v1/reports/revenue-by-outlet').set(auth(f.hqToken));
    expect(res.status).toBe(200);
    expect(res.body.data.totals).toEqual({ revenue: 2650, transactionCount: 3 });
    const byCode = Object.fromEntries(
      res.body.data.outlets.map((o: { outletCode: string }) => [o.outletCode, o]),
    );
    expect(byCode['OUT-A']).toMatchObject({ revenue: 2450, transactionCount: 2, itemsSold: 8, averageTicket: 1225 });
    expect(byCode['OUT-B']).toMatchObject({ revenue: 200, transactionCount: 1 });
  });

  it('returns top selling items per outlet, ranked by quantity', async () => {
    const res = await api().get('/api/v1/reports/top-items').set(auth(f.hqToken));
    expect(res.status).toBe(200);
    expect(res.body.data.limit).toBe(5);
    const a = res.body.data.outlets.find((o: { outletCode: string }) => o.outletCode === 'OUT-A');
    expect(a.items.map((i: { name: string; quantitySold: number; rank: number }) => [i.rank, i.name, i.quantitySold])).toEqual([
      [1, 'Coffee', 5],
      [2, 'Burger', 2],
      [3, 'Cake', 1],
    ]);
    expect(a.items[0].revenue).toBe(1250);
  });

  it('honours limit, outlet filter and date range', async () => {
    const one = await api()
      .get(`/api/v1/reports/top-items?limit=1&outletId=${f.outlets.a.id}`)
      .set(auth(f.hqToken));
    expect(one.body.data.outlets).toHaveLength(1);
    expect(one.body.data.outlets[0].items).toHaveLength(1);

    const future = await api().get('/api/v1/reports/revenue-by-outlet?from=2999-01-01').set(auth(f.hqToken));
    expect(future.body.data.totals.revenue).toBe(0);
    expect(future.body.data.outlets).toHaveLength(2); // outlets with no sales still listed

    const bad = await api().get('/api/v1/reports/revenue-by-outlet?from=2026-02-01&to=2026-01-01').set(auth(f.hqToken));
    expect(bad.status).toBe(400);
  });

  it('is HQ-only', async () => {
    const res = await api().get('/api/v1/reports/revenue-by-outlet').set(auth(f.outlets.a.token));
    expect(res.status).toBe(403);
  });
});
