import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { AppError } from '../lib/AppError';
import { toCsv } from '../lib/csv';
import { isoDate, toDateOnly } from '../lib/dates';
import { ah, ok, pageMeta, paginate, qry } from '../lib/http';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { audit } from '../services/audit.service';
import { issueFinalInvoice, issueInstallmentInvoice, renderInvoicePdf } from '../services/invoice.service';
import { decideRefund, recordManualPayment, requestRefund } from '../services/payment.service';
import { storeFile, privateFileAccess } from '../services/storage.service';
import { upload } from './media.routes';

export const financeRouter = Router();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const range = z.object({ from: dateStr.optional(), to: dateStr.optional() });
const between = (from?: string, to?: string) => (from || to ? { ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59Z`) } : {}) } : undefined);

/* ───── Invoices ───── */

financeRouter.get(
  '/invoices',
  requirePermission('finance.view'),
  validate({ query: range.extend({ page: z.coerce.number().optional(), limit: z.coerce.number().optional(), status: z.enum(['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID']).optional(), q: z.string().max(100).optional(), bookingId: z.string().optional() }) }),
  ah(async (req, res) => {
    const q = qry<{ page?: number; limit?: number; status?: 'ISSUED'; q?: string; from?: string; to?: string; bookingId?: string }>(req);
    const { page, limit, skip, take } = paginate(q);
    const where: Prisma.InvoiceWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.bookingId ? { bookingId: q.bookingId } : {}),
      ...(between(q.from, q.to) ? { issuedAt: between(q.from, q.to) } : {}),
      ...(q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { booking: { reference: { contains: q.q, mode: 'insensitive' } } }, { booking: { client: { name: { contains: q.q, mode: 'insensitive' } } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.invoice.findMany({ where, orderBy: { issuedAt: 'desc' }, skip, take, include: { booking: { select: { id: true, reference: true, title: true, client: { select: { name: true } } } } } }),
      prisma.invoice.count({ where }),
    ]);
    ok(res, items, pageMeta(page, limit, total));
  }),
);

financeRouter.post(
  '/invoices',
  requirePermission('finance.manage'),
  validate({ body: z.object({ kind: z.enum(['INSTALLMENT', 'FINAL']), installmentId: z.string().optional(), bookingId: z.string().optional(), notes: z.string().max(1000).default('') }) }),
  ah(async (req, res) => {
    const inv =
      req.body.kind === 'INSTALLMENT'
        ? await issueInstallmentInvoice(req.body.installmentId ?? '', req.user!.id)
        : await issueFinalInvoice(req.body.bookingId ?? '', req.user!.id, req.body.notes);
    await audit(req, { action: 'invoice.issue', entityType: 'Invoice', entityId: inv.id, summary: inv.number });
    ok(res, inv, undefined, 201);
  }),
);

financeRouter.post(
  '/invoices/:id/void',
  requirePermission('finance.manage'),
  validate({ body: z.object({ reason: z.string().trim().min(3).max(300) }) }),
  ah(async (req, res) => {
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: req.params.id } });
    if (Number(inv.paidMinor) > 0) throw AppError.conflict('Invoices with recorded payments cannot be voided');
    await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'VOID', notes: `${inv.notes}\nVOID: ${req.body.reason}`.trim() } });
    await audit(req, { action: 'invoice.void', entityType: 'Invoice', entityId: inv.id, summary: req.body.reason });
    ok(res, { ok: true });
  }),
);

financeRouter.get(
  '/invoices/:id/pdf',
  requirePermission('finance.view'),
  ah(async (req, res) => {
    const { pdf, filename } = await renderInvoicePdf(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(pdf);
  }),
);

/* ───── Payments ───── */

const paymentsQuery = range.extend({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  status: z.enum(['CREATED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']).optional(),
  provider: z.string().max(20).optional(),
  bookingId: z.string().optional(),
  q: z.string().max(100).optional(),
});
type PaymentsQ = z.infer<typeof paymentsQuery>;
const paymentsWhere = (q: PaymentsQ): Prisma.PaymentWhereInput => ({
  ...(q.status ? { status: q.status } : {}),
  ...(q.provider ? { provider: q.provider } : {}),
  ...(q.bookingId ? { bookingId: q.bookingId } : {}),
  ...(between(q.from, q.to) ? { OR: [{ paidAt: between(q.from, q.to) }, { paidAt: null, createdAt: between(q.from, q.to) }] } : {}),
  ...(q.q ? { booking: { OR: [{ reference: { contains: q.q, mode: 'insensitive' } }, { client: { name: { contains: q.q, mode: 'insensitive' } } }] } } : {}),
});

financeRouter.get(
  '/payments',
  requirePermission('finance.view'),
  validate({ query: paymentsQuery }),
  ah(async (req, res) => {
    const q = qry<PaymentsQ>(req);
    const { page, limit, skip, take } = paginate(q);
    const where = paymentsWhere(q);
    const [items, total] = await Promise.all([
      prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { booking: { select: { id: true, reference: true, title: true, client: { select: { name: true } } } }, installment: { select: { label: true } }, refunds: true } }),
      prisma.payment.count({ where }),
    ]);
    ok(res, items, pageMeta(page, limit, total));
  }),
);

financeRouter.get(
  '/payments/export.csv',
  requirePermission('finance.view'),
  validate({ query: paymentsQuery }),
  ah(async (req, res) => {
    const rows = await prisma.payment.findMany({ where: paymentsWhere(qry<PaymentsQ>(req)), orderBy: { createdAt: 'desc' }, take: 20_000, include: { booking: { select: { reference: true, client: { select: { name: true } } } } } });
    await audit(req, { action: 'payments.export', entityType: 'Payment', summary: `${rows.length} rows` });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="payments-${isoDate(new Date())}.csv"`);
    res.send(toCsv(rows.map((p) => ({ date: p.paidAt ?? p.createdAt, booking: p.booking.reference, client: p.booking.client.name, provider: p.provider, method: p.method, reference: p.reference || p.providerPaymentId || '', status: p.status, amount: Number(p.amountMinor) / 100, refunded: Number(p.refundedMinor) / 100, currency: p.currency }))));
  }),
);

