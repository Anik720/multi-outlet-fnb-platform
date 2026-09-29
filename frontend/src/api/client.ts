import type { ApiErrorBody } from './types';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api/v1';
const TOKEN_KEY = 'fnb.token';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable (private mode) - session just won't persist */
    }
  },
};

/** Called on 401 so the app can drop the session and go to /login. */
let onUnauthorized: () => void = () => undefined;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(BASE_URL + path, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection.');
  }

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (payload as ApiErrorBody | null)?.error;
    if (res.status === 401 && token) onUnauthorized();
    // Proxy/gateway errors have no API body; "Gateway Time-out" means nothing to a cashier.
    if (!err && [502, 503, 504].includes(res.status)) {
      throw new ApiError(res.status, 'SERVER_UNAVAILABLE', 'The server is unavailable right now. Please try again in a moment.');
    }
    throw new ApiError(res.status, err?.code ?? 'HTTP_ERROR', err?.message ?? res.statusText, err?.details);
  }
  return payload as T;
}

/** Human-friendly message for any thrown error, including validation details. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
      return err.details.map((d: { path: string; message: string }) => `${d.path || 'request'}: ${d.message}`).join('; ');
    }
    if (err.code === 'INSUFFICIENT_STOCK' && Array.isArray(err.details)) {
      return (
        'Not enough stock: ' +
        err.details
          .map((d: { name: string; requested: number; available: number }) => `${d.name} (wanted ${d.requested}, have ${d.available})`)
          .join(', ')
      );
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}
