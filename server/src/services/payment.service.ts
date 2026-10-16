import type { Payment } from '@prisma/client';
import { formatMoney } from '@maison/shared';
import { prisma, type Tx } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../lib/AppError';
import { afterTransition, autoAdvanceAfterPayment, bookingFinancials } from './booking.service';
import { notifyStaffWith, sendEmail } from './notify.service';
import { paymentProvider } from './payments';

const PAYABLE_STATUSES = ['AWAITING_ADVANCE', 'CONFIRMED', 'IN_PROGRESS', 'AWAITING_FINAL_PAYMENT'];

/**
 * Creates a provider order for an installment (or the remaining balance). The amount is computed on the
 * server from the installment — the client never supplies an amount.
 */
export async function createOrder(bookingId: string, installmentId: string | null, initiatedById: string) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  if (!PAYABLE_STATUSES.includes(booking.status)) throw AppError.conflict(booking.status === 'AWAITING_CONTRACT' ? 'Payments open once your agreement has been signed.' : 'This booking is not accepting payments');
  const fin = await bookingFinancials(bookingId);
  if (fin.balanceMinor <= 0) throw AppError.conflict('Nothing is outstanding on this booking');
  let amount = fin.balanceMinor;
  let label = 'Outstanding balance';
  if (installmentId) {
    const inst = await prisma.installment.findFirst({ where: { id: installmentId, bookingId } });
    if (!inst) throw AppError.notFound('Instalment');
    if (inst.status === 'PAID' || inst.status === 'WAIVED') throw AppError.conflict('This instalment is already settled');
    amount = Math.min(Number(inst.amountMinor) - Number(inst.paidMinor), fin.balanceMinor);
    label = inst.label;
  }
  if (amount < 100) throw AppError.badRequest('Amount is too small to pay online');
  // Reuse a recent unpaid order for the same target to avoid duplicates on double-click.
  const recent = await prisma.payment.findFirst({
    where: { bookingId, installmentId, status: 'CREATED', amountMinor: BigInt(amount), provider: paymentProvider.name, createdAt: { gt: new Date(Date.now() - 20 * 60_000) } },
  });
  if (recent?.providerOrderId) return { payment: recent, order: { orderId: recent.providerOrderId, amountMinor: amount, currency: booking.currency, keyId: env.RAZORPAY_KEY_ID }, label };
  const order = await paymentProvider.createOrder({ amountMinor: amount, currency: booking.currency, receipt: booking.reference, notes: { bookingId, installmentId: installmentId ?? '' } });
  const payment = await prisma.payment.create({
    data: { bookingId, installmentId, provider: paymentProvider.name, providerOrderId: order.orderId, amountMinor: BigInt(amount), currency: booking.currency, status: 'CREATED', initiatedById },
  });
  return { payment, order, label };
}

/** Applies a verified payment to its installment/invoice and advances the booking. Must run inside a transaction. */
async function applyPayment(tx: Tx, payment: Payment) {
  const amount = Number(payment.amountMinor);
  if (payment.installmentId) {
    const inst = await tx.installment.findUniqueOrThrow({ where: { id: payment.installmentId } });
    const paid = Number(inst.paidMinor) + amount;
    await tx.installment.update({ where: { id: inst.id }, data: { paidMinor: BigInt(paid), status: paid >= Number(inst.amountMinor) ? 'PAID' : 'PARTIAL' } });
  } else {
    // Balance payment: allocate across open installments in order.
    let remaining = amount;
    const open = await tx.installment.findMany({ where: { bookingId: payment.bookingId, status: { in: ['PENDING', 'PARTIAL'] } }, orderBy: { sortOrder: 'asc' } });
    for (const inst of open) {
      if (remaining <= 0) break;
      const due = Number(inst.amountMinor) - Number(inst.paidMinor);
      const take = Math.min(due, remaining);
      remaining -= take;
      const paid = Number(inst.paidMinor) + take;
      await tx.installment.update({ where: { id: inst.id }, data: { paidMinor: BigInt(paid), status: paid >= Number(inst.amountMinor) ? 'PAID' : 'PARTIAL' } });
    }
  }
  // Invoice linked directly or via installment.
  const invoice = payment.invoiceId
    ? await tx.invoice.findUnique({ where: { id: payment.invoiceId } })
    : payment.installmentId
      ? await tx.invoice.findFirst({ where: { installmentId: payment.installmentId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } } })
      : null;
  if (invoice) {
    const paid = Number(invoice.paidMinor) + amount;
    await tx.invoice.update({ where: { id: invoice.id }, data: { paidMinor: BigInt(paid), status: paid >= Number(invoice.totalMinor) ? 'PAID' : 'PARTIALLY_PAID' } });
    if (!payment.invoiceId) await tx.payment.update({ where: { id: payment.id }, data: { invoiceId: invoice.id } });
  }
  return autoAdvanceAfterPayment(payment.bookingId, tx);
}

