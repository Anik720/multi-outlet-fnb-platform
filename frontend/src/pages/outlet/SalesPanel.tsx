import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/endpoints';
import { formatDateTime, formatMoney } from '../../lib/format';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { Empty, ErrorBanner, Loading, PageHeader } from '../../components/ui';

const PAGE_SIZE = 15;

export function SalesPanel({ outletId, embedded = false }: { outletId: string; embedded?: boolean }) {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const sales = useQuery({
    queryKey: ['sales', outletId, page],
    queryFn: () => api.sales.list(outletId, { page, pageSize: PAGE_SIZE }),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      {!embedded && <PageHeader eyebrow="Outlet" title="Sales" subtitle="Every sale with its sequential receipt number." />}
      <div className="card">
        <ErrorBanner error={sales.error} />
        {sales.isLoading ? (
          <Loading />
        ) : !sales.data?.data.length ? (
          <Empty>No sales yet.</Empty>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Date</th>
                    <th className="num">Items</th>
                    <th className="num">Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sales.data.data.map((s) => (
                    <Fragment key={s.id}>
                      <tr>
                        <td>
                          <code>{s.receiptNumber}</code>
                        </td>
                        <td className="muted">{formatDateTime(s.createdAt)}</td>
                        <td className="num">{s.itemCount}</td>
                        <td className="num">
                          <strong>{formatMoney(s.totalAmount)}</strong>
                        </td>
                        <td className="row-actions">
                          <button
                            className="btn ghost sm"
                            aria-expanded={open === s.id}
                            onClick={() => setOpen(open === s.id ? null : s.id)}
                          >
                            {open === s.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            {open === s.id ? 'Hide' : 'Details'}
                          </button>
                        </td>
                      </tr>
                      {open === s.id && (
                        <tr className="details">
                          <td colSpan={5}>
                            <ul className="receipt-lines">
                              {s.items.map((i) => (
                                <li key={i.menuItemId}>
                                  <span>
                                    {i.quantity} × {i.name} <small className="muted">@ {formatMoney(i.unitPrice)}</small>
                                  </span>
                                  <span>{formatMoney(i.lineTotal)}</span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span className="muted small">
                {sales.data.pagination.total} sales · page {page} of {Math.max(sales.data.pagination.totalPages, 1)}
              </span>
              <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={16} /> Previous
              </button>
              <button
                className="btn ghost sm"
                disabled={page >= sales.data.pagination.totalPages}
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
