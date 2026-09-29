import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type DateRange } from '../../api/endpoints';
import { formatInt, formatMoney, startOfDayIso } from '../../lib/format';
import { Empty, ErrorBanner, Loading, PageHeader } from '../../components/ui';
import { Banknote, ReceiptText, Store, TrendingUp, Trophy } from 'lucide-react';
import { RevenueBars } from '../../components/RevenueBars';

const RANGES = [
  { key: 'today', label: 'Today', range: (): DateRange => ({ from: startOfDayIso(0) }) },
  { key: '7d', label: '7 days', range: (): DateRange => ({ from: startOfDayIso(6) }) },
  { key: '30d', label: '30 days', range: (): DateRange => ({ from: startOfDayIso(29) }) },
  { key: 'all', label: 'All time', range: (): DateRange => ({}) },
] as const;

export function DashboardPage() {
  const [rangeKey, setRangeKey] = useState<(typeof RANGES)[number]['key']>('30d');
  const range = RANGES.find((r) => r.key === rangeKey)!.range();

  const revenue = useQuery({
    queryKey: ['report', 'revenue', range],
    queryFn: () => api.reports.revenueByOutlet(range),
  });
  const topItems = useQuery({
    queryKey: ['report', 'top-items', range],
    queryFn: () => api.reports.topItems({ ...range, limit: 5 }),
  });

  const totals = revenue.data?.totals;
  const avgTicket = totals && totals.transactionCount ? totals.revenue / totals.transactionCount : 0;

  return (
    <>
      <PageHeader
        eyebrow="Head office"
        title="Sales overview"
        subtitle="Revenue and best sellers across all outlets"
        actions={
          <div className="segmented" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button
                key={r.key}
                className={r.key === rangeKey ? 'active' : undefined}
                aria-pressed={r.key === rangeKey}
                onClick={() => setRangeKey(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      <ErrorBanner error={revenue.error ?? topItems.error} />

      <section className="stats">
        <Stat tone="accent" icon={<Banknote size={19} />} label="Total revenue" value={totals ? formatMoney(totals.revenue) : '—'} />
        <Stat icon={<ReceiptText size={19} />} label="Transactions" value={totals ? formatInt(totals.transactionCount) : '—'} />
        <Stat icon={<TrendingUp size={19} />} label="Average ticket" value={totals ? formatMoney(avgTicket) : '—'} />
        <Stat icon={<Store size={19} />} label="Outlets" value={revenue.data ? String(revenue.data.outlets.length) : '—'} />
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Revenue by outlet</h2>
            <p className="muted small">Hover a bar for transactions and average ticket.</p>
          </div>
        </div>
        {revenue.isLoading ? (
          <Loading />
        ) : revenue.data && revenue.data.outlets.length ? (
          <div className="split">
            <RevenueBars rows={revenue.data.outlets} />
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Outlet</th>
                    <th className="num">Revenue</th>
                    <th className="num">Txns</th>
                    <th className="num">Items</th>
                    <th className="num">Avg ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue.data.outlets.map((o) => (
                    <tr key={o.outletId}>
                      <td>
                        {o.outletName} <small className="muted">{o.outletCode}</small>
                      </td>
                      <td className="num">{formatMoney(o.revenue)}</td>
                      <td className="num">{formatInt(o.transactionCount)}</td>
                      <td className="num">{formatInt(o.itemsSold)}</td>
                      <td className="num">{formatMoney(o.averageTicket)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <Empty>No outlets yet.</Empty>
        )}
      </section>

      <section>
        <div className="section-title">
          <h2>Top 5 sellers per outlet</h2>
          <p className="muted small">Ranked by quantity sold in the selected period.</p>
        </div>
        {topItems.isLoading ? (
          <Loading />
        ) : (
          <div className="grid-cards">
            {topItems.data?.outlets.map((o) => (
              <div key={o.outletId} className="card top-card">
                <div className="top-head">
                  <span className="top-icon">
                    <Trophy size={18} />
                  </span>
                  <div className="grow">
                    <h3>{o.outletName}</h3>
                    <code>{o.outletCode}</code>
                  </div>
                </div>
                {o.items.length ? (
                  <ol className="ranked">
                    {o.items.map((i) => (
                      <li key={i.menuItemId}>
                        <span className={`rank r${i.rank}`}>{i.rank}</span>
                        <div className="grow">
                          <div className="ranked-line">
                            <span className="ranked-name">{i.name}</span>
                            <strong className="qty">{formatInt(i.quantitySold)} sold</strong>
                          </div>
                          <div className="ranked-bar">
                            <span style={{ width: `${(i.quantitySold / o.items[0]!.quantitySold) * 100}%` }} />
                          </div>
                          <small className="muted">{formatMoney(i.revenue)} revenue</small>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty>No sales in this period.</Empty>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Stat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone?: 'accent' }) {
  return (
    <div className={`stat card${tone ? ` ${tone}` : ''}`}>
      <span className="stat-icon">{icon}</span>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}