financeRouter.post(
  '/payments/manual',
  requirePermission('finance.manage'),
  validate({
    body: z.object({
      bookingId: z.string(),
      installmentId: z.string().nullable().default(null),
      invoiceId: z.string().nullable().default(null),
      amountMinor: z.number().int().min(1),
      method: z.enum(['bank_transfer', 'cash', 'cheque', 'upi', 'card_terminal', 'other']),
      reference: z.string().trim().min(2, 'Enter the bank / cheque / receipt reference').max(120),
      paidAt: dateStr,
    }),
  }),
  ah(async (req, res) => {
    const p = await recordManualPayment({ ...req.body, paidAt: new Date(`${req.body.paidAt}T12:00:00Z`), recordedById: req.user!.id });
    await audit(req, { action: 'payment.manual_record', entityType: 'Payment', entityId: p.id, summary: `${req.body.method} ${req.body.amountMinor / 100} ref ${req.body.reference}`, changes: req.body });
    ok(res, p, undefined, 201);
  }),
);

/* ───── Refunds ───── */

financeRouter.get(
  '/refunds',
  requirePermission('finance.view'),
  ah(async (_req, res) => {
    ok(res, await prisma.refund.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { payment: { select: { id: true, provider: true, amountMinor: true, currency: true, booking: { select: { id: true, reference: true, client: { select: { name: true } } } } } } } }));
  }),
);

financeRouter.post(
  '/refunds',
  requirePermission('finance.manage'),
  validate({ body: z.object({ paymentId: z.string(), amountMinor: z.number().int().min(1), reason: z.string().trim().min(3).max(500) }) }),
  ah(async (req, res) => {
    const r = await requestRefund(req.body.paymentId, req.body.amountMinor, req.body.reason, req.user!.id);
    await audit(req, { action: 'refund.request', entityType: 'Refund', entityId: r.id, summary: `${req.body.amountMinor / 100}: ${req.body.reason}` });
    ok(res, r, undefined, 201);
  }),
);

financeRouter.post(
  '/refunds/:id/decide',
  requirePermission('refunds.approve'),
  validate({ body: z.object({ approve: z.boolean(), manualReference: z.string().trim().max(120).default('') }) }),
  ah(async (req, res) => {
    const refund = await prisma.refund.findUniqueOrThrow({ where: { id: req.params.id } });
    if (req.body.approve && refund.requestedById === req.user!.id && req.user!.roleKey !== 'SUPER_ADMIN' && req.user!.roleKey !== 'OWNER') {
      throw AppError.forbidden('A refund must be approved by someone other than the requester');
    }
    const r = await decideRefund(refund.id, req.body.approve, req.user!.id, req.body.manualReference);
    await audit(req, { action: req.body.approve ? 'refund.approve' : 'refund.reject', entityType: 'Refund', entityId: r.id, summary: r.status });
    ok(res, r);
  }),
);

/* ───── Expenses (incl. vendor payments) ───── */

const expenseInput = z.object({
  bookingId: z.string().nullable().default(null),
  vendorId: z.string().nullable().default(null),
  assignmentId: z.string().nullable().default(null),
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(300),
  amountMinor: z.number().int().min(1),
  currency: z.string().length(3).default('INR'),
  incurredOn: dateStr,
  status: z.enum(['UNPAID', 'PAID']).default('UNPAID'),
  paidOn: dateStr.nullable().default(null),
  reference: z.string().trim().max(120).default(''),
});

