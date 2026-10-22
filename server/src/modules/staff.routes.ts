import { Router, type Request } from 'express';
import { z } from 'zod';
import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from '@maison/shared';
import { prisma, type Prisma, type Tx, withTx, lockRows } from '../config/db';
import { env } from '../config/env';
import { AppError } from '../lib/AppError';
import { addDays, toDateOnly } from '../lib/dates';
import { ah, ok, pageMeta, paginate, qry } from '../lib/http';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { audit, diff } from '../services/audit.service';
import { issueUserToken, revokeUserSessions } from '../services/auth.service';
import { emailConfigured, sendEmail } from '../services/notify.service';

/**
 * Staff & access control: invite staff, change roles, activate/deactivate, revoke sessions,
 * edit role permissions, and browse the audit log. Every change is audit-logged.
 */
export const staffRouter = Router();

const SUPER = 'SUPER_ADMIN';
const INVITE_TTL_MIN = 72 * 60;
const str = (max: number) => z.string().trim().max(max);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

// ───────────────────────────── Audit log (audit.view) ─────────────────────────────

const auditQuery = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  entityType: str(60).optional(),
  entityId: str(60).optional(),
  actorId: str(40).optional(),
  action: str(80).optional(),
  q: str(100).optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
});

staffRouter.get(
  '/audit',
  requirePermission('audit.view'),
  validate({ query: auditQuery }),
  ah(async (req, res) => {
    const q = qry<z.infer<typeof auditQuery>>(req);
    const { page, limit, skip, take } = paginate(q, 100);
    const createdAt: Prisma.DateTimeFilter = {};
    if (q.from) createdAt.gte = toDateOnly(q.from)!;
    if (q.to) createdAt.lt = addDays(toDateOnly(q.to)!, 1);
    const where: Prisma.AuditLogWhereInput = {
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.from || q.to ? { createdAt } : {}),
      ...(q.q
        ? {
            OR: [
              { summary: { contains: q.q, mode: 'insensitive' } },
              { action: { contains: q.q, mode: 'insensitive' } },
              { entityId: q.q },
              { actor: { name: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total, entityTypes] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { actor: { select: { id: true, name: true, email: true } } } }),
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({ by: ['entityType'], _count: true, orderBy: { entityType: 'asc' } }),
    ]);
    ok(
      res,
      items.map((i) => ({ ...i, actorName: i.actor?.name ?? (i.actorId ? 'Deleted user' : 'System') })),
      { ...pageMeta(page, limit, total), entityTypes: entityTypes.map((e) => e.entityType) },
    );
  }),
);

// Everything below requires staff.manage.
staffRouter.use(requirePermission('staff.manage'));

const isSuper = (req: Request) => req.user!.roleKey === SUPER;

/** Throws when the change would leave no active Super Admin. Call inside a transaction. */
async function assertKeepsSuperAdmin(tx: Tx, userId: string) {
  // Serialise every change that could affect the set of active Super Admins on the Super Admin role document.
  await lockRows(tx, 'role', { key: SUPER });
  const others = await tx.user.count({ where: { roleKey: SUPER, status: 'ACTIVE', id: { not: userId } } });
  if (others === 0) throw AppError.conflict('This is the last active Super Admin. Promote another user to Super Admin first.');
}

async function staffRole(roleKey: string) {
  if (roleKey === 'CLIENT') throw AppError.badRequest('Choose a staff role');
  const role = await prisma.role.findUnique({ where: { key: roleKey } });
  if (!role) throw AppError.badRequest('Unknown role');
  return role;
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  title: true,
  avatarUrl: true,
  roleKey: true,
  status: true,
  mfaEnabled: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
  role: { select: { key: true, name: true } },
} satisfies Prisma.UserSelect;

