import { Router } from 'express';
import { z } from 'zod';
import { calculateQuote, CHANGE_REQUEST_TYPES, BOOKING_STATUS_LABELS } from '@maison/shared';
import { prisma } from '../config/db';
import { env, isProd } from '../config/env';
import { AppError } from '../lib/AppError';
import { isoDate, toDateOnly } from '../lib/dates';
import { ah, ok } from '../lib/http';
import { requireClient } from '../middleware/auth';
import { paymentLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { bookingFinancials } from '../services/booking.service';
import { renderInvoicePdf } from '../services/invoice.service';
import { notifyUser, notifyStaffWith } from '../services/notify.service';
import { createOrder, markFailed, verifyCheckout } from '../services/payment.service';
import { sandboxProvider } from '../services/payments';
import { quotationPdf } from '../services/pdf.service';
import { clientAccept, clientRespond, markViewed, pricingWithSelection, versionToPricing } from '../services/quotation.service';
import { getPublishedSite } from '../services/siteConfig.service';
import { privateFileAccess, storeFile } from '../services/storage.service';
import { upload } from './media.routes';

/**
 * Client portal. Every query is scoped by the signed-in client's id — a booking/quotation/document id
 * belonging to another client returns 404, never data.
 */
export const portalRouter = Router();
portalRouter.use(requireClient);

const cid = (req: Express.Request) => (req as unknown as { user: { clientId: string } }).user.clientId;

async function ownBooking(req: Express.Request, id: string) {
  const b = await prisma.booking.findFirst({ where: { id, clientId: cid(req) } });
  if (!b) throw AppError.notFound('Booking');
  return b;
}

portalRouter.get(
  '/overview',
  ah(async (req, res) => {
    const clientId = cid(req);
    const [client, bookings, quotations, inquiries] = await Promise.all([
      prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true, email: true, relationshipManager: { select: { name: true, title: true } } } }),
      prisma.booking.findMany({ where: { clientId }, orderBy: { eventDate: 'asc' }, select: { id: true, reference: true, title: true, eventDate: true, venueName: true, city: true, status: true, manager: { select: { name: true } } } }),
      prisma.quotation.findMany({ where: { clientId, status: { in: ['SENT', 'VIEWED', 'REVISION_REQUESTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED'] } }, orderBy: { updatedAt: 'desc' }, select: { id: true, number: true, title: true, status: true, validUntil: true, currentVersion: true, versions: { orderBy: { version: 'desc' }, take: 1, select: { totalMinor: true } }, currency: true } }),
      prisma.inquiry.findMany({ where: { clientId, status: { notIn: ['ARCHIVED'] } }, orderBy: { createdAt: 'desc' }, take: 5, select: { reference: true, eventType: true, status: true, createdAt: true } }),
    ]);
    ok(res, { client, bookings: bookings.map((b) => ({ ...b, eventDate: isoDate(b.eventDate), statusLabel: BOOKING_STATUS_LABELS[b.status] })), quotations, inquiries });
  }),
);

/* ───── Quotations ───── */

const SENT_STATES = ['SENT', 'VIEWED', 'REVISION_REQUESTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED'];

async function ownQuotation(req: Express.Request, id: string) {
  const q = await prisma.quotation.findFirst({ where: { id, clientId: cid(req), status: { in: SENT_STATES as never } }, include: { versions: { where: { lockedAt: { not: null } }, orderBy: { version: 'desc' } }, booking: { select: { id: true } } } });
  if (!q || !q.versions.length) throw AppError.notFound('Proposal');
  return q;
}

