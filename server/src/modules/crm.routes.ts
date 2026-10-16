import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { emailSchema, INQUIRY_STATUSES } from '@maison/shared';
import { prisma } from '../config/db';
import { AppError } from '../lib/AppError';
import { toCsv } from '../lib/csv';
import { isoDate, toDateOnly } from '../lib/dates';
import { ah, ok, pageMeta, paginate, qry } from '../lib/http';
import { can, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { audit, diff } from '../services/audit.service';
import { notifyUser, sendEmail } from '../services/notify.service';
import { ensurePortalAccess } from '../services/quotation.service';
import { privateFileAccess } from '../services/storage.service';

/* ════════════════════════════ Inquiries ════════════════════════════ */

export const inquiriesRouter = Router();

const listQuery = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  q: z.string().trim().max(100).optional(),
  status: z.enum(INQUIRY_STATUSES).optional(),
  open: z.enum(['true', 'false']).optional(),
  assignedToId: z.string().optional(),
  categoryId: z.string().optional(),
  source: z.string().max(60).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sort: z.enum(['newest', 'oldest', 'eventDate']).default('newest'),
});
type ListQ = z.infer<typeof listQuery>;

function inquiryWhere(q: ListQ): Prisma.InquiryWhereInput {
  return {
    ...(q.status ? { status: q.status } : q.open === 'true' ? { status: { notIn: ['WON', 'LOST', 'ARCHIVED'] } } : { status: { not: 'ARCHIVED' } }),
    ...(q.assignedToId ? { assignedToId: q.assignedToId === 'unassigned' ? null : q.assignedToId } : {}),
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.source ? { source: q.source } : {}),
    ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59Z`) } : {}) } } : {}),
    ...(q.q
      ? { OR: [{ reference: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }, { location: { contains: q.q, mode: 'insensitive' } }, { eventType: { contains: q.q, mode: 'insensitive' } }] }
      : {}),
  };
}

inquiriesRouter.get(
  '/',
  requirePermission('inquiries.view'),
  validate({ query: listQuery }),
  ah(async (req, res) => {
    const q = qry<ListQ>(req);
    const { page, limit, skip, take } = paginate(q);
    const where = inquiryWhere(q);
    const orderBy: Prisma.InquiryOrderByWithRelationInput[] = q.sort === 'oldest' ? [{ createdAt: 'asc' }] : q.sort === 'eventDate' ? [{ eventDate: 'asc' }] : [{ createdAt: 'desc' }];
    const [items, total, counts] = await Promise.all([
      prisma.inquiry.findMany({ where, orderBy, skip, take, include: { assignedTo: { select: { id: true, name: true } }, category: { select: { name: true } } } }),
      prisma.inquiry.count({ where }),
      prisma.inquiry.groupBy({ by: ['status'], _count: true }),
    ]);
    ok(res, items, { ...pageMeta(page, limit, total), statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count])) });
  }),
);

inquiriesRouter.get(
  '/export.csv',
  requirePermission('inquiries.view', 'clients.view'),
  validate({ query: listQuery }),
  ah(async (req, res) => {
    const rows = await prisma.inquiry.findMany({ where: inquiryWhere(qry<ListQ>(req)), orderBy: { createdAt: 'desc' }, take: 10_000, include: { assignedTo: { select: { name: true } } } });
    await audit(req, { action: 'inquiries.export', entityType: 'Inquiry', summary: `${rows.length} rows` });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="inquiries-${isoDate(new Date())}.csv"`);
    res.send(
      toCsv(
        rows.map((r) => ({ ...r, eventDate: isoDate(r.eventDate), assignedTo: r.assignedTo?.name ?? '', services: r.services.join('; ') })),
        [
          { key: 'reference', label: 'Reference' },
          { key: 'createdAt', label: 'Submitted' },
          { key: 'status', label: 'Status' },
          { key: 'name', label: 'Name' },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Phone' },
          { key: 'eventType', label: 'Event type' },
          { key: 'eventDate', label: 'Event date' },
          { key: 'location', label: 'Location' },
          { key: 'guestCount', label: 'Guests' },
          { key: 'budgetRange', label: 'Budget' },
          { key: 'services', label: 'Services' },
          { key: 'source', label: 'Source' },
          { key: 'assignedTo', label: 'Assigned to' },
        ],
      ),
    );
  }),
);

