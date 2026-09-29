import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import type { OutletMenuItem, Sale } from '../../api/types';
import { formatDateTime, formatMoney } from '../../lib/format';
import { Empty, ErrorBanner, Loading, PageHeader, initials, toneFor } from '../../components/ui';
import { CircleCheck, ShoppingBag, Trash2 } from 'lucide-react';
import { uuid } from '../../lib/id';

type Cart = Record<string, number>; // menuItemId -> quantity

const newKey = () => `pos-${uuid()}`;

export function PosPage({ outletId, embedded = false }: { outletId: string; embedded?: boolean }) {
  const qc = useQueryClient();
  const [cart, setCart] = useState<Cart>({});
  const [category, setCategory] = useState<string>('All');
  const [receipt, setReceipt] = useState<Sale | null>(null);
  // One idempotency key per checkout attempt: a retry after a timeout reuses
  // it, so the server can never create the same sale twice.
  const idempotencyKey = useRef(newKey());

  const menu = useQuery({
    queryKey: ['outlet-menu', outletId, 'sellable'],
    queryFn: () => api.outletMenu.list(outletId, true),
  });

  const items = useMemo(() => menu.data ?? [], [menu.data]);
  const byId = useMemo(() => new Map(items.map((i) => [i.menuItemId, i])), [items]);
  const categories = useMemo(
    () => ['All', ...new Set(items.map((i) => i.category ?? 'Other'))],
    [items],
  );

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ item: byId.get(id), qty }))
    .filter((l): l is { item: OutletMenuItem; qty: number } => Boolean(l.item));
  const total = lines.reduce((sum, l) => sum + l.item.effectivePrice * l.qty, 0);

  const checkout = useMutation({
    mutationFn: () =>
      api.sales.create(
        outletId,
        lines.map((l) => ({ menuItemId: l.item.menuItemId, quantity: l.qty })),
        idempotencyKey.current,
      ),
    onSuccess: (sale) => {
      setReceipt(sale);
      setCart({});
      idempotencyKey.current = newKey();
      qc.invalidateQueries({ queryKey: ['outlet-menu', outletId] });
      qc.invalidateQueries({ queryKey: ['inventory', outletId] });
      qc.invalidateQueries({ queryKey: ['sales', outletId] });
      qc.invalidateQueries({ queryKey: ['report'] });
    },
    onError: () => {
      // Stock may have changed under us; refresh what's on screen.
      qc.invalidateQueries({ queryKey: ['outlet-menu', outletId] });
    },
  });

  const changeCart = (id: string, delta: number) => {
    const item = byId.get(id);
    if (!item) return;
    setCart((c) => {
      const next = Math.min(Math.max((c[id] ?? 0) + delta, 0), item.stock);
      const copy = { ...c };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
    // Cart changed -> it's a different sale now.
    idempotencyKey.current = newKey();
    checkout.reset();
  };

  const visible = items.filter((i) => category === 'All' || (i.category ?? 'Other') === category);

  return (
    <>
      {!embedded && (
        <PageHeader
          eyebrow="Counter"
          title="Point of sale"
          subtitle="Tap items to build the order. Prices and stock are confirmed by the server at checkout."
        />
      )}
      <div className="pos-layout">
        <section className="card pos-menu">
          <div className="chips">
            {categories.map((c) => (
              <button key={c} className={c === category ? 'chip active' : 'chip'} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
          <ErrorBanner error={menu.error} />
          {menu.isLoading ? (
            <Loading />
          ) : !visible.length ? (
            <Empty>No items assigned to this outlet yet.</Empty>
          ) : (
            <div className="tiles">
              {visible.map((i) => {
                const inCart = cart[i.menuItemId] ?? 0;
                const soldOut = i.stock === 0;
                return (
                  <button
                    key={i.menuItemId}
                    className={`tile${inCart ? ' selected' : ''}`}
                    disabled={soldOut || inCart >= i.stock}
                    onClick={() => changeCart(i.menuItemId, 1)}
                  >
                    <span className={`tile-avatar tone-${toneFor(i.category ?? 'Other')}`} aria-hidden>
                      {initials(i.name)}
                    </span>
                    <span className="tile-name">{i.name}</span>
                    <span className="tile-price">{formatMoney(i.effectivePrice)}</span>
                    <span className={`tile-stock${i.stock <= 5 ? ' low' : ''}`}>
                      {soldOut ? 'Sold out' : `${i.stock - inCart} left`}
                    </span>
                    {inCart > 0 && <span className="tile-count">{inCart}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="card pos-cart">
          <div className="cart-head">
            <span className="cart-icon">
              <ShoppingBag size={19} />
            </span>
            <div className="grow">
              <h2>Current order</h2>
              <small className="muted">
                {lines.length ? `${lines.reduce((n, l) => n + l.qty, 0)} items` : 'Empty'}
              </small>
            </div>
          </div>
          {!lines.length ? (
            <Empty>Tap items to add them.</Empty>
          ) : (
            <ul className="cart-lines">
              {lines.map(({ item, qty }) => (
                <li key={item.menuItemId}>
                  <div className="grow">
                    <div>{item.name}</div>
                    <small className="muted">{formatMoney(item.effectivePrice)} each</small>
                  </div>
                  <div className="stepper">
                    <button aria-label={`Remove one ${item.name}`} onClick={() => changeCart(item.menuItemId, -1)}>
                      −
                    </button>
                    <span>{qty}</span>
                    <button
                      aria-label={`Add one ${item.name}`}
                      disabled={qty >= item.stock}
                      onClick={() => changeCart(item.menuItemId, 1)}
                    >
                      +
                    </button>
                  </div>
                  <strong className="line-total">{formatMoney(item.effectivePrice * qty)}</strong>
                </li>
              ))}
            </ul>
          )}
          <div className="cart-total">
            <span>Total</span>
            <strong>{formatMoney(total)}</strong>
          </div>
          <ErrorBanner error={checkout.error} />
          <button
            className="btn primary block lg"
            disabled={!lines.length || checkout.isPending}
            onClick={() => checkout.mutate()}
          >
            {checkout.isPending
              ? 'Processing…'
              : checkout.isError
                ? 'Retry checkout'
                : lines.length
                  ? `Charge ${formatMoney(total)}`
                  : 'Charge'}
          </button>
          {lines.length > 0 && (
            <button className="btn ghost block" onClick={() => setCart({})} disabled={checkout.isPending}>
              <Trash2 size={16} /> Clear order
            </button>
          )}
        </aside>
      </div>

      {receipt && <ReceiptDialog sale={receipt} onClose={() => setReceipt(null)} />}
    </>
  );
}

function ReceiptDialog({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="receipt" role="dialog" aria-modal="true" aria-label="Receipt" onClick={(e) => e.stopPropagation()}>
        <div className="receipt-done">
          <span className="done-icon">
            <CircleCheck size={22} />
          </span>
          <strong>Payment recorded</strong>
        </div>
        <div className="thermal">
          <p className="thermal-head">SALES RECEIPT</p>
          <p className="thermal-no">{sale.receiptNumber}</p>
          <p className="thermal-date">{formatDateTime(sale.createdAt)}</p>
          <ul>
            {sale.items.map((i) => (
              <li key={i.menuItemId}>
                <span>
                  {i.quantity} × {i.name}
                </span>
                <span>{formatMoney(i.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <p className="thermal-total">
            <span>TOTAL</span>
            <span>{formatMoney(sale.totalAmount)}</span>
          </p>
          <p className="thermal-foot">Thank you · {sale.itemCount} items</p>
        </div>
        <button className="btn primary block lg" onClick={onClose} autoFocus>
          New order
        </button>
      </div>
    </div>
  );
}
