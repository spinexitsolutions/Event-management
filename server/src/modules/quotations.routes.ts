import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { calculateQuote, DEFAULT_MILESTONES, QUOTATION_STATUSES, quotePricingInputSchema } from '@maison/shared';
import { prisma } from '../config/db';
import { AppError } from '../lib/AppError';
import { isoDate } from '../lib/dates';
import { ah, ok, pageMeta, paginate, qry } from '../lib/http';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { audit } from '../services/audit.service';
import { convertQuotationToBooking } from '../services/booking.service';
import { quotationPdf } from '../services/pdf.service';
import { createQuotation, getQuotationFull, quotationContentSchema, quotationMetaSchema, saveQuotation, sendQuotation, versionToPricing } from '../services/quotation.service';
import { getBusiness } from '../services/siteConfig.service';
import { aiConfigured, callClaude, extractJson } from '../services/ai.service';
import { emailConfigured } from '../services/notify.service';

export const quotationsRouter = Router();
quotationsRouter.use(requirePermission('quotations.manage'));

quotationsRouter.get(
  '/',
  validate({ query: z.object({ page: z.coerce.number().optional(), limit: z.coerce.number().optional(), q: z.string().trim().max(100).optional(), status: z.enum(QUOTATION_STATUSES).optional(), clientId: z.string().optional() }) }),
  ah(async (req, res) => {
    const q = qry<{ page?: number; limit?: number; q?: string; status?: (typeof QUOTATION_STATUSES)[number]; clientId?: string }>(req);
    const { page, limit, skip, take } = paginate(q);
    const where: Prisma.QuotationWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.clientId ? { clientId: q.clientId } : {}),
      ...(q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { title: { contains: q.q, mode: 'insensitive' } }, { client: { name: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.quotation.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take, include: { client: { select: { id: true, name: true } }, versions: { orderBy: { version: 'desc' }, take: 1, select: { totalMinor: true, version: true } } } }),
      prisma.quotation.count({ where }),
    ]);
    ok(res, items, pageMeta(page, limit, total));
  }),
);

/** Defaults for a new quotation editor (taxes, milestones, terms from Business settings). */
quotationsRouter.get(
  '/defaults',
  ah(async (_req, res) => {
    const biz = await getBusiness();
    const [services, packages] = await Promise.all([
      prisma.service.findMany({ where: { status: { not: 'ARCHIVED' } }, select: { id: true, name: true, summary: true, defaultPriceMinor: true, defaultUnit: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.package.findMany({ where: { status: { not: 'ARCHIVED' } }, select: { id: true, name: true, tier: true, priceMinor: true, pricingModel: true, inclusions: true, addOns: true, services: { select: { id: true, name: true, defaultPriceMinor: true, defaultUnit: true } } }, orderBy: { sortOrder: 'asc' } }),
    ]);
    ok(res, { currency: biz.currency, taxes: biz.quotation.defaultTaxes, milestones: biz.quotation.defaultMilestones.length ? biz.quotation.defaultMilestones : DEFAULT_MILESTONES, terms: biz.quotation.terms, validityDays: biz.quotation.validityDays, services, packages, aiAvailable: aiConfigured() });
  }),
);

/** Live price preview — the same calculation the server persists. */
quotationsRouter.post(
  '/calculate',
  validate({ body: quotePricingInputSchema }),
  ah(async (req, res) => ok(res, calculateQuote(req.body))),
);

quotationsRouter.post(
  '/',
  validate({ body: z.object({ clientId: z.string(), inquiryId: z.string().nullable().default(null), meta: quotationMetaSchema, content: quotationContentSchema, aiDrafted: z.boolean().default(false) }) }),
  ah(async (req, res) => {
    const q = await createQuotation({ ...req.body, userId: req.user!.id });
    await audit(req, { action: 'quotation.create', entityType: 'Quotation', entityId: q.id, summary: q.number });
    ok(res, q, undefined, 201);
  }),
);

quotationsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const q = await getQuotationFull(req.params.id);
    ok(res, { ...q, eventDate: isoDate(q.eventDate), validUntil: isoDate(q.validUntil) });
  }),
);

quotationsRouter.put(
  '/:id',
  validate({ body: z.object({ meta: quotationMetaSchema.partial().default({}), content: quotationContentSchema.optional() }) }),
  ah(async (req, res) => {
    const q = await saveQuotation(req.params.id, req.body.meta, req.body.content, req.user!.id);
    await audit(req, { action: 'quotation.update', entityType: 'Quotation', entityId: q.id, summary: `${q.number} v${q.currentVersion}` });
    ok(res, q);
  }),
);

quotationsRouter.post(
  '/:id/send',
  ah(async (req, res) => {
    const r = await sendQuotation(req.params.id, req.user!.id);
    await audit(req, { action: 'quotation.send', entityType: 'Quotation', entityId: req.params.id });
    ok(res, { ok: true, deliveredByEmail: emailConfigured(), portalInviteUrl: emailConfigured() ? null : r.inviteUrl });
  }),
);