inquiriesRouter.get(
  '/:id',
  requirePermission('inquiries.view'),
  ah(async (req, res) => {
    const inq = await prisma.inquiry.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true, company: true, userId: true } },
        assignedTo: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        package: { select: { id: true, name: true } },
        consultations: { orderBy: { scheduledAt: 'desc' }, include: { owner: { select: { name: true } } } },
        communications: { orderBy: { createdAt: 'desc' }, take: 100 },
        quotations: { orderBy: { createdAt: 'desc' }, select: { id: true, number: true, title: true, status: true, currentVersion: true, createdAt: true, versions: { orderBy: { version: 'desc' }, take: 1, select: { totalMinor: true } } } },
        bookings: { select: { id: true, reference: true, status: true } },
      },
    });
    if (!inq) throw AppError.notFound('Inquiry');
    const reminders = await prisma.reminder.findMany({ where: { entityType: 'inquiry', entityId: inq.id, doneAt: null }, orderBy: { dueAt: 'asc' } });
    const authorIds = [...new Set(inq.communications.map((c) => c.authorId).filter(Boolean))] as string[];
    const authors = await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } });
    ok(res, { ...inq, reminders, communications: inq.communications.map((c) => ({ ...c, authorName: authors.find((a) => a.id === c.authorId)?.name ?? null })) });
  }),
);

/** Reference images attached to an inquiry (private files). */
inquiriesRouter.get(
  '/:id/attachments/:mediaId',
  requirePermission('inquiries.view'),
  ah(async (req, res) => {
    const inq = await prisma.inquiry.findUniqueOrThrow({ where: { id: req.params.id } });
    const att = (inq.attachments as { mediaId: string }[]).find((a) => a.mediaId === req.params.mediaId);
    if (!att) throw AppError.notFound('Attachment');
    const m = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: att.mediaId } });
    const access = privateFileAccess(m.provider, m.storageKey!, m.mime);
    if (access.redirect) return res.redirect(access.redirect);
    res.setHeader('Content-Type', m.mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    access.stream!.pipe(res);
  }),
);

inquiriesRouter.patch(
  '/:id',
  requirePermission('inquiries.manage'),
  validate({
    body: z.object({
      status: z.enum(INQUIRY_STATUSES).optional(),
      assignedToId: z.string().nullable().optional(),
      lostReason: z.string().trim().max(300).optional(),
      eventType: z.string().trim().min(1).max(80).optional(),
      eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      location: z.string().trim().min(1).max(160).optional(),
      guestCount: z.number().int().min(1).max(100000).optional(),
      budgetRange: z.string().trim().max(60).optional(),
      categoryId: z.string().nullable().optional(),
      aiReviewed: z.boolean().optional(),
    }),
  }),
  ah(async (req, res) => {
    const before = await prisma.inquiry.findUnique({ where: { id: req.params.id } });
    if (!before) throw AppError.notFound('Inquiry');
    const { aiReviewed, eventDate, ...rest } = req.body;
    if (rest.status === 'LOST' && !rest.lostReason && !before.lostReason) throw AppError.badRequest('Add a reason when marking an inquiry as lost');
    if (rest.assignedToId) {
      const u = await prisma.user.findFirst({ where: { id: rest.assignedToId, status: 'ACTIVE', NOT: { roleKey: 'CLIENT' } } });
      if (!u) throw AppError.badRequest('Assignee must be an active staff member');
    }
    const data: Prisma.InquiryUncheckedUpdateInput = { ...rest, ...(eventDate !== undefined ? { eventDate: toDateOnly(eventDate) } : {}) };
    if (aiReviewed !== undefined && before.aiClassification) data.aiClassification = { ...(before.aiClassification as object), reviewed: aiReviewed };
    const updated = await prisma.inquiry.update({ where: { id: before.id }, data });
    const changes = diff(before as unknown as Record<string, unknown>, { ...rest, ...(eventDate !== undefined ? { eventDate: updated.eventDate } : {}) });
    if (Object.keys(changes).length) {
      await audit(req, { action: 'inquiry.update', entityType: 'Inquiry', entityId: before.id, changes });
      await prisma.communication.create({ data: { kind: 'SYSTEM', body: Object.entries(changes).map(([k, v]) => `${k}: ${String(v.from ?? '—')} → ${String(v.to ?? '—')}`).join('\n'), inquiryId: before.id, clientId: before.clientId, authorId: req.user!.id, subject: 'Inquiry updated' } });
    }
    if (rest.assignedToId && rest.assignedToId !== before.assignedToId && rest.assignedToId !== req.user!.id) {
      await notifyUser(rest.assignedToId, `Inquiry ${before.reference} assigned to you`, `${before.eventType} · ${before.name}`, `/admin/inquiries/${before.id}`);
    }
    ok(res, updated);
  }),
);

