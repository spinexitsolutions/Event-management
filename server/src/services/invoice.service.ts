import { prisma } from '../config/db';
import { AppError } from '../lib/AppError';
import { isoDate } from '../lib/dates';
import { bookingFinancials } from './booking.service';
import { nextNumber } from './counter.service';
import { invoicePdf } from './pdf.service';
import { getBusiness } from './siteConfig.service';

/**
 * Invoices are documents over the booking's contract value. Amounts are tax-inclusive slices of the
 * contract (the quotation already contained taxes), so invoice tax is reported as 0 unless entered manually.
 */
export async function issueInstallmentInvoice(installmentId: string, userId: string) {
  const biz = await getBusiness();
  return prisma.$transaction(async (tx) => {
    const inst = await tx.installment.findUnique({ where: { id: installmentId }, include: { booking: true, invoices: { where: { status: { not: 'VOID' } } } } });
    if (!inst) throw AppError.notFound('Instalment');
    if (inst.invoices.length) throw AppError.conflict('An invoice already exists for this instalment');
    if (inst.booking.status === 'CANCELLED') throw AppError.conflict('Booking is cancelled');
    const number = await nextNumber(biz.invoice.prefix || 'INV', tx);
    const amount = Number(inst.amountMinor);
    const paid = Number(inst.paidMinor);
    return tx.invoice.create({
      data: {
        number,
        bookingId: inst.bookingId,
        installmentId: inst.id,
        kind: 'INSTALLMENT',
        lines: [{ description: `${inst.label} — ${inst.booking.title}`, amountMinor: amount }],
        subtotalMinor: BigInt(amount),
        totalMinor: BigInt(amount),
        paidMinor: BigInt(Math.min(paid, amount)),
        currency: inst.booking.currency,
        status: paid >= amount ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'ISSUED',
        dueDate: inst.dueDate,
        createdById: userId,
      },
    });
  });
}

/** Final invoice: full contract, all services, minus everything received. */
export async function issueFinalInvoice(bookingId: string, userId: string, notes = '') {
  const biz = await getBusiness();
  const fin = await bookingFinancials(bookingId);
  return prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { services: { orderBy: { sortOrder: 'asc' } }, invoices: { where: { kind: 'FINAL', status: { not: 'VOID' } } }, quotation: { include: { versions: true } } } });
    if (b.invoices.length) throw AppError.conflict('A final invoice already exists. Void it first to reissue.');
    if (!['IN_PROGRESS', 'AWAITING_FINAL_PAYMENT', 'COMPLETED'].includes(b.status)) throw AppError.conflict('Final invoices are issued once the event is in execution or complete');
    const lines: { description: string; amountMinor: number }[] = b.services.map((s) => ({ description: s.name, amountMinor: Number(s.amountMinor) }));
    const servicesTotal = lines.reduce((s, l) => s + l.amountMinor, 0);
    const adjustments = fin.contractValueMinor - servicesTotal;
    if (adjustments !== 0) lines.push({ description: adjustments > 0 ? 'Taxes, fees and adjustments' : 'Discounts and adjustments', amountMinor: adjustments });
    const number = await nextNumber(biz.invoice.prefix || 'INV', tx);
    return tx.invoice.create({
      data: {
        number,
        bookingId,
        kind: 'FINAL',
        lines,
        subtotalMinor: BigInt(fin.contractValueMinor),
        totalMinor: BigInt(fin.contractValueMinor),
        paidMinor: BigInt(Math.min(fin.paidMinor, fin.contractValueMinor)),
        currency: b.currency,
        status: fin.balanceMinor === 0 ? 'PAID' : fin.paidMinor > 0 ? 'PARTIALLY_PAID' : 'ISSUED',
        notes: notes || `Payments received: ${fin.paidMinor / 100}. Balance due: ${fin.balanceMinor / 100}.`,
        createdById: userId,
      },
    });
  });
}

export async function renderInvoicePdf(invoiceId: string) {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { booking: { include: { client: true } } } });
  if (!inv) throw AppError.notFound('Invoice');
  const pdf = await invoicePdf({
    number: inv.number,
    issuedAt: inv.issuedAt,
    dueDate: isoDate(inv.dueDate),
    status: inv.status,
    currency: inv.currency,
    clientName: inv.booking.client.name,
    clientEmail: inv.booking.client.email,
    bookingRef: inv.booking.reference,
    bookingTitle: inv.booking.title,
    eventDate: isoDate(inv.booking.eventDate),
    lines: inv.lines as { description: string; amountMinor: number }[],
    subtotalMinor: Number(inv.subtotalMinor),
    taxMinor: Number(inv.taxMinor),
    totalMinor: Number(inv.totalMinor),
    paidMinor: Number(inv.paidMinor),
    notes: inv.notes,
  });
  return { pdf, filename: `${inv.number}.pdf` };
}