/**
 * Idempotent capture. Safe to call from the checkout callback AND the webhook, in any order, any number
 * of times: the payment row is locked, and a PAID payment is never applied twice.
 */
export async function markCaptured(orderId: string, providerPaymentId: string, amountMinor: number, method: string) {
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Payment" WHERE "providerOrderId" = ${orderId} FOR UPDATE`;
    if (!rows.length) throw AppError.notFound('Payment order');
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: rows[0].id } });
    if (payment.status === 'PAID' || payment.status === 'PARTIALLY_REFUNDED' || payment.status === 'REFUNDED') return { payment, applied: false, transition: null };
    if (amountMinor !== Number(payment.amountMinor)) {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: `Amount mismatch: expected ${payment.amountMinor}, got ${amountMinor}` } });
      throw new AppError(400, 'AMOUNT_MISMATCH', 'Payment amount did not match the order. Our team has been alerted.');
    }
    const updated = await tx.payment.update({ where: { id: payment.id }, data: { status: 'PAID', providerPaymentId, method, paidAt: new Date(), failureReason: '' } });
    const transition = await applyPayment(tx, updated);
    return { payment: updated, applied: true, transition };
  });
  if (result.applied) void afterPaymentRecorded(result.payment.id, result.transition).catch((err) => logger.error({ err }, 'after payment failed'));
  return result.payment;
}

async function afterPaymentRecorded(paymentId: string, transition: Awaited<ReturnType<typeof autoAdvanceAfterPayment>>) {
  const p = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { booking: { include: { client: true } } } });
  const fin = await bookingFinancials(p.bookingId);
  await sendEmail({
    to: p.booking.client.email,
    template: 'payment_confirmation',
    automation: 'paymentConfirmation',
    vars: { name: p.booking.client.name, amount: formatMoney(Number(p.amountMinor), p.currency), title: p.booking.title, reference: p.booking.reference, balance: formatMoney(fin.balanceMinor, p.currency), portalUrl: `${env.APP_URL}/portal/bookings/${p.bookingId}` },
    dedupeKey: `payment:${p.id}`,
    entityType: 'Payment',
    entityId: p.id,
  });
  await notifyStaffWith('finance.view', `Payment received ${formatMoney(Number(p.amountMinor), p.currency)}`, `${p.booking.reference} · ${p.booking.title}`, `/admin/bookings/${p.bookingId}`);
  if (transition) await afterTransition(p.bookingId, transition.from, transition.to);
}

