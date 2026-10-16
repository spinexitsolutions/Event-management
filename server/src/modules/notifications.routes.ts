import { Router } from 'express';
import { z } from 'zod';
import { prisma, type Prisma } from '../config/db';
import { env } from '../config/env';
import { AppError } from '../lib/AppError';
import { ah, ok, pageMeta, paginate, qry } from '../lib/http';
import { requireAuth, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { audit } from '../services/audit.service';
import { emailConfigured, processMessage, whatsappConfigured } from '../services/notify.service';

/** In-app notifications for the signed-in user (staff or client). */
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  validate({ query: z.object({ page: z.coerce.number().optional(), limit: z.coerce.number().optional(), unread: z.enum(['true', 'false']).optional() }) }),
  ah(async (req, res) => {
    const q = qry<{ page?: number; limit?: number; unread?: string }>(req);
    const { page, limit, skip, take } = paginate(q, 100);
    const where: Prisma.NotificationWhereInput = { userId: req.user!.id, ...(q.unread === 'true' ? { readAt: null } : {}) };
    const [items, total, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
    ]);
    ok(res, items, { ...pageMeta(page, limit, total), unread });
  }),
);

notificationsRouter.get(
  '/unread-count',
  ah(async (req, res) => {
    ok(res, { unread: await prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }) });
  }),
);

notificationsRouter.post(
  '/read-all',
  ah(async (req, res) => {
    const r = await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
    ok(res, { updated: r.count });
  }),
);

notificationsRouter.post(
  '/:id/read',
  ah(async (req, res) => {
    // Scoped to the owner: another user's notification id behaves as not found.
    const r = await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
    if (!r.count) {
      const exists = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { id: true } });
      if (!exists) throw AppError.notFound('Notification');
    }
    ok(res, { ok: true });
  }),
);

/** Outbound message log (email / WhatsApp) with manual retry. */
export const outboxRouter = Router();
outboxRouter.use(requirePermission('notifications.manage'));

const providerStatus = () => ({
  email: { provider: env.EMAIL_PROVIDER, configured: emailConfigured(), from: env.EMAIL_FROM },
  whatsapp: { provider: env.WHATSAPP_PROVIDER, configured: whatsappConfigured() },
});

outboxRouter.get(
  '/status',
  ah(async (_req, res) => {
    const counts = await prisma.outboundMessage.groupBy({ by: ['channel', 'status'], _count: true });
    ok(res, { ...providerStatus(), counts: counts.map((c) => ({ channel: c.channel, status: c.status, count: c._count })) });
  }),
);

const listQuery = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  status: z.enum(['QUEUED', 'SENT', 'FAILED', 'SKIPPED']).optional(),
  channel: z.enum(['EMAIL', 'WHATSAPP']).optional(),
  q: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(40).optional(),
});

outboxRouter.get(
  '/',
  validate({ query: listQuery }),
  ah(async (req, res) => {
    const q = qry<z.infer<typeof listQuery>>(req);
    const { page, limit, skip, take } = paginate(q, 100);
    const where: Prisma.OutboundMessageWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.channel ? { channel: q.channel } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.q
        ? {
            OR: [
              { to: { contains: q.q, mode: 'insensitive' } },
              { subject: { contains: q.q, mode: 'insensitive' } },
              { templateKey: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([prisma.outboundMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }), prisma.outboundMessage.count({ where })]);
    ok(res, items, { ...pageMeta(page, limit, total), providers: providerStatus() });
  }),
);

outboxRouter.get(
  '/:id',
  ah(async (req, res) => {
    const row = await prisma.outboundMessage.findUnique({ where: { id: req.params.id } });
    if (!row) throw AppError.notFound('Message');
    ok(res, row);
  }),
);

outboxRouter.post(
  '/:id/retry',
  ah(async (req, res) => {
    const m = await prisma.outboundMessage.findUnique({ where: { id: req.params.id } });
    if (!m) throw AppError.notFound('Message');
    if (m.status !== 'FAILED' && m.status !== 'SKIPPED') throw AppError.conflict(`Only failed or skipped messages can be retried (this one is ${m.status.toLowerCase()})`);
    const configured = m.channel === 'EMAIL' ? emailConfigured() : whatsappConfigured();
    if (!configured) {
      throw new AppError(
        409,
        'PROVIDER_NOT_CONFIGURED',
        m.channel === 'EMAIL'
          ? 'No email provider is configured (EMAIL_PROVIDER=none). Configure SMTP or Resend on the server, then retry.'
          : 'WhatsApp is not configured (WHATSAPP_PROVIDER=none). Add the Meta WhatsApp credentials on the server, then retry.',
      );
    }
    const claimed = await prisma.outboundMessage.updateMany({
      where: { id: m.id, status: { in: ['FAILED', 'SKIPPED'] } },
      data: { status: 'QUEUED', attempts: 0, nextAttemptAt: new Date(), lastError: '' },
    });
    if (!claimed.count) throw AppError.conflict('This message is already being retried');
    await processMessage(m.id);
    const row = await prisma.outboundMessage.findUniqueOrThrow({ where: { id: m.id } });
    await audit(req, { action: 'outbox.retry', entityType: 'outboundMessage', entityId: m.id, summary: `${m.channel} to ${m.to}: ${row.status}` });
    ok(res, row);
  }),
);
