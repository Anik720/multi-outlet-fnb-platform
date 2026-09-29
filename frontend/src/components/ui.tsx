import type { ReactNode } from 'react';
import { errorMessage } from '../api/client';
import { ChefHat, Inbox, LoaderCircle, Moon, Sun } from 'lucide-react';
import { useTheme } from '../lib/theme';

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="alert error" role="alert">
      {errorMessage(error)}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spinner" size={20} aria-hidden />
      {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={20} strokeWidth={1.75} />
      </span>
      <span>{children}</span>
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warn' | 'bad'; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function StockBadge({ quantity }: { quantity: number }) {
  if (quantity === 0) return <Badge tone="bad">Out of stock</Badge>;
  if (quantity <= 5) return <Badge tone="warn">Low · {quantity}</Badge>;
  return <Badge tone="good">{quantity} in stock</Badge>;
}

/** Initials from a name: "Gulshan Flagship" -> "GF". */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Stable colour slot (1-5) for a label, e.g. a menu category. */
const KNOWN_TONES: Record<string, number> = { Beverages: 3, Mains: 1, Sides: 5, Desserts: 4 };
export const toneFor = (label: string) => {
  if (KNOWN_TONES[label]) return KNOWN_TONES[label];
  let h = 0;
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 5) + 1;
};

/** Brand mark: a chef's hat on the brand gradient. */
export function BrandMark({ size = 38 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden>
      <ChefHat size={Math.round(size * 0.55)} strokeWidth={2} />
    </span>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === 'light' ? 'dark' : 'light';
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
    </button>
  );
}
