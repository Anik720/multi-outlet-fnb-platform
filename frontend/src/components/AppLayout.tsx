import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/endpoints';
import { BookOpenText, LayoutDashboard, LogOut, Package, ReceiptText, ShoppingCart, Store } from 'lucide-react';
import { BrandMark, ThemeToggle, initials } from './ui';

const HQ_NAV = [
  { to: '/hq/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/hq/menu', label: 'Master menu', icon: BookOpenText },
  { to: '/hq/outlets', label: 'Outlets', icon: Store },
];

const OUTLET_NAV = [
  { to: '/outlet/pos', label: 'Point of sale', icon: ShoppingCart },
  { to: '/outlet/inventory', label: 'Inventory', icon: Package },
  { to: '/outlet/sales', label: 'Sales', icon: ReceiptText },
];

const today = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isHq = user?.role === 'HQ_ADMIN';

  const outlet = useQuery({
    queryKey: ['outlet', user?.outletId],
    queryFn: () => api.outlets.get(user!.outletId!),
    enabled: !isHq && Boolean(user?.outletId),
  });

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <div>
            <strong>F&amp;B {isHq ? 'HQ' : 'Outlet'}</strong>
            <small>{isHq ? 'Head office console' : 'Counter terminal'}</small>
          </div>
        </div>

        <p className="side-label">Workspace</p>
        <nav className="nav" aria-label="Main">
          {(isHq ? HQ_NAV : OUTLET_NAV).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              <Icon size={18} strokeWidth={1.9} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="side-context">
          <span className="side-label">{isHq ? 'Scope' : 'Outlet'}</span>
          <strong>{isHq ? 'All outlets' : (outlet.data?.name ?? '…')}</strong>
          <small>{isHq ? 'Company-wide access' : (outlet.data?.code ?? '')}</small>
        </div>

        <div className="user">
          <span className="avatar" aria-hidden>
            {initials(user?.fullName ?? '?')}
          </span>
          <div className="user-meta">
            <strong>{user?.fullName}</strong>
            <small title={user?.email}>{user?.email}</small>
          </div>
          <button
            className="icon-btn"
            aria-label="Log out"
            title="Log out"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="main-top">
          <span className="live-dot" aria-hidden />
          <span className="grow">{today.format(new Date())}</span>
          <ThemeToggle />
        </div>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