const commSchema = z.object({
  kind: z.enum(['NOTE', 'CALL', 'EMAIL', 'MEETING', 'WHATSAPP']),
  direction: z.enum(['INBOUND', 'OUTBOUND', 'INTERNAL']).default('INTERNAL'),
  subject: z.string().trim().max(200).default(''),
  body: z.string().trim().min(1).max(5000),
});

inquiriesRouter.post(
  '/:id/communications',
  requirePermission('inquiries.manage'),
  validate({ body: commSchema }),
  ah(async (req, res) => {
    const inq = await prisma.inquiry.findUniqueOrThrow({ where: { id: req.params.id } });
    const c = await prisma.communication.create({ data: { ...req.body, inquiryId: inq.id, clientId: inq.clientId, authorId: req.user!.id } });
    if (inq.status === 'NEW' && ['CALL', 'EMAIL', 'MEETING', 'WHATSAPP'].includes(req.body.kind) && req.body.direction === 'OUTBOUND') {
      await prisma.inquiry.update({ where: { id: inq.id }, data: { status: 'CONTACTED' } });
    }
    ok(res, c, undefined, 201);
  }),
);

/** Sends a follow-up email through the configured provider and logs it. */
inquiriesRouter.post(
  '/:id/email',
  requirePermission('inquiries.manage'),
  validate({ body: z.object({ subject: z.string().trim().min(1).max(200), message: z.string().trim().min(1).max(8000) }) }),
  ah(async (req, res) => {
    const inq = await prisma.inquiry.findUniqueOrThrow({ where: { id: req.params.id } });
    const msg = await sendEmail({ to: inq.email, template: 'general_followup', vars: { subject: req.body.subject, message: req.body.message }, entityType: 'Inquiry', entityId: inq.id });
    await prisma.communication.create({ data: { kind: 'EMAIL', direction: 'OUTBOUND', subject: req.body.subject, body: req.body.message, inquiryId: inq.id, clientId: inq.clientId, authorId: req.user!.id } });
    if (inq.status === 'NEW') await prisma.inquiry.update({ where: { id: inq.id }, data: { status: 'CONTACTED' } });
    ok(res, { status: msg?.status ?? 'SKIPPED', note: msg?.status === 'SKIPPED' ? msg.lastError : undefined });
  }),
);

const consultationSchema = z.object({
  scheduledAt: z.string().datetime({ offset: true }),
  durationMin: z.number().int().min(15).max(480).default(60),
  mode: z.enum(['IN_PERSON', 'VIDEO', 'PHONE']).default('VIDEO'),
  location: z.string().trim().max(300).default(''),
  agenda: z.string().trim().max(2000).default(''),
  ownerId: z.string().nullable().default(null),
});

inquiriesRouter.post(
  '/:id/consultations',
  requirePermission('inquiries.manage'),
  validate({ body: consultationSchema }),
  ah(async (req, res) => {
    const inq = await prisma.inquiry.findUniqueOrThrow({ where: { id: req.params.id } });
    const c = await prisma.consultation.create({ data: { ...req.body, scheduledAt: new Date(req.body.scheduledAt), ownerId: req.body.ownerId ?? req.user!.id, inquiryId: inq.id } });
    if (['NEW', 'CONTACTED'].includes(inq.status)) await prisma.inquiry.update({ where: { id: inq.id }, data: { status: 'CONSULTATION_SCHEDULED' } });
    await prisma.communication.create({ data: { kind: 'MEETING', direction: 'INTERNAL', subject: 'Consultation scheduled', body: `${c.mode} on ${c.scheduledAt.toISOString()}`, inquiryId: inq.id, clientId: inq.clientId, authorId: req.user!.id } });
    await audit(req, { action: 'consultation.create', entityType: 'Consultation', entityId: c.id });
    ok(res, c, undefined, 201);
  }),
);

