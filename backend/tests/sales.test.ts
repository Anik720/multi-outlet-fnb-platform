import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma';
import { api, auth, createFixture, resetDb, stockOf, type Fixture } from './helpers';

let f: Fixture;

afterAll(() => prisma.$disconnect());

const saleUrl = (outletId: string) => `/api/v1/outlets/${outletId}/sales`;

const sell = (outlet: { id: string; token: string }, items: { menuItemId: string; quantity: number }[], key?: string) => {
  const req = api().post(saleUrl(outlet.id)).set(auth(outlet.token));
  if (key) req.set('Idempotency-Key', key);
  return req.send({ items });
};

describe('sales', () => {
  beforeEach(async () => {
    await resetDb();
    f = await createFixture({ coffee: 10, burger: 5, cake: 2 });
  });

  it('creates a multi-item sale with server-side prices, deducts stock and issues receipt #1', async () => {
    const res = await sell(f.outlets.a, [
      { menuItemId: f.items.coffee, quantity: 2 }, // 2 x 250.00 (outlet override)
      { menuItemId: f.items.burger, quantity: 1 }, // 1 x 450.00
    ]);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      receiptNumber: 'OUT-A-00000001',
      receiptSeq: 1,
      itemCount: 3,
      totalAmount: 950,
    });
    expect(res.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Coffee', unitPrice: 250, quantity: 2, lineTotal: 500 }),
        expect.objectContaining({ name: 'Burger', unitPrice: 450, quantity: 1, lineTotal: 450 }),
      ]),
    );
    expect(await stockOf(f.outlets.a.id, f.items.coffee)).toBe(8);
    expect(await stockOf(f.outlets.a.id, f.items.burger)).toBe(4);

    const ledger = await prisma.inventoryMovement.findMany({ where: { saleId: res.body.data.id } });
    expect(ledger).toHaveLength(2);
    expect(ledger.every((m) => m.reason === 'SALE' && m.change < 0)).toBe(true);
  });

  it('numbers receipts sequentially and independently per outlet', async () => {
    const a1 = await sell(f.outlets.a, [{ menuItemId: f.items.coffee, quantity: 1 }]);
    const a2 = await sell(f.outlets.a, [{ menuItemId: f.items.coffee, quantity: 1 }]);
    const b1 = await sell(f.outlets.b, [{ menuItemId: f.items.coffee, quantity: 1 }]);
    expect([a1.body.data.receiptNumber, a2.body.data.receiptNumber]).toEqual(['OUT-A-00000001', 'OUT-A-00000002']);
    expect(b1.body.data.receiptNumber).toBe('OUT-B-00000001');
    // Same item, different outlet -> different price (A overrides, B uses base)
    expect(b1.body.data.totalAmount).toBe(200);
  });

  it('merges duplicate lines for the same item', async () => {
    const res = await sell(f.outlets.a, [
      { menuItemId: f.items.cake, quantity: 1 },
      { menuItemId: f.items.cake, quantity: 1 },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(2);
    expect(await stockOf(f.outlets.a.id, f.items.cake)).toBe(0);
  });

  it('rejects insufficient stock atomically: no stock change, no receipt number consumed', async () => {
    const res = await sell(f.outlets.a, [
      { menuItemId: f.items.coffee, quantity: 1 },
      { menuItemId: f.items.cake, quantity: 3 }, // only 2 in stock
    ]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ menuItemId: f.items.cake, requested: 3, available: 2 }),
    ]);
    expect(await stockOf(f.outlets.a.id, f.items.coffee)).toBe(10);
    expect(await stockOf(f.outlets.a.id, f.items.cake)).toBe(2);

    const next = await sell(f.outlets.a, [{ menuItemId: f.items.coffee, quantity: 1 }]);
    expect(next.body.data.receiptNumber).toBe('OUT-A-00000001'); // gap-free
  });

  it('rejects items not assigned to the outlet (422)', async () => {
    const res = await sell(f.outlets.b, [{ menuItemId: f.items.burger, quantity: 1 }]);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ITEM_NOT_ASSIGNED');
  });

  it('rejects items switched off at the outlet (422)', async () => {
    await api()
      .put(`/api/v1/outlets/${f.outlets.a.id}/menu-items/${f.items.burger}`)
      .set(auth(f.hqToken))
      .send({ isAvailable: false });
    const res = await sell(f.outlets.a, [{ menuItemId: f.items.burger, quantity: 1 }]);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ITEM_UNAVAILABLE');
  });

  it('never trusts client prices and validates the payload', async () => {
    const res = await api()
      .post(saleUrl(f.outlets.a.id))
      .set(auth(f.outlets.a.token))
      .send({ items: [{ menuItemId: f.items.coffee, quantity: 0 }] });
    expect(res.status).toBe(400);
    const empty = await api().post(saleUrl(f.outlets.a.id)).set(auth(f.outlets.a.token)).send({ items: [] });
    expect(empty.status).toBe(400);
  });

  it("forbids selling at another outlet", async () => {
    const res = await api()
      .post(saleUrl(f.outlets.b.id))
      .set(auth(f.outlets.a.token))
      .send({ items: [{ menuItemId: f.items.coffee, quantity: 1 }] });
    expect(res.status).toBe(403);
  });

  it('is idempotent: replaying the same Idempotency-Key returns the original sale', async () => {
    const items = [{ menuItemId: f.items.coffee, quantity: 3 }];
    const first = await sell(f.outlets.a, items, 'pos-1:offline-000123');
    const replay = await sell(f.outlets.a, items, 'pos-1:offline-000123');

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(await stockOf(f.outlets.a.id, f.items.coffee)).toBe(7); // deducted once
    expect(await prisma.sale.count()).toBe(1);
  });

  it('lists and fetches sales for the outlet', async () => {
    const created = await sell(f.outlets.a, [{ menuItemId: f.items.coffee, quantity: 1 }]);
    const list = await api().get(saleUrl(f.outlets.a.id)).set(auth(f.outlets.a.token));
    expect(list.body.pagination.total).toBe(1);
    const one = await api().get(`${saleUrl(f.outlets.a.id)}/${created.body.data.id}`).set(auth(f.outlets.a.token));
    expect(one.body.data.receiptNumber).toBe('OUT-A-00000001');
    // A sale is only visible under its own outlet
    const wrong = await api().get(`${saleUrl(f.outlets.b.id)}/${created.body.data.id}`).set(auth(f.hqToken));
    expect(wrong.status).toBe(404);
  });
});

