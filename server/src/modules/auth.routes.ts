import { Router } from 'express';
import { z } from 'zod';
import { emailSchema, phoneSchema } from '@maison/shared';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { AppError } from '../lib/AppError';
import { ah, ok } from '../lib/http';
import { sha256, encrypt, decrypt } from '../lib/crypto';
import { generateSecret, otpauthUrl, verifyTotp } from '../lib/totp';
import { requireAuth } from '../middleware/auth';
import { CSRF_COOKIE } from '../middleware/csrf';
import { authLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import {
  assertStrongPassword,
  checkCredentials,
  clearSessionCookie,
  consumeUserToken,
  createSession,
  hashPassword,
  issueUserToken,
  loadSession,
  revokeUserSessions,
  SESSION_COOKIE,
  verifyPassword,
} from '../services/auth.service';
import { audit } from '../services/audit.service';
import { sendEmail } from '../services/notify.service';
import { getPublishedSite } from '../services/siteConfig.service';

export const authRouter = Router();

const password = z.string().min(10, 'Use at least 10 characters').max(200);

authRouter.get('/csrf', (req, res) => ok(res, { csrfToken: req.cookies?.[CSRF_COOKIE] }));

authRouter.get(
  '/me',
  ah(async (req, res) => {
    if (!req.user) return ok(res, null);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user.id }, select: { id: true, email: true, name: true, phone: true, title: true, avatarUrl: true, roleKey: true, mfaEnabled: true, role: { select: { name: true } } } });
    ok(res, { ...u, roleName: u.role.name, permissions: req.user.permissions, isStaff: req.user.isStaff, clientId: req.user.clientId });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validate({ body: z.object({ email: emailSchema, password: z.string().min(1).max(200) }) }),
  ah(async (req, res) => {
    const user = await checkCredentials(req.body.email, req.body.password);
    await createSession(req, res, user.id, user.mfaEnabled);
    if (user.mfaEnabled) return ok(res, { mfaRequired: true });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    if (user.roleKey !== 'CLIENT') await audit(req, { action: 'auth.login', entityType: 'User', entityId: user.id, actorId: user.id });
    ok(res, { mfaRequired: false });
  }),
);

authRouter.post(
  '/mfa/verify',
  authLimiter,
  validate({ body: z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') }) }),
  ah(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    const session = token ? await prisma.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } }) : null;
    if (!session || !session.mfaPending || session.expiresAt < new Date() || !session.user.mfaSecret) throw AppError.unauthorized('Your sign-in expired. Please sign in again.');
    if (!verifyTotp(decrypt(session.user.mfaSecret), req.body.code)) throw new AppError(401, 'INVALID_CODE', 'That code is not valid. Check your authenticator app.');
    await prisma.session.delete({ where: { id: session.id } });
    await createSession(req, res, session.userId, false);
    await prisma.user.update({ where: { id: session.userId }, data: { lastLoginAt: new Date() } });
    ok(res, { mfaRequired: false });
  }),
);

authRouter.post(
  '/logout',
  ah(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
    clearSessionCookie(res);
    ok(res, { ok: true });
  }),
);

authRouter.post(
  '/logout-all',
  requireAuth,
  ah(async (req, res) => {
    await revokeUserSessions(req.user!.id, req.user!.sessionId);
    ok(res, { ok: true });
  }),
);

authRouter.get(
  '/sessions',
  requireAuth,
  ah(async (req, res) => {
    const rows = await prisma.session.findMany({ where: { userId: req.user!.id, expiresAt: { gt: new Date() }, mfaPending: false }, orderBy: { lastSeenAt: 'desc' }, select: { id: true, ip: true, userAgent: true, createdAt: true, lastSeenAt: true } });
    ok(res, rows.map((s) => ({ ...s, current: s.id === req.user!.sessionId })));
  }),
);

authRouter.delete(
  '/sessions/:id',
  requireAuth,
  ah(async (req, res) => {
    await prisma.session.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
    ok(res, { ok: true });
  }),
);

/** Client self-registration. The account is activated only after the email address is verified. */
authRouter.post(
  '/register',
  authLimiter,
  validate({ body: z.object({ name: z.string().trim().min(2).max(120), email: emailSchema, phone: phoneSchema.or(z.literal('')).default(''), password }) }),
  ah(async (req, res) => {
    assertStrongPassword(req.body.password);
    const existing = await prisma.user.findUnique({ where: { email: req.body.email } });
    // Same response whether or not the email exists (prevents account enumeration).
    if (!existing) {
      const user = await prisma.user.create({
        data: { email: req.body.email, name: req.body.name, phone: req.body.phone || null, passwordHash: await hashPassword(req.body.password), roleKey: 'CLIENT', status: 'INVITED' },
      });
      const token = await issueUserToken(user.id, 'verify', 60 * 24);
      await sendEmail({ to: user.email, template: 'email_verification', vars: { name: user.name, url: `${env.APP_URL}/verify-email?token=${token}` } });
    }
    ok(res, { message: 'Check your inbox to confirm your email address and activate your account.' }, undefined, 201);
  }),
);

/** Verifies email; links the account to an existing client profile with the same email (ownership proven). */
authRouter.post(
  '/verify-email',
  validate({ body: z.object({ token: z.string().min(10).max(200) }) }),
  ah(async (req, res) => {
    const t = await consumeUserToken(req.body.token, ['verify']);
    const user = await prisma.user.update({ where: { id: t.userId }, data: { status: 'ACTIVE' } });
    await linkClientProfile(user.id, user.email, user.name, user.phone ?? '');
    await createSession(req, res, user.id);
    ok(res, { ok: true });
  }),
);

