import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { BOOKING_STATUSES } from '@maison/shared';
import { prisma } from '../config/db';
import { AppError } from '../lib/AppError';
import { toCsv } from '../lib/csv';
import { isoDate, toDateOnly } from '../lib/dates';
import { ah, ok, pageMeta, paginate, qry } from '../lib/http';
import { can, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { audit, diff } from '../services/audit.service';
import { afterTransition, bookingFinancials, suggestedRefund, transitionBooking } from '../services/booking.service';
import { assertVenueAvailable } from '../services/conflicts.service';
import { nextNumber } from '../services/counter.service';
import { notifyUser } from '../services/notify.service';
import { getBusiness } from '../services/siteConfig.service';
import { privateFileAccess, storeFile } from '../services/storage.service';
import { upload } from './media.routes';

export const bookingsRouter = Router();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listQuery = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  q: z.string().trim().max(100).optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  scope: z.enum(['upcoming', 'past', 'active', 'all']).default('all'),
  categoryId: z.string().optional(),
  city: z.string().max(80).optional(),
  managerId: z.string().optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  archived: z.enum(['true', 'false']).default('false'),
});
type ListQ = z.infer<typeof listQuery>;

function where(q: ListQ): Prisma.BookingWhereInput {
  const today = new Date(new Date().toISOString().slice(0, 10));
  return {
    archived: q.archived === 'true',
    ...(q.status ? { status: q.status } : {}),
    ...(q.scope === 'upcoming' ? { eventDate: { gte: today }, status: { not: 'CANCELLED' } } : q.scope === 'past' ? { eventDate: { lt: today } } : q.scope === 'active' ? { status: { notIn: ['COMPLETED', 'CANCELLED'] } } : {}),
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.city ? { city: { equals: q.city, mode: 'insensitive' } } : {}),
    ...(q.managerId ? { managerId: q.managerId } : {}),
    ...(q.from || q.to ? { eventDate: { ...(q.from ? { gte: toDateOnly(q.from)! } : {}), ...(q.to ? { lte: toDateOnly(q.to)! } : {}) } } : {}),
    ...(q.q ? { OR: [{ reference: { contains: q.q, mode: 'insensitive' } }, { title: { contains: q.q, mode: 'insensitive' } }, { client: { name: { contains: q.q, mode: 'insensitive' } } }, { client: { email: { contains: q.q, mode: 'insensitive' } } }, { venueName: { contains: q.q, mode: 'insensitive' } }] } : {}),
  };
}

bookingsRouter.get(
  '/',
  requirePermission('bookings.view'),
  validate({ query: listQuery }),
  ah(async (req, res) => {
    const q = qry<ListQ>(req);
    const { page, limit, skip, take } = paginate(q);
    const w = where(q);
    const [items, total] = await Promise.all([
      prisma.booking.findMany({
        where: w,
        orderBy: q.scope === 'past' ? { eventDate: 'desc' } : { eventDate: 'asc' },
        skip,
        take,
        include: { client: { select: { id: true, name: true } }, manager: { select: { id: true, name: true } }, category: { select: { name: true } } },
      }),
      prisma.booking.count({ where: w }),
    ]);
    const showMoney = can(req.user, 'finance.view');
    ok(res, showMoney ? items : items.map(({ contractValueMinor: _c, estimatedBudgetMinor: _e, ...b }) => b), pageMeta(page, limit, total));
  }),
);