/** Checkout callback: verify signature, then confirm with the provider before marking paid. */
export async function verifyCheckout(orderId: string, paymentId: string, signature: string) {
  if (!paymentProvider.verifyPaymentSignature(orderId, paymentId, signature)) throw new AppError(400, 'INVALID_SIGNATURE', 'Payment verification failed');
  const remote = await paymentProvider.fetchPayment(paymentId);
  if (remote.orderId !== orderId) throw new AppError(400, 'INVALID_PAYMENT', 'Payment does not belong to this order');
  if (remote.status === 'failed') {
    await prisma.payment.updateMany({ where: { providerOrderId: orderId, status: 'CREATED' }, data: { status: 'FAILED', failureReason: 'Declined by provider' } });
    throw new AppError(402, 'PAYMENT_FAILED', 'The payment was declined. No money was taken.');
  }
  if (remote.status !== 'captured') throw new AppError(409, 'PAYMENT_PENDING', 'Payment is still processing. We will update your booking as soon as it is confirmed.');
  return markCaptured(orderId, paymentId, remote.amountMinor, remote.method);
}

export async function markFailed(orderId: string, reason: string) {
  await prisma.payment.updateMany({ where: { providerOrderId: orderId, status: 'CREATED' }, data: { status: 'FAILED', failureReason: reason.slice(0, 300) } });
}

/** Razorpay-style webhook handling with event de-duplication. */
export async function handleWebhook(rawBody: Buffer, signature: string) {
  if (!signature || !paymentProvider.verifyWebhookSignature(rawBody, signature)) throw new AppError(400, 'INVALID_SIGNATURE', 'Invalid webhook signature');
  const evt = JSON.parse(rawBody.toString('utf8')) as {
    id?: string;
    event: string;
    payload?: { payment?: { entity: { id: string; order_id: string; amount: number; method: string; error_description?: string } }; refund?: { entity: { id: string; payment_id: string; amount: number; status: string } } };
  };
  const eventId = evt.id ?? `${evt.event}:${evt.payload?.payment?.entity.id ?? evt.payload?.refund?.entity.id ?? 'unknown'}`;
  const inserted = await prisma.webhookEvent.createMany({ data: [{ provider: paymentProvider.name, eventId, type: evt.event, payload: evt as object }], skipDuplicates: true });
  if (inserted.count === 0) return { duplicate: true };
  try {
    const pay = evt.payload?.payment?.entity;
    if ((evt.event === 'payment.captured' || evt.event === 'order.paid') && pay) await markCaptured(pay.order_id, pay.id, pay.amount, pay.method);
    else if (evt.event === 'payment.failed' && pay) await markFailed(pay.order_id, pay.error_description ?? 'Payment failed');
    else if (evt.event === 'refund.processed' && evt.payload?.refund) {
      await prisma.refund.updateMany({ where: { providerRefundId: evt.payload.refund.entity.id, status: { not: 'PROCESSED' } }, data: { status: 'PROCESSED', processedAt: new Date() } });
    }
    await prisma.webhookEvent.update({ where: { provider_eventId: { provider: paymentProvider.name, eventId } }, data: { processedAt: new Date() } });
  } catch (err) {
    await prisma.webhookEvent.update({ where: { provider_eventId: { provider: paymentProvider.name, eventId } }, data: { error: (err as Error).message.slice(0, 500) } });
    if (!(err instanceof AppError) || err.status >= 500) throw err;
  }
  return { duplicate: false };
}

