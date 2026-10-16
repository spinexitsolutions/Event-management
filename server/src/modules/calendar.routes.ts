import { Router } from 'express';
import { z } from 'zod';
import { prisma, type Prisma, type Tx } from '../config/db';
import { AppError } from '../lib/AppError';
import { addDays, isoDate, toDateOnly } from '../lib/dates';
import { ah, ok, qry } from '../lib/http';
import { can, requireAnyPermission, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { audit, diff } from '../services/audit.service';
import { bookingOverlapWhere, findVenueConflicts } from '../services/conflicts.service';

/**
 * Unified operations calendar: event dates, consultations, payment due dates (finance only),
 * vendor deliveries, task deadlines and manual calendar entries — plus CRUD for entries with
 * venue double-booking protection.
 */
export const calendarRouter = Router();
const canRead = requireAnyPermission('calendar.manage', 'bookings.view', 'inquiries.view');
const canWrite = requirePermission('calendar.manage');

const MAX_DAYS = 100;
const FEED_TYPES = ['booking', 'consultation', 'payment', 'vendor', 'task', 'entry'] as const;
type FeedType = (typeof FEED_TYPES)[number];
const ENTRY_TYPES = ['CONSULTATION', 'VENDOR_DELIVERY', 'DEADLINE', 'MEETING', 'SITE_VISIT', 'OTHER'] as const;

export interface FeedItem {
  id: string;
  source: FeedType;
  type: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  link: string;
  color: string;
  bookingId?: string | null;
  assignee?: { id: string; name: string } | null;
  status?: string;
  meta?: Record<string, unknown>;
}

const dateOrDateTime = z
  .string()
  .trim()
  .refine((s) => /^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isNaN(Date.parse(s)), 'Invalid date');
const parseBound = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? toDateOnly(s)! : new Date(s));

const feedQuery = z
  .object({
    from: dateOrDateTime,
    to: dateOrDateTime,
    types: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [...FEED_TYPES]))
      .pipe(z.array(z.enum(FEED_TYPES))),
    assigneeId: z.string().max(40).optional(),
  })
  .transform((q) => {
    const from = parseBound(q.from);
    // A date-only "to" is inclusive: extend to the end of that day.
    const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to) ? addDays(toDateOnly(q.to)!, 1) : parseBound(q.to);
    return { ...q, from, to };
  })
  .refine((q) => q.to > q.from, 'The end of the range must be after the start')
  .refine((q) => q.to.getTime() - q.from.getTime() <= (MAX_DAYS + 1) * 86_400_000, `The range cannot exceed ${MAX_DAYS} days`);
type FeedQuery = z.infer<typeof feedQuery>;

const userSel = { select: { id: true, name: true } } as const;

