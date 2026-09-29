import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import type { MenuItem, Outlet, OutletMenuItem } from '../../api/types';
import { formatMoney } from '../../lib/format';
import { Badge, ErrorBanner, Loading, PageHeader, StockBadge } from '../../components/ui';
import { ArrowLeft, Box, Pencil, Power, ReceiptText, ShoppingCart, UtensilsCrossed, X } from 'lucide-react';
import { InventoryPanel } from '../outlet/InventoryPanel';
import { SalesPanel } from '../outlet/SalesPanel';
import { PosPage } from '../outlet/PosPage';

const TABS = [
  { key: 'menu', label: 'Menu & pricing', icon: UtensilsCrossed },
  { key: 'inventory', label: 'Inventory', icon: Box },
  { key: 'sales', label: 'Sales', icon: ReceiptText },
  { key: 'pos', label: 'POS (test)', icon: ShoppingCart },
] as const;
type Tab = (typeof TABS)[number]['key'];

export function OutletDetailPage({ outletId }: { outletId: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('menu');
  const [editing, setEditing] = useState(false);
  const outlet = useQuery({ queryKey: ['outlet', outletId], queryFn: () => api.outlets.get(outletId) });
  const update = useMutation({
    mutationFn: (body: Partial<Pick<Outlet, 'name' | 'address' | 'isActive'>>) => api.outlets.update(outletId, body),
    onSuccess: (o) => {
      qc.setQueryData(['outlet', outletId], o);
      qc.invalidateQueries({ queryKey: ['outlets'] });
      qc.invalidateQueries({ queryKey: ['report'] });
      setEditing(false);
    },
  });

  return (
    <>
      <p className="crumbs">
        <Link to="/hq/outlets">
          <ArrowLeft size={16} /> All outlets
        </Link>
      </p>
      <PageHeader
        eyebrow={
          <>
            {outlet.data?.code ?? 'Outlet'} {outlet.data && !outlet.data.isActive && <Badge>Inactive</Badge>}
          </>
        }
        title={outlet.data?.name ?? 'Outlet'}
        subtitle={outlet.data ? (outlet.data.address ?? 'No address') : undefined}
        actions={
          outlet.data && (
            <>
              <button className="btn ghost" onClick={() => setEditing((e) => !e)} disabled={update.isPending}>
                {editing ? <X size={16} /> : <Pencil size={16} />} {editing ? 'Close' : 'Edit'}
              </button>
              <button
                className="btn ghost"
                onClick={() => update.mutate({ isActive: !outlet.data.isActive })}
                disabled={update.isPending}
                title={outlet.data.isActive ? 'Inactive outlets cannot record sales' : undefined}
              >
                <Power size={16} /> {outlet.data.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </>
          )
        }
      />
      <ErrorBanner error={outlet.error ?? (!editing && update.error)} />
      {editing && outlet.data && (
        <EditOutletForm outlet={outlet.data} pending={update.isPending} error={update.error} onSave={update.mutate} />
      )}
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? 'active' : undefined}
            onClick={() => setTab(t.key)}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'menu' && <OutletMenuAssignment outletId={outletId} />}
      {tab === 'inventory' && <InventoryPanel outletId={outletId} embedded />}
      {tab === 'sales' && <SalesPanel outletId={outletId} embedded />}
      {tab === 'pos' && <PosPage outletId={outletId} embedded />}
    </>
  );
}

/** Name and address are editable; the code is not, because it is baked into issued receipt numbers. */
function EditOutletForm({
  outlet,
  pending,
  error,
  onSave,
}: {
  outlet: Outlet;
  pending: boolean;
  error: unknown;
  onSave: (body: { name: string; address: string | null }) => void;
}) {
  const [form, setForm] = useState({ name: outlet.name, address: outlet.address ?? '' });

  return (
    <form
      className="card form-grid"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSave({ name: form.name, address: form.address.trim() || null });
      }}
    >
      <h2 className="span-all">Edit outlet</h2>
      <div className="span-all">
        <ErrorBanner error={error} />
      </div>
      <label className="field">
        <span>Code</span>
        <input value={outlet.code} disabled />
        <small className="muted">Used as the receipt prefix; cannot be changed.</small>
      </label>
      <label className="field">
        <span>Name</span>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
      </label>
      <label className="field span-all">
        <span>Address</span>
        <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </label>
      <div className="span-all">
        <button className="btn primary" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

