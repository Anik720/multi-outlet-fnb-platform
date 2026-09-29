import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { ArrowRight, MapPin, Plus, Store, X } from 'lucide-react';
import { Badge, Empty, ErrorBanner, Loading, PageHeader } from '../../components/ui';

export function OutletsPage() {
  const [showForm, setShowForm] = useState(false);
  const outlets = useQuery({ queryKey: ['outlets'], queryFn: api.outlets.list });

  return (
    <>
      <PageHeader
        eyebrow="Head office"
        title="Outlets"
        subtitle="Open an outlet to manage its menu, prices, stock and sales."
        actions={
          <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? <X size={17} /> : <Plus size={17} />}
            {showForm ? 'Close' : 'New outlet'}
          </button>
        }
      />
      {showForm && <CreateOutletForm onDone={() => setShowForm(false)} />}
      <ErrorBanner error={outlets.error} />
      {outlets.isLoading ? (
        <Loading />
      ) : !outlets.data?.length ? (
        <Empty>No outlets yet.</Empty>
      ) : (
        <div className="grid-cards">
          {outlets.data.map((o) => (
            <Link key={o.id} to={`/hq/outlets/${o.id}`} className="card outlet-card">
              <div className="row between">
                <span className="outlet-avatar">
                  <Store size={20} />
                </span>
                {o.isActive ? <Badge tone="good">Active</Badge> : <Badge>Inactive</Badge>}
              </div>
              <div>
                <h3>{o.name}</h3>
                <code>{o.code}</code>
              </div>
              <p className="muted small with-icon">
                <MapPin size={14} /> {o.address ?? 'No address'}
              </p>
              <span className="link">
                Manage outlet <ArrowRight size={16} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function CreateOutletForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ code: '', name: '', address: '' });
  const create = useMutation({
    mutationFn: () => api.outlets.create({ code: form.code, name: form.name, address: form.address || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['outlets'] });
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
      <h2 className="span-all">New outlet</h2>
      <div className="span-all">
        <ErrorBanner error={create.error} />
      </div>
      <label className="field">
        <span>Code</span>
        <input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          placeholder="DHK-BNN"
          required
        />
        <small className="muted">Used as the receipt prefix; cannot be changed later.</small>
      </label>
      <label className="field">
        <span>Name</span>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </label>
      <label className="field span-all">
        <span>Address</span>
        <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </label>
      <div className="span-all">
        <button className="btn primary" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create outlet'}
        </button>
      </div>
    </form>
  );
}
