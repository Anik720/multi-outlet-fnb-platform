import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../utils/errors';
import type { AuthUser, Role } from '../types/auth';

export interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
  outletId: string | null;
}

/** Verifies the Bearer JWT and attaches the caller to `req.user`. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());

  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as TokenPayload;
    const user: AuthUser = {
      id: payload.sub,
      email: payload.email,
      fullName: payload.name,
      role: payload.role,
      outletId: payload.outletId,
    };
    req.user = user;
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

/**
 * Tenant guard for routes under /outlets/:outletId. HQ can reach every outlet;
 * outlet staff can only reach their own.
 */
export const authorizeOutlet: RequestHandler = (req, _res, next) => {
  const user = req.user;
  if (!user) return next(unauthorized());
  if (user.role === 'HQ_ADMIN') return next();
  if (user.outletId && user.outletId === req.params.outletId) return next();
  next(forbidden('You can only access your own outlet'));
};
