import { Router } from 'express';
import { z } from 'zod';
import { prisma, type Prisma, type Tx } from '../config/db';
import { AppError } from '../lib/AppError';
import { addDays, isoDate, toDateOnly } from '../lib/dates';
import { ah, ok, pageMeta, paginate, qry } from '../lib/http';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { audit, diff } from '../services/audit.service';
import { findVenueConflicts } from '../services/conflicts.service';

/**
 * Inventory (owned or vendor-supplied equipment), quantity-aware allocations to bookings with
 * race-safe overbooking prevention, dispatch/return/damage tracking, and venue availability.
 */
export const resourcesRouter = Router();
resourcesRouter.use(requirePermission('venues.manage'));

const OWNERSHIP = ['OWNED', 'VENDOR'] as const;
const CONDITIONS = ['GOOD', 'NEEDS_REPAIR', 'RETIRED'] as const;
/** Allocations in these statuses hold stock. */
const HOLDING = ['RESERVED', 'DISPATCHED'];
const MAX_RANGE_DAYS = 366;

const str = (max: number) => z.string().trim().max(max);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const resourceInput = z
  .object({
    name: str(160).min(1, 'Name is required'),
    category: str(60).min(1).default('Other'),
    sku: str(60).nullable().optional().transform((v) => v || null),
    ownership: z.enum(OWNERSHIP).default('OWNED'),
    vendorId: z.string().max(40).nullable().optional().transform((v) => v || null),
    quantity: z.coerce.number().int().min(0).max(1_000_000),
    unit: str(20).default('pcs'),
    location: str(200).default(''),
    condition: z.enum(CONDITIONS).default('GOOD'),
    notes: str(4000).default(''),
  })
  .refine((d) => d.ownership !== 'VENDOR' || !!d.vendorId, { message: 'Choose the vendor that supplies this item', path: ['vendorId'] });

const listQuery = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  q: str(100).optional(),
  category: str(60).optional(),
  ownership: z.enum(OWNERSHIP).optional(),
  condition: z.enum(CONDITIONS).optional(),
  vendorId: z.string().max(40).optional(),
});

const rangeQuery = z
  .object({ from: dateStr, to: dateStr.optional() })
  .transform((q) => ({ from: toDateOnly(q.from)!, to: toDateOnly(q.to ?? q.from)! }))
  .refine((q) => q.to >= q.from, 'The end date must be on or after the start date')
  .refine((q) => (q.to.getTime() - q.from.getTime()) / 86_400_000 <= MAX_RANGE_DAYS, `Range cannot exceed ${MAX_RANGE_DAYS} days`);

/** Allocations holding stock of a resource that overlap [from, to]. */
function overlapping(tx: Tx, resourceId: string, from: Date, to: Date, excludeId?: string) {
  return tx.resourceAllocation.findMany({
    where: { resourceId, status: { in: HOLDING }, fromDate: { lte: to }, toDate: { gte: from }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, quantity: true, fromDate: true, toDate: true, status: true, booking: { select: { id: true, reference: true, title: true } } },
  });
}

/** Peak quantity in use on any single day of [from, to] (allocations that don't overlap each other don't add up). */
function peakUsage(allocs: { quantity: number; fromDate: Date; toDate: Date }[], from: Date, to: Date) {
  let peak = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const used = allocs.reduce((s, a) => (a.fromDate <= d && a.toDate >= d ? s + a.quantity : s), 0);
    if (used > peak) peak = used;
  }
  return peak;
}

async function availability(tx: Tx, resource: { id: string; quantity: number; condition: string }, from: Date, to: Date, excludeId?: string) {
  const allocs = await overlapping(tx, resource.id, from, to, excludeId);
  const allocated = peakUsage(allocs, from, to);
  const total = resource.condition === 'RETIRED' ? 0 : resource.quantity;
  return { quantity: total, allocated, available: Math.max(0, total - allocated), allocations: allocs };
}

const serialiseAlloc = <T extends { fromDate: Date; toDate: Date }>(a: T) => ({ ...a, fromDate: isoDate(a.fromDate), toDate: isoDate(a.toDate) });