async function sendInvite(user: { id: string; name: string; email: string }, roleName: string) {
  // Invalidate earlier unused invitation links.
  await prisma.passwordResetToken.updateMany({ where: { userId: user.id, purpose: 'invite', usedAt: null }, data: { usedAt: new Date() } });
  const token = await issueUserToken(user.id, 'invite', INVITE_TTL_MIN);
  const url = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}&invite=1`;
  await sendEmail({ to: user.email, template: 'staff_invite', vars: { name: user.name, role: roleName, url }, entityType: 'user', entityId: user.id });
  const deliveredByEmail = emailConfigured();
  // The link is only returned to the inviting admin when it cannot be emailed.
  return deliveredByEmail ? { deliveredByEmail: true as const } : { deliveredByEmail: false as const, inviteUrl: url, expiresInHours: INVITE_TTL_MIN / 60 };
}

// ───────────────────────────── Users ─────────────────────────────

const usersQuery = z.object({
  q: str(100).optional(),
  status: z.enum(['ACTIVE', 'INVITED', 'DEACTIVATED']).optional(),
  roleKey: str(40).optional(),
});

staffRouter.get(
  '/users',
  validate({ query: usersQuery }),
  ah(async (req, res) => {
    const q = qry<z.infer<typeof usersQuery>>(req);
    const now = new Date();
    const items = await prisma.user.findMany({
      where: {
        roleKey: q.roleKey && q.roleKey !== 'CLIENT' ? q.roleKey : { not: 'CLIENT' },
        ...(q.status ? { status: q.status } : {}),
        ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {}),
      },
      select: { ...userSelect, _count: { select: { sessions: { where: { expiresAt: { gt: now }, mfaPending: false } } } } },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      take: 1000,
    });
    ok(
      res,
      items.map(({ _count, ...u }) => ({ ...u, activeSessions: _count.sessions, isSelf: u.id === req.user!.id })),
    );
  }),
);

const inviteInput = z.object({
  name: str(120).min(1, 'Name is required'),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(200),
  roleKey: str(40).min(1),
  title: str(120).optional(),
  phone: str(40).optional(),
});

staffRouter.post(
  '/users',
  validate({ body: inviteInput }),
  ah(async (req, res) => {
    const b = req.body as z.infer<typeof inviteInput>;
    const role = await staffRole(b.roleKey);
    if (role.key === SUPER && !isSuper(req)) throw AppError.forbidden('Only a Super Admin can invite another Super Admin');
    const existing = await prisma.user.findUnique({ where: { email: b.email }, select: { id: true, roleKey: true } });
    if (existing) throw AppError.conflict(existing.roleKey === 'CLIENT' ? 'This email belongs to a client account' : 'A staff member with this email already exists');
    const user = await prisma.user.create({
      data: { name: b.name, email: b.email, roleKey: role.key, title: b.title || null, phone: b.phone || null, status: 'INVITED' },
      select: userSelect,
    });
    const delivery = await sendInvite(user, role.name);
    await audit(req, { action: 'staff.invite', entityType: 'user', entityId: user.id, summary: `${user.email} invited as ${role.name}${delivery.deliveredByEmail ? '' : ' (link shown to admin)'}` });
    ok(res, { user, ...delivery }, undefined, 201);
  }),
);

staffRouter.post(
  '/users/:id/resend-invite',
  ah(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { ...userSelect } });
    if (!user || user.roleKey === 'CLIENT') throw AppError.notFound('Staff member');
    if (user.status !== 'INVITED') throw AppError.conflict('This person has already activated their account');
    if (user.roleKey === SUPER && !isSuper(req)) throw AppError.forbidden();
    const delivery = await sendInvite(user, user.role.name);
    await audit(req, { action: 'staff.resend_invite', entityType: 'user', entityId: user.id, summary: user.email });
    ok(res, { user, ...delivery });
  }),
);

const userUpdate = z
  .object({
    name: str(120).min(1).optional(),
    title: str(120).nullable().optional(),
    phone: str(40).nullable().optional(),
    roleKey: str(40).min(1).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'Nothing to update');

staffRouter.patch(
  '/users/:id',
  validate({ body: userUpdate }),
  ah(async (req, res) => {
    const b = req.body as z.infer<typeof userUpdate>;
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target || target.roleKey === 'CLIENT') throw AppError.notFound('Staff member');
    if (target.roleKey === SUPER && !isSuper(req)) throw AppError.forbidden('Only a Super Admin can edit a Super Admin');
    const roleChange = b.roleKey !== undefined && b.roleKey !== target.roleKey;
    if (roleChange) {
      const role = await staffRole(b.roleKey!);
      if (role.key === SUPER && !isSuper(req)) throw AppError.forbidden('Only a Super Admin can grant Super Admin');
      if (target.id === req.user!.id) throw AppError.conflict('You cannot change your own role. Ask another administrator.');
    }
    const row = await withTx(async (tx) => {
      if (roleChange && target.roleKey === SUPER && target.status === 'ACTIVE') await assertKeepsSuperAdmin(tx, target.id);
      return tx.user.update({
        where: { id: target.id },
        data: {
          ...(b.name !== undefined ? { name: b.name } : {}),
          ...(b.title !== undefined ? { title: b.title || null } : {}),
          ...(b.phone !== undefined ? { phone: b.phone || null } : {}),
          ...(roleChange ? { roleKey: b.roleKey } : {}),
        },
        select: userSelect,
      });
    });
    await audit(req, {
      action: roleChange ? 'staff.role_change' : 'staff.update',
      entityType: 'user',
      entityId: row.id,
      summary: roleChange ? `${row.email}: ${target.roleKey} → ${row.roleKey}` : row.email,
      changes: diff({ name: target.name, title: target.title, phone: target.phone, roleKey: target.roleKey }, { name: row.name, title: row.title, phone: row.phone, roleKey: row.roleKey }),
    });
    ok(res, row);
  }),
);

staffRouter.post(
  '/users/:id/deactivate',
  ah(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target || target.roleKey === 'CLIENT') throw AppError.notFound('Staff member');
    if (target.id === req.user!.id) throw AppError.conflict('You cannot deactivate your own account');
    if (target.roleKey === SUPER && !isSuper(req)) throw AppError.forbidden('Only a Super Admin can deactivate a Super Admin');
    if (target.status === 'DEACTIVATED') return ok(res, { id: target.id, status: target.status });
    const row = await withTx(async (tx) => {
      if (target.roleKey === SUPER && target.status === 'ACTIVE') await assertKeepsSuperAdmin(tx, target.id);
      const u = await tx.user.update({ where: { id: target.id }, data: { status: 'DEACTIVATED' }, select: userSelect });
      await tx.session.deleteMany({ where: { userId: target.id } });
      await tx.passwordResetToken.updateMany({ where: { userId: target.id, usedAt: null }, data: { usedAt: new Date() } });
      return u;
    });
    await audit(req, { action: 'staff.deactivate', entityType: 'user', entityId: row.id, summary: row.email });
    ok(res, row);
  }),
);

staffRouter.post(
  '/users/:id/activate',
  ah(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target || target.roleKey === 'CLIENT') throw AppError.notFound('Staff member');
    if (target.roleKey === SUPER && !isSuper(req)) throw AppError.forbidden();
    if (target.status !== 'DEACTIVATED') return ok(res, { id: target.id, status: target.status });
    // Users who never set a password go back to INVITED (they need a fresh invitation link).
    const status = target.passwordHash ? 'ACTIVE' : 'INVITED';
    const row = await prisma.user.update({ where: { id: target.id }, data: { status, failedLogins: 0, lockedUntil: null }, select: userSelect });
    await audit(req, { action: 'staff.activate', entityType: 'user', entityId: row.id, summary: `${row.email} → ${status}` });
    ok(res, row);
  }),
);

staffRouter.post(
  '/users/:id/revoke-sessions',
  ah(async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, email: true, roleKey: true } });
    if (!target || target.roleKey === 'CLIENT') throw AppError.notFound('Staff member');
    if (target.roleKey === SUPER && !isSuper(req)) throw AppError.forbidden();
    const count = await prisma.session.count({ where: { userId: target.id } });
    // Revoking your own sessions keeps the current one so the admin isn't logged out mid-action.
    await revokeUserSessions(target.id, target.id === req.user!.id ? req.user!.sessionId : undefined);
    await audit(req, { action: 'staff.revoke_sessions', entityType: 'user', entityId: target.id, summary: `${target.email}: ${count} session(s) revoked` });
    ok(res, { revoked: target.id === req.user!.id ? Math.max(0, count - 1) : count });
  }),
);

// ───────────────────────────── Roles ─────────────────────────────

staffRouter.get(
  '/roles',
  ah(async (_req, res) => {
    const roles = await prisma.role.findMany({ include: { _count: { select: { users: true } } }, orderBy: { key: 'asc' } });
    ok(
      res,
      roles.map(({ _count, ...r }) => ({ ...r, userCount: _count.users, editable: r.key !== SUPER && r.key !== 'CLIENT' })),
      { permissions: Object.entries(PERMISSIONS).map(([key, label]) => ({ key, label })) },
    );
  }),
);

const roleUpdate = z.object({
  permissions: z.array(z.string()).max(ALL_PERMISSIONS.length * 2),
  name: str(80).min(1).optional(),
  description: str(300).optional(),
});

staffRouter.put(
  '/roles/:key',
  validate({ body: roleUpdate }),
  ah(async (req, res) => {
    const b = req.body as z.infer<typeof roleUpdate>;
    const role = await prisma.role.findUnique({ where: { key: req.params.key } });
    if (!role) throw AppError.notFound('Role');
    const unknown = b.permissions.filter((p) => !(ALL_PERMISSIONS as string[]).includes(p));
    if (unknown.length) throw AppError.badRequest(`Unknown permission(s): ${unknown.join(', ')}`);
    const perms = [...new Set(b.permissions)] as Permission[];
    if (role.key === 'CLIENT' && perms.length) throw AppError.badRequest('The client role cannot hold staff permissions');
    if (role.key === SUPER) {
      const missing = ALL_PERMISSIONS.filter((p) => !perms.includes(p));
      if (missing.length) throw AppError.conflict('Super Admin permissions cannot be reduced');
      if (!isSuper(req)) throw AppError.forbidden('Only a Super Admin can edit this role');
    }
    if (!isSuper(req)) {
      // Prevent privilege escalation: you can only grant permissions you hold yourself.
      const added = perms.filter((p) => !role.permissions.includes(p));
      const notHeld = added.filter((p) => !req.user!.permissions.includes(p));
      if (notHeld.length) throw AppError.forbidden(`You cannot grant permissions you do not hold: ${notHeld.join(', ')}`);
      if (role.key === req.user!.roleKey && !perms.includes('staff.manage')) throw AppError.conflict('You cannot remove staff.manage from your own role');
    }
    const row = await prisma.role.update({
      where: { key: role.key },
      data: { permissions: perms, ...(b.name ? { name: b.name } : {}), ...(b.description !== undefined ? { description: b.description } : {}) },
    });
    const added = perms.filter((p) => !role.permissions.includes(p));
    const removed = role.permissions.filter((p) => !perms.includes(p as Permission));
    await audit(req, {
      action: 'role.update',
      entityType: 'role',
      entityId: role.key,
      summary: `${role.name}: +${added.length} / −${removed.length} permissions`,
      changes: { added, removed },
    });
    ok(res, row);
  }),
);
