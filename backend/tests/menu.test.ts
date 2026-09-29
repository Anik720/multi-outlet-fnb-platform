import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma';
import { api, auth, createFixture, resetDb, stockOf, type Fixture } from './helpers';

let f: Fixture;

beforeEach(async () => {
  await resetDb();
  f = await createFixture();
});
afterAll(() => prisma.$disconnect());

describe('master menu (HQ)', () => {
  it('creates a menu item and rejects a duplicate SKU', async () => {
    const body = { sku: 'new-01', name: 'Latte', basePrice: 320.5, category: 'Drinks' };
    const res = await api().post('/api/v1/menu-items').set(auth(f.hqToken)).send(body);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ sku: 'NEW-01', basePrice: 320.5, isActive: true });

    const dup = await api().post('/api/v1/menu-items').set(auth(f.hqToken)).send(body);
    expect(dup.status).toBe(409);
  });

  it('validates input', async () => {
    const res = await api()
      .post('/api/v1/menu-items')
      .set(auth(f.hqToken))
      .send({ sku: '!', name: '', basePrice: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['sku', 'name', 'basePrice']),
    );
  });

  it('is HQ-only', async () => {
    const res = await api().get('/api/v1/menu-items').set(auth(f.outlets.a.token));
    expect(res.status).toBe(403);
  });

  it('lists with pagination and search', async () => {
    const res = await api().get('/api/v1/menu-items?search=bur&pageSize=10').set(auth(f.hqToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
  });
});

describe('outlet menu assignment', () => {
  it('outlet sees ONLY its assigned items, with the effective (overridden) price', async () => {
    const a = await api().get(`/api/v1/outlets/${f.outlets.a.id}/menu-items`).set(auth(f.outlets.a.token));
    expect(a.status).toBe(200);
    expect(a.body.data.map((i: { sku: string }) => i.sku).sort()).toEqual(['T-BRG', 'T-CAK', 'T-COF']);
    const coffeeAtA = a.body.data.find((i: { sku: string }) => i.sku === 'T-COF');
    expect(coffeeAtA).toMatchObject({ basePrice: 200, priceOverride: 250, effectivePrice: 250 });

    const b = await api().get(`/api/v1/outlets/${f.outlets.b.id}/menu-items`).set(auth(f.outlets.b.token));
    expect(b.body.data).toHaveLength(1);
    expect(b.body.data[0]).toMatchObject({ sku: 'T-COF', priceOverride: null, effectivePrice: 200 });
  });

  it("forbids staff from reading another outlet's menu", async () => {
    const res = await api().get(`/api/v1/outlets/${f.outlets.b.id}/menu-items`).set(auth(f.outlets.a.token));
    expect(res.status).toBe(403);
  });

  it('assigns (201), then updates the override (200), then clears it', async () => {
    const url = `/api/v1/outlets/${f.outlets.b.id}/menu-items/${f.items.burger}`;
    const created = await api().put(url).set(auth(f.hqToken)).send({ priceOverride: 499.99 });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ effectivePrice: 499.99, stock: 0 });
    expect(await stockOf(f.outlets.b.id, f.items.burger)).toBe(0);

    const updated = await api().put(url).set(auth(f.hqToken)).send({ priceOverride: 520 });
    expect(updated.status).toBe(200);
    expect(updated.body.data.effectivePrice).toBe(520);

    const cleared = await api().put(url).set(auth(f.hqToken)).send({ priceOverride: null });
    expect(cleared.body.data).toMatchObject({ priceOverride: null, effectivePrice: 450 });
  });

  it('only HQ can assign', async () => {
    const res = await api()
      .put(`/api/v1/outlets/${f.outlets.a.id}/menu-items/${f.items.unassigned}`)
      .set(auth(f.outlets.a.token))
      .send({});
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown outlet or menu item', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    const r1 = await api().put(`/api/v1/outlets/${ghost}/menu-items/${f.items.coffee}`).set(auth(f.hqToken)).send({});
    const r2 = await api().put(`/api/v1/outlets/${f.outlets.a.id}/menu-items/${ghost}`).set(auth(f.hqToken)).send({});
    expect(r1.status).toBe(404);
    expect(r2.status).toBe(404);
  });

  it('unassigns an item (and its stock row)', async () => {
    const url = `/api/v1/outlets/${f.outlets.a.id}/menu-items/${f.items.cake}`;
    expect((await api().delete(url).set(auth(f.hqToken))).status).toBe(204);
    expect(await stockOf(f.outlets.a.id, f.items.cake)).toBeUndefined();
    expect((await api().delete(url).set(auth(f.hqToken))).status).toBe(404);
  });
});