// ───────────────────────────── Venue availability ─────────────────────────────

resourcesRouter.get(
  '/venue-availability',
  validate({ query: z.object({ venueId: z.string().min(1).max(40), from: dateStr, to: dateStr.optional(), excludeBookingId: z.string().max(40).optional() }) }),
  ah(async (req, res) => {
    const q = qry<{ venueId: string; from: string; to?: string; excludeBookingId?: string }>(req);
    const from = toDateOnly(q.from)!;
    const to = toDateOnly(q.to ?? q.from)!;
    if (to < from) throw AppError.badRequest('The end date must be on or after the start date');
    const venue = await prisma.venue.findUnique({ where: { id: q.venueId }, select: { id: true, name: true, exclusive: true } });
    if (!venue) throw AppError.notFound('Venue');
    const [bookings, entries] = await Promise.all([
      findVenueConflicts(prisma, venue.id, from, to, q.excludeBookingId),
      prisma.calendarEntry.findMany({
        where: { venueId: venue.id, startsAt: { lt: addDays(to, 1) }, endsAt: { gt: from } },
        select: { id: true, title: true, type: true, startsAt: true, endsAt: true, bookingId: true },
        orderBy: { startsAt: 'asc' },
      }),
    ]);
    ok(res, {
      venue,
      from: isoDate(from),
      to: isoDate(to),
      available: !venue.exclusive || bookings.length === 0,
      conflicts: bookings.map((b) => ({ ...b, eventDate: isoDate(b.eventDate), eventEndDate: isoDate(b.eventEndDate) })),
      calendarEntries: entries,
    });
  }),
);

// ───────────────────────────── Allocations ─────────────────────────────

const allocInclude = { resource: { select: { id: true, name: true, category: true, unit: true, ownership: true, sku: true } } } satisfies Prisma.ResourceAllocationInclude;

