import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import type { Permission } from '@maison/shared';
import { prisma } from '../config/db';
import { env, isProd } from '../config/env';
import { AppError } from '../lib/AppError';
import { randomToken, sha256 } from '../lib/crypto';

export const SESSION_COOKIE = 'me_session';
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleKey: string;
  permissions: Permission[];
  isStaff: boolean;
  clientId: string | null;
  sessionId: string;
  mfaEnabled: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const verifyPassword = (p: string, hash: string) => bcrypt.compare(p, hash);

// Equalise timing for unknown emails (computed lazily once).
let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync('timing-equaliser-password', 12));

export function setSessionCookie(res: Response, token: string, expires: Date) {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: env.COOKIE_SECURE || isProd, domain: env.COOKIE_DOMAIN, path: '/', expires });
}
export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/', domain: env.COOKIE_DOMAIN });
}

export async function createSession(req: Request, res: Response, userId: string, mfaPending = false) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + (mfaPending ? 10 * 60_000 : env.SESSION_TTL_HOURS * 3600_000));
  await prisma.session.create({
    data: { tokenHash: sha256(token), userId, mfaPending, expiresAt, ip: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 300) ?? null },
  });
  setSessionCookie(res, token, expiresAt);
}

export async function checkCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.passwordHash) {
    await bcrypt.compare(password, getDummyHash());
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in a few minutes or reset your password.');
  }
  const okPw = await verifyPassword(password, user.passwordHash);
  if (!okPw) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: failed >= MAX_FAILED ? 0 : failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
    });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  if (user.status === 'DEACTIVATED') throw new AppError(403, 'ACCOUNT_DEACTIVATED', 'This account has been deactivated. Contact an administrator.');
  if (user.status === 'INVITED') throw new AppError(403, 'ACCOUNT_NOT_ACTIVE', 'Please finish setting up your account from the link in your email.');
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  return user;
}

/** Resolves the session cookie into a user. Role & permissions are read from the database on every request. */
export async function loadSession(token: string): Promise<{ user: AuthUser; mfaPending: boolean } | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { role: true, client: { select: { id: true } } } } },
  });
  if (!session || session.expiresAt < new Date() || session.user.status !== 'ACTIVE') return null;
  // Touch at most once a minute to limit writes.
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  const u = session.user;
  return {
    mfaPending: session.mfaPending,
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      roleKey: u.roleKey,
      permissions: u.role.permissions as Permission[],
      isStaff: u.roleKey !== 'CLIENT',
      clientId: u.client?.id ?? null,
      sessionId: session.id,
      mfaEnabled: u.mfaEnabled,
    },
  };
}

export async function revokeUserSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.deleteMany({ where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) } });
}

/** One-time token for password reset / invitation / email verification (only the hash is stored). */
export async function issueUserToken(userId: string, purpose: 'reset' | 'invite' | 'verify', ttlMinutes: number) {
  const token = randomToken(32);
  await prisma.passwordResetToken.create({ data: { userId, purpose, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMinutes * 60_000) } });
  return token;
}

export async function consumeUserToken(token: string, purposes: string[]) {
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date() || !purposes.includes(row.purpose)) {
    throw new AppError(400, 'INVALID_TOKEN', 'This link is invalid or has expired. Please request a new one.');
  }
  const claimed = await prisma.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) throw new AppError(400, 'INVALID_TOKEN', 'This link has already been used.');
  return row;
}

export const passwordSchemaMessage = 'Use at least 10 characters with letters and numbers';
export function assertStrongPassword(p: string) {
  if (p.length < 10 || !/[a-zA-Z]/.test(p) || !/\d/.test(p)) throw new AppError(422, 'WEAK_PASSWORD', passwordSchemaMessage);
}
