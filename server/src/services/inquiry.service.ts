import type { Request } from 'express';
import { INQUIRY_PUBLIC_LABELS, type InquirySubmit } from '@maison/shared';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../lib/AppError';
import { refCode, sha256 } from '../lib/crypto';
import { toDateOnly, isoDate } from '../lib/dates';
import { classifyInquiry } from './ai.service';
import { notifyStaffWith, sendEmail } from './notify.service';
import { getBusiness } from './siteConfig.service';

const MIN_FILL_MS = 2500;

/** Bot checks: honeypot (schema), minimum fill time and optional Cloudflare Turnstile. */
export async function assertHuman(startedAt: number | undefined, captchaToken: string | undefined, ip: string | null) {
  if (startedAt && Date.now() - startedAt < MIN_FILL_MS) throw new AppError(400, 'SPAM_SUSPECTED', 'That was very quick — please review the form and submit again.');
  if (env.TURNSTILE_SECRET_KEY) {
    if (!captchaToken) throw new AppError(400, 'CAPTCHA_REQUIRED', 'Please complete the verification challenge.');
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: captchaToken, ...(ip ? { remoteip: ip } : {}) }),
    });
    const json = (await r.json().catch(() => ({}))) as { success?: boolean };
    if (!json.success) throw new AppError(400, 'CAPTCHA_FAILED', 'Verification failed. Please try again.');
  }
}

async function uniqueReference() {
  for (let i = 0; i < 8; i++) {
    const ref = `INQ-${refCode(6)}`;
    if (!(await prisma.inquiry.findUnique({ where: { reference: ref } }))) return ref;
  }
  throw new Error('Could not allocate inquiry reference');
}

export async function createInquiry(req: Request, input: InquirySubmit, opts: { humanVerified?: boolean } = {}) {
  if (!opts.humanVerified) await assertHuman(input.startedAt, input.captchaToken, req.ip ?? null);

  // Duplicate protection: identical submission from the same email within 30 minutes returns the original.
  const fingerprint = sha256(JSON.stringify([input.email, input.eventType, input.eventDate, input.location, input.guestCount, input.budgetRange, input.notes]));
  const dup = await prisma.inquiry.findFirst({ where: { submissionHash: fingerprint, createdAt: { gt: new Date(Date.now() - 30 * 60_000) } } });
  if (dup) return { inquiry: dup, duplicate: true };

  const category = input.categoryId ? await prisma.eventCategory.findFirst({ where: { id: input.categoryId, status: 'PUBLISHED' } }) : null;
  const pkg = input.packageId ? await prisma.package.findFirst({ where: { id: input.packageId, status: 'PUBLISHED' } }) : null;

  // Reference uploads must be private files uploaded through the public inquiry upload endpoint in the last day.
  const attachments = input.referenceImages.length
    ? await prisma.mediaAsset.findMany({ where: { id: { in: input.referenceImages }, isPrivate: true, folder: 'inquiry-uploads', createdAt: { gt: new Date(Date.now() - 864e5) } }, select: { id: true, filename: true } })
    : [];

  const reference = await uniqueReference();
  const inquiry = await prisma.$transaction(async (tx) => {
    const existing = await tx.client.findUnique({ where: { email: input.email } });
    const client =
      existing ??
      (await tx.client.create({ data: { name: input.name, email: input.email, phone: input.phone, city: input.location.slice(0, 80), source: input.source } }));
    if (existing && !existing.phone) await tx.client.update({ where: { id: existing.id }, data: { phone: input.phone } });
    const created = await tx.inquiry.create({
      data: {
        reference,
        clientId: client.id,
        name: input.name,
        email: input.email,
        phone: input.phone,
        preferredContact: input.preferredContact,
        eventType: input.eventType,
        categoryId: category?.id ?? null,
        packageId: pkg?.id ?? null,
        eventDate: toDateOnly(input.eventDate || null),
        alternativeDate: toDateOnly(input.alternativeDate || null),
        dateFlexible: input.dateFlexible,
        location: input.location,
        guestCount: input.guestCount,
        budgetRange: input.budgetRange,
        venueRequirements: input.venueRequirements,
        services: input.services,
        themePreferences: input.themePreferences,
        cateringRequirements: input.cateringRequirements,
        notes: input.notes,
        attachments: attachments.map((a) => ({ mediaId: a.id, filename: a.filename })),
        source: input.source,
        utm: input.utm,
        submissionHash: fingerprint,
        ip: req.ip ?? null,
      },
    });
    await tx.communication.create({ data: { kind: 'SYSTEM', direction: 'INBOUND', subject: 'Inquiry submitted', body: `Submitted via ${input.source}`, inquiryId: created.id, clientId: client.id } });
    return created;
  });

  // Side effects never block or fail the submission.
  void afterInquiryCreated(inquiry.id).catch((err) => logger.error({ err }, 'inquiry post-processing failed'));
  return { inquiry, duplicate: false };
}