resourcesRouter.get(
  '/allocations',
  validate({ query: z.object({ bookingId: z.string().max(40).optional(), resourceId: z.string().max(40).optional() }).refine((q) => q.bookingId || q.resourceId, 'bookingId or resourceId is required') }),
  ah(async (req, res) => {
    const q = qry<{ bookingId?: string; resourceId?: string }>(req);
    const items = await prisma.resourceAllocation.findMany({
      where: { ...(q.bookingId ? { bookingId: q.bookingId } : {}), ...(q.resourceId ? { resourceId: q.resourceId } : {}) },
      include: { ...allocInclude, booking: { select: { id: true, reference: true, title: true } } },
      orderBy: [{ fromDate: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    });
    ok(res, items.map(serialiseAlloc));
  }),
);

const allocCreate = z.object({
  resourceId: z.string().min(1).max(40),
  bookingId: z.string().min(1).max(40),
  quantity: z.coerce.number().int().min(1).max(1_000_000),
  fromDate: dateStr.optional(),
  toDate: dateStr.optional(),
});

resourcesRouter.post(
  '/allocations',
  validate({ body: allocCreate }),
  ah(async (req, res) => {
    const b = req.body as z.infer<typeof allocCreate>;
    const booking = await prisma.booking.findUnique({ where: { id: b.bookingId }, select: { id: true, reference: true, status: true, eventDate: true, eventEndDate: true } });
    if (!booking) throw AppError.notFound('Booking');
    if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') throw AppError.conflict('Resources cannot be allocated to a cancelled or completed booking');
    const from = b.fromDate ? toDateOnly(b.fromDate)! : booking.eventDate;
    const to = b.toDate ? toDateOnly(b.toDate)! : b.fromDate ? from : (booking.eventEndDate ?? booking.eventDate);
    if (to < from) throw AppError.badRequest('The return date must be on or after the dispatch date');
    if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_RANGE_DAYS) throw AppError.badRequest(`Allocations cannot exceed ${MAX_RANGE_DAYS} days`);

    const row = await prisma.$transaction(async (tx) => {
      // Lock the resource row so concurrent allocations serialise on this item.
      const locked = await tx.$queryRaw<{ id: string; name: string; quantity: number; condition: string }[]>`
        SELECT "id", "name", "quantity", "condition" FROM "Resource" WHERE "id" = ${b.resourceId} FOR UPDATE`;
      const resource = locked[0];
      if (!resource) throw AppError.notFound('Resource');
      if (resource.condition === 'RETIRED') throw AppError.conflict(`${resource.name} is retired`);
      const avail = await availability(tx, resource, from, to);
      if (avail.allocated + b.quantity > resource.quantity) {
        throw AppError.conflict(`Only ${avail.available} of ${resource.quantity} ${resource.name} available between ${isoDate(from)} and ${isoDate(to)}`, {
          quantity: resource.quantity,
          allocated: avail.allocated,
          available: avail.available,
          requested: b.quantity,
          conflicts: avail.allocations.map(serialiseAlloc),
        });
      }
      return tx.resourceAllocation.create({ data: { resourceId: resource.id, bookingId: booking.id, quantity: b.quantity, fromDate: from, toDate: to }, include: allocInclude });
    });
    await audit(req, { action: 'resource.allocate', entityType: 'booking', entityId: booking.id, summary: `${row.quantity} × ${row.resource.name} (${isoDate(from)} – ${isoDate(to)})` });
    ok(res, serialiseAlloc(row), undefined, 201);
  }),
);

const allocUpdate = z
  .object({
    status: z.enum(['RESERVED', 'DISPATCHED', 'RETURNED']).optional(),
    quantity: z.coerce.number().int().min(1).max(1_000_000).optional(),
    fromDate: dateStr.optional(),
    toDate: dateStr.optional(),
    returnedQty: z.coerce.number().int().min(0).optional(),
    damagedQty: z.coerce.number().int().min(0).optional(),
    damageNotes: str(2000).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'Nothing to update');

resourcesRouter.patch(
  '/allocations/:allocId',
  validate({ body: allocUpdate }),
  ah(async (req, res) => {
    const b = req.body as z.infer<typeof allocUpdate>;
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.resourceAllocation.findUnique({ where: { id: req.params.allocId } });
      if (!existing) throw AppError.notFound('Allocation');
      if (existing.status === 'CANCELLED') throw AppError.conflict('This allocation was cancelled');
      const locked = await tx.$queryRaw<{ id: string; name: string; quantity: number; condition: string; ownership: string }[]>`
        SELECT "id", "name", "quantity", "condition", "ownership" FROM "Resource" WHERE "id" = ${existing.resourceId} FOR UPDATE`;
      const resource = locked[0];
      if (!resource) throw AppError.notFound('Resource');

      const quantity = b.quantity ?? existing.quantity;
      const from = b.fromDate ? toDateOnly(b.fromDate)! : existing.fromDate;
      const to = b.toDate ? toDateOnly(b.toDate)! : existing.toDate;
      if (to < from) throw AppError.badRequest('The return date must be on or after the dispatch date');
      const status = b.status ?? existing.status;
      const data: Prisma.ResourceAllocationUncheckedUpdateInput = {};

      const reschedule = quantity !== existing.quantity || from.getTime() !== existing.fromDate.getTime() || to.getTime() !== existing.toDate.getTime();
      if (reschedule) {
        if (existing.status === 'RETURNED') throw AppError.conflict('A returned allocation cannot be changed');
        const avail = await availability(tx, resource, from, to, existing.id);
        if (avail.allocated + quantity > resource.quantity) {
          throw AppError.conflict(`Only ${avail.available} of ${resource.quantity} ${resource.name} available for those dates`, {
            quantity: resource.quantity,
            allocated: avail.allocated,
            available: avail.available,
            requested: quantity,
          });
        }
        Object.assign(data, { quantity, fromDate: from, toDate: to });
      }

      if (b.status) data.status = b.status;
      if (status === 'RETURNED') {
        const returnedQty = b.returnedQty ?? existing.returnedQty ?? quantity;
        const damagedQty = b.damagedQty ?? existing.damagedQty;
        if (returnedQty > quantity) throw AppError.badRequest(`Returned quantity cannot exceed ${quantity}`);
        if (damagedQty > quantity) throw AppError.badRequest(`Damaged quantity cannot exceed ${quantity}`);
        Object.assign(data, { returnedQty, damagedQty, damageNotes: b.damageNotes ?? existing.damageNotes });
      } else if (b.returnedQty !== undefined || b.damagedQty !== undefined) {
        throw AppError.badRequest('Record returned and damaged quantities when marking the allocation RETURNED');
      } else if (b.damageNotes !== undefined) {
        data.damageNotes = b.damageNotes;
      }

      const row = await tx.resourceAllocation.update({ where: { id: existing.id }, data, include: allocInclude });
      let flaggedForRepair = false;
      if (row.status === 'RETURNED' && row.damagedQty > 0 && resource.ownership === 'OWNED' && resource.condition === 'GOOD') {
        await tx.resource.update({ where: { id: resource.id }, data: { condition: 'NEEDS_REPAIR' } });
        flaggedForRepair = true;
      }
      return { existing, row, flaggedForRepair };
    });
    const { existing, row, flaggedForRepair } = result;
    await audit(req, {
      action: 'resource.allocation_update',
      entityType: 'booking',
      entityId: row.bookingId,
      summary: `${row.resource.name}: ${existing.status} → ${row.status}${row.damagedQty ? ` (${row.damagedQty} damaged)` : ''}`,
      changes: diff(
        { status: existing.status, quantity: existing.quantity, fromDate: isoDate(existing.fromDate), toDate: isoDate(existing.toDate), returnedQty: existing.returnedQty, damagedQty: existing.damagedQty },
        { status: row.status, quantity: row.quantity, fromDate: isoDate(row.fromDate), toDate: isoDate(row.toDate), returnedQty: row.returnedQty, damagedQty: row.damagedQty },
      ),
    });
    ok(res, { ...serialiseAlloc(row), resourceFlaggedForRepair: flaggedForRepair });
  }),
);