/** Every master item, showing whether (and how) it is assigned to this outlet. */
function OutletMenuAssignment({ outletId }: { outletId: string }) {
  const qc = useQueryClient();
  const master = useQuery({
    queryKey: ['menu-items', 'all'],
    queryFn: () => api.menuItems.list({ pageSize: 100 }),
  });
  const assigned = useQuery({
    queryKey: ['outlet-menu', outletId],
    queryFn: () => api.outletMenu.list(outletId),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['outlet-menu', outletId] });
    qc.invalidateQueries({ queryKey: ['inventory', outletId] });
  };
  const assign = useMutation({
    mutationFn: (v: { menuItemId: string; body: { priceOverride?: number | null; isAvailable?: boolean } }) =>
      api.outletMenu.assign(outletId, v.menuItemId, v.body),
    onSuccess: invalidate,
  });
  const unassign = useMutation({
    mutationFn: (menuItemId: string) => api.outletMenu.unassign(outletId, menuItemId),
    onSuccess: invalidate,
  });

  if (master.isLoading || assigned.isLoading) return <Loading />;
  const byId = new Map((assigned.data ?? []).map((a) => [a.menuItemId, a]));
  const busy = assign.isPending || unassign.isPending;

  return (
    <div className="card">
      <p className="muted small card-note">
        {byId.size} of {master.data?.data.length ?? 0} master items assigned. Leave the override empty to use the HQ
        base price.
      </p>
      <ErrorBanner error={master.error ?? assigned.error ?? assign.error ?? unassign.error} />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Assigned</th>
              <th>Item</th>
              <th className="num">Base</th>
              <th className="num">Outlet price override</th>
              <th className="num">Effective</th>
              <th>Available</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            {master.data?.data.map((m) => (
              <AssignmentRow
                key={m.id}
                item={m}
                assignment={byId.get(m.id)}
                busy={busy}
                onAssign={(body) => assign.mutate({ menuItemId: m.id, body })}
                onUnassign={() => unassign.mutate(m.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssignmentRow({
  item,
  assignment,
  busy,
  onAssign,
  onUnassign,
}: {
  item: MenuItem;
  assignment?: OutletMenuItem;
  busy: boolean;
  onAssign: (body: { priceOverride?: number | null; isAvailable?: boolean }) => void;
  onUnassign: () => void;
}) {
  const [override, setOverride] = useState(assignment?.priceOverride != null ? String(assignment.priceOverride) : '');
  const current = assignment?.priceOverride != null ? String(assignment.priceOverride) : '';
  const dirty = assignment && override !== current;

  return (
    <tr className={assignment ? undefined : 'dim'}>
      <td>
        <input
          type="checkbox"
          checked={Boolean(assignment)}
          disabled={busy || (!assignment && !item.isActive)}
          aria-label={`Assign ${item.name}`}
          onChange={() => (assignment ? onUnassign() : onAssign({}))}
        />
      </td>
      <td>
        {item.name} <small className="muted">{item.sku}</small>
        {!item.isActive && (
          <>
            {' '}
            <Badge>Inactive in master</Badge>
          </>
        )}
      </td>
      <td className="num">{formatMoney(item.basePrice)}</td>
      <td className="num">
        {assignment ? (
          <span className="inline-edit">
            <input
              className="input-price"
              type="number"
              min={0}
              step="0.01"
              placeholder="—"
              value={override}
              aria-label={`Price override for ${item.name}`}
              onChange={(e) => setOverride(e.target.value)}
            />
            {dirty && (
              <button
                className="btn primary sm"
                disabled={busy}
                onClick={() => onAssign({ priceOverride: override === '' ? null : Number(override) })}
              >
                Save
              </button>
            )}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td className="num">
        {assignment ? (
          <strong className={assignment.priceOverride != null ? 'accent' : undefined}>
            {formatMoney(assignment.effectivePrice)}
          </strong>
        ) : (
          '—'
        )}
      </td>
      <td>
        {assignment ? (
          <label className="switch">
            <input
              type="checkbox"
              checked={assignment.isAvailable}
              disabled={busy}
              onChange={(e) => onAssign({ isAvailable: e.target.checked })}
            />
            <span>{assignment.isAvailable ? 'On' : 'Off'}</span>
          </label>
        ) : (
          '—'
        )}
      </td>
      <td>{assignment ? <StockBadge quantity={assignment.stock} /> : '—'}</td>
    </tr>
  );
}
