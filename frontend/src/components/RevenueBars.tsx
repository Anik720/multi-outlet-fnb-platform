import { useState } from 'react';
import type { RevenueReport } from '../api/types';
import { formatInt, formatMoney } from '../lib/format';

type Row = RevenueReport['outlets'][number];

/**
 * Revenue by outlet: a single-series magnitude comparison, so horizontal bars
 * in one hue, sorted, with direct value labels and a hover tooltip. The table
 * next to it is the accessible/exact view of the same numbers.
 */
export function RevenueBars({ rows }: { rows: Row[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...rows.map((r) => r.revenue), 0);

  return (
    <div className="bars" role="img" aria-label="Revenue by outlet bar chart">
      {rows.map((r) => {
        const pct = max ? (r.revenue / max) * 100 : 0;
        return (
          <div
            key={r.outletId}
            className="bar-row"
            onMouseEnter={() => setHover(r.outletId)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(r.outletId)}
            onBlur={() => setHover(null)}
            tabIndex={0}
          >
            <div className="bar-label">
              <span>{r.outletName}</span>
              <small>{r.outletCode}</small>
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${Math.max(pct, r.revenue ? 1 : 0)}%` }} />
              <span className="bar-value">{formatMoney(r.revenue)}</span>
              {hover === r.outletId && (
                <div className="tooltip" role="tooltip">
                  <strong>{r.outletName}</strong>
                  <span>Revenue: {formatMoney(r.revenue)}</span>
                  <span>Transactions: {formatInt(r.transactionCount)}</span>
                  <span>Avg ticket: {formatMoney(r.averageTicket)}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