describe('sales under concurrency', () => {
  it('never oversells and keeps receipts unique + gap-free (30 parallel requests, stock 10)', async () => {
    await resetDb();
    f = await createFixture({ coffee: 10 });

    const results = await Promise.all(
      Array.from({ length: 30 }, () => sell(f.outlets.a, [{ menuItemId: f.items.coffee, quantity: 1 }])),
    );

    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(10);
    expect(rejected).toHaveLength(20);
    expect(rejected.every((r) => r.body.error.code === 'INSUFFICIENT_STOCK')).toBe(true);

    const seqs = ok.map((r) => r.body.data.receiptSeq as number).sort((x, y) => x - y);
    expect(seqs).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    expect(await stockOf(f.outlets.a.id, f.items.coffee)).toBe(0);
  });

  it('keeps per-outlet sequences independent when two outlets sell concurrently', async () => {
    await resetDb();
    f = await createFixture({ coffee: 100 });

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        sell(i % 2 ? f.outlets.a : f.outlets.b, [{ menuItemId: f.items.coffee, quantity: 1 }]),
      ),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);

    for (const outlet of [f.outlets.a, f.outlets.b]) {
      const seqs = results
        .filter((r) => r.body.data.outletId === outlet.id)
        .map((r) => r.body.data.receiptSeq as number)
        .sort((x, y) => x - y);
      expect(seqs).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    }
  });

  it('creates exactly one sale when the same Idempotency-Key is sent concurrently', async () => {
    await resetDb();
    f = await createFixture({ coffee: 100 });

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        sell(f.outlets.a, [{ menuItemId: f.items.coffee, quantity: 1 }], 'same-key-12345'),
      ),
    );
    expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
    expect(await prisma.sale.count()).toBe(1);
    expect(await stockOf(f.outlets.a.id, f.items.coffee)).toBe(99);
  });

  it('does not deadlock when concurrent carts lock the same items in opposite order', async () => {
    await resetDb();
    f = await createFixture({ coffee: 100, burger: 100 });

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        sell(
          f.outlets.a,
          i % 2
            ? [
                { menuItemId: f.items.coffee, quantity: 1 },
                { menuItemId: f.items.burger, quantity: 1 },
              ]
            : [
                { menuItemId: f.items.burger, quantity: 1 },
                { menuItemId: f.items.coffee, quantity: 1 },
              ],
        ),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(20).fill(201));
    expect(await stockOf(f.outlets.a.id, f.items.coffee)).toBe(80);
    expect(await stockOf(f.outlets.a.id, f.items.burger)).toBe(80);
  });
});