portalRouter.get(
  '/quotations/:id',
  ah(async (req, res) => {
    const q = await ownQuotation(req, req.params.id);
    await markViewed(q.id);
    const v = q.versions.find((x) => x.version === q.currentVersion) ?? q.versions[0];
    const pricing = versionToPricing(v);
    ok(res, {
      id: q.id,
      number: q.number,
      title: q.title,
      status: q.status === 'SENT' ? 'VIEWED' : q.status,
      eventDate: isoDate(q.eventDate),
      venue: q.venue,
      guestCount: q.guestCount,
      currency: q.currency,
      validUntil: isoDate(q.validUntil),
      version: v.version,
      intro: v.intro,
      terms: v.terms,
      lines: pricing.lines.map(({ serviceId: _s, ...l }) => l),
      taxes: pricing.taxes,
      fees: pricing.fees,
      totals: calculateQuote(pricing),
      clientComment: q.clientComment,
      bookingId: q.booking?.id ?? null,
      history: q.versions.map((x) => ({ version: x.version, createdAt: x.createdAt, totalMinor: x.totalMinor })),
    });
  }),
);

/** Recalculates totals for a selection of optional services (server-side; nothing is saved). */
portalRouter.post(
  '/quotations/:id/preview',
  validate({ body: z.object({ selectedOptionalIds: z.array(z.string().max(40)).max(150) }) }),
  ah(async (req, res) => {
    const q = await ownQuotation(req, req.params.id);
    const v = q.versions.find((x) => x.version === q.currentVersion) ?? q.versions[0];
    ok(res, calculateQuote(pricingWithSelection(v, req.body.selectedOptionalIds)));
  }),
);

portalRouter.post(
  '/quotations/:id/accept',
  validate({ body: z.object({ selectedOptionalIds: z.array(z.string().max(40)).max(150).default([]), agree: z.literal(true, { errorMap: () => ({ message: 'Please confirm you agree to the terms' }) }) }) }),
  ah(async (req, res) => {
    const q = await clientAccept(req.params.id, cid(req), req.body.selectedOptionalIds, req.user!.id);
    ok(res, { status: q.status, acceptedVersion: q.acceptedVersion });
  }),
);

portalRouter.post(
  '/quotations/:id/respond',
  validate({ body: z.object({ action: z.enum(['reject', 'revise']), comment: z.string().trim().max(3000).default('') }) }),
  ah(async (req, res) => {
    if (req.body.action === 'revise' && req.body.comment.length < 5) throw AppError.badRequest('Tell us what you would like to change');
    const q = await clientRespond(req.params.id, cid(req), req.body.action, req.body.comment);
    ok(res, { status: q.status });
  }),
);

portalRouter.get(
  '/quotations/:id/pdf',
  ah(async (req, res) => {
    const q = await ownQuotation(req, req.params.id);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: cid(req) } });
    const v = q.versions.find((x) => x.version === q.currentVersion) ?? q.versions[0];
    const pricing = versionToPricing(v);
    const pdf = await quotationPdf({ number: q.number, version: v.version, title: q.title, clientName: client.name, clientEmail: client.email, eventDate: isoDate(q.eventDate), venue: q.venue, guestCount: q.guestCount, validUntil: isoDate(q.validUntil), currency: q.currency, intro: v.intro, terms: v.terms, lines: pricing.lines, totals: calculateQuote(pricing) });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${q.number}.pdf"`);
    res.send(pdf);
  }),
);

/* ───── Bookings ───── */

