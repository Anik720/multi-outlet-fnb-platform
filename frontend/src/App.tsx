import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth/AuthContext';
import type { Role } from './api/types';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/hq/DashboardPage';
import { MenuItemsPage } from './pages/hq/MenuItemsPage';
import { OutletsPage } from './pages/hq/OutletsPage';
import { OutletDetailPage } from './pages/hq/OutletDetailPage';
import { PosPage } from './pages/outlet/PosPage';
import { InventoryPanel } from './pages/outlet/InventoryPanel';
import { SalesPanel } from './pages/outlet/SalesPanel';
import { ErrorBanner } from './components/ui';

/** Shown while a saved session is restored, or when the server couldn't be reached to check it. */
function SessionPending() {
  const { restoreError, retryRestore, logout } = useAuth();
  if (!restoreError) return <div className="page-loading">Loading…</div>;
  return (
    <div className="page-loading">
      <div className="session-error">
        <ErrorBanner error={restoreError} />
        <div className="row gap">
          <button className="btn primary" onClick={retryRestore}>
            Try again
          </button>
          <button className="btn ghost" onClick={logout}>
            Sign in again
          </button>
        </div>
      </div>
    </div>
  );
}

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading, restoreError } = useAuth();
  if (loading || restoreError) return <SessionPending />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Home() {
  const { user, loading, restoreError } = useAuth();
  if (loading || restoreError) return <SessionPending />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'HQ_ADMIN' ? '/hq/dashboard' : '/outlet/pos'} replace />;
}

/** Outlet staff pages always act on the user's own outlet. */
function StaffOutlet({ render }: { render: (outletId: string) => ReactNode }) {
  const { user } = useAuth();
  return <>{render(user!.outletId!)}</>;
}

function OutletDetailRoute() {
  const { outletId } = useParams();
  return <OutletDetailPage outletId={outletId!} />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Home />} />

      <Route
        path="/hq"
        element={
          <RequireRole role="HQ_ADMIN">
            <AppLayout />
          </RequireRole>
        }
      >
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="menu" element={<MenuItemsPage />} />
        <Route path="outlets" element={<OutletsPage />} />
        <Route path="outlets/:outletId" element={<OutletDetailRoute />} />
      </Route>

      <Route
        path="/outlet"
        element={
          <RequireRole role="OUTLET_STAFF">
            <AppLayout />
          </RequireRole>
        }
      >
        <Route path="pos" element={<StaffOutlet render={(id) => <PosPage outletId={id} />} />} />
        <Route path="inventory" element={<StaffOutlet render={(id) => <InventoryPanel outletId={id} />} />} />
        <Route path="sales" element={<StaffOutlet render={(id) => <SalesPanel outletId={id} />} />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