bookingsRouter.get(
  '/export.csv',
  requirePermission('bookings.view', 'finance.view'),
  validate({ query: listQuery }),
  ah(async (req, res) => {
    const rows = await prisma.booking.findMany({ where: where(qry<ListQ>(req)), orderBy: { eventDate: 'asc' }, take: 10_000, include: { client: { select: { name: true, email: true } }, manager: { select: { name: true } } } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bookings-${isoDate(new Date())}.csv"`);
    res.send(
      toCsv(
        rows.map((b) => ({ reference: b.reference, title: b.title, client: b.client.name, email: b.client.email, eventDate: isoDate(b.eventDate), venue: b.venueName, city: b.city, guests: b.guestCount ?? '', status: b.status, manager: b.manager?.name ?? '', contractValue: Number(b.contractValueMinor) / 100, currency: b.currency })),
      ),
    );
  }),
);

/** Manual booking (e.g. contract agreed offline). Installments can be added afterwards. */
bookingsRouter.post(
  '/',
  requirePermission('bookings.manage'),
  validate({
    body: z.object({
      clientId: z.string(),
      title: z.string().trim().min(1).max(160),
      eventDate: dateStr,
      eventEndDate: dateStr.nullable().default(null),
      startTime: z.string().max(5).default(''),
      venueId: z.string().nullable().default(null),
      venueName: z.string().trim().max(200).default(''),
      city: z.string().trim().max(80).default(''),
      guestCount: z.number().int().min(1).max(100000).nullable().default(null),
      categoryId: z.string().nullable().default(null),
      contractValueMinor: z.number().int().min(0),
      currency: z.string().length(3).default('INR'),
      managerId: z.string().nullable().default(null),
    }),
  }),
  ah(async (req, res) => {
    const b = req.body;
    const booking = await prisma.$transaction(async (tx) => {
      if (b.venueId) await assertVenueAvailable(tx, b.venueId, toDateOnly(b.eventDate)!, toDateOnly(b.eventEndDate), undefined);
      const venue = b.venueId ? await tx.venue.findUnique({ where: { id: b.venueId } }) : null;
      return tx.booking.create({
        data: { ...b, reference: await nextNumber('EV', tx), eventDate: toDateOnly(b.eventDate)!, eventEndDate: toDateOnly(b.eventEndDate), venueName: venue?.name ?? b.venueName, city: b.city || venue?.city || '', contractValueMinor: BigInt(b.contractValueMinor) },
      });
    });
    await audit(req, { action: 'booking.create', entityType: 'Booking', entityId: booking.id, summary: booking.reference });
    ok(res, booking, undefined, 201);
  }),
);

bookingsRouter.get(
  '/:id',
  requirePermission('bookings.view'),
  ah(async (req, res) => {
    const b = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true, company: true, userId: true } },
        manager: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
        venue: { select: { id: true, name: true, city: true } },
        quotation: { select: { id: true, number: true, acceptedVersion: true } },
        inquiry: { select: { id: true, reference: true } },
        services: { orderBy: { sortOrder: 'asc' } },
        installments: { orderBy: { sortOrder: 'asc' } },
        invoices: { orderBy: { issuedAt: 'desc' } },
        payments: { orderBy: { createdAt: 'desc' }, include: { refunds: true } },
        documents: { orderBy: { createdAt: 'desc' } },
        changeRequests: { orderBy: { createdAt: 'desc' } },
        feedback: true,
        microsite: { select: { slug: true, enabled: true } },
        _count: { select: { tasks: true, guests: true, vendorAssignments: true, messages: true } },
      },
    });
    if (!b) throw AppError.notFound('Booking');
    const tasksDone = await prisma.task.count({ where: { bookingId: b.id, status: 'DONE' } });
    const unread = await prisma.message.count({ where: { bookingId: b.id, fromClient: true, readAt: null } });
    const finance = can(req.user, 'finance.view');
    const fin = await bookingFinancials(b.id);
    ok(res, {
      ...b,
      eventDate: isoDate(b.eventDate),
      eventEndDate: isoDate(b.eventEndDate),
      tasksDone,
      unreadMessages: unread,
      financials: finance ? fin : null,
      ...(finance ? {} : { payments: [], invoices: [], contractValueMinor: null, installments: b.installments.map((i) => ({ ...i, amountMinor: null, paidMinor: null })) }),
    });
  }),
);