resourcesRouter.post(
  '/allocations/:allocId/cancel',
  ah(async (req, res) => {
    const existing = await prisma.resourceAllocation.findUnique({ where: { id: req.params.allocId }, include: allocInclude });
    if (!existing) throw AppError.notFound('Allocation');
    if (existing.status === 'CANCELLED') return ok(res, serialiseAlloc(existing));
    if (existing.status !== 'RESERVED') throw AppError.conflict(`Only reserved allocations can be cancelled (this one is ${existing.status.toLowerCase()})`);
    const row = await prisma.resourceAllocation.update({ where: { id: existing.id }, data: { status: 'CANCELLED' }, include: allocInclude });
    await audit(req, { action: 'resource.allocation_cancel', entityType: 'booking', entityId: row.bookingId, summary: `${row.quantity} × ${row.resource.name}` });
    ok(res, serialiseAlloc(row));
  }),
);

// ───────────────────────────── Resource CRUD ─────────────────────────────

resourcesRouter.get(
  '/',
  validate({ query: listQuery }),
  ah(async (req, res) => {
    const q = qry<z.infer<typeof listQuery>>(req);
    const { page, limit, skip, take } = paginate(q, 200);
    const where: Prisma.ResourceWhereInput = {
      ...(q.category ? { category: q.category } : {}),
      ...(q.ownership ? { ownership: q.ownership } : {}),
      ...(q.condition ? { condition: q.condition } : {}),
      ...(q.vendorId ? { vendorId: q.vendorId } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { sku: { contains: q.q, mode: 'insensitive' } }, { location: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const today = toDateOnly(isoDate(new Date()))!;
    const [items, total, categories] = await Promise.all([
      prisma.resource.findMany({
        where,
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        skip,
        take,
        include: {
          vendor: { select: { id: true, name: true } },
          allocations: { where: { status: { in: HOLDING }, fromDate: { lte: today }, toDate: { gte: today } }, select: { quantity: true } },
        },
      }),
      prisma.resource.count({ where }),
      prisma.resource.groupBy({ by: ['category'], _count: true, orderBy: { category: 'asc' } }),
    ]);
    ok(
      res,
      items.map(({ allocations, ...r }) => {
        const inUseToday = allocations.reduce((s, a) => s + a.quantity, 0);
        return { ...r, inUseToday, availableToday: Math.max(0, (r.condition === 'RETIRED' ? 0 : r.quantity) - inUseToday) };
      }),
      { ...pageMeta(page, limit, total), categories: categories.map((c) => ({ name: c.category, count: c._count })) },
    );
  }),
);

resourcesRouter.get(
  '/:id/availability',
  validate({ query: rangeQuery }),
  ah(async (req, res) => {
    const q = qry<{ from: Date; to: Date }>(req);
    const resource = await prisma.resource.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, quantity: true, condition: true, unit: true } });
    if (!resource) throw AppError.notFound('Resource');
    const a = await availability(prisma, resource, q.from, q.to);
    ok(res, { resource, from: isoDate(q.from), to: isoDate(q.to), quantity: a.quantity, allocated: a.allocated, available: a.available, allocations: a.allocations.map(serialiseAlloc) });
  }),
);

resourcesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const row = await prisma.resource.findUnique({
      where: { id: req.params.id },
      include: {
        vendor: { select: { id: true, name: true, phone: true } },
        allocations: { orderBy: { fromDate: 'desc' }, take: 100, include: { booking: { select: { id: true, reference: true, title: true, status: true } } } },
      },
    });
    if (!row) throw AppError.notFound('Resource');
    ok(res, { ...row, allocations: row.allocations.map(serialiseAlloc) });
  }),
);

async function assertVendor(vendorId: string | null | undefined) {
  if (vendorId && !(await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true } }))) throw AppError.badRequest('Vendor not found');
}

resourcesRouter.post(
  '/',
  validate({ body: resourceInput }),
  ah(async (req, res) => {
    const b = req.body as z.infer<typeof resourceInput>;
    await assertVendor(b.vendorId);
    const row = await prisma.resource.create({ data: { ...b, vendorId: b.ownership === 'VENDOR' ? b.vendorId : (b.vendorId ?? null) } });
    await audit(req, { action: 'resource.create', entityType: 'resource', entityId: row.id, summary: `${row.name} × ${row.quantity}` });
    ok(res, row, undefined, 201);
  }),
);

resourcesRouter.put(
  '/:id',
  validate({ body: resourceInput }),
  ah(async (req, res) => {
    const b = req.body as z.infer<typeof resourceInput>;
    const existing = await prisma.resource.findUnique({ where: { id: req.params.id } });
    if (!existing) throw AppError.notFound('Resource');
    await assertVendor(b.vendorId);
    if (b.quantity < existing.quantity) {
      // Reducing stock must not strand future reservations.
      const today = toDateOnly(isoDate(new Date()))!;
      const future = await prisma.resourceAllocation.findMany({ where: { resourceId: existing.id, status: { in: HOLDING }, toDate: { gte: today } }, select: { quantity: true, fromDate: true, toDate: true } });
      if (future.length) {
        const last = future.reduce((m, a) => (a.toDate > m ? a.toDate : m), today);
        const peak = peakUsage(future, today, last > addDays(today, MAX_RANGE_DAYS * 3) ? addDays(today, MAX_RANGE_DAYS * 3) : last);
        if (peak > b.quantity) throw AppError.conflict(`${peak} ${existing.unit} are already allocated on an upcoming date. Reduce allocations first.`);
      }
    }
    const row = await prisma.resource.update({ where: { id: existing.id }, data: b });
    const changes = diff(existing as unknown as Record<string, unknown>, b as Record<string, unknown>);
    if (Object.keys(changes).length) await audit(req, { action: 'resource.update', entityType: 'resource', entityId: row.id, summary: row.name, changes });
    ok(res, row);
  }),
);

resourcesRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const existing = await prisma.resource.findUnique({ where: { id: req.params.id }, include: { _count: { select: { allocations: true } } } });
    if (!existing) throw AppError.notFound('Resource');
    if (existing._count.allocations) throw AppError.conflict('This item has allocation history. Mark it RETIRED instead of deleting.');
    await prisma.resource.delete({ where: { id: existing.id } });
    await audit(req, { action: 'resource.delete', entityType: 'resource', entityId: existing.id, summary: existing.name });
    ok(res, { ok: true });
  }),
);
