import type { RequestHandler } from 'express';
import type { ZodTypeAny, z } from 'zod';

/** Validates and replaces req.body / req.query / req.params with parsed (defaulted, coerced) values. */
export const validate =
  (schemas: { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny }): RequestHandler =>
  (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
      if (schemas.query) Object.defineProperty(req, 'query', { value: schemas.query.parse(req.query), writable: true });
      if (schemas.params) req.params = schemas.params.parse(req.params);
      next();
    } catch (e) {
      next(e);
    }
  };

export type Body<S extends ZodTypeAny> = z.infer<S>;
