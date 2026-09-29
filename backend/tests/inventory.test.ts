import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma';
import { api, auth, createFixture, resetDb, stockOf, type Fixture } from './helpers';

let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await createFixture({ burger: 5 });
});
afterAll(() => prisma.$disconnect());

const adjustUrl = (outletId: string, menuItemId: string) =>
  `/api/v1/outlets/${outletId}/inventory/${menuItemId}/adjustments`;

describe('inventory', () => {
  it('tracks stock per outlet', async () => {
    const a = await api().get(`/api/v1/outlets/${f.outlets.a.id}/inventory`).set(auth(f.outlets.a.token));
    const b = await api().get(`/api/v1/outlets/${f.outlets.b.id}/inventory`).set(auth(f.outlets.b.token));
    expect(a.body.data).toHaveLength(3);
    expect(b.body.data).toHaveLength(1);
  });

  it('restocks and records a ledger entry', async () => {
    const res = await api()
      .post(adjustUrl(f.outlets.a.id, f.items.burger))
      .set(auth(f.outlets.a.token))
      .send({ change: 10, reason: 'RESTOCK', note: 'Morning delivery' });
    expect(res.status).toBe(201);
    expect(res.body.data.quantity).toBe(15);

    const moves = await api()
      .get(`/api/v1/outlets/${f.outlets.a.id}/inventory/movements`)
      .set(auth(f.outlets.a.token));
    expect(moves.body.data[0]).toMatchObject({ change: 10, quantityAfter: 15, reason: 'RESTOCK' });
  });

  it('never lets stock go negative', async () => {
    const res = await api()
      .post(adjustUrl(f.outlets.a.id, f.items.burger))
      .set(auth(f.outlets.a.token))
      .send({ change: -6, reason: 'WASTAGE' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details[0]).toMatchObject({ requested: 6, available: 5 });
    expect(await stockOf(f.outlets.a.id, f.items.burger)).toBe(5);
  });

  it('rejects semantically wrong adjustments', async () => {
    const res = await api()
      .post(adjustUrl(f.outlets.a.id, f.items.burger))
      .set(auth(f.outlets.a.token))
      .send({ change: -1, reason: 'RESTOCK' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the item is not assigned to the outlet', async () => {
    const res = await api()
      .post(adjustUrl(f.outlets.b.id, f.items.burger))
      .set(auth(f.outlets.b.token))
      .send({ change: 1, reason: 'RESTOCK' });
    expect(res.status).toBe(404);
  });

  it('has a database-level CHECK as the last line of defence', async () => {
    await expect(
      prisma.inventory.update({
        where: { outletId_menuItemId: { outletId: f.outlets.a.id, menuItemId: f.items.burger } },
        data: { quantity: -1 },
      }),
    ).rejects.toThrow(/inventory_quantity_non_negative_chk/);
  });
});
