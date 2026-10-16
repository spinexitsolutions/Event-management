import type { Booking, BookingStatus } from '@prisma/client';
import { canTransitionBooking, formatMoney, milestoneDueDate, type Milestone } from '@maison/shared';
import { prisma, type Tx } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../lib/AppError';
import { isoDate, toDateOnly } from '../lib/dates';
import { assertVenueAvailable } from './conflicts.service';
import { nextNumber } from './counter.service';
import { notifyUser, sendEmail, sendWhatsApp } from './notify.service';
import { versionToPricing } from './quotation.service';
import { calculateQuote } from '@maison/shared';

/** Financial position of a booking. Only verified PAID payments count; refunds are subtracted. */
export async function bookingFinancials(bookingId: string, tx: Tx = prisma) {
  const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { contractValueMinor: true, currency: true } });
  const pays = await tx.payment.findMany({ where: { bookingId, status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, select: { amountMinor: true, refundedMinor: true } });
  const paid = pays.reduce((s, p) => s + Number(p.amountMinor) - Number(p.refundedMinor), 0);
  const contract = Number(b.contractValueMinor);
  return { contractValueMinor: contract, paidMinor: paid, balanceMinor: Math.max(0, contract - paid), overpaidMinor: Math.max(0, paid - contract), currency: b.currency };
}

/** Creates a booking from an ACCEPTED quotation: services, installment schedule from milestones, venue check. */
export async function convertQuotationToBooking(quotationId: string, input: { managerId?: string | null; venueId?: string | null; startTime?: string; eventEndDate?: string | null }, userId: string) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Quotation" WHERE id = ${quotationId} FOR UPDATE`;
    if (!locked.length) throw AppError.notFound('Quotation');
    const q = await tx.quotation.findUniqueOrThrow({ where: { id: quotationId }, include: { versions: true, inquiry: true, client: true } });
    if (q.status === 'CONVERTED') throw AppError.conflict('This quotation has already been converted to a booking');
    if (q.status !== 'ACCEPTED' || !q.acceptedVersion) throw AppError.conflict('Only quotations accepted by the client can be converted');
    if (!q.eventDate) throw AppError.badRequest('Set the event date on the quotation before converting');
    const v = q.versions.find((x) => x.version === q.acceptedVersion)!;
    const pricing = versionToPricing(v);
    const totals = calculateQuote(pricing);
    if (totals.totalMinor !== Number(v.totalMinor)) throw new AppError(500, 'TOTAL_MISMATCH', 'Stored quotation total does not match recomputation');

    const eventEnd = toDateOnly(input.eventEndDate ?? null);
    if (input.venueId) await assertVenueAvailable(tx, input.venueId, q.eventDate, eventEnd, undefined);
    const venue = input.venueId ? await tx.venue.findUnique({ where: { id: input.venueId } }) : null;

    const reference = await nextNumber('EV', tx);
    const acceptedAt = q.respondedAt ?? new Date();
    const booking = await tx.booking.create({
      data: {
        reference,
        title: q.title,
        clientId: q.clientId,
        quotationId: q.id,
        inquiryId: q.inquiryId,
        categoryId: q.inquiry?.categoryId ?? null,
        eventDate: q.eventDate,
        eventEndDate: eventEnd,
        startTime: input.startTime ?? '',
        venueId: venue?.id ?? null,
        venueName: venue?.name ?? q.venue,
        city: venue?.city ?? q.inquiry?.location ?? '',
        guestCount: q.guestCount,
        currency: q.currency,
        contractValueMinor: BigInt(totals.totalMinor),
        managerId: input.managerId ?? q.client.relationshipManagerId ?? null,
        requirements: [q.inquiry?.venueRequirements, q.inquiry?.themePreferences, q.inquiry?.cateringRequirements].filter(Boolean).join('\n\n'),
        services: {
          create: pricing.lines
            .filter((l) => !l.optional || l.selected)
            .map((l, i) => ({ serviceId: l.serviceId, name: l.name, description: l.description, amountMinor: BigInt(totals.lines.find((t) => t.id === l.id)!.netMinor), sortOrder: i })),
        },
        installments: {
          create: totals.milestones.map((m, i) => ({
            label: m.label,
            amountMinor: BigInt(m.amountMinor),
            dueDate: toDateOnly(milestoneDueDate(m as Milestone, isoDate(q.eventDate), acceptedAt)),
            sortOrder: i,
          })),
        },
      },
    });
    await tx.quotation.update({ where: { id: q.id }, data: { status: 'CONVERTED' } });
    if (q.inquiryId) await tx.inquiry.update({ where: { id: q.inquiryId }, data: { status: 'WON' } });
    await tx.communication.create({ data: { kind: 'SYSTEM', direction: 'INTERNAL', subject: `Booking ${reference} created`, body: `From quotation ${q.number} v${v.version}`, clientId: q.clientId, bookingId: booking.id, authorId: userId } });
    return booking;
  });
}