bookingsRouter.patch(
  '/:id',
  requirePermission('bookings.manage'),
  validate({
    body: z.object({
      title: z.string().trim().min(1).max(160).optional(),
      eventDate: dateStr.optional(),
      eventEndDate: dateStr.nullable().optional(),
      startTime: z.string().max(5).optional(),
      venueId: z.string().nullable().optional(),
      venueName: z.string().trim().max(200).optional(),
      city: z.string().trim().max(80).optional(),
      guestCount: z.number().int().min(1).max(100000).nullable().optional(),
      categoryId: z.string().nullable().optional(),
      managerId: z.string().nullable().optional(),
      requirements: z.string().trim().max(10000).optional(),
      clientVisibleNotes: z.string().trim().max(5000).optional(),
      archived: z.boolean().optional(),
    }),
  }),
  ah(async (req, res) => {
    const before = await prisma.booking.findUniqueOrThrow({ where: { id: req.params.id } });
    const body = req.body;
    const updated = await prisma.$transaction(async (tx) => {
      const eventDate = body.eventDate ? toDateOnly(body.eventDate)! : before.eventDate;
      const eventEnd = body.eventEndDate !== undefined ? toDateOnly(body.eventEndDate) : before.eventEndDate;
      const venueId = body.venueId !== undefined ? body.venueId : before.venueId;
      if (venueId && (body.eventDate || body.eventEndDate !== undefined || body.venueId !== undefined) && before.status !== 'CANCELLED') await assertVenueAvailable(tx, venueId, eventDate, eventEnd, before.id);
      const venue = body.venueId ? await tx.venue.findUnique({ where: { id: body.venueId } }) : null;
      if (body.managerId) {
        const m = await tx.user.findFirst({ where: { id: body.managerId, status: 'ACTIVE', NOT: { roleKey: 'CLIENT' } } });
        if (!m) throw AppError.badRequest('Manager must be an active staff member');
      }
      return tx.booking.update({
        where: { id: before.id },
        data: { ...body, eventDate, eventEndDate: eventEnd, ...(venue ? { venueName: body.venueName ?? venue.name, city: body.city ?? venue.city } : {}) },
      });
    });
    const changes = diff(before as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>);
    delete changes.updatedAt;
    await audit(req, { action: 'booking.update', entityType: 'Booking', entityId: before.id, changes });
    if (body.managerId && body.managerId !== before.managerId && body.managerId !== req.user!.id) await notifyUser(body.managerId, `You are managing ${before.reference}`, before.title, `/admin/bookings/${before.id}`);
    ok(res, updated);
  }),
);

bookingsRouter.post(
  '/:id/contract-signed',
  requirePermission('bookings.manage'),
  validate({ body: z.object({ signedAt: dateStr.optional() }) }),
  ah(async (req, res) => {
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: req.params.id } });
    if (b.status === 'CANCELLED') throw AppError.conflict('Booking is cancelled');
    await prisma.booking.update({ where: { id: b.id }, data: { contractSignedAt: req.body.signedAt ? toDateOnly(req.body.signedAt) : new Date() } });
    if (b.status === 'AWAITING_CONTRACT') await transitionBooking(b.id, 'AWAITING_ADVANCE');
    // If the advance was already paid (e.g. paid before signature), confirm now.
    const first = await prisma.installment.findFirst({ where: { bookingId: b.id }, orderBy: { sortOrder: 'asc' } });
    if (first && (first.status === 'PAID' || first.status === 'WAIVED')) await transitionBooking(b.id, 'CONFIRMED');
    await audit(req, { action: 'booking.contract_signed', entityType: 'Booking', entityId: b.id });
    ok(res, await prisma.booking.findUniqueOrThrow({ where: { id: b.id } }));
  }),
);

bookingsRouter.post(
  '/:id/status',
  requirePermission('bookings.manage'),
  validate({ body: z.object({ status: z.enum(BOOKING_STATUSES), reason: z.string().trim().max(500).default(''), override: z.boolean().default(false) }) }),
  ah(async (req, res) => {
    if (req.body.override && !(can(req.user, 'finance.manage') || req.user!.roleKey === 'OWNER' || req.user!.roleKey === 'SUPER_ADMIN')) throw AppError.forbidden('Only finance managers or owners can override payment rules');
    if (req.body.override && !req.body.reason) throw AppError.badRequest('Give a reason for the override');
    const before = await prisma.booking.findUniqueOrThrow({ where: { id: req.params.id } });
    const b = await transitionBooking(before.id, req.body.status, { reason: req.body.reason, override: req.body.override });
    await audit(req, { action: req.body.override ? 'booking.status_override' : 'booking.status', entityType: 'Booking', entityId: b.id, summary: `${before.status} → ${b.status}${req.body.reason ? `: ${req.body.reason}` : ''}` });
    ok(res, b);
  }),
);

