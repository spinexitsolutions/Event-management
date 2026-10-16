import { Router } from 'express';
import { z } from 'zod';
import { ACTIVE_BOOKING_STATUSES, CONFIRMED_BOOKING_STATUSES } from '@maison/shared';
import { prisma } from '../config/db';
import { toCsv } from '../lib/csv';
import { isoDate } from '../lib/dates';
import { ah, ok, qry } from '../lib/http';
import { can, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';

/**
 * Dashboard & reports. Definitions (kept deliberately strict):
 *  - Quotation value: totals of quotations sent (an estimate, never revenue).
 *  - Confirmed contract value: contract value of bookings in CONFIRMED or later (not cancelled).
 *  - Payments received: verified PAID payments minus processed refunds, by payment date.
 *  - Outstanding: contract value of active/completed bookings minus payments received on them.
 */
export const reportsRouter = Router();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangeQuery = z.object({ from: dateStr.optional(), to: dateStr.optional() });

function resolveRange(q: { from?: string; to?: string }) {
  const to = q.to ? new Date(`${q.to}T23:59:59.999Z`) : new Date();
  const from = q.from ? new Date(`${q.from}T00:00:00Z`) : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1));
  return { from, to };
}
const n = (v: bigint | number | null | undefined) => Number(v ?? 0);
const monthKey = (d: Date) => d.toISOString().slice(0, 7);
function months(from: Date, to: Date) {
  const out: string[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (d <= to && out.length < 36) {
    out.push(monthKey(d));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

async function paymentsReceived(from: Date, to: Date) {
  const pays = await prisma.payment.findMany({ where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, paidAt: { gte: from, lte: to } }, select: { amountMinor: true, paidAt: true } });
  const refunds = await prisma.refund.findMany({ where: { status: 'PROCESSED', processedAt: { gte: from, lte: to } }, select: { amountMinor: true, processedAt: true } });
  return { pays, refunds, total: pays.reduce((s, p) => s + n(p.amountMinor), 0) - refunds.reduce((s, r) => s + n(r.amountMinor), 0) };
}

async function outstanding() {
  const bookings = await prisma.booking.findMany({ where: { status: { in: [...ACTIVE_BOOKING_STATUSES, 'COMPLETED'] } }, select: { id: true, contractValueMinor: true } });
  const paid = await prisma.payment.groupBy({ by: ['bookingId'], where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, _sum: { amountMinor: true, refundedMinor: true } });
  const paidBy = new Map(paid.map((p) => [p.bookingId, n(p._sum.amountMinor) - n(p._sum.refundedMinor)]));
  return bookings.reduce((s, b) => s + Math.max(0, n(b.contractValueMinor) - (paidBy.get(b.id) ?? 0)), 0);
}

reportsRouter.get(
  '/dashboard',
  requirePermission('dashboard.view'),
  validate({ query: rangeQuery }),
  ah(async (req, res) => {
    const { from, to } = resolveRange(qry<{ from?: string; to?: string }>(req));
    const finance = can(req.user, 'finance.view');
    const today = new Date(new Date().toISOString().slice(0, 10));
    const [inquiriesTotal, inquiriesNew, statusGroups, upcoming, inProgress, completed, confirmedCount, quotesSent, pendingQuotes, clientsTotal, clientsNew, recent, upcomingList, categories] = await Promise.all([
      prisma.inquiry.count({ where: { createdAt: { gte: from, lte: to } } }),
      prisma.inquiry.count({ where: { status: 'NEW' } }),
      prisma.booking.groupBy({ by: ['status'], _count: true }),
      prisma.booking.count({ where: { status: { in: ['CONFIRMED', 'AWAITING_ADVANCE', 'AWAITING_CONTRACT'] }, eventDate: { gte: today } } }),
      prisma.booking.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.booking.count({ where: { status: 'COMPLETED', completedAt: { gte: from, lte: to } } }),
      prisma.booking.count({ where: { status: { in: CONFIRMED_BOOKING_STATUSES }, confirmedAt: { gte: from, lte: to } } }),
      prisma.quotation.findMany({ where: { sentAt: { gte: from, lte: to } }, select: { currentVersion: true, versions: { orderBy: { version: 'desc' }, take: 1, select: { totalMinor: true } } } }),
      prisma.quotation.count({ where: { status: { in: ['SENT', 'VIEWED', 'REVISION_REQUESTED'] } } }),
      prisma.client.count(),
      prisma.client.count({ where: { createdAt: { gte: from, lte: to } } }),
      prisma.auditLog.findMany({ where: { NOT: { action: { startsWith: 'auth.' } } }, orderBy: { createdAt: 'desc' }, take: 12, include: { actor: { select: { name: true } } } }),
      prisma.booking.findMany({ where: { status: { notIn: ['CANCELLED', 'COMPLETED'] }, eventDate: { gte: today } }, orderBy: { eventDate: 'asc' }, take: 6, select: { id: true, reference: true, title: true, eventDate: true, venueName: true, city: true, status: true, client: { select: { name: true } } } }),
      prisma.booking.groupBy({ by: ['categoryId'], where: { status: { not: 'CANCELLED' }, createdAt: { gte: from, lte: to } }, _count: true, _sum: { contractValueMinor: true } }),
    ]);
    const cats = await prisma.eventCategory.findMany({ where: { id: { in: categories.map((c) => c.categoryId).filter(Boolean) as string[] } }, select: { id: true, name: true } });
    const ms = months(from, to);
    const inqByMonth = await prisma.inquiry.findMany({ where: { createdAt: { gte: from, lte: to } }, select: { createdAt: true } });
    const bookingsByMonth = await prisma.booking.findMany({ where: { createdAt: { gte: from, lte: to }, status: { not: 'CANCELLED' } }, select: { createdAt: true } });
    const trend = ms.map((m) => ({ month: m, inquiries: inqByMonth.filter((i) => monthKey(i.createdAt) === m).length, bookings: bookingsByMonth.filter((b) => monthKey(b.createdAt) === m).length }));

    let money: Record<string, unknown> | null = null;
    if (finance) {
      const [received, out, confirmedValue] = await Promise.all([
        paymentsReceived(from, to),
        outstanding(),
        prisma.booking.aggregate({ where: { status: { in: CONFIRMED_BOOKING_STATUSES }, confirmedAt: { gte: from, lte: to } }, _sum: { contractValueMinor: true } }),
      ]);
      const revenueTrend = ms.map((m) => ({
        month: m,
        received: received.pays.filter((p) => p.paidAt && monthKey(p.paidAt) === m).reduce((s, p) => s + n(p.amountMinor), 0) - received.refunds.filter((r) => r.processedAt && monthKey(r.processedAt) === m).reduce((s, r) => s + n(r.amountMinor), 0),
      }));
      money = {
        quotationValueMinor: quotesSent.reduce((s, q) => s + n(q.versions[0]?.totalMinor), 0),
        confirmedValueMinor: n(confirmedValue._sum.contractValueMinor),
        receivedMinor: received.total,
        outstandingMinor: out,
        revenueTrend,
      };
    }
    ok(res, {
      range: { from: isoDate(from), to: isoDate(to) },
      inquiries: { total: inquiriesTotal, new: inquiriesNew },
      bookings: { upcoming, inProgress, completed, confirmed: confirmedCount, byStatus: Object.fromEntries(statusGroups.map((g) => [g.status, g._count])) },
      quotations: { sent: quotesSent.length, pending: pendingQuotes },
      clients: { total: clientsTotal, new: clientsNew },
      money,
      trend,
      categoryPerformance: categories.map((c) => ({ category: cats.find((x) => x.id === c.categoryId)?.name ?? 'Uncategorised', bookings: c._count, valueMinor: finance ? n(c._sum.contractValueMinor) : null })),
      upcomingEvents: upcomingList.map((b) => ({ ...b, eventDate: isoDate(b.eventDate) })),
      recentActivity: recent.map((a) => ({ id: a.id, action: a.action, summary: a.summary, entityType: a.entityType, entityId: a.entityId, actor: a.actor?.name ?? 'System', createdAt: a.createdAt })),
    });
  }),
);

const reportQuery = rangeQuery.extend({ format: z.enum(['json', 'csv']).default('json') });
type ReportFn = (from: Date, to: Date) => Promise<Record<string, unknown>[]>;

const REPORTS: Record<string, { label: string; finance?: boolean; run: ReportFn }> = {
  'inquiries-by-source': {
    label: 'Inquiries by source',
    run: async (from, to) => {
      const g = await prisma.inquiry.groupBy({ by: ['source'], where: { createdAt: { gte: from, lte: to } }, _count: true });
      const won = await prisma.inquiry.groupBy({ by: ['source'], where: { createdAt: { gte: from, lte: to }, status: 'WON' }, _count: true });
      return g.map((r) => ({ source: r.source, inquiries: r._count, won: won.find((w) => w.source === r.source)?._count ?? 0, conversionPct: r._count ? Math.round(((won.find((w) => w.source === r.source)?._count ?? 0) / r._count) * 1000) / 10 : 0 })).sort((a, b) => b.inquiries - a.inquiries);
    },
  },
  'inquiry-conversion': {
    label: 'Inquiry conversion funnel',
    run: async (from, to) => {
      const g = await prisma.inquiry.groupBy({ by: ['status'], where: { createdAt: { gte: from, lte: to } }, _count: true });
      const total = g.reduce((s, r) => s + r._count, 0);
      return g.map((r) => ({ status: r.status, count: r._count, sharePct: total ? Math.round((r._count / total) * 1000) / 10 : 0 }));
    },
  },
  'bookings-by-category': {
    label: 'Bookings by category',
    run: async (from, to) => {
      const g = await prisma.booking.groupBy({ by: ['categoryId'], where: { eventDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } }, _count: true });
      const cats = await prisma.eventCategory.findMany({ select: { id: true, name: true } });
      return g.map((r) => ({ category: cats.find((c) => c.id === r.categoryId)?.name ?? 'Uncategorised', bookings: r._count }));
    },
  },
  'bookings-by-month': {
    label: 'Bookings by event month',
    run: async (from, to) => {
      const rows = await prisma.booking.findMany({ where: { eventDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } }, select: { eventDate: true } });
      return months(from, to).map((m) => ({ month: m, events: rows.filter((r) => monthKey(r.eventDate) === m).length }));
    },
  },
  'manager-performance': {
    label: 'Event manager performance',
    run: async (from, to) => {
      const users = await prisma.user.findMany({ where: { NOT: { roleKey: 'CLIENT' } }, select: { id: true, name: true } });
      const [inq, won, bk, done] = await Promise.all([
        prisma.inquiry.groupBy({ by: ['assignedToId'], where: { createdAt: { gte: from, lte: to } }, _count: true }),
        prisma.inquiry.groupBy({ by: ['assignedToId'], where: { createdAt: { gte: from, lte: to }, status: 'WON' }, _count: true }),
        prisma.booking.groupBy({ by: ['managerId'], where: { eventDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } }, _count: true }),
        prisma.booking.groupBy({ by: ['managerId'], where: { completedAt: { gte: from, lte: to } }, _count: true }),
      ]);
      return users
        .map((u) => ({ manager: u.name, inquiriesAssigned: inq.find((r) => r.assignedToId === u.id)?._count ?? 0, inquiriesWon: won.find((r) => r.assignedToId === u.id)?._count ?? 0, eventsManaged: bk.find((r) => r.managerId === u.id)?._count ?? 0, eventsCompleted: done.find((r) => r.managerId === u.id)?._count ?? 0 }))
        .filter((r) => r.inquiriesAssigned || r.eventsManaged);
    },
  },
  'quotation-acceptance': {
    label: 'Quotation acceptance rate',
    run: async (from, to) => {
      const g = await prisma.quotation.groupBy({ by: ['status'], where: { sentAt: { gte: from, lte: to } }, _count: true });
      const sent = g.reduce((s, r) => s + r._count, 0);
      const accepted = g.filter((r) => ['ACCEPTED', 'CONVERTED'].includes(r.status)).reduce((s, r) => s + r._count, 0);
      return [...g.map((r) => ({ status: r.status, count: r._count })), { status: 'ACCEPTANCE RATE %', count: sent ? Math.round((accepted / sent) * 1000) / 10 : 0 }];
    },
  },
  'contract-value': {
    label: 'Confirmed contract value by month',
    finance: true,
    run: async (from, to) => {
      const rows = await prisma.booking.findMany({ where: { status: { in: CONFIRMED_BOOKING_STATUSES }, confirmedAt: { gte: from, lte: to } }, select: { confirmedAt: true, contractValueMinor: true } });
      return months(from, to).map((m) => ({ month: m, bookings: rows.filter((r) => r.confirmedAt && monthKey(r.confirmedAt) === m).length, contractValue: rows.filter((r) => r.confirmedAt && monthKey(r.confirmedAt) === m).reduce((s, r) => s + n(r.contractValueMinor), 0) / 100 }));
    },
  },
  'payments-received': {
    label: 'Payments received (net of refunds)',
    finance: true,
    run: async (from, to) => {
      const r = await paymentsReceived(from, to);
      return months(from, to).map((m) => {
        const gross = r.pays.filter((p) => p.paidAt && monthKey(p.paidAt) === m).reduce((s, p) => s + n(p.amountMinor), 0);
        const ref = r.refunds.filter((x) => x.processedAt && monthKey(x.processedAt) === m).reduce((s, x) => s + n(x.amountMinor), 0);
        return { month: m, received: gross / 100, refunded: ref / 100, net: (gross - ref) / 100 };
      });
    },
  },
  'outstanding-balances': {
    label: 'Outstanding balances',
    finance: true,
    run: async () => {
      const bookings = await prisma.booking.findMany({ where: { status: { in: [...ACTIVE_BOOKING_STATUSES, 'COMPLETED'] } }, select: { id: true, reference: true, title: true, eventDate: true, contractValueMinor: true, client: { select: { name: true } } }, orderBy: { eventDate: 'asc' } });
      const paid = await prisma.payment.groupBy({ by: ['bookingId'], where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, _sum: { amountMinor: true, refundedMinor: true } });
      return bookings
        .map((b) => {
          const p = paid.find((x) => x.bookingId === b.id);
          const received = n(p?._sum.amountMinor) - n(p?._sum.refundedMinor);
          return { booking: b.reference, title: b.title, client: b.client.name, eventDate: isoDate(b.eventDate), contractValue: n(b.contractValueMinor) / 100, received: received / 100, outstanding: Math.max(0, n(b.contractValueMinor) - received) / 100 };
        })
        .filter((r) => r.outstanding > 0);
    },
  },
  'event-margins': {
    label: 'Event expenses & margins',
    finance: true,
    run: async (from, to) => {
      const bookings = await prisma.booking.findMany({ where: { eventDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } }, select: { id: true, reference: true, title: true, contractValueMinor: true } });
      const exp = await prisma.expense.groupBy({ by: ['bookingId'], where: { bookingId: { in: bookings.map((b) => b.id) } }, _sum: { amountMinor: true } });
      return bookings.map((b) => {
        const cost = n(exp.find((e) => e.bookingId === b.id)?._sum.amountMinor);
        const value = n(b.contractValueMinor);
        return { booking: b.reference, title: b.title, contractValue: value / 100, expenses: cost / 100, margin: (value - cost) / 100, marginPct: value ? Math.round(((value - cost) / value) * 1000) / 10 : 0 };
      });
    },
  },
  'vendor-spending': {
    label: 'Vendor spending',
    finance: true,
    run: async (from, to) => {
      const g = await prisma.expense.groupBy({ by: ['vendorId'], where: { vendorId: { not: null }, incurredOn: { gte: from, lte: to } }, _sum: { amountMinor: true }, _count: true });
      const vendors = await prisma.vendor.findMany({ where: { id: { in: g.map((x) => x.vendorId!) } }, select: { id: true, name: true, category: true } });
      return g.map((x) => ({ vendor: vendors.find((v) => v.id === x.vendorId)?.name ?? '—', category: vendors.find((v) => v.id === x.vendorId)?.category ?? '', entries: x._count, spent: n(x._sum.amountMinor) / 100 })).sort((a, b) => b.spent - a.spent);
    },
  },
  'upcoming-events': {
    label: 'Upcoming events',
    run: async (_from, to) => {
      const rows = await prisma.booking.findMany({ where: { eventDate: { gte: new Date(new Date().toISOString().slice(0, 10)), lte: new Date(Math.max(to.getTime(), Date.now() + 180 * 864e5)) }, status: { notIn: ['CANCELLED', 'COMPLETED'] } }, orderBy: { eventDate: 'asc' }, select: { reference: true, title: true, eventDate: true, venueName: true, city: true, guestCount: true, status: true, client: { select: { name: true } }, manager: { select: { name: true } } } });
      return rows.map((r) => ({ reference: r.reference, title: r.title, client: r.client.name, eventDate: isoDate(r.eventDate), venue: r.venueName, city: r.city, guests: r.guestCount ?? '', status: r.status, manager: r.manager?.name ?? '' }));
    },
  },
  'client-retention': {
    label: 'Client retention (repeat clients)',
    run: async () => {
      const g = await prisma.booking.groupBy({ by: ['clientId'], where: { status: { not: 'CANCELLED' } }, _count: true });
      const repeat = g.filter((x) => x._count > 1).length;
      return [
        { metric: 'Clients with bookings', value: g.length },
        { metric: 'Repeat clients (2+ bookings)', value: repeat },
        { metric: 'Retention rate %', value: g.length ? Math.round((repeat / g.length) * 1000) / 10 : 0 },
      ];
    },
  },
  'package-popularity': {
    label: 'Package popularity (inquiries)',
    run: async (from, to) => {
      const g = await prisma.inquiry.groupBy({ by: ['packageId'], where: { packageId: { not: null }, createdAt: { gte: from, lte: to } }, _count: true });
      const pk = await prisma.package.findMany({ where: { id: { in: g.map((x) => x.packageId!) } }, select: { id: true, name: true } });
      return g.map((x) => ({ package: pk.find((p) => p.id === x.packageId)?.name ?? '—', inquiries: x._count })).sort((a, b) => b.inquiries - a.inquiries);
    },
  },
};

reportsRouter.get(
  '/reports',
  requirePermission('reports.view'),
  ah(async (req, res) => ok(res, Object.entries(REPORTS).filter(([, r]) => !r.finance || can(req.user, 'finance.view')).map(([key, r]) => ({ key, label: r.label, finance: !!r.finance })))),
);

reportsRouter.get(
  '/reports/:key',
  requirePermission('reports.view'),
  validate({ query: reportQuery }),
  ah(async (req, res) => {
    const def = REPORTS[req.params.key];
    if (!def) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
    if (def.finance && !can(req.user, 'finance.view')) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Financial reports require finance access' } });
    const q = qry<z.infer<typeof reportQuery>>(req);
    const { from, to } = resolveRange(q);
    const rows = await def.run(from, to);
    if (q.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.key}-${isoDate(from)}-${isoDate(to)}.csv"`);
      return res.send(toCsv(rows));
    }
    ok(res, { key: req.params.key, label: def.label, from: isoDate(from), to: isoDate(to), rows });
  }),
);

