import type { Quotation, QuotationVersion } from '@prisma/client';
import { z } from 'zod';
import { calculateQuote, formatMoney, quotePricingInputSchema, type QuotePricingInput } from '@maison/shared';
import { prisma, type Tx, withTx, lockRows } from '../config/db';
import { env } from '../config/env';
import { AppError } from '../lib/AppError';
import { isoDate, toDateOnly, addDays, startOfDayUtc } from '../lib/dates';
import { issueUserToken } from './auth.service';
import { nextNumber } from './counter.service';
import { notifyStaffWith, sendEmail } from './notify.service';
import { getBusiness } from './siteConfig.service';

export const quotationMetaSchema = z.object({
  title: z.string().trim().min(1).max(160),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  venue: z.string().trim().max(200).default(''),
  guestCount: z.number().int().min(1).max(100000).nullable().default(null),
  currency: z.string().length(3).default('INR'),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
});

export const quotationContentSchema = z.object({
  intro: z.string().trim().max(5000).default(''),
  terms: z.string().trim().max(10000).default(''),
  notes: z.string().trim().max(5000).default(''),
  pricing: quotePricingInputSchema,
});
export type QuotationContent = z.infer<typeof quotationContentSchema>;

/** Persists a computed version. Totals are ALWAYS computed here — never taken from the request. */
function versionData(content: QuotationContent) {
  const t = calculateQuote(content.pricing);
  return {
    intro: content.intro,
    terms: content.terms,
    notes: content.notes,
    lines: content.pricing.lines as object,
    discountType: content.pricing.discountType,
    discountValue: content.pricing.discountValue,
    taxes: content.pricing.taxes as object,
    fees: content.pricing.fees as object,
    milestones: content.pricing.milestones as object,
    subtotalMinor: BigInt(t.subtotalMinor),
    discountMinor: BigInt(t.discountMinor),
    taxMinor: BigInt(t.taxMinor),
    feesMinor: BigInt(t.feesMinor),
    totalMinor: BigInt(t.totalMinor),
    breakdown: t as object,
  };
}

export function versionToPricing(v: QuotationVersion): QuotePricingInput {
  return quotePricingInputSchema.parse({ lines: v.lines, discountType: v.discountType, discountValue: v.discountValue, taxes: v.taxes, fees: v.fees, milestones: v.milestones });
}

export async function createQuotation(input: { clientId: string; inquiryId?: string | null; meta: z.infer<typeof quotationMetaSchema>; content: QuotationContent; userId: string; aiDrafted?: boolean }) {
  const biz = await getBusiness();
  return withTx(async (tx) => {
    const client = await tx.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw AppError.notFound('Client');
    if (input.inquiryId) {
      const inq = await tx.inquiry.findUnique({ where: { id: input.inquiryId } });
      if (!inq || inq.clientId !== client.id) throw AppError.badRequest('Inquiry does not belong to this client');
    }
    const number = await nextNumber(biz.quotation.prefix || 'QT', tx);
    const validUntil = input.meta.validUntil ? toDateOnly(input.meta.validUntil) : addDays(startOfDayUtc(), biz.quotation.validityDays);
    return tx.quotation.create({
      data: {
        number,
        title: input.meta.title,
        clientId: client.id,
        inquiryId: input.inquiryId ?? null,
        eventDate: toDateOnly(input.meta.eventDate),
        venue: input.meta.venue,
        guestCount: input.meta.guestCount,
        currency: input.meta.currency,
        validUntil,
        createdById: input.userId,
        versions: { create: { version: 1, ...versionData({ ...input.content, terms: input.content.terms || biz.quotation.terms }), createdById: input.userId, aiDrafted: !!input.aiDrafted } },
      },
      include: { versions: true },
    });
  });
}

export async function getQuotationFull(id: string) {
  const q = await prisma.quotation.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true, company: true } },
      inquiry: { select: { id: true, reference: true, eventType: true } },
      booking: { select: { id: true, reference: true, status: true } },
      versions: { orderBy: { version: 'desc' } },
    },
  });
  if (!q) throw AppError.notFound('Quotation');
  return q;
}

const EDITABLE: Quotation['status'][] = ['DRAFT', 'SENT', 'VIEWED', 'REVISION_REQUESTED', 'REJECTED', 'EXPIRED'];

/**
 * Saves content. If the current version has been sent (locked), a NEW version is created (revision history);
 * otherwise the draft version is updated in place.
 */