calendarRouter.get(
  '/feed',
  canRead,
  validate({ query: feedQuery }),
  ah(async (req, res) => {
    const q = qry<FeedQuery>(req);
    const u = req.user!;
    const bookingAccess = can(u, 'calendar.manage') || can(u, 'bookings.view') || can(u, 'tasks.manage');
    const allowed: Record<FeedType, boolean> = {
      booking: bookingAccess,
      consultation: can(u, 'calendar.manage') || can(u, 'inquiries.view'),
      payment: can(u, 'finance.view'),
      vendor: bookingAccess,
      task: bookingAccess,
      entry: true,
    };
    const want = (t: FeedType) => q.types.includes(t) && allowed[t];
    const { from, to } = q;
    // DATE columns: compare against date-only bounds (inclusive end day).
    const fromDay = toDateOnly(isoDate(from))!;
    const lastDay = toDateOnly(isoDate(new Date(to.getTime() - 1)))!;
    const notCancelledBooking = { status: { not: 'CANCELLED' as const }, archived: false };

    const [bookings, consultations, installments, deliveries, tasks, entries] = await Promise.all([
      want('booking')
        ? prisma.booking.findMany({
            where: { ...notCancelledBooking, ...bookingOverlapWhere(fromDay, lastDay), ...(q.assigneeId ? { managerId: q.assigneeId } : {}) },
            select: { id: true, reference: true, title: true, eventDate: true, eventEndDate: true, startTime: true, status: true, venueName: true, city: true, guestCount: true, manager: userSel },
            take: 1000,
          })
        : [],
      want('consultation')
        ? prisma.consultation.findMany({
            where: { scheduledAt: { gte: from, lt: to }, status: { not: 'CANCELLED' }, ...(q.assigneeId ? { ownerId: q.assigneeId } : {}) },
            select: { id: true, scheduledAt: true, durationMin: true, mode: true, location: true, status: true, owner: userSel, inquiry: { select: { id: true, reference: true, name: true, eventType: true } } },
            take: 1000,
          })
        : [],
      want('payment')
        ? prisma.installment.findMany({
            where: { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { gte: fromDay, lte: lastDay }, booking: { ...notCancelledBooking, ...(q.assigneeId ? { managerId: q.assigneeId } : {}) } },
            select: { id: true, label: true, amountMinor: true, paidMinor: true, dueDate: true, status: true, booking: { select: { id: true, reference: true, title: true, currency: true, manager: userSel } } },
            take: 1000,
          })
        : [],
      want('vendor')
        ? prisma.vendorAssignment.findMany({
            where: { deliveryAt: { gte: from, lt: to }, status: { not: 'CANCELLED' }, booking: { ...notCancelledBooking, ...(q.assigneeId ? { managerId: q.assigneeId } : {}) } },
            select: { id: true, service: true, deliveryAt: true, status: true, poNumber: true, vendor: { select: { id: true, name: true } }, booking: { select: { id: true, reference: true, title: true, manager: userSel } } },
            take: 1000,
          })
        : [],
      want('task')
        ? prisma.task.findMany({
            where: { status: { not: 'DONE' }, dueAt: { gte: from, lt: to }, booking: notCancelledBooking, ...(q.assigneeId ? { assigneeId: q.assigneeId } : {}) },
            select: { id: true, title: true, dueAt: true, status: true, priority: true, phase: true, isMilestone: true, bookingId: true, assignee: userSel, booking: { select: { reference: true, title: true } } },
            take: 2000,
          })
        : [],
      want('entry')
        ? prisma.calendarEntry.findMany({
            where: { startsAt: { lt: to }, endsAt: { gte: from }, ...(q.assigneeId ? { assigneeId: q.assigneeId } : {}) },
            include: { assignee: userSel, venue: { select: { id: true, name: true } }, booking: { select: { id: true, reference: true, title: true } } },
            take: 2000,
          })
        : [],
    ]);

    const now = Date.now();
    const items: FeedItem[] = [
      ...bookings.map<FeedItem>((b) => ({
        id: `booking:${b.id}`,
        source: 'booking',
        type: 'EVENT',
        title: b.title,
        start: isoDate(b.eventDate)!,
        end: isoDate(b.eventEndDate ?? b.eventDate)!,
        allDay: true,
        link: `/admin/bookings/${b.id}`,
        color: b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS' ? 'event-confirmed' : 'event-tentative',
        bookingId: b.id,
        assignee: b.manager,
        status: b.status,
        meta: { reference: b.reference, startTime: b.startTime, venueName: b.venueName, city: b.city, guestCount: b.guestCount },
      })),
      ...consultations.map<FeedItem>((c) => ({
        id: `consultation:${c.id}`,
        source: 'consultation',
        type: 'CONSULTATION',
        title: `Consultation — ${c.inquiry.name}`,
        start: c.scheduledAt.toISOString(),
        end: new Date(c.scheduledAt.getTime() + c.durationMin * 60_000).toISOString(),
        allDay: false,
        link: `/admin/inquiries/${c.inquiry.id}`,
        color: 'consultation',
        bookingId: null,
        assignee: c.owner,
        status: c.status,
        meta: { mode: c.mode, location: c.location, inquiryReference: c.inquiry.reference, eventType: c.inquiry.eventType },
      })),
      ...installments.map<FeedItem>((i) => ({
        id: `payment:${i.id}`,
        source: 'payment',
        type: 'PAYMENT_DUE',
        title: `${i.label} due — ${i.booking.title}`,
        start: isoDate(i.dueDate)!,
        end: isoDate(i.dueDate)!,
        allDay: true,
        link: `/admin/bookings/${i.booking.id}?tab=finance`,
        color: i.dueDate && i.dueDate.getTime() < now ? 'payment-overdue' : 'payment',
        bookingId: i.booking.id,
        assignee: i.booking.manager,
        status: i.status,
        meta: { reference: i.booking.reference, amountMinor: i.amountMinor, paidMinor: i.paidMinor, currency: i.booking.currency },
      })),
      ...deliveries.map<FeedItem>((d) => ({
        id: `vendor:${d.id}`,
        source: 'vendor',
        type: 'VENDOR_DELIVERY',
        title: `${d.vendor.name}: ${d.service}`,
        start: d.deliveryAt!.toISOString(),
        end: new Date(d.deliveryAt!.getTime() + 60 * 60_000).toISOString(),
        allDay: false,
        link: `/admin/bookings/${d.booking.id}?tab=vendors`,
        color: 'vendor',
        bookingId: d.booking.id,
        assignee: d.booking.manager,
        status: d.status,
        meta: { poNumber: d.poNumber, vendorId: d.vendor.id, reference: d.booking.reference, bookingTitle: d.booking.title },
      })),
      ...tasks.map<FeedItem>((t) => ({
        id: `task:${t.id}`,
        source: 'task',
        type: t.isMilestone ? 'MILESTONE' : 'TASK_DEADLINE',
        title: t.title,
        start: t.dueAt!.toISOString(),
        end: t.dueAt!.toISOString(),
        allDay: t.dueAt!.getUTCHours() === 0 && t.dueAt!.getUTCMinutes() === 0,
        link: `/admin/bookings/${t.bookingId}?tab=tasks&task=${t.id}`,
        color: t.dueAt!.getTime() < now ? 'task-overdue' : t.priority === 'URGENT' || t.priority === 'HIGH' ? 'task-high' : 'task',
        bookingId: t.bookingId,
        assignee: t.assignee,
        status: t.status,
        meta: { phase: t.phase, priority: t.priority, reference: t.booking.reference, bookingTitle: t.booking.title },
      })),
      ...entries.map<FeedItem>((e) => ({
        id: `entry:${e.id}`,
        source: 'entry',
        type: e.type,
        title: e.title,
        start: e.allDay ? isoDate(e.startsAt)! : e.startsAt.toISOString(),
        end: e.allDay ? isoDate(e.endsAt)! : e.endsAt.toISOString(),
        allDay: e.allDay,
        link: e.bookingId ? `/admin/bookings/${e.bookingId}` : '',
        color: `entry-${e.type.toLowerCase()}`,
        bookingId: e.bookingId,
        assignee: e.assignee,
        meta: { entryId: e.id, notes: e.notes, venue: e.venue, booking: e.booking },
      })),
    ].sort((a, b) => a.start.localeCompare(b.start));

    ok(res, items, {
      from: from.toISOString(),
      to: to.toISOString(),
      types: q.types.filter((t) => allowed[t]),
      hiddenTypes: q.types.filter((t) => !allowed[t]),
      total: items.length,
    });
  }),
);