portalRouter.get(
  '/bookings/:id',
  ah(async (req, res) => {
    const b = await ownBooking(req, req.params.id);
    const [full, fin, milestones, docs, changeRequests, feedback] = await Promise.all([
      prisma.booking.findUniqueOrThrow({
        where: { id: b.id },
        select: {
          id: true, reference: true, title: true, status: true, eventDate: true, eventEndDate: true, startTime: true, venueName: true, city: true, guestCount: true, currency: true,
          contractValueMinor: true, contractSignedAt: true, clientVisibleNotes: true, quotationId: true,
          manager: { select: { name: true, title: true, email: true, phone: true } },
          services: { orderBy: { sortOrder: 'asc' }, select: { name: true, description: true } },
          installments: { orderBy: { sortOrder: 'asc' }, select: { id: true, label: true, amountMinor: true, paidMinor: true, dueDate: true, status: true } },
          invoices: { where: { status: { not: 'VOID' } }, orderBy: { issuedAt: 'desc' }, select: { id: true, number: true, kind: true, totalMinor: true, paidMinor: true, status: true, issuedAt: true, dueDate: true } },
          payments: { where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, orderBy: { paidAt: 'desc' }, select: { id: true, amountMinor: true, refundedMinor: true, method: true, paidAt: true, status: true } },
          microsite: { select: { slug: true, enabled: true } },
        },
      }),
      bookingFinancials(b.id),
      prisma.task.findMany({ where: { bookingId: b.id, visibleToClient: true }, orderBy: [{ dueAt: 'asc' }, { sortOrder: 'asc' }], select: { id: true, title: true, phase: true, status: true, dueAt: true, isMilestone: true, completedAt: true } }),
      prisma.document.findMany({ where: { bookingId: b.id, visibleToClient: true }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, kind: true, createdAt: true, uploadedByClient: true } }),
      prisma.changeRequest.findMany({ where: { bookingId: b.id }, orderBy: { createdAt: 'desc' }, select: { id: true, type: true, message: true, requestedDate: true, status: true, resolutionNote: true, createdAt: true } }),
      prisma.feedback.findUnique({ where: { bookingId: b.id }, select: { rating: true, comment: true, createdAt: true } }),
    ]);
    ok(res, {
      ...full,
      eventDate: isoDate(full.eventDate),
      eventEndDate: isoDate(full.eventEndDate),
      statusLabel: BOOKING_STATUS_LABELS[full.status],
      installments: full.installments.map((i) => ({ ...i, dueDate: isoDate(i.dueDate) })),
      financials: fin,
      milestones,
      documents: docs,
      changeRequests: changeRequests.map((c) => ({ ...c, requestedDate: isoDate(c.requestedDate) })),
      feedback,
      paymentsEnabled: ['AWAITING_ADVANCE', 'CONFIRMED', 'IN_PROGRESS', 'AWAITING_FINAL_PAYMENT'].includes(full.status),
      paymentProvider: env.PAYMENT_PROVIDER,
    });
  }),
);

portalRouter.get(
  '/bookings/:id/documents/:docId',
  ah(async (req, res) => {
    const b = await ownBooking(req, req.params.id);
    const d = await prisma.document.findFirst({ where: { id: req.params.docId, bookingId: b.id, visibleToClient: true } });
    if (!d) throw AppError.notFound('Document');
    const m = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: d.mediaId } });
    const access = privateFileAccess(m.provider, m.storageKey!, m.mime);
    if (access.redirect) return res.redirect(access.redirect);
    res.setHeader('Content-Type', m.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(m.filename)}"`);
    access.stream!.pipe(res);
  }),
);

portalRouter.post(
  '/bookings/:id/documents',
  upload.single('file'),
  ah(async (req, res) => {
    const b = await ownBooking(req, req.params.id);
    if (!req.file) throw AppError.badRequest('Choose a file');
    if (req.file.size > 15 * 1024 * 1024) throw AppError.badRequest('Files must be 15 MB or smaller');
    const stored = await storeFile(req.file.buffer, req.file.originalname, { isPrivate: true, allow: ['DOCUMENT', 'IMAGE'] });
    const m = await prisma.mediaAsset.create({ data: { ...stored, isPrivate: true, folder: 'client-uploads', filename: req.file.originalname.slice(0, 200), uploadedById: req.user!.id, tags: [] } });
    const d = await prisma.document.create({ data: { bookingId: b.id, name: String(req.body.name || req.file.originalname).slice(0, 200), kind: 'OTHER', mediaId: m.id, visibleToClient: true, uploadedByClient: true, uploadedById: req.user!.id } });
    if (b.managerId) await notifyUser(b.managerId, `${req.user!.name} uploaded a document`, d.name, `/admin/bookings/${b.id}`);
    ok(res, d, undefined, 201);
  }),
);

