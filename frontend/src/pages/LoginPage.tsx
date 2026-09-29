import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ArrowRight, Building2, Store } from 'lucide-react';
import { BrandMark, ErrorBanner, ThemeToggle } from '../components/ui';

const DEMO_ACCOUNTS = [
  { label: 'HQ Admin', role: 'Head office', email: 'hq@fnb.test' },
  { label: 'Gulshan Flagship', role: 'Outlet · DHK-GUL', email: 'gulshan@fnb.test' },
  { label: 'Dhanmondi Lake View', role: 'Outlet · DHK-DHN', email: 'dhanmondi@fnb.test' },
  { label: 'Agrabad Express', role: 'Outlet · CTG-AGR', email: 'agrabad@fnb.test' },
];
const DEMO_PASSWORD = 'Password123!';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent, creds = { email, password }) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(creds.email, creds.password);
      navigate('/');
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login">
      <section className="login-art">
        <div className="brand">
          <BrandMark />
          <div>
            <strong>F&amp;B HQ</strong>
            <small>Multi-outlet operations</small>
          </div>
        </div>

        <div className="login-pitch">
          <p className="eyebrow">Head office · Outlets · Counter</p>
          <h1>One master menu. Every outlet in sync. Every receipt in order.</h1>
          <p>
            Assign menus and outlet prices, track stock per outlet, ring up sales and watch revenue come in from one
            console.
          </p>
        </div>

        {/* Decorative sample receipt, priced like the demo Gulshan outlet */}
        <div className="login-ticket" aria-hidden>
          <div className="thermal">
            <p className="thermal-head">GULSHAN FLAGSHIP</p>
            <p className="thermal-no">DHK-GUL-00000042</p>
            <ul>
              <li>
                <span>2 × Cappuccino</span>
                <span>৳560.00</span>
              </li>
              <li>
                <span>1 × Chocolate Brownie</span>
                <span>৳220.00</span>
              </li>
              <li>
                <span>1 × French Fries</span>
                <span>৳180.00</span>
              </li>
            </ul>
            <p className="thermal-total">
              <span>TOTAL</span>
              <span>৳960.00</span>
            </p>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <ThemeToggle />
        <form className="login-card" onSubmit={submit}>
          <div className="login-head">
            <h2>Sign in</h2>
            <p className="muted">Use your work account, or pick a demo account below.</p>
          </div>

          <ErrorBanner error={error} />

          <label className="field">
            <span>Email</span>
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="btn primary block lg" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
            {!submitting && <ArrowRight size={18} />}
          </button>

          <div className="demo">
            <p className="divider-label">
              <span>Demo accounts</span>
            </p>
            <div className="demo-grid">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  className="demo-account"
                  disabled={submitting}
                  onClick={(e) => {
                    setEmail(a.email);
                    setPassword(DEMO_PASSWORD);
                    void submit(e as unknown as FormEvent, { email: a.email, password: DEMO_PASSWORD });
                  }}
                >
                  <span className={`avatar${a.email.startsWith('hq') ? ' hq' : ''}`}>
                    {a.email.startsWith('hq') ? <Building2 size={16} /> : <Store size={16} />}
                  </span>
                  <span className="demo-meta">
                    <strong>{a.label}</strong>
                    <small>{a.role}</small>
                  </span>
                </button>
              ))}
            </div>
            <p className="muted small center">
              Password for all: <code>{DEMO_PASSWORD}</code>
            </p>
          </div>
        </form>
      </section>
    </div>
  );
}
