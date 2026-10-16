import type { RequestHandler } from 'express';
import type { Permission } from '@maison/shared';
import { AppError } from '../lib/AppError';
import { loadSession, SESSION_COOKIE } from '../services/auth.service';

/** Attaches req.user when a valid, fully-authenticated session cookie is present. Never rejects. */
export const attachUser: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  try {
    const s = await loadSession(token);
    if (s && !s.mfaPending) req.user = s.user;
    next();
  } catch (e) {
    next(e);
  }
};

export const requireAuth: RequestHandler = (req, _res, next) => (req.user ? next() : next(AppError.unauthorized()));

export const requireStaff: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (!req.user.isStaff) return next(AppError.forbidden());
  next();
};

/** Staff user holding ALL listed permissions. */
export const requirePermission =
  (...perms: Permission[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!req.user.isStaff || !perms.every((p) => req.user!.permissions.includes(p))) return next(AppError.forbidden());
    next();
  };

/** Staff user holding ANY of the listed permissions. */
export const requireAnyPermission =
  (...perms: Permission[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!req.user.isStaff || !perms.some((p) => req.user!.permissions.includes(p))) return next(AppError.forbidden());
    next();
  };

/** Logged-in client with a linked client profile. */
export const requireClient: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (req.user.isStaff || !req.user.clientId) return next(AppError.forbidden('Client portal access only'));
  next();
};

export const can = (user: { permissions: string[] } | undefined, p: Permission) => !!user?.permissions.includes(p);