export async function saveQuotation(id: string, meta: Partial<z.infer<typeof quotationMetaSchema>>, content: QuotationContent | undefined, userId: string) {
  return withTx(async (tx) => {
    const q = await tx.quotation.findUnique({ where: { id }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
    if (!q) throw AppError.notFound('Quotation');
    if (!EDITABLE.includes(q.status)) throw AppError.conflict(`A ${q.status.toLowerCase()} quotation can no longer be edited`);
    const current = q.versions[0];
    let version = q.currentVersion;
    let status = q.status;
    if (content) {
      if (current.lockedAt) {
        version = current.version + 1;
        await tx.quotationVersion.create({ data: { quotationId: q.id, version, ...versionData(content), createdById: userId } });
        status = 'DRAFT';
      } else {
        await tx.quotationVersion.update({ where: { id: current.id }, data: versionData(content) });
      }
    }
    return tx.quotation.update({
      where: { id: q.id },
      data: {
        currentVersion: version,
        status,
        ...(meta.title !== undefined ? { title: meta.title } : {}),
        ...(meta.eventDate !== undefined ? { eventDate: toDateOnly(meta.eventDate) } : {}),
        ...(meta.venue !== undefined ? { venue: meta.venue } : {}),
        ...(meta.guestCount !== undefined ? { guestCount: meta.guestCount } : {}),
        ...(meta.validUntil !== undefined ? { validUntil: toDateOnly(meta.validUntil) } : {}),
        ...(meta.currency !== undefined ? { currency: meta.currency } : {}),
      },
    });
  });
}

/** Ensures the client can sign in to the portal. Returns an activation URL when an invitation was issued. */
export async function ensurePortalAccess(clientId: string, tx: Tx = prisma): Promise<{ inviteUrl: string | null }> {
  const client = await tx.client.findUniqueOrThrow({ where: { id: clientId }, include: { user: true } });
  if (client.user && client.user.status === 'ACTIVE') return { inviteUrl: null };
  let userId = client.user?.id;
  if (!userId) {
    const existingUser = await tx.user.findUnique({ where: { email: client.email } });
    if (existingUser && existingUser.roleKey !== 'CLIENT') throw AppError.conflict('This email belongs to a staff account; use a different client email');
    const user = existingUser ?? (await tx.user.create({ data: { email: client.email, name: client.name, phone: client.phone || null, roleKey: 'CLIENT', status: 'INVITED' } }));
    await tx.client.update({ where: { id: client.id }, data: { userId: user.id } });
    userId = user.id;
    if (existingUser?.status === 'ACTIVE') return { inviteUrl: null };
  }
  const token = await issueUserToken(userId, 'invite', 72 * 60);
  const inviteUrl = `${env.APP_URL}/reset-password?token=${token}&invite=1&portal=1`;
  await sendEmail({ to: client.email, template: 'portal_invite', vars: { name: client.name, url: inviteUrl }, entityType: 'Client', entityId: client.id });
  return { inviteUrl };
}

export async function sendQuotation(id: string, userId: string) {
  const q = await getQuotationFull(id);
  if (!['DRAFT', 'REVISION_REQUESTED', 'SENT', 'VIEWED', 'EXPIRED', 'REJECTED'].includes(q.status)) throw AppError.conflict('This quotation cannot be sent');
  const current = q.versions.find((v) => v.version === q.currentVersion)!;
  // Re-validate before locking.
  const pricing = quotePricingInputSchema.safeParse({ lines: current.lines, discountType: current.discountType, discountValue: current.discountValue, taxes: current.taxes, fees: current.fees, milestones: current.milestones });
  if (!pricing.success) throw new AppError(422, 'VALIDATION_ERROR', pricing.error.issues[0]?.message ?? 'Quotation is incomplete');
  const today = startOfDayUtc();
  const biz = await getBusiness();
  const validUntil = q.validUntil && q.validUntil >= today ? q.validUntil : addDays(today, biz.quotation.validityDays);
  await prisma.$transaction([
    prisma.quotationVersion.update({ where: { id: current.id }, data: { lockedAt: current.lockedAt ?? new Date() } }),
    prisma.quotation.update({ where: { id: q.id }, data: { status: 'SENT', sentAt: new Date(), viewedAt: null, validUntil, clientComment: '' } }),
    ...(q.inquiryId ? [prisma.inquiry.update({ where: { id: q.inquiryId }, data: { status: 'QUOTATION_SENT' } })] : []),
    prisma.communication.create({ data: { kind: 'EMAIL', direction: 'OUTBOUND', subject: `Quotation ${q.number} v${current.version} sent`, body: `Total ${formatMoney(Number(current.totalMinor), q.currency)}`, clientId: q.clientId, inquiryId: q.inquiryId, authorId: userId } }),
  ]);
  const { inviteUrl } = await ensurePortalAccess(q.clientId);
  await sendEmail({
    to: q.client.email,
    template: 'quotation_sent',
    automation: 'quotationSent',
    vars: { name: q.client.name, title: q.title, number: q.number, total: formatMoney(Number(current.totalMinor), q.currency), validUntil: isoDate(validUntil), portalUrl: `${env.APP_URL}/portal/quotations/${q.id}` },
    dedupeKey: `quote-sent:${q.id}:v${current.version}`,
    entityType: 'Quotation',
    entityId: q.id,
  });
  return { inviteUrl };
}

/** Recomputes the current version with the client's optional-service choices (no persistence). */
export function pricingWithSelection(v: QuotationVersion, selectedOptionalIds: string[]) {
  const p = versionToPricing(v);
  p.lines = p.lines.map((l) => (l.optional ? { ...l, selected: selectedOptionalIds.includes(l.id) } : l));
  return p;
}

export async function clientAccept(quotationId: string, clientId: string, selectedOptionalIds: string[], userId: string) {
  return withTx(async (tx) => {
    if (!(await lockRows(tx, 'quotation', { id: quotationId, clientId }))) throw AppError.notFound('Quotation');
    const q = await tx.quotation.findUniqueOrThrow({ where: { id: quotationId }, include: { versions: { orderBy: { version: 'desc' } } } });
    if (!['SENT', 'VIEWED'].includes(q.status)) throw AppError.conflict(q.status === 'ACCEPTED' || q.status === 'CONVERTED' ? 'This proposal has already been accepted' : 'This proposal is not open for acceptance');
    if (q.validUntil && q.validUntil < startOfDayUtc()) {
      await tx.quotation.update({ where: { id: q.id }, data: { status: 'EXPIRED' } });
      throw AppError.conflict('This proposal has expired. Please request an updated proposal.');
    }
    const current = q.versions.find((v) => v.version === q.currentVersion)!;
    if (!current.lockedAt) throw AppError.conflict('This proposal is being revised. Please wait for the updated version.');
    const optionalIds = (current.lines as { id: string; optional: boolean }[]).filter((l) => l.optional).map((l) => l.id);
    const invalid = selectedOptionalIds.filter((id) => !optionalIds.includes(id));
    if (invalid.length) throw AppError.badRequest('Unknown optional service selected');
    const pricing = pricingWithSelection(current, selectedOptionalIds);
    const same = JSON.stringify(pricing.lines) === JSON.stringify(versionToPricing(current).lines);
    let acceptedVersion = current.version;
    if (!same) {
      acceptedVersion = current.version + 1;
      await tx.quotationVersion.create({
        data: { quotationId: q.id, version: acceptedVersion, ...versionData({ intro: current.intro, terms: current.terms, notes: `Client selection of optional services at acceptance (from v${current.version}).`, pricing }), createdById: userId, lockedAt: new Date() },
      });
    }
    const updated = await tx.quotation.update({ where: { id: q.id }, data: { status: 'ACCEPTED', acceptedVersion, currentVersion: acceptedVersion, respondedAt: new Date() } });
    if (q.inquiryId) await tx.inquiry.update({ where: { id: q.inquiryId }, data: { status: 'WON' } });
    await tx.communication.create({ data: { kind: 'SYSTEM', direction: 'INBOUND', subject: `Quotation ${q.number} accepted (v${acceptedVersion})`, body: 'Accepted in client portal', clientId: q.clientId, inquiryId: q.inquiryId } });
    return updated;
  }).then(async (q) => {
    await notifyStaffWith('quotations.manage', `Proposal ${q.number} accepted`, q.title, `/admin/quotations/${q.id}`);
    return q;
  });
}

export async function clientRespond(quotationId: string, clientId: string, action: 'reject' | 'revise', comment: string) {
  const q = await prisma.quotation.findFirst({ where: { id: quotationId, clientId } });
  if (!q) throw AppError.notFound('Quotation');
  if (!['SENT', 'VIEWED'].includes(q.status)) throw AppError.conflict('This proposal is not open for a response');
  const status = action === 'reject' ? 'REJECTED' : 'REVISION_REQUESTED';
  const updated = await prisma.quotation.update({ where: { id: q.id }, data: { status, respondedAt: new Date(), clientComment: comment } });
  if (q.inquiryId && action === 'revise') await prisma.inquiry.update({ where: { id: q.inquiryId }, data: { status: 'NEGOTIATION' } });
  await prisma.communication.create({ data: { kind: 'SYSTEM', direction: 'INBOUND', subject: `Quotation ${q.number} ${action === 'reject' ? 'declined' : 'revision requested'}`, body: comment || '(no comment)', clientId: q.clientId, inquiryId: q.inquiryId } });
  await notifyStaffWith('quotations.manage', `Proposal ${q.number}: ${action === 'reject' ? 'declined' : 'changes requested'}`, comment.slice(0, 140), `/admin/quotations/${q.id}`);
  return updated;
}

export async function markViewed(quotationId: string) {
  await prisma.quotation.updateMany({ where: { id: quotationId, status: 'SENT' }, data: { status: 'VIEWED', viewedAt: new Date() } });
}

export async function expireQuotations() {
  const r = await prisma.quotation.updateMany({ where: { status: { in: ['SENT', 'VIEWED'] }, validUntil: { lt: startOfDayUtc() } }, data: { status: 'EXPIRED' } });
  return r.count;
}
