import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, setUnauthorizedHandler, tokenStore } from '../api/client';
import { api } from '../api/endpoints';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  /** true while restoring a saved session on first load */
  loading: boolean;
  /** set when the saved session couldn't be checked (server down, network), not when it's invalid */
  restoreError: unknown;
  retryRestore: () => void;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => Boolean(tokenStore.get()));
  const [restoreError, setRestoreError] = useState<unknown>(null);

  const logout = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    setRestoreError(null);
    queryClient.clear();
  }, [queryClient]);

  const restore = useCallback(() => {
    if (!tokenStore.get()) return;
    setLoading(true);
    setRestoreError(null);
    api.auth
      .me()
      .then(setUser)
      .catch((err) => {
        // The server rejecting the session (4xx) ends it; an outage (network / 5xx) or a rate limit must not.
        const rejected = err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;
        if (rejected) tokenStore.set(null);
        else setRestoreError(err);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    restore();
  }, [logout, restore]);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: u } = await api.auth.login(email, password);
    tokenStore.set(token);
    setUser(u);
    return u;
  }, []);

  const value = useMemo(
    () => ({ user, loading, restoreError, retryRestore: restore, login, logout }),
    [user, loading, restoreError, restore, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