bookingsRouter.get(
  '/:id/cancellation-preview',
  requirePermission('bookings.manage', 'finance.view'),
  ah(async (req, res) => {
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: req.params.id } });
    const fin = await bookingFinancials(b.id);
    const biz = await getBusiness();
    ok(res, { ...fin, suggestion: suggestedRefund(fin.paidMinor, b.eventDate, biz.refundRules), policy: biz.cancellationPolicy });
  }),
);

/* ───── Installments ───── */

bookingsRouter.put(
  '/:id/installments',
  requirePermission('finance.manage'),
  validate({ body: z.object({ installments: z.array(z.object({ id: z.string().optional(), label: z.string().trim().min(1).max(80), amountMinor: z.number().int().min(0), dueDate: dateStr.nullable() })).min(1).max(20) }) }),
  ah(async (req, res) => {
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: req.params.id }, include: { installments: true } });
    const total = req.body.installments.reduce((s: number, i: { amountMinor: number }) => s + i.amountMinor, 0);
    if (total !== Number(b.contractValueMinor)) throw AppError.badRequest(`Instalments must add up to the contract value (${Number(b.contractValueMinor) / 100})`);
    const keep = new Set(req.body.installments.map((i: { id?: string }) => i.id).filter(Boolean));
    for (const ex of b.installments) {
      if (!keep.has(ex.id) && Number(ex.paidMinor) > 0) throw AppError.conflict(`“${ex.label}” has payments and cannot be removed`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.installment.deleteMany({ where: { bookingId: b.id, id: { notIn: [...keep] as string[] }, paidMinor: 0 } });
      for (const [i, inst] of req.body.installments.entries()) {
        const existing = b.installments.find((x) => x.id === inst.id);
        if (existing && inst.amountMinor < Number(existing.paidMinor)) throw AppError.badRequest(`“${inst.label}” cannot be less than the amount already paid`);
        const status = existing ? (Number(existing.paidMinor) >= inst.amountMinor ? 'PAID' : Number(existing.paidMinor) > 0 ? 'PARTIAL' : 'PENDING') : 'PENDING';
        if (existing) await tx.installment.update({ where: { id: existing.id }, data: { label: inst.label, amountMinor: BigInt(inst.amountMinor), dueDate: toDateOnly(inst.dueDate), sortOrder: i, status } });
        else await tx.installment.create({ data: { bookingId: b.id, label: inst.label, amountMinor: BigInt(inst.amountMinor), dueDate: toDateOnly(inst.dueDate), sortOrder: i } });
      }
    });
    await audit(req, { action: 'booking.installments', entityType: 'Booking', entityId: b.id, changes: req.body.installments });
    ok(res, await prisma.installment.findMany({ where: { bookingId: b.id }, orderBy: { sortOrder: 'asc' } }));
  }),
);

/** Approved change in scope: adjusts the contract value (audited). Installments must then be rebalanced. */
bookingsRouter.post(
  '/:id/contract-value',
  requirePermission('finance.manage'),
  validate({ body: z.object({ contractValueMinor: z.number().int().min(0), reason: z.string().trim().min(3).max(500) }) }),
  ah(async (req, res) => {
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: req.params.id } });
    const fin = await bookingFinancials(b.id);
    if (req.body.contractValueMinor < fin.paidMinor) throw AppError.badRequest('Contract value cannot be lower than payments already received (issue a refund instead)');
    await prisma.booking.update({ where: { id: b.id }, data: { contractValueMinor: BigInt(req.body.contractValueMinor) } });
    await prisma.communication.create({ data: { kind: 'SYSTEM', subject: 'Contract value changed', body: `${Number(b.contractValueMinor) / 100} → ${req.body.contractValueMinor / 100}: ${req.body.reason}`, bookingId: b.id, clientId: b.clientId, authorId: req.user!.id } });
    await audit(req, { action: 'booking.contract_value', entityType: 'Booking', entityId: b.id, changes: { contractValueMinor: { from: Number(b.contractValueMinor), to: req.body.contractValueMinor } }, summary: req.body.reason });
    ok(res, { ok: true });
  }),
);

/* ───── Services on the booking ───── */

