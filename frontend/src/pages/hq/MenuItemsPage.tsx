import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import type { MenuItem } from '../../api/types';
import { formatMoney } from '../../lib/format';
import { Badge, Empty, ErrorBanner, Loading, PageHeader } from '../../components/ui';
import { ChevronLeft, ChevronRight, Plus, Power, Search, X } from 'lucide-react';

const PAGE_SIZE = 20;

export function MenuItemsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);

  const list = useQuery({
    queryKey: ['menu-items', search, page],
    queryFn: () => api.menuItems.list({ search: search || undefined, page, pageSize: PAGE_SIZE }),
    placeholderData: (prev) => prev,
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.menuItems.update>[1] }) =>
      api.menuItems.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menu-items'] }),
  });

  return (
    <>
      <PageHeader
        eyebrow="Head office"
        title="Master menu"
        subtitle="HQ-owned catalogue. Assign items to outlets and set per-outlet prices from the Outlets page."
        actions={
          <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? <X size={17} /> : <Plus size={17} />}
            {showForm ? 'Close' : 'New item'}
          </button>
        }
      />

      {showForm && <CreateMenuItemForm onDone={() => setShowForm(false)} />}

      <div className="card">
        <div className="toolbar">
          <label className="search">
            <Search size={17} />
            <input
              type="search"
              placeholder="Search by name or SKU…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        <ErrorBanner error={list.error ?? update.error} />
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.data.length ? (
          <Empty>No menu items found.</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th className="num">Base price</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.data.data.map((item) => (
                    <MenuRow
                      key={item.id}
                      item={item}
                      saving={update.isPending && update.variables?.id === item.id}
                      onSave={(body) => update.mutate({ id: item.id, body })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span className="muted small">
                {list.data.pagination.total} items · page {list.data.pagination.page} of{' '}
                {Math.max(list.data.pagination.totalPages, 1)}
              </span>
              <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={16} /> Previous
              </button>
              <button
                className="btn ghost sm"
                disabled={page >= list.data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function MenuRow({
  item,
  saving,
  onSave,
}: {
  item: MenuItem;
  saving: boolean;
  onSave: (body: { basePrice?: number; isActive?: boolean }) => void;
}) {
  const [price, setPrice] = useState(String(item.basePrice));
  const dirty = Number(price) !== item.basePrice;

  return (
    <tr className={item.isActive ? undefined : 'dim'}>
      <td>
        <code>{item.sku}</code>
      </td>
      <td>{item.name}</td>
      <td className="muted">{item.category ?? '—'}</td>
      <td className="num">
        <input
          className="input-price"
          type="number"
          min={0}
          step="0.01"
          value={price}
          aria-label={`Base price for ${item.name}`}
          onChange={(e) => setPrice(e.target.value)}
        />
        {!dirty && <small className="muted block">{formatMoney(item.basePrice)}</small>}
      </td>
      <td>{item.isActive ? <Badge tone="good">Active</Badge> : <Badge>Inactive</Badge>}</td>
      <td className="row-actions">
        {dirty && (
          <button className="btn primary sm" disabled={saving || price === ''} onClick={() => onSave({ basePrice: Number(price) })}>
            Save
          </button>
        )}
        <button className="btn ghost sm" disabled={saving} onClick={() => onSave({ isActive: !item.isActive })}>
          <Power size={14} /> {item.isActive ? 'Deactivate' : 'Activate'}
        </button>
      </td>
    </tr>
  );
}

function CreateMenuItemForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ sku: '', name: '', category: '', description: '', basePrice: '' });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const create = useMutation({
    mutationFn: () =>
      api.menuItems.create({
        sku: form.sku,
        name: form.name,
        category: form.category || undefined,
        description: form.description || undefined,
        basePrice: Number(form.basePrice),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['menu-items'] });
      onDone();
    },
  });

  return (
    <form
      className="card form-grid"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <h2 className="span-all">New menu item</h2>
      <div className="span-all">
        <ErrorBanner error={create.error} />
      </div>
      <label className="field">
        <span>SKU</span>
        <input value={form.sku} onChange={set('sku')} placeholder="BEV-MOC" required />
      </label>
      <label className="field">
        <span>Name</span>
        <input value={form.name} onChange={set('name')} placeholder="Mocha" required />
      </label>
      <label className="field">
        <span>Category</span>
        <input value={form.category} onChange={set('category')} placeholder="Beverages" />
      </label>
      <label className="field">
        <span>Base price (BDT)</span>
        <input type="number" min={0} step="0.01" value={form.basePrice} onChange={set('basePrice')} required />
      </label>
      <label className="field span-all">
        <span>Description</span>
        <input value={form.description} onChange={set('description')} />
      </label>
      <div className="span-all">
        <button className="btn primary" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create item'}
        </button>
      </div>
    </form>
  );
}