/** Re-sends the verification link for an unverified client registration (generic response, rate-limited). */
authRouter.post(
  '/resend-verification',
  authLimiter,
  validate({ body: z.object({ email: emailSchema }) }),
  ah(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (user && user.status === 'INVITED' && user.roleKey === 'CLIENT' && user.passwordHash) {
      const recent = await prisma.passwordResetToken.count({ where: { userId: user.id, purpose: 'verify', createdAt: { gt: new Date(Date.now() - 5 * 60_000) } } });
      if (!recent) {
        const token = await issueUserToken(user.id, 'verify', 60 * 24);
        await sendEmail({ to: user.email, template: 'email_verification', vars: { name: user.name, url: `${env.APP_URL}/verify-email?token=${token}` } });
      }
    }
    ok(res, { message: 'If that account is awaiting verification, a new link is on its way.' });
  }),
);

export async function linkClientProfile(userId: string, email: string, name: string, phone: string) {
  const client = await prisma.client.findUnique({ where: { email } });
  if (client) {
    if (!client.userId) await prisma.client.update({ where: { id: client.id }, data: { userId } });
  } else {
    await prisma.client.create({ data: { email, name, phone, userId, source: 'portal-registration' } });
  }
}

authRouter.post(
  '/forgot-password',
  authLimiter,
  validate({ body: z.object({ email: emailSchema }) }),
  ah(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (user && user.status !== 'DEACTIVATED') {
      const token = await issueUserToken(user.id, 'reset', 60);
      await sendEmail({ to: user.email, template: 'password_reset', vars: { name: user.name, url: `${env.APP_URL}/reset-password?token=${token}` } });
    }
    ok(res, { message: 'If an account exists for that email, a reset link is on its way.' });
  }),
);

/** Completes a password reset or accepts an invitation (staff or client portal). Revokes all other sessions. */
authRouter.post(
  '/reset-password',
  authLimiter,
  validate({ body: z.object({ token: z.string().min(10).max(200), password }) }),
  ah(async (req, res) => {
    assertStrongPassword(req.body.password);
    const t = await consumeUserToken(req.body.token, ['reset', 'invite']);
    const user = await prisma.user.update({
      where: { id: t.userId },
      data: { passwordHash: await hashPassword(req.body.password), status: t.purpose === 'invite' ? 'ACTIVE' : undefined, failedLogins: 0, lockedUntil: null },
    });
    if (user.status === 'DEACTIVATED') throw new AppError(403, 'ACCOUNT_DEACTIVATED', 'This account has been deactivated.');
    if (user.roleKey === 'CLIENT') await linkClientProfile(user.id, user.email, user.name, user.phone ?? '');
    await revokeUserSessions(user.id);
    await audit(req, { action: t.purpose === 'invite' ? 'auth.invite_accepted' : 'auth.password_reset', entityType: 'User', entityId: user.id, actorId: user.id });
    ok(res, { ok: true });
  }),
);

authRouter.patch(
  '/profile',
  requireAuth,
  validate({ body: z.object({ name: z.string().trim().min(2).max(120).optional(), phone: z.string().trim().max(30).optional(), title: z.string().trim().max(80).optional() }) }),
  ah(async (req, res) => {
    const u = await prisma.user.update({ where: { id: req.user!.id }, data: req.body, select: { id: true, name: true, phone: true, title: true } });
    ok(res, u);
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  validate({ body: z.object({ currentPassword: z.string().min(1), newPassword: password }) }),
  ah(async (req, res) => {
    assertStrongPassword(req.body.newPassword);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!u.passwordHash || !(await verifyPassword(req.body.currentPassword, u.passwordHash))) throw new AppError(400, 'INVALID_PASSWORD', 'Current password is incorrect');
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(req.body.newPassword) } });
    await revokeUserSessions(u.id, req.user!.sessionId);
    await audit(req, { action: 'auth.password_changed', entityType: 'User', entityId: u.id });
    ok(res, { ok: true });
  }),
);

/* MFA enrolment (TOTP). */
authRouter.post(
  '/mfa/setup',
  requireAuth,
  ah(async (req, res) => {
    const secret = generateSecret();
    await prisma.user.update({ where: { id: req.user!.id }, data: { mfaSecret: encrypt(secret), mfaEnabled: false } });
    const site = await getPublishedSite();
    ok(res, { secret, otpauthUrl: otpauthUrl(secret, req.user!.email, site.brand.name) });
  }),
);

authRouter.post(
  '/mfa/enable',
  requireAuth,
  validate({ body: z.object({ code: z.string().trim().regex(/^\d{6}$/) }) }),
  ah(async (req, res) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!u.mfaSecret || !verifyTotp(decrypt(u.mfaSecret), req.body.code)) throw new AppError(400, 'INVALID_CODE', 'That code is not valid');
    await prisma.user.update({ where: { id: u.id }, data: { mfaEnabled: true } });
    await audit(req, { action: 'auth.mfa_enabled', entityType: 'User', entityId: u.id });
    ok(res, { ok: true });
  }),
);

authRouter.post(
  '/mfa/disable',
  requireAuth,
  validate({ body: z.object({ password: z.string().min(1) }) }),
  ah(async (req, res) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!u.passwordHash || !(await verifyPassword(req.body.password, u.passwordHash))) throw new AppError(400, 'INVALID_PASSWORD', 'Password is incorrect');
    await prisma.user.update({ where: { id: u.id }, data: { mfaEnabled: false, mfaSecret: null } });
    await audit(req, { action: 'auth.mfa_disabled', entityType: 'User', entityId: u.id });
    ok(res, { ok: true });
  }),
);

// Used by tests and the session-status UI.
authRouter.get(
  '/session-status',
  ah(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    const s = token ? await loadSession(token) : null;
    ok(res, { authenticated: !!s && !s.mfaPending, mfaPending: !!s?.mfaPending });
  }),
);