inquiriesRouter.patch(
  '/consultations/:cid',
  requirePermission('inquiries.manage'),
  validate({ body: consultationSchema.partial().extend({ status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(), outcome: z.string().trim().max(3000).optional() }) }),
  ah(async (req, res) => {
    const c = await prisma.consultation.update({
      where: { id: req.params.cid },
      data: { ...req.body, ...(req.body.scheduledAt ? { scheduledAt: new Date(req.body.scheduledAt), reminderSentAt: null } : {}) },
    });
    if (req.body.status === 'COMPLETED') {
      const inq = await prisma.inquiry.findUniqueOrThrow({ where: { id: c.inquiryId } });
      if (['NEW', 'CONTACTED', 'CONSULTATION_SCHEDULED'].includes(inq.status)) await prisma.inquiry.update({ where: { id: inq.id }, data: { status: 'REQUIREMENTS_RECEIVED' } });
    }
    ok(res, c);
  }),
);

inquiriesRouter.post(
  '/:id/reminders',
  requirePermission('inquiries.manage'),
  validate({ body: z.object({ dueAt: z.string().datetime({ offset: true }), note: z.string().trim().min(1).max(300), userId: z.string().optional() }) }),
  ah(async (req, res) => {
    const inq = await prisma.inquiry.findUniqueOrThrow({ where: { id: req.params.id } });
    const r = await prisma.reminder.create({ data: { entityType: 'inquiry', entityId: inq.id, dueAt: new Date(req.body.dueAt), note: req.body.note, userId: req.body.userId ?? req.user!.id } });
    ok(res, r, undefined, 201);
  }),
);

inquiriesRouter.post(
  '/reminders/:rid/done',
  requirePermission('inquiries.manage'),
  ah(async (req, res) => {
    await prisma.reminder.update({ where: { id: req.params.rid }, data: { doneAt: new Date() } });
    ok(res, { ok: true });
  }),
);

/** Staff-entered inquiry (phone / walk-in). */
inquiriesRouter.post(
  '/',
  requirePermission('inquiries.manage'),
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120),
      email: emailSchema,
      phone: z.string().trim().max(30).default(''),
      eventType: z.string().trim().min(1).max(80),
      eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
      location: z.string().trim().min(1).max(160),
      guestCount: z.number().int().min(1).max(100000),
      budgetRange: z.string().trim().max(60).default('Not specified'),
      notes: z.string().trim().max(3000).default(''),
      source: z.string().trim().max(60).default('phone'),
      categoryId: z.string().nullable().default(null),
    }),
  }),
  ah(async (req, res) => {
    const { refCode } = await import('../lib/crypto');
    const b = req.body;
    const inq = await prisma.$transaction(async (tx) => {
      const client = (await tx.client.findUnique({ where: { email: b.email } })) ?? (await tx.client.create({ data: { name: b.name, email: b.email, phone: b.phone, source: b.source } }));
      return tx.inquiry.create({
        data: { reference: `INQ-${refCode(6)}`, clientId: client.id, name: b.name, email: b.email, phone: b.phone, eventType: b.eventType, eventDate: toDateOnly(b.eventDate), location: b.location, guestCount: b.guestCount, budgetRange: b.budgetRange, notes: b.notes, source: b.source, categoryId: b.categoryId, assignedToId: req.user!.id, services: [] },
      });
    });
    await audit(req, { action: 'inquiry.create', entityType: 'Inquiry', entityId: inq.id });
    ok(res, inq, undefined, 201);
  }),
);

/* ════════════════════════════ Clients (CRM) ════════════════════════════ */

export const clientsRouter = Router();

clientsRouter.get(
  '/',
  requirePermission('clients.view'),
  validate({ query: z.object({ page: z.coerce.number().optional(), limit: z.coerce.number().optional(), q: z.string().trim().max(100).optional(), managerId: z.string().optional() }) }),
  ah(async (req, res) => {
    const q = qry<{ page?: number; limit?: number; q?: string; managerId?: string }>(req);
    const { page, limit, skip, take } = paginate(q);
    const where: Prisma.ClientWhereInput = {
      ...(q.managerId ? { relationshipManagerId: q.managerId } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }, { company: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.client.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { relationshipManager: { select: { id: true, name: true } }, _count: { select: { inquiries: true, bookings: true, quotations: true } }, user: { select: { status: true } } },
      }),
      prisma.client.count({ where }),
    ]);
    ok(res, items, pageMeta(page, limit, total));
  }),
);

const clientInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: z.string().trim().max(30).default(''),
  company: z.string().trim().max(160).default(''),
  city: z.string().trim().max(80).default(''),
  source: z.string().trim().max(60).default('manual'),
  preferences: z.record(z.string().max(500)).default({}),
  notes: z.string().trim().max(5000).default(''),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(15).default([]),
  relationshipManagerId: z.string().nullable().default(null),
});

