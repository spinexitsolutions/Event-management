import type { RequestHandler } from 'express';
import { env, isProd } from '../config/env';
import { AppError } from '../lib/AppError';
import { randomToken, safeEqual } from '../lib/crypto';

export const CSRF_COOKIE = 'me_csrf';
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF protection: a readable cookie whose value must be echoed in X-CSRF-Token.
 * Combined with SameSite=Lax session cookies and a strict CORS allowlist.
 * Webhooks are exempt (they are authenticated by signature instead).
 */
export const issueCsrf: RequestHandler = (req, res, next) => {
  if (!req.cookies?.[CSRF_COOKIE]) {
    const token = randomToken(24);
    res.cookie(CSRF_COOKIE, token, { httpOnly: false, sameSite: 'lax', secure: env.COOKIE_SECURE || isProd, domain: env.COOKIE_DOMAIN, path: '/', maxAge: 30 * 864e5 });
    req.cookies = { ...(req.cookies ?? {}), [CSRF_COOKIE]: token };
  }
  next();
};

export const verifyCsrf: RequestHandler = (req, _res, next) => {
  if (SAFE.has(req.method) || req.path.startsWith('/webhooks/')) return next();
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get('x-csrf-token');
  if (!cookie || !header || !safeEqual(cookie, header)) return next(new AppError(403, 'CSRF_FAILED', 'Security token missing or invalid. Refresh the page and try again.'));
  next();
};