bookingsRouter.put(
  '/:id/services',
  requirePermission('bookings.manage'),
  validate({ body: z.object({ services: z.array(z.object({ name: z.string().trim().min(1).max(160), description: z.string().trim().max(600).default(''), amountMinor: z.number().int().min(0).default(0), serviceId: z.string().nullable().default(null) })).max(100) }) }),
  ah(async (req, res) => {
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: req.params.id } });
    await prisma.$transaction([prisma.bookingService.deleteMany({ where: { bookingId: b.id } }), prisma.bookingService.createMany({ data: req.body.services.map((s: { amountMinor: number }, i: number) => ({ ...s, amountMinor: BigInt(s.amountMinor), bookingId: b.id, sortOrder: i })) })]);
    await audit(req, { action: 'booking.services', entityType: 'Booking', entityId: b.id });
    ok(res, await prisma.bookingService.findMany({ where: { bookingId: b.id }, orderBy: { sortOrder: 'asc' } }));
  }),
);

/* ───── Change requests ───── */

bookingsRouter.post(
  '/change-requests/:cid/resolve',
  requirePermission('bookings.manage'),
  validate({ body: z.object({ decision: z.enum(['APPROVED', 'DECLINED']), note: z.string().trim().max(1000).default(''), applyNewDate: z.boolean().default(true) }) }),
  ah(async (req, res) => {
    const cr = await prisma.changeRequest.findUniqueOrThrow({ where: { id: req.params.cid }, include: { booking: { include: { client: true } } } });
    if (cr.status !== 'OPEN') throw AppError.conflict('Already resolved');
    await prisma.$transaction(async (tx) => {
      if (req.body.decision === 'APPROVED' && cr.type === 'RESCHEDULE' && cr.requestedDate && req.body.applyNewDate) {
        if (cr.booking.venueId) await assertVenueAvailable(tx, cr.booking.venueId, cr.requestedDate, null, cr.bookingId);
        await tx.booking.update({ where: { id: cr.bookingId }, data: { eventDate: cr.requestedDate, eventEndDate: null } });
      }
      await tx.changeRequest.update({ where: { id: cr.id }, data: { status: req.body.decision, resolutionNote: req.body.note, resolvedById: req.user!.id, resolvedAt: new Date() } });
    });
    if (req.body.decision === 'APPROVED' && cr.type === 'CANCELLATION') {
      // Cancellation itself is a separate, explicit action (refunds are decided by finance).
    }
    await audit(req, { action: 'booking.change_request', entityType: 'Booking', entityId: cr.bookingId, summary: `${cr.type} ${req.body.decision}` });
    if (cr.booking.client.userId) await notifyUser(cr.booking.client.userId, `Your ${cr.type.toLowerCase().replace('_', ' ')} request was ${req.body.decision.toLowerCase()}`, req.body.note, `/portal/bookings/${cr.bookingId}`);
    ok(res, { ok: true });
  }),
);

/* ───── Documents ───── */

bookingsRouter.post(
  '/:id/documents',
  requirePermission('bookings.manage'),
  upload.single('file'),
  ah(async (req, res) => {
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: req.params.id } });
    if (!req.file) throw AppError.badRequest('Choose a file');
    const kind = z.enum(['CONTRACT', 'SIGNED_CONTRACT', 'INVOICE', 'PLAN', 'OTHER']).parse(req.body.kind ?? 'OTHER');
    const stored = await storeFile(req.file.buffer, req.file.originalname, { isPrivate: true, allow: ['DOCUMENT', 'IMAGE'] });
    const media = await prisma.mediaAsset.create({ data: { ...stored, isPrivate: true, folder: 'booking-documents', filename: req.file.originalname.slice(0, 200), uploadedById: req.user!.id, tags: [] } });
    const doc = await prisma.document.create({
      data: { bookingId: b.id, name: String(req.body.name || req.file.originalname).slice(0, 200), kind, mediaId: media.id, visibleToClient: req.body.visibleToClient === 'true', uploadedById: req.user!.id },
    });
    if (kind === 'SIGNED_CONTRACT' && !b.contractSignedAt) {
      await prisma.booking.update({ where: { id: b.id }, data: { contractSignedAt: new Date() } });
      if (b.status === 'AWAITING_CONTRACT') await transitionBooking(b.id, 'AWAITING_ADVANCE');
    }
    await audit(req, { action: 'booking.document_upload', entityType: 'Booking', entityId: b.id, summary: doc.name });
    if (doc.visibleToClient) {
      const c = await prisma.client.findUniqueOrThrow({ where: { id: b.clientId } });
      if (c.userId) await notifyUser(c.userId, 'New document shared with you', doc.name, `/portal/bookings/${b.id}`);
    }
    ok(res, doc, undefined, 201);
  }),
);