quotationsRouter.post(
  '/:id/cancel',
  ah(async (req, res) => {
    const q = await prisma.quotation.findUniqueOrThrow({ where: { id: req.params.id } });
    if (['ACCEPTED', 'CONVERTED'].includes(q.status)) throw AppError.conflict('Accepted quotations cannot be withdrawn here');
    await prisma.quotation.update({ where: { id: q.id }, data: { status: 'EXPIRED', validUntil: new Date(Date.now() - 864e5) } });
    await audit(req, { action: 'quotation.withdraw', entityType: 'Quotation', entityId: q.id });
    ok(res, { ok: true });
  }),
);

quotationsRouter.post(
  '/:id/duplicate',
  ah(async (req, res) => {
    const src = await getQuotationFull(req.params.id);
    const v = src.versions.find((x) => x.version === src.currentVersion)!;
    const q = await createQuotation({
      clientId: src.clientId,
      inquiryId: src.inquiryId,
      meta: { title: `${src.title} (copy)`, eventDate: isoDate(src.eventDate), venue: src.venue, guestCount: src.guestCount, currency: src.currency, validUntil: null },
      content: { intro: v.intro, terms: v.terms, notes: v.notes, pricing: versionToPricing(v) },
      userId: req.user!.id,
    });
    ok(res, q, undefined, 201);
  }),
);

quotationsRouter.post(
  '/:id/convert',
  requirePermission('bookings.manage'),
  validate({ body: z.object({ managerId: z.string().nullable().default(null), venueId: z.string().nullable().default(null), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).or(z.literal('')).default(''), eventEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null) }) }),
  ah(async (req, res) => {
    const b = await convertQuotationToBooking(req.params.id, req.body, req.user!.id);
    await audit(req, { action: 'quotation.convert', entityType: 'Booking', entityId: b.id, summary: b.reference });
    ok(res, b, undefined, 201);
  }),
);

quotationsRouter.get(
  '/:id/pdf',
  validate({ query: z.object({ version: z.coerce.number().int().optional() }) }),
  ah(async (req, res) => {
    const q = await getQuotationFull(req.params.id);
    const ver = qry<{ version?: number }>(req).version ?? q.currentVersion;
    const v = q.versions.find((x) => x.version === ver);
    if (!v) throw AppError.notFound('Version');
    const pricing = versionToPricing(v);
    const pdf = await quotationPdf({
      number: q.number,
      version: v.version,
      title: q.title,
      clientName: q.client.name,
      clientEmail: q.client.email,
      eventDate: isoDate(q.eventDate),
      venue: q.venue,
      guestCount: q.guestCount,
      validUntil: isoDate(q.validUntil),
      currency: q.currency,
      intro: v.intro,
      terms: v.terms,
      lines: pricing.lines,
      totals: calculateQuote(pricing),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${q.number}-v${v.version}.pdf"`);
    res.send(pdf);
  }),
);

/**
 * AI-assisted draft from admin-approved packages and services only. Prices come from the catalogue
 * (never invented); the result is returned for human editing and is NOT saved or sent.
 */
quotationsRouter.post(
  '/ai-draft',
  validate({ body: z.object({ inquiryId: z.string() }) }),
  ah(async (req, res) => {
    if (!aiConfigured()) throw new AppError(409, 'AI_NOT_CONFIGURED', 'AI assistance is not configured (set AI_PROVIDER=anthropic and ANTHROPIC_API_KEY).');
    const inq = await prisma.inquiry.findUniqueOrThrow({ where: { id: req.body.inquiryId } });
    const services = await prisma.service.findMany({ where: { status: 'PUBLISHED', defaultPriceMinor: { not: null } }, select: { id: true, name: true, defaultPriceMinor: true, defaultUnit: true } });
    if (!services.length) throw AppError.badRequest('Add reference prices to services first (Content → Services → internal reference price)');
    const text = await callClaude(
      'You help an event planner draft a quotation. Choose ONLY from the provided catalogue (use ids exactly). Respond with JSON only: {"intro": string (max 80 words), "lines": [{"serviceId": string, "quantity": number, "optional": boolean, "reason": string}]}. Do not invent services or prices.',
      JSON.stringify({ inquiry: { eventType: inq.eventType, guests: inq.guestCount, budget: inq.budgetRange, services: inq.services, notes: inq.notes.slice(0, 1500), theme: inq.themePreferences.slice(0, 600) }, catalogue: services.map((s) => ({ id: s.id, name: s.name, unit: s.defaultUnit })) }),
      1200,
    );
    const parsed = extractJson<{ intro?: string; lines?: { serviceId: string; quantity: number; optional?: boolean; reason?: string }[] }>(text);
    const lines = (parsed?.lines ?? [])
      .map((l, i) => {
        const s = services.find((x) => x.id === l.serviceId);
        if (!s) return null;
        const qty = Math.max(1, Math.min(10000, Math.round(Number(l.quantity) || 1)));
        return { id: `ai${i}`, serviceId: s.id, name: s.name, description: (l.reason ?? '').slice(0, 300), quantityX100: qty * 100, unit: s.defaultUnit, unitPriceMinor: Number(s.defaultPriceMinor), discountBps: 0, optional: !!l.optional, selected: !l.optional, taxable: true };
      })
      .filter(Boolean);
    ok(res, { intro: (parsed?.intro ?? '').slice(0, 1500), lines, note: 'AI suggestion — review every line before saving or sending.' });
  }),
);