async function afterInquiryCreated(id: string) {
  const inq = await prisma.inquiry.findUniqueOrThrow({ where: { id } });
  const vars = {
    name: inq.name,
    email: inq.email,
    phone: inq.phone,
    reference: inq.reference,
    eventType: inq.eventType,
    eventDate: isoDate(inq.eventDate) ?? 'flexible',
    location: inq.location,
    guestCount: inq.guestCount,
    budgetRange: inq.budgetRange,
    trackUrl: `${env.APP_URL}/track?ref=${inq.reference}`,
    adminUrl: `${env.APP_URL}/admin/inquiries/${inq.id}`,
  };
  await sendEmail({ to: inq.email, template: 'inquiry_confirmation', vars, automation: 'inquiryConfirmation', dedupeKey: `inq-confirm:${inq.id}`, entityType: 'Inquiry', entityId: inq.id });
  const biz = await getBusiness();
  for (const to of biz.notifications.adminEmails) {
    await sendEmail({ to, template: 'admin_inquiry_alert', vars, automation: 'adminInquiryAlert', dedupeKey: `inq-alert:${inq.id}:${to}`, entityType: 'Inquiry', entityId: inq.id });
  }
  await notifyStaffWith('inquiries.manage', `New inquiry ${inq.reference}`, `${inq.eventType} · ${inq.guestCount} guests · ${inq.location}`, `/admin/inquiries/${inq.id}`);
  const ai = await classifyInquiry(inq).catch(() => null);
  if (ai) await prisma.inquiry.update({ where: { id: inq.id }, data: { aiClassification: ai as object } });
}

export async function trackInquiry(reference: string, email: string) {
  const inq = await prisma.inquiry.findUnique({
    where: { reference },
    include: {
      consultations: { where: { status: { in: ['SCHEDULED', 'COMPLETED'] } }, orderBy: { scheduledAt: 'asc' }, select: { scheduledAt: true, mode: true, status: true } },
      quotations: { where: { status: { in: ['SENT', 'VIEWED', 'REVISION_REQUESTED', 'ACCEPTED', 'CONVERTED'] } }, select: { number: true, status: true } },
      assignedTo: { select: { name: true } },
    },
  });
  // Uniform "not found" for wrong email or reference (no enumeration).
  if (!inq || inq.email.toLowerCase() !== email.toLowerCase()) throw new AppError(404, 'NOT_FOUND', 'We could not find an inquiry with that reference and email.');
  return {
    reference: inq.reference,
    status: inq.status,
    statusLabel: INQUIRY_PUBLIC_LABELS[inq.status],
    eventType: inq.eventType,
    eventDate: isoDate(inq.eventDate),
    location: inq.location,
    guestCount: inq.guestCount,
    submittedAt: inq.createdAt,
    planner: inq.assignedTo?.name ?? null,
    consultations: inq.consultations,
    hasProposal: inq.quotations.length > 0,
  };
}
