import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import type { InventoryRow, MovementReason } from '../../api/types';
import { formatDateTime } from '../../lib/format';
import { SlidersHorizontal } from 'lucide-react';
import { Badge, Empty, ErrorBanner, Loading, PageHeader, StockBadge } from '../../components/ui';

type AdjustReason = Exclude<MovementReason, 'SALE'>;

export function InventoryPanel({ outletId, embedded = false }: { outletId: string; embedded?: boolean }) {
  const inventory = useQuery({ queryKey: ['inventory', outletId], queryFn: () => api.inventory.list(outletId) });
  const movements = useQuery({
    queryKey: ['inventory', outletId, 'movements'],
    queryFn: () => api.inventory.movements(outletId, 25),
  });
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);

  return (
    <>
      {!embedded && <PageHeader eyebrow="Outlet" title="Inventory" subtitle="Stock on hand for items assigned to this outlet." />}
      <div className="card">
        <ErrorBanner error={inventory.error} />
        {inventory.isLoading ? (
          <Loading />
        ) : !inventory.data?.length ? (
          <Empty>No items assigned to this outlet yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {inventory.data.map((row) => (
                  <tr key={row.menuItemId}>
                    <td>
                      {row.name} <small className="muted">{row.sku}</small>
                    </td>
                    <td className="muted">{row.category ?? '—'}</td>
                    <td>
                      <StockBadge quantity={row.quantity} />
                    </td>
                    <td>{row.isAvailable ? <Badge tone="good">On menu</Badge> : <Badge>Off</Badge>}</td>
                    <td className="muted small">{formatDateTime(row.updatedAt)}</td>
                    <td className="row-actions">
                      <button className="btn ghost sm" onClick={() => setAdjusting(row)}>
                        <SlidersHorizontal size={14} /> Adjust
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Recent stock movements</h2>
            <p className="muted small">Every restock, wastage, correction and sale, newest first.</p>
          </div>
        </div>
        {movements.isLoading ? (
          <Loading />
        ) : !movements.data?.length ? (
          <Empty>No movements yet.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Item</th>
                  <th>Reason</th>
                  <th className="num">Change</th>
                  <th className="num">After</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {movements.data.map((m) => (
                  <tr key={m.id}>
                    <td className="muted small">{formatDateTime(m.createdAt)}</td>
                    <td>{m.name}</td>
                    <td>
                      <Badge tone={m.reason === 'RESTOCK' ? 'good' : m.reason === 'WASTAGE' ? 'bad' : 'neutral'}>
                        {m.reason}
                      </Badge>
                    </td>
                    <td className={`num ${m.change > 0 ? 'pos' : 'neg'}`}>
                      {m.change > 0 ? `+${m.change}` : m.change}
                    </td>
                    <td className="num">{m.quantityAfter}</td>
                    <td className="muted small">{m.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adjusting && <AdjustDialog outletId={outletId} row={adjusting} onClose={() => setAdjusting(null)} />}
    </>
  );
}

function AdjustDialog({ outletId, row, onClose }: { outletId: string; row: InventoryRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState<AdjustReason>('RESTOCK');
  const [amount, setAmount] = useState('10');
  const [direction, setDirection] = useState<1 | -1>(1);
  const [note, setNote] = useState('');

  const sign = reason === 'RESTOCK' ? 1 : reason === 'WASTAGE' ? -1 : direction;
  const change = sign * Math.abs(Math.trunc(Number(amount) || 0));

  const adjust = useMutation({
    mutationFn: () => api.inventory.adjust(outletId, row.menuItemId, { change, reason, note: note || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory', outletId] });
      qc.invalidateQueries({ queryKey: ['outlet-menu', outletId] });
      onClose();
    },
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Adjust stock for ${row.name}`}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          adjust.mutate();
        }}
      >
        <h2>Adjust stock · {row.name}</h2>
        <p className="muted small">Current stock: {row.quantity}</p>
        <ErrorBanner error={adjust.error} />
        <label className="field">
          <span>Reason</span>
          <select value={reason} onChange={(e) => setReason(e.target.value as AdjustReason)}>
            <option value="RESTOCK">Restock (add)</option>
            <option value="WASTAGE">Wastage (remove)</option>
            <option value="ADJUSTMENT">Stock-count correction</option>
          </select>
        </label>
        {reason === 'ADJUSTMENT' && (
          <div className="segmented" role="group" aria-label="Direction">
            <button type="button" className={direction === 1 ? 'active' : undefined} onClick={() => setDirection(1)}>
              Add
            </button>
            <button type="button" className={direction === -1 ? 'active' : undefined} onClick={() => setDirection(-1)}>
              Remove
            </button>
          </div>
        )}
        <label className="field">
          <span>Quantity</span>
          <input type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label className="field">
          <span>Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </label>
        <p className="muted small">
          New stock will be <strong>{row.quantity + change}</strong>
          {row.quantity + change < 0 && ' - not allowed (stock cannot go negative)'}
        </p>
        <div className="row gap">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={adjust.isPending || change === 0}>
            {adjust.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