bookingsRouter.patch(
  '/documents/:docId',
  requirePermission('bookings.manage'),
  validate({ body: z.object({ visibleToClient: z.boolean().optional(), name: z.string().trim().min(1).max(200).optional() }) }),
  ah(async (req, res) => {
    const d = await prisma.document.update({ where: { id: req.params.docId }, data: req.body });
    await audit(req, { action: 'document.update', entityType: 'Document', entityId: d.id, changes: req.body });
    ok(res, d);
  }),
);

bookingsRouter.get(
  '/documents/:docId/file',
  requirePermission('bookings.view'),
  ah(async (req, res) => {
    const d = await prisma.document.findUnique({ where: { id: req.params.docId } });
    if (!d || !d.bookingId) throw AppError.notFound('Document');
    const m = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: d.mediaId } });
    const access = privateFileAccess(m.provider, m.storageKey!, m.mime);
    if (access.redirect) return res.redirect(access.redirect);
    res.setHeader('Content-Type', m.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(m.filename)}"`);
    access.stream!.pipe(res);
  }),
);

bookingsRouter.delete(
  '/documents/:docId',
  requirePermission('bookings.manage'),
  ah(async (req, res) => {
    const d = await prisma.document.findUniqueOrThrow({ where: { id: req.params.docId } });
    await prisma.document.delete({ where: { id: d.id } });
    await audit(req, { action: 'document.delete', entityType: 'Document', entityId: d.id, summary: d.name });
    ok(res, { ok: true });
  }),
);

/* ───── Messages (client ↔ event manager) ───── */

bookingsRouter.get(
  '/:id/messages',
  requirePermission('bookings.view'),
  ah(async (req, res) => {
    const msgs = await prisma.message.findMany({ where: { bookingId: req.params.id }, orderBy: { createdAt: 'asc' }, take: 500 });
    await prisma.message.updateMany({ where: { bookingId: req.params.id, fromClient: true, readAt: null }, data: { readAt: new Date() } });
    ok(res, msgs);
  }),
);

bookingsRouter.post(
  '/:id/messages',
  requirePermission('bookings.manage'),
  validate({ body: z.object({ body: z.string().trim().min(1).max(5000) }) }),
  ah(async (req, res) => {
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: req.params.id }, include: { client: true } });
    const m = await prisma.message.create({ data: { bookingId: b.id, authorId: req.user!.id, authorName: req.user!.name, fromClient: false, body: req.body.body } });
    if (b.client.userId) await notifyUser(b.client.userId, `New message from ${req.user!.name}`, req.body.body.slice(0, 140), `/portal/bookings/${b.id}?tab=messages`);
    ok(res, m, undefined, 201);
  }),
);

/* ───── Communications log on a booking ───── */

bookingsRouter.get(
  '/:id/activity',
  requirePermission('bookings.view'),
  ah(async (req, res) => {
    const [comms, audits] = await Promise.all([
      prisma.communication.findMany({ where: { bookingId: req.params.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.auditLog.findMany({ where: { entityType: 'Booking', entityId: req.params.id }, orderBy: { createdAt: 'desc' }, take: 100, include: { actor: { select: { name: true } } } }),
    ]);
    ok(res, { communications: comms, audit: audits });
  }),
);

bookingsRouter.post(
  '/:id/communications',
  requirePermission('bookings.manage'),
  validate({ body: z.object({ kind: z.enum(['NOTE', 'CALL', 'EMAIL', 'MEETING', 'WHATSAPP']), body: z.string().trim().min(1).max(5000), subject: z.string().trim().max(200).default('') }) }),
  ah(async (req, res) => {
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: req.params.id } });
    ok(res, await prisma.communication.create({ data: { ...req.body, bookingId: b.id, clientId: b.clientId, authorId: req.user!.id } }), undefined, 201);
  }),
);

// Re-export for portal/notifications
export { afterTransition };
