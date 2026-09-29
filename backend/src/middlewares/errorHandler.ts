import type { ErrorRequestHandler, RequestHandler } from 'express';
import { isProduction } from '../config/env';
import { AppError } from '../utils/errors';
import { PG, dbErrorInfo } from '../utils/dbErrors';

interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

/**
 * Translates database errors that slipped past the service layer. Services
 * validate up front; constraints are the safety net, and hitting one should
 * still produce a meaningful 4xx rather than a 500.
 */
function fromDatabaseError(err: unknown): AppError | null {
  const info = dbErrorInfo(err);
  if (!info) return null;
  const details = info.constraint ? { constraint: info.constraint } : undefined;

  if (info.prismaCode === 'P2025') return new AppError(404, 'NOT_FOUND', 'Record not found');

  switch (info.sqlState) {
    case PG.UNIQUE_VIOLATION:
      return new AppError(409, 'DUPLICATE', 'A record with the same unique value already exists', details);
    case PG.FOREIGN_KEY_VIOLATION:
      return new AppError(409, 'REFERENCE_VIOLATION', 'Referenced record does not exist or is still in use', details);
    case PG.CHECK_VIOLATION:
      return new AppError(409, 'CONSTRAINT_VIOLATION', 'Operation violates a data integrity rule', details);
    case PG.INVALID_TEXT_REPRESENTATION:
      return new AppError(400, 'BAD_REQUEST', 'Malformed identifier or value');
    case PG.DEADLOCK_DETECTED:
    case PG.SERIALIZATION_FAILURE:
      return new AppError(503, 'RETRYABLE', 'Temporary conflict, please retry');
  }
  if (info.prismaCode === 'P2034') return new AppError(503, 'RETRYABLE', 'Temporary conflict, please retry');
  return null;
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};

// Express identifies error handlers by arity, so `_next` must stay.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let appError: AppError | null;

  if (err instanceof AppError) {
    appError = err;
  } else if (err?.type === 'entity.parse.failed') {
    appError = new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  } else if (err?.type === 'entity.too.large') {
    appError = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  } else {
    appError = fromDatabaseError(err);
  }

  const status = appError?.statusCode ?? 500;
  if (status >= 500) req.log?.error({ err }, 'Request failed');

  const body: ErrorBody = {
    error: appError
      ? { code: appError.code, message: appError.message, details: appError.details }
      : {
          code: 'INTERNAL_ERROR',
          message: isProduction ? 'Something went wrong' : String(err?.message ?? err),
        },
  };
  body.error.requestId = String(req.id ?? '');

  res.status(status).json(body);
};
