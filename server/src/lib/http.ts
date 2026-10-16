import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Wraps async handlers so rejections reach the error middleware. */
export const ah =
  <R extends Request = Request>(fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) =>
    fn(req as R, res, next).catch(next);

export const ok = (res: Response, data: unknown, meta?: Record<string, unknown>, status = 200) => res.status(status).json(meta ? { data, meta } : { data });

export function paginate(q: { page?: unknown; limit?: unknown }, maxLimit = 100) {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(q.limit) || 20));
  return { page, limit, skip: (page - 1) * limit, take: limit };
}
export const pageMeta = (page: number, limit: number, total: number) => ({ page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });

export const clientIp = (req: Request) => req.ip ?? null;

/** Typed access to a query object already parsed by validate({ query }). */
export const qry = <T>(req: Request) => req.query as unknown as T;