portalRouter.get(
  '/bookings/:id/invoices/:invoiceId/pdf',
  ah(async (req, res) => {
    const b = await ownBooking(req, req.params.id);
    const inv = await prisma.invoice.findFirst({ where: { id: req.params.invoiceId, bookingId: b.id, status: { not: 'VOID' } } });
    if (!inv) throw AppError.notFound('Invoice');
    const { pdf, filename } = await renderInvoicePdf(inv.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  }),
);

portalRouter.get(
  '/bookings/:id/messages',
  ah(async (req, res) => {
    const b = await ownBooking(req, req.params.id);
    const msgs = await prisma.message.findMany({ where: { bookingId: b.id }, orderBy: { createdAt: 'asc' }, take: 500, select: { id: true, authorName: true, fromClient: true, body: true, createdAt: true } });
    await prisma.message.updateMany({ where: { bookingId: b.id, fromClient: false, readAt: null }, data: { readAt: new Date() } });
    ok(res, msgs);
  }),
);

portalRouter.post(
  '/bookings/:id/messages',
  validate({ body: z.object({ body: z.string().trim().min(1).max(5000) }) }),
  ah(async (req, res) => {
    const b = await ownBooking(req, req.params.id);
    const m = await prisma.message.create({ data: { bookingId: b.id, authorId: req.user!.id, authorName: req.user!.name, fromClient: true, body: req.body.body } });
    if (b.managerId) await notifyUser(b.managerId, `Message from ${req.user!.name}`, req.body.body.slice(0, 140), `/admin/bookings/${b.id}?tab=messages`);
    else await notifyStaffWith('bookings.manage', `Message from ${req.user!.name}`, `${b.reference}: ${req.body.body.slice(0, 120)}`, `/admin/bookings/${b.id}?tab=messages`);
    ok(res, { id: m.id, authorName: m.authorName, fromClient: true, body: m.body, createdAt: m.createdAt }, undefined, 201);
  }),
);

portalRouter.post(
  '/bookings/:id/change-requests',
  validate({ body: z.object({ type: z.enum(CHANGE_REQUEST_TYPES), message: z.string().trim().min(5).max(3000), requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null) }) }),
  ah(async (req, res) => {
    const b = await ownBooking(req, req.params.id);
    if (['COMPLETED', 'CANCELLED'].includes(b.status)) throw AppError.conflict('This booking can no longer be changed');
    if (req.body.type === 'RESCHEDULE' && !req.body.requestedDate) throw AppError.badRequest('Choose the new date you would like');
    const open = await prisma.changeRequest.count({ where: { bookingId: b.id, status: 'OPEN' } });
    if (open >= 10) throw AppError.conflict('You have several open requests — our team will respond shortly');
    const cr = await prisma.changeRequest.create({ data: { bookingId: b.id, type: req.body.type, message: req.body.message, requestedDate: toDateOnly(req.body.requestedDate), createdById: req.user!.id } });
    const title = `${req.body.type.replace('_', ' ').toLowerCase()} request on ${b.reference}`;
    if (b.managerId) await notifyUser(b.managerId, title, req.body.message.slice(0, 140), `/admin/bookings/${b.id}`);
    await notifyStaffWith('bookings.manage', title, req.body.message.slice(0, 140), `/admin/bookings/${b.id}`);
    ok(res, cr, undefined, 201);
  }),
);

portalRouter.post(
  '/bookings/:id/feedback',
  validate({ body: z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(3000).default(''), publishConsent: z.boolean().default(false) }) }),
  ah(async (req, res) => {
    const b = await ownBooking(req, req.params.id);
    if (b.status !== 'COMPLETED') throw AppError.conflict('Feedback opens after your event is complete');
    const f = await prisma.feedback.upsert({ where: { bookingId: b.id }, update: req.body, create: { ...req.body, bookingId: b.id } });
    await notifyStaffWith('bookings.view', `Feedback received (${req.body.rating}/5)`, `${b.reference} · ${b.title}`, `/admin/bookings/${b.id}`);
    ok(res, f);
  }),
);