// ───────────────────────────── Calendar entries ─────────────────────────────

const entryBase = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  type: z.enum(ENTRY_TYPES).default('OTHER'),
  startsAt: dateOrDateTime,
  endsAt: dateOrDateTime.optional(),
  allDay: z.boolean().default(false),
  bookingId: z.string().max(40).nullable().optional(),
  venueId: z.string().max(40).nullable().optional(),
  assigneeId: z.string().max(40).nullable().optional(),
  notes: z.string().trim().max(4000).default(''),
});

/** Normalises start/end: all-day entries span whole UTC days; timed entries default to 1 hour. */
function resolveTimes(startsAt: string, endsAt: string | undefined, allDay: boolean) {
  let start = parseBound(startsAt);
  let end = endsAt ? parseBound(endsAt) : null;
  if (allDay) {
    start = toDateOnly(isoDate(start))!;
    end = end ? toDateOnly(isoDate(end))! : start;
    // stored end is the start of the last day; exclusive-end for overlap checks is +1 day
    if (end < start) throw AppError.badRequest('The end date must be on or after the start date');
    return { start, end, overlapEnd: addDays(end, 1) };
  }
  end = end ?? new Date(start.getTime() + 60 * 60_000);
  if (end <= start) throw AppError.badRequest('The end time must be after the start time');
  if (end.getTime() - start.getTime() > 31 * 86_400_000) throw AppError.badRequest('An entry cannot be longer than 31 days');
  return { start, end, overlapEnd: end };
}

async function venueChecks(tx: Tx, venueId: string, start: Date, overlapEnd: Date, excludeEntryId?: string, ownBookingId?: string | null) {
  const venue = await tx.venue.findUnique({ where: { id: venueId }, select: { id: true, name: true } });
  if (!venue) throw AppError.badRequest('Venue not found');
  // Hard conflict: another calendar entry occupying the same venue at an overlapping time.
  const candidates = await tx.calendarEntry.findMany({
    where: { venueId, startsAt: { lt: overlapEnd }, endsAt: { gte: start }, ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}) },
    select: { id: true, title: true, startsAt: true, endsAt: true, allDay: true },
  });
  const clash = candidates.filter((c) => {
    const cEnd = c.allDay ? addDays(c.endsAt, 1) : c.endsAt;
    return c.startsAt < overlapEnd && cEnd > start;
  });
  if (clash.length) {
    throw AppError.conflict(`${venue.name} already has “${clash[0].title}” at that time`, { conflicts: clash });
  }
  // Soft warning: active bookings at this venue on those dates.
  const fromDay = toDateOnly(isoDate(start))!;
  const toDay = toDateOnly(isoDate(new Date(overlapEnd.getTime() - 1)))!;
  const bookings = await findVenueConflicts(tx, venueId, fromDay, toDay, ownBookingId ?? undefined);
  return bookings.map((b) => ({ ...b, eventDate: isoDate(b.eventDate), eventEndDate: isoDate(b.eventEndDate) }));
}