/** Manual (bank transfer / cash / cheque) payment recorded by authorised finance staff. */
export async function recordManualPayment(input: { bookingId: string; installmentId: string | null; invoiceId: string | null; amountMinor: number; method: string; reference: string; paidAt: Date; recordedById: string }) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Booking" WHERE id = ${input.bookingId} FOR UPDATE`;
    const booking = await tx.booking.findUniqueOrThrow({ where: { id: input.bookingId } });
    if (booking.status === 'CANCELLED') throw AppError.conflict('Cannot record payments on a cancelled booking');
    if (input.installmentId && !(await tx.installment.findFirst({ where: { id: input.installmentId, bookingId: booking.id } }))) throw AppError.notFound('Instalment');
    if (input.invoiceId && !(await tx.invoice.findFirst({ where: { id: input.invoiceId, bookingId: booking.id } }))) throw AppError.notFound('Invoice');
    const fin = await bookingFinancials(booking.id, tx);
    if (input.amountMinor > fin.balanceMinor) throw AppError.badRequest(`Amount exceeds the outstanding balance (${formatMoney(fin.balanceMinor, booking.currency)})`);
    if (input.reference) {
      const dup = await tx.payment.findFirst({ where: { bookingId: booking.id, provider: 'manual', reference: input.reference, status: 'PAID' } });
      if (dup) throw AppError.conflict('A payment with this reference has already been recorded');
    }
    const payment = await tx.payment.create({
      data: {
        bookingId: booking.id,
        installmentId: input.installmentId,
        invoiceId: input.invoiceId,
        provider: 'manual',
        amountMinor: BigInt(input.amountMinor),
        currency: booking.currency,
        status: 'PAID',
        method: input.method,
        reference: input.reference,
        recordedById: input.recordedById,
        paidAt: input.paidAt,
      },
    });
    const transition = await applyPayment(tx, payment);
    return { payment, transition };
  });
  void afterPaymentRecorded(result.payment.id, result.transition).catch((err) => logger.error({ err }, 'after manual payment failed'));
  return result.payment;
}

/* ───── Refunds: request → approve (refunds.approve) → process ───── */

export async function requestRefund(paymentId: string, amountMinor: number, reason: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { refunds: true } });
    if (!['PAID', 'PARTIALLY_REFUNDED'].includes(p.status)) throw AppError.conflict('Only received payments can be refunded');
    const pending = p.refunds.filter((r) => ['REQUESTED', 'APPROVED'].includes(r.status)).reduce((s, r) => s + Number(r.amountMinor), 0);
    const refundable = Number(p.amountMinor) - Number(p.refundedMinor) - pending;
    if (amountMinor <= 0 || amountMinor > refundable) throw AppError.badRequest(`Refund must be between 0.01 and ${formatMoney(refundable, p.currency)}`);
    return tx.refund.create({ data: { paymentId, amountMinor: BigInt(amountMinor), reason, requestedById: userId } });
  });
}

export async function decideRefund(refundId: string, approve: boolean, userId: string, manualReference = '') {
  const refund = await prisma.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
  if (refund.status !== 'REQUESTED') throw AppError.conflict('This refund has already been decided');
  if (!approve) return prisma.refund.update({ where: { id: refundId }, data: { status: 'REJECTED', approvedById: userId } });
  const claimed = await prisma.refund.updateMany({ where: { id: refundId, status: 'REQUESTED' }, data: { status: 'APPROVED', approvedById: userId } });
  if (claimed.count !== 1) throw AppError.conflict('This refund has already been decided');

  let providerRefundId: string | null = null;
  let processed = true;
  if (refund.payment.provider !== 'manual') {
    try {
      const r = await paymentProvider.refund(refund.payment.providerPaymentId!, Number(refund.amountMinor), { refundId });
      providerRefundId = r.refundId;
      processed = r.status === 'processed';
    } catch (err) {
      await prisma.refund.update({ where: { id: refundId }, data: { status: 'FAILED' } });
      throw new AppError(502, 'REFUND_FAILED', `The payment provider rejected the refund: ${(err as Error).message}`);
    }
  } else providerRefundId = manualReference ? `manual:${refundId}:${manualReference}`.slice(0, 120) : null;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${refund.paymentId} FOR UPDATE`;
    const p = await tx.payment.findUniqueOrThrow({ where: { id: refund.paymentId } });
    const refunded = Number(p.refundedMinor) + Number(refund.amountMinor);
    await tx.payment.update({ where: { id: p.id }, data: { refundedMinor: BigInt(refunded), status: refunded >= Number(p.amountMinor) ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
    return tx.refund.update({ where: { id: refundId }, data: { status: processed ? 'PROCESSED' : 'APPROVED', providerRefundId, processedAt: processed ? new Date() : null } });
  });
}
