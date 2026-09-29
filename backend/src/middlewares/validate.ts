import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { validationError } from '../utils/errors';

interface Schemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

type Location = keyof Schemas;

/**
 * Validates and coerces request parts against zod schemas. Parsed values are
 * exposed on `req.valid` (Express 5 makes `req.query` read-only), so
 * controllers only ever see data that passed validation.
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    const issues: { location: Location; path: string; message: string }[] = [];
    const parsed: Express.Request['valid'] = {};

    for (const location of ['params', 'query', 'body'] as const) {
      const schema = schemas[location];
      if (!schema) continue;
      const result = schema.safeParse(req[location] ?? {});
      if (result.success) {
        parsed[location] = result.data;
      } else {
        for (const issue of result.error.issues) {
          issues.push({ location, path: issue.path.join('.'), message: issue.message });
        }
      }
    }

    if (issues.length) return next(validationError(issues));
    req.valid = { ...req.valid, ...parsed };
    next();
  };