/** Applies a status transition with business-rule checks. `override` lets authorised staff bypass payment rules (audited by caller). */
export async function transitionBooking(bookingId: string, to: BookingStatus, opts: { reason?: string; override?: boolean } = {}, tx: Tx = prisma): Promise<Booking> {
  const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  if (b.status === to) return b;
  if (!canTransitionBooking(b.status, to)) throw AppError.conflict(`Cannot move a booking from ${b.status} to ${to}`);
  const fin = await bookingFinancials(b.id, tx);
  const data: Partial<Booking> = { status: to };
  switch (to) {
    case 'AWAITING_ADVANCE':
      if (!b.contractSignedAt) throw AppError.conflict('Record the signed contract first');
      break;
    case 'CONFIRMED': {
      if (!b.contractSignedAt) throw AppError.conflict('Record the signed contract first');
      const first = await tx.installment.findFirst({ where: { bookingId: b.id }, orderBy: { sortOrder: 'asc' } });
      const advancePaid = !first || first.status === 'PAID' || first.status === 'WAIVED';
      if (!advancePaid && !opts.override) throw AppError.conflict('The advance payment has not been received. An authorised manager can confirm with an override reason.');
      data.confirmedAt = new Date();
      break;
    }
    case 'COMPLETED':
      if (fin.balanceMinor > 0 && !opts.override) throw AppError.conflict(`Outstanding balance of ${formatMoney(fin.balanceMinor, b.currency)}. Record the final payment or complete with an override reason.`);
      data.completedAt = new Date();
      break;
    case 'AWAITING_FINAL_PAYMENT':
      if (fin.balanceMinor === 0) {
        data.status = 'COMPLETED';
        data.completedAt = new Date();
      }
      break;
    case 'CANCELLED':
      if (!opts.reason) throw AppError.badRequest('A cancellation reason is required');
      data.cancelledAt = new Date();
      data.cancelReason = opts.reason;
      break;
  }
  const updated = await tx.booking.update({ where: { id: b.id }, data });
  if (tx === prisma) void afterTransition(updated.id, b.status, updated.status).catch((err) => logger.error({ err }, 'post-transition failed'));
  return updated;
}

/** Notifications that follow a status change (outside transactions). */
export async function afterTransition(bookingId: string, from: BookingStatus, to: BookingStatus) {
  if (from === to) return;
  const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { client: true, manager: true } });
  const vars = { name: b.client.name, title: b.title, reference: b.reference, eventDate: isoDate(b.eventDate), manager: b.manager?.name ?? 'our team', portalUrl: `${env.APP_URL}/portal/bookings/${b.id}` };
  if (to === 'CONFIRMED') {
    await sendEmail({ to: b.client.email, template: 'booking_confirmation', vars, automation: 'bookingConfirmation', dedupeKey: `booking-confirmed:${b.id}`, entityType: 'Booking', entityId: b.id });
    // Optional WhatsApp (only when enabled in settings and a provider is configured; otherwise logged as SKIPPED).
    if (b.client.phone) await sendWhatsApp(b.client.phone, `Your event “${b.title}” on ${vars.eventDate} is confirmed. Details: ${vars.portalUrl}`, { dedupeKey: `wa-confirmed:${b.id}`, entityType: 'Booking', entityId: b.id });
  }
  if (to === 'COMPLETED') {
    await sendEmail({ to: b.client.email, template: 'event_completion', vars, automation: 'eventCompletion', dedupeKey: `booking-completed:${b.id}`, entityType: 'Booking', entityId: b.id });
    await sendEmail({ to: b.client.email, template: 'feedback_request', vars: { ...vars, portalUrl: `${env.APP_URL}/portal/bookings/${b.id}?feedback=1` }, automation: 'feedbackRequest', dedupeKey: `feedback:${b.id}`, entityType: 'Booking', entityId: b.id });
  }
  if (b.client.userId) await notifyUser(b.client.userId, `Your event status: ${to.replace(/_/g, ' ').toLowerCase()}`, b.title, `/portal/bookings/${b.id}`);
}

/** After a payment is applied: auto-advance AWAITING_ADVANCE → CONFIRMED and AWAITING_FINAL_PAYMENT → COMPLETED. */
export async function autoAdvanceAfterPayment(bookingId: string, tx: Tx) {
  const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
  if (b.status === 'AWAITING_ADVANCE' && b.contractSignedAt) {
    const first = await tx.installment.findFirst({ where: { bookingId }, orderBy: { sortOrder: 'asc' } });
    if (first && (first.status === 'PAID' || first.status === 'WAIVED')) {
      await tx.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
      return { from: b.status, to: 'CONFIRMED' as BookingStatus };
    }
  }
  if (b.status === 'AWAITING_FINAL_PAYMENT') {
    const fin = await bookingFinancials(bookingId, tx);
    if (fin.balanceMinor === 0) {
      await tx.booking.update({ where: { id: bookingId }, data: { status: 'COMPLETED', completedAt: new Date() } });
      return { from: b.status, to: 'COMPLETED' as BookingStatus };
    }
  }
  return null;
}

/** Refund amount suggested by the business refund rules for a cancellation (staff still approve). */
export function suggestedRefund(paidMinor: number, eventDate: Date, rules: { daysBefore: number; refundBps: number }[], today = new Date()) {
  const days = Math.floor((eventDate.getTime() - today.getTime()) / 864e5);
  const rule = [...rules].sort((a, b) => b.daysBefore - a.daysBefore).find((r) => days >= r.daysBefore);
  const bps = rule?.refundBps ?? 0;
  return { daysBeforeEvent: days, refundBps: bps, amountMinor: Math.floor((paidMinor * bps) / 10_000) };
}