clientsRouter.post(
  '/',
  requirePermission('clients.manage'),
  validate({ body: clientInput }),
  ah(async (req, res) => {
    const c = await prisma.client.create({ data: req.body });
    await audit(req, { action: 'client.create', entityType: 'Client', entityId: c.id });
    ok(res, c, undefined, 201);
  }),
);

clientsRouter.get(
  '/:id',
  requirePermission('clients.view'),
  ah(async (req, res) => {
    const c = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        relationshipManager: { select: { id: true, name: true } },
        user: { select: { id: true, status: true, lastLoginAt: true } },
        inquiries: { orderBy: { createdAt: 'desc' }, select: { id: true, reference: true, eventType: true, status: true, createdAt: true, eventDate: true } },
        quotations: { orderBy: { createdAt: 'desc' }, select: { id: true, number: true, title: true, status: true, createdAt: true, versions: { orderBy: { version: 'desc' }, take: 1, select: { totalMinor: true } } } },
        bookings: { orderBy: { eventDate: 'desc' }, select: { id: true, reference: true, title: true, status: true, eventDate: true, contractValueMinor: true, currency: true } },
        communications: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!c) throw AppError.notFound('Client');
    const payments = can(req.user, 'finance.view')
      ? await prisma.payment.findMany({ where: { booking: { clientId: c.id }, status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, orderBy: { paidAt: 'desc' }, select: { id: true, amountMinor: true, refundedMinor: true, currency: true, method: true, paidAt: true, booking: { select: { reference: true } } } })
      : null;
    ok(res, { ...c, payments });
  }),
);

clientsRouter.put(
  '/:id',
  requirePermission('clients.manage'),
  validate({ body: clientInput }),
  ah(async (req, res) => {
    const before = await prisma.client.findUniqueOrThrow({ where: { id: req.params.id } });
    if (before.userId && before.email !== req.body.email) throw AppError.conflict('This client has a portal account; their email can only be changed by the client');
    const c = await prisma.client.update({ where: { id: before.id }, data: req.body });
    await audit(req, { action: 'client.update', entityType: 'Client', entityId: c.id, changes: diff(before as unknown as Record<string, unknown>, req.body) });
    ok(res, c);
  }),
);

clientsRouter.post(
  '/:id/communications',
  requirePermission('clients.manage'),
  validate({ body: commSchema }),
  ah(async (req, res) => {
    const c = await prisma.client.findUniqueOrThrow({ where: { id: req.params.id } });
    ok(res, await prisma.communication.create({ data: { ...req.body, clientId: c.id, authorId: req.user!.id } }), undefined, 201);
  }),
);

clientsRouter.post(
  '/:id/portal-invite',
  requirePermission('clients.manage'),
  ah(async (req, res) => {
    const r = await ensurePortalAccess(req.params.id);
    await audit(req, { action: 'client.portal_invite', entityType: 'Client', entityId: req.params.id });
    const { emailConfigured } = await import('../services/notify.service');
    ok(res, { alreadyActive: !r.inviteUrl, deliveredByEmail: emailConfigured(), inviteUrl: emailConfigured() ? null : r.inviteUrl });
  }),
);

/** Privacy: removes personal data for a client without bookings (data minimisation / erasure requests). */
clientsRouter.delete(
  '/:id',
  requirePermission('clients.manage', 'settings.manage'),
  ah(async (req, res) => {
    const c = await prisma.client.findUniqueOrThrow({ where: { id: req.params.id }, include: { _count: { select: { bookings: true, quotations: true } } } });
    if (c._count.bookings || c._count.quotations) throw AppError.conflict('Clients with quotations or bookings must be retained for financial records');
    await prisma.$transaction([prisma.inquiry.deleteMany({ where: { clientId: c.id } }), prisma.client.delete({ where: { id: c.id } }), ...(c.userId ? [prisma.user.delete({ where: { id: c.userId } })] : [])]);
    await audit(req, { action: 'client.delete', entityType: 'Client', entityId: c.id, summary: 'Personal data erased' });
    ok(res, { ok: true });
  }),
);

/** Staff directory for assignment dropdowns (any staff member). */
export const staffDirectoryRouter = Router();
staffDirectoryRouter.get(
  '/',
  ah(async (req, res) => {
    if (!req.user?.isStaff) throw AppError.forbidden();
    ok(res, await prisma.user.findMany({ where: { status: 'ACTIVE', NOT: { roleKey: 'CLIENT' } }, select: { id: true, name: true, roleKey: true, title: true }, orderBy: { name: 'asc' } }));
  }),
);