async function assertRefs(b: { bookingId?: string | null; assigneeId?: string | null }) {
  if (b.bookingId && !(await prisma.booking.findUnique({ where: { id: b.bookingId }, select: { id: true } }))) throw AppError.badRequest('Booking not found');
  if (b.assigneeId) {
    const u = await prisma.user.findUnique({ where: { id: b.assigneeId }, select: { roleKey: true, status: true } });
    if (!u || u.roleKey === 'CLIENT' || u.status === 'DEACTIVATED') throw AppError.badRequest('Entries can only be assigned to active staff');
  }
}

const entryInclude = {
  assignee: userSel,
  venue: { select: { id: true, name: true } },
  booking: { select: { id: true, reference: true, title: true } },
} satisfies Prisma.CalendarEntryInclude;

calendarRouter.get(
  '/entries/:id',
  canRead,
  ah(async (req, res) => {
    const row = await prisma.calendarEntry.findUnique({ where: { id: req.params.id }, include: entryInclude });
    if (!row) throw AppError.notFound('Calendar entry');
    ok(res, row);
  }),
);

calendarRouter.post(
  '/entries',
  canWrite,
  validate({ body: entryBase }),
  ah(async (req, res) => {
    const b = req.body as z.infer<typeof entryBase>;
    await assertRefs(b);
    const { start, end, overlapEnd } = resolveTimes(b.startsAt, b.endsAt, b.allDay);
    const { row, warnings } = await prisma.$transaction(
      async (tx) => {
        let venueBookings: Awaited<ReturnType<typeof venueChecks>> = [];
        if (b.venueId) {
          await tx.$queryRaw`SELECT "id" FROM "Venue" WHERE "id" = ${b.venueId} FOR UPDATE`;
          venueBookings = await venueChecks(tx, b.venueId, start, overlapEnd, undefined, b.bookingId);
        }
        const row = await tx.calendarEntry.create({
          data: { title: b.title, type: b.type, startsAt: start, endsAt: end, allDay: b.allDay, bookingId: b.bookingId ?? null, venueId: b.venueId ?? null, assigneeId: b.assigneeId ?? null, notes: b.notes, createdById: req.user!.id },
          include: entryInclude,
        });
        return { row, warnings: { venueBookings } };
      },
    );
    await audit(req, { action: 'calendar.create', entityType: 'calendarEntry', entityId: row.id, summary: `${row.title} (${start.toISOString()})` });
    ok(res, row, { warnings }, 201);
  }),
);

calendarRouter.put(
  '/entries/:id',
  canWrite,
  validate({ body: entryBase }),
  ah(async (req, res) => {
    const b = req.body as z.infer<typeof entryBase>;
    const existing = await prisma.calendarEntry.findUnique({ where: { id: req.params.id } });
    if (!existing) throw AppError.notFound('Calendar entry');
    await assertRefs(b);
    const { start, end, overlapEnd } = resolveTimes(b.startsAt, b.endsAt, b.allDay);
    const { row, warnings } = await prisma.$transaction(async (tx) => {
      let venueBookings: Awaited<ReturnType<typeof venueChecks>> = [];
      if (b.venueId) {
        await tx.$queryRaw`SELECT "id" FROM "Venue" WHERE "id" = ${b.venueId} FOR UPDATE`;
        venueBookings = await venueChecks(tx, b.venueId, start, overlapEnd, existing.id, b.bookingId);
      }
      const row = await tx.calendarEntry.update({
        where: { id: existing.id },
        data: { title: b.title, type: b.type, startsAt: start, endsAt: end, allDay: b.allDay, bookingId: b.bookingId ?? null, venueId: b.venueId ?? null, assigneeId: b.assigneeId ?? null, notes: b.notes },
        include: entryInclude,
      });
      return { row, warnings: { venueBookings } };
    });
    await audit(req, {
      action: 'calendar.update',
      entityType: 'calendarEntry',
      entityId: row.id,
      summary: row.title,
      changes: diff(
        { startsAt: existing.startsAt.toISOString(), endsAt: existing.endsAt.toISOString(), venueId: existing.venueId, assigneeId: existing.assigneeId, title: existing.title },
        { startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), venueId: row.venueId, assigneeId: row.assigneeId, title: row.title },
      ),
    });
    ok(res, row, { warnings });
  }),
);

calendarRouter.delete(
  '/entries/:id',
  canWrite,
  ah(async (req, res) => {
    const existing = await prisma.calendarEntry.findUnique({ where: { id: req.params.id } });
    if (!existing) throw AppError.notFound('Calendar entry');
    await prisma.calendarEntry.delete({ where: { id: existing.id } });
    await audit(req, { action: 'calendar.delete', entityType: 'calendarEntry', entityId: existing.id, summary: existing.title });
    ok(res, { ok: true });
  }),
);