/** Calendar file for the event (works with Google Calendar, Apple Calendar, Outlook). */
portalRouter.get(
  '/bookings/:id/calendar.ics',
  ah(async (req, res) => {
    const b = await ownBooking(req, req.params.id);
    const site = await getPublishedSite();
    const d = (x: Date) => x.toISOString().slice(0, 10).replace(/-/g, '');
    const end = new Date((b.eventEndDate ?? b.eventDate).getTime() + 864e5);
    const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${esc(site.brand.name)}//Events//EN`, 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${b.id}@${new URL(env.APP_URL).hostname}`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `DTSTART;VALUE=DATE:${d(b.eventDate)}`, `DTEND;VALUE=DATE:${d(end)}`, `SUMMARY:${esc(b.title)}`,
      `LOCATION:${esc([b.venueName, b.city].filter(Boolean).join(', '))}`, `DESCRIPTION:${esc(`${b.reference} — ${site.brand.name}`)}`, 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${b.reference}.ics"`);
    res.send(ics);
  }),
);

/* ───── Payments ───── */

portalRouter.post(
  '/bookings/:id/payments/order',
  paymentLimiter,
  validate({ body: z.object({ installmentId: z.string().nullable().default(null) }) }),
  ah(async (req, res) => {
    const b = await ownBooking(req, req.params.id);
    const { order, payment, label } = await createOrder(b.id, req.body.installmentId, req.user!.id);
    const site = await getPublishedSite();
    ok(res, { provider: env.PAYMENT_PROVIDER, orderId: order.orderId, amountMinor: Number(payment.amountMinor), currency: payment.currency, keyId: order.keyId ?? null, label, name: site.brand.name, description: `${b.reference} · ${label}`, prefill: { name: req.user!.name, email: req.user!.email } });
  }),
);

portalRouter.post(
  '/payments/verify',
  paymentLimiter,
  validate({ body: z.object({ orderId: z.string().max(100), paymentId: z.string().max(100), signature: z.string().max(200) }) }),
  ah(async (req, res) => {
    const p = await prisma.payment.findFirst({ where: { providerOrderId: req.body.orderId, booking: { clientId: cid(req) } } });
    if (!p) throw AppError.notFound('Payment');
    const paid = await verifyCheckout(req.body.orderId, req.body.paymentId, req.body.signature);
    ok(res, { status: paid.status, bookingId: paid.bookingId });
  }),
);

portalRouter.post(
  '/payments/failed',
  validate({ body: z.object({ orderId: z.string().max(100), reason: z.string().max(300).default('Cancelled by client') }) }),
  ah(async (req, res) => {
    const p = await prisma.payment.findFirst({ where: { providerOrderId: req.body.orderId, booking: { clientId: cid(req) } } });
    if (!p) throw AppError.notFound('Payment');
    await markFailed(req.body.orderId, req.body.reason);
    ok(res, { ok: true });
  }),
);

/** Sandbox gateway (development/test only): simulates the provider, then runs the real verification path. */
portalRouter.post(
  '/payments/sandbox',
  validate({ body: z.object({ orderId: z.string().max(100), outcome: z.enum(['success', 'failure']) }) }),
  ah(async (req, res) => {
    if (isProd || env.PAYMENT_PROVIDER !== 'sandbox') throw AppError.notFound('Route');
    const p = await prisma.payment.findFirst({ where: { providerOrderId: req.body.orderId, booking: { clientId: cid(req) } } });
    if (!p) throw AppError.notFound('Payment');
    const sim = sandboxProvider.simulate(req.body.orderId, req.body.outcome);
    if (req.body.outcome === 'failure') {
      await markFailed(req.body.orderId, 'Sandbox: card declined');
      throw new AppError(402, 'PAYMENT_FAILED', 'Sandbox payment declined. No money was taken.');
    }
    const paid = await verifyCheckout(req.body.orderId, sim.paymentId, sim.signature);
    ok(res, { status: paid.status, bookingId: paid.bookingId, paymentId: sim.paymentId, signature: sim.signature });
  }),
);