const expenseQuery = range.extend({ page: z.coerce.number().optional(), limit: z.coerce.number().optional(), bookingId: z.string().optional(), vendorId: z.string().optional(), category: z.string().optional(), status: z.enum(['UNPAID', 'PAID']).optional() });

financeRouter.get(
  '/expenses',
  requirePermission('finance.view'),
  validate({ query: expenseQuery }),
  ah(async (req, res) => {
    const q = qry<z.infer<typeof expenseQuery>>(req);
    const { page, limit, skip, take } = paginate(q);
    const where: Prisma.ExpenseWhereInput = {
      ...(q.bookingId ? { bookingId: q.bookingId } : {}),
      ...(q.vendorId ? { vendorId: q.vendorId } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.from || q.to ? { incurredOn: { ...(q.from ? { gte: toDateOnly(q.from)! } : {}), ...(q.to ? { lte: toDateOnly(q.to)! } : {}) } } : {}),
    };
    const [items, total, sum] = await Promise.all([
      prisma.expense.findMany({ where, orderBy: { incurredOn: 'desc' }, skip, take, include: { booking: { select: { id: true, reference: true } }, vendor: { select: { id: true, name: true } } } }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({ where, _sum: { amountMinor: true } }),
    ]);
    ok(res, items.map((e) => ({ ...e, incurredOn: isoDate(e.incurredOn), paidOn: isoDate(e.paidOn) })), { ...pageMeta(page, limit, total), totalMinor: Number(sum._sum.amountMinor ?? 0) });
  }),
);

const toExpenseData = (b: z.infer<typeof expenseInput>) => ({ ...b, amountMinor: BigInt(b.amountMinor), incurredOn: toDateOnly(b.incurredOn)!, paidOn: toDateOnly(b.paidOn) });

financeRouter.post(
  '/expenses',
  requirePermission('finance.manage'),
  validate({ body: expenseInput }),
  ah(async (req, res) => {
    const e = await prisma.expense.create({ data: { ...toExpenseData(req.body), createdById: req.user!.id } });
    await audit(req, { action: 'expense.create', entityType: 'Expense', entityId: e.id, summary: `${e.description} ${req.body.amountMinor / 100}` });
    ok(res, e, undefined, 201);
  }),
);

financeRouter.put(
  '/expenses/:id',
  requirePermission('finance.manage'),
  validate({ body: expenseInput }),
  ah(async (req, res) => {
    const e = await prisma.expense.update({ where: { id: req.params.id }, data: toExpenseData(req.body) });
    await audit(req, { action: 'expense.update', entityType: 'Expense', entityId: e.id });
    ok(res, e);
  }),
);

financeRouter.delete(
  '/expenses/:id',
  requirePermission('finance.manage'),
  ah(async (req, res) => {
    const e = await prisma.expense.findUniqueOrThrow({ where: { id: req.params.id } });
    await prisma.expense.delete({ where: { id: e.id } });
    await audit(req, { action: 'expense.delete', entityType: 'Expense', entityId: e.id, summary: `${e.description} ${Number(e.amountMinor) / 100}` });
    ok(res, { ok: true });
  }),
);

financeRouter.post(
  '/expenses/:id/receipt',
  requirePermission('finance.manage'),
  upload.single('file'),
  ah(async (req, res) => {
    const e = await prisma.expense.findUniqueOrThrow({ where: { id: req.params.id } });
    if (!req.file) throw AppError.badRequest('Choose a file');
    const stored = await storeFile(req.file.buffer, req.file.originalname, { isPrivate: true, allow: ['DOCUMENT', 'IMAGE'] });
    const m = await prisma.mediaAsset.create({ data: { ...stored, isPrivate: true, folder: 'receipts', filename: req.file.originalname.slice(0, 200), uploadedById: req.user!.id, tags: [] } });
    ok(res, await prisma.expense.update({ where: { id: e.id }, data: { receiptMediaId: m.id } }));
  }),
);

financeRouter.get(
  '/expenses/:id/receipt',
  requirePermission('finance.view'),
  ah(async (req, res) => {
    const e = await prisma.expense.findUniqueOrThrow({ where: { id: req.params.id } });
    if (!e.receiptMediaId) throw AppError.notFound('Receipt');
    const m = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: e.receiptMediaId } });
    const access = privateFileAccess(m.provider, m.storageKey!, m.mime);
    if (access.redirect) return res.redirect(access.redirect);
    res.setHeader('Content-Type', m.mime);
    access.stream!.pipe(res);
  }),
);
