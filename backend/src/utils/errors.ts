/**
 * Operational errors: expected failures that map to a specific HTTP response.
 * Anything that is NOT an AppError is treated as a bug and returned as 500.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const validationError = (details: unknown) =>
  new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details);

export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have access to this resource') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (resource: string) => new AppError(404, 'NOT_FOUND', `${resource} not found`);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, details);

export const unprocessable = (code: string, message: string, details?: unknown) =>
  new AppError(422, code, message, details);

export interface StockShortage {
  menuItemId: string;
  name: string;
  requested: number;
  available: number;
}

export const insufficientStock = (items: StockShortage[]) =>
  new AppError(409, 'INSUFFICIENT_STOCK', 'Not enough stock for one or more items', items);
