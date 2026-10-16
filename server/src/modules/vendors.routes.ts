import { Router } from 'express';
import { z } from 'zod';
import { VENDOR_CATEGORIES } from '@maison/shared';
import { prisma, type Prisma } from '../config/db';
import { AppError } from '../lib/AppError';
import { toCsv } from '../lib/csv';
import { isoDate } from '../lib/dates';
import { ah, ok, pageMeta, paginate, qry } from '../lib/http';
import { requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { audit, diff } from '../services/audit.service';
import { nextNumber } from '../services/counter.service';
import { deleteStored, privateFileAccess, storeFile } from '../services/storage.service';
import { upload } from './media.routes';

/**
 * Vendor database: suppliers, their assignments to bookings (purchase orders), documents and
 * performance. Internal pricing/notes are only visible with `vendors.view`.
 */
export const vendorsRouter = Router();
const canView = requirePermission('vendors.view');
const canManage = requirePermission('vendors.manage');

const VENDOR_STATUSES = ['ACTIVE', 'PREFERRED', 'INACTIVE', 'BLOCKED'] as const;
const ASSIGNMENT_STATUSES = ['REQUESTED', 'CONFIRMED', 'DELIVERED', 'CANCELLED'] as const;

const str = (max: number) => z.string().trim().max(max);
const strList = z.array(z.string().trim().min(1).max(80)).max(50).default([]);
const money = z.coerce.number().int().min(0).max(1e13);
const dateTime = z
  .string()
  .trim()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date/time');

const vendorInput = z.object({
  name: str(160).min(1, 'Name is required'),
  category: z.enum(VENDOR_CATEGORIES),
  contactName: str(120).default(''),
  email: z.union([z.literal(''), z.string().trim().toLowerCase().email().max(200)]).default(''),
  phone: str(40).default(''),
  website: z.union([z.literal(''), z.string().trim().url().max(300)]).default(''),
  serviceAreas: strList,
  services: strList,
  priceNotes: str(4000).default(''),
  availabilityNotes: str(4000).default(''),
  rating: z.coerce.number().int().min(1).max(5).nullable().optional(),
  notes: str(8000).default(''),
  status: z.enum(VENDOR_STATUSES).default('ACTIVE'),
});

const listQuery = z.object({
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  q: str(100).optional(),
  category: str(80).optional(),
  status: z.enum(VENDOR_STATUSES).optional(),
  area: str(80).optional(),
  sort: z.enum(['name', 'rating', 'recent']).default('name'),
});
type ListQuery = z.infer<typeof listQuery>;

function vendorWhere(q: Partial<ListQuery>): Prisma.VendorWhereInput {
  const where: Prisma.VendorWhereInput = {};
  if (q.category) where.category = q.category;
  if (q.status) where.status = q.status;
  if (q.area) where.serviceAreas = { has: q.area };
  if (q.q) {
    where.OR = [
      { name: { contains: q.q, mode: 'insensitive' } },
      { contactName: { contains: q.q, mode: 'insensitive' } },
      { email: { contains: q.q, mode: 'insensitive' } },
      { phone: { contains: q.q } },
      { services: { has: q.q } },
    ];
  }
  return where;
}

vendorsRouter.get(
  '/',
  canView,
  validate({ query: listQuery }),
  ah(async (req, res) => {
    const q = qry<ListQuery>(req);
    const { page, limit, skip, take } = paginate(q, 200);
    const where = vendorWhere(q);
    const orderBy: Prisma.VendorOrderByWithRelationInput[] =
      q.sort === 'rating' ? [{ rating: { sort: 'desc', nulls: 'last' } }, { name: 'asc' }] : q.sort === 'recent' ? [{ createdAt: 'desc' }] : [{ name: 'asc' }];
    const [items, total, areas] = await Promise.all([
      prisma.vendor.findMany({ where, orderBy, skip, take, include: { _count: { select: { assignments: true, documents: true } } } }),
      prisma.vendor.count({ where }),
      prisma.$queryRaw<{ area: string }[]>`SELECT DISTINCT unnest("serviceAreas") AS area FROM "Vendor" ORDER BY area`,
    ]);
    ok(res, items, { ...pageMeta(page, limit, total), categories: VENDOR_CATEGORIES, serviceAreas: areas.map((a) => a.area) });
  }),
);

vendorsRouter.get(
  '/export.csv',
  canView,
  validate({ query: listQuery }),
  ah(async (req, res) => {
    const q = qry<ListQuery>(req);
    const rows = await prisma.vendor.findMany({ where: vendorWhere(q), orderBy: { name: 'asc' }, take: 10_000, include: { _count: { select: { assignments: true } } } });
    const csv = toCsv(
      rows.map((v) => ({ ...v, serviceAreas: v.serviceAreas.join('; '), services: v.services.join('; '), assignments: v._count.assignments })),
      [
        { key: 'name', label: 'Name' },
        { key: 'category', label: 'Category' },
        { key: 'status', label: 'Status' },
        { key: 'contactName', label: 'Contact' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'website', label: 'Website' },
        { key: 'serviceAreas', label: 'Service areas' },
        { key: 'services', label: 'Services' },
        { key: 'rating', label: 'Rating' },
        { key: 'assignments', label: 'Assignments' },
        { key: 'priceNotes', label: 'Price notes' },
      ],
    );
    await audit(req, { action: 'vendor.export', entityType: 'vendor', summary: `${rows.length} vendors exported` });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="vendors-${isoDate(new Date())}.csv"`);
    res.send(`\uFEFF${csv}`);
  }),
);

// ───────────────────────────── Assignments ─────────────────────────────

const assignmentInclude = {
  vendor: { select: { id: true, name: true, category: true, phone: true, email: true, status: true } },
  booking: { select: { id: true, reference: true, title: true, eventDate: true, status: true } },
} satisfies Prisma.VendorAssignmentInclude;

vendorsRouter.get(
  '/assignments',
  canView,
  validate({ query: z.object({ bookingId: z.string().min(1).max(40) }) }),
  ah(async (req, res) => {
    const { bookingId } = qry<{ bookingId: string }>(req);
    const items = await prisma.vendorAssignment.findMany({ where: { bookingId }, include: assignmentInclude, orderBy: [{ deliveryAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }] });
    const paid = await prisma.expense.groupBy({ by: ['assignmentId', 'status'], where: { bookingId, assignmentId: { in: items.map((i) => i.id) } }, _sum: { amountMinor: true } });
    ok(
      res,
      items.map((a) => {
        const rows = paid.filter((p) => p.assignmentId === a.id);
        const sum = (s: string) => rows.filter((r) => r.status === s).reduce((t, r) => t + (r._sum.amountMinor ?? 0n), 0n);
        return { ...a, paidMinor: sum('PAID'), billedUnpaidMinor: sum('UNPAID') };
      }),
    );
  }),
);

const assignmentCreate = z.object({
  vendorId: z.string().min(1).max(40),
  bookingId: z.string().min(1).max(40),
  service: str(200).min(1, 'Describe the service'),
  agreedAmountMinor: money.default(0),
  status: z.enum(ASSIGNMENT_STATUSES).default('REQUESTED'),
  deliveryAt: dateTime.nullable().optional(),
  notes: str(4000).default(''),
});

vendorsRouter.post(
  '/assignments',
  canManage,
  validate({ body: assignmentCreate }),
  ah(async (req, res) => {
    const b = req.body as z.infer<typeof assignmentCreate>;
    const [vendor, booking] = await Promise.all([
      prisma.vendor.findUnique({ where: { id: b.vendorId }, select: { id: true, name: true, status: true } }),
      prisma.booking.findUnique({ where: { id: b.bookingId }, select: { id: true, reference: true, status: true } }),
    ]);
    if (!vendor) throw AppError.notFound('Vendor');
    if (!booking) throw AppError.notFound('Booking');
    if (vendor.status === 'BLOCKED') throw AppError.conflict(`${vendor.name} is blocked and cannot be assigned`);
    if (booking.status === 'CANCELLED') throw AppError.conflict('This booking is cancelled');
    const row = await prisma.$transaction(async (tx) => {
      const poNumber = await nextNumber('PO', tx);
      return tx.vendorAssignment.create({
        data: {
          vendorId: b.vendorId,
          bookingId: b.bookingId,
          service: b.service,
          poNumber,
          agreedAmountMinor: BigInt(b.agreedAmountMinor),
          status: b.status,
          deliveryAt: b.deliveryAt ? new Date(b.deliveryAt) : null,
          notes: b.notes,
        },
        include: assignmentInclude,
      });
    });
    await audit(req, { action: 'vendor_assignment.create', entityType: 'booking', entityId: booking.id, summary: `${row.poNumber}: ${vendor.name} — ${b.service}` });
    ok(res, row, undefined, 201);
  }),
);

const assignmentUpdate = z.object({
  service: str(200).min(1).optional(),
  status: z.enum(ASSIGNMENT_STATUSES).optional(),
  performanceRating: z.coerce.number().int().min(1).max(5).nullable().optional(),
  performanceNotes: str(4000).optional(),
  notes: str(4000).optional(),
  deliveryAt: dateTime.nullable().optional(),
  agreedAmountMinor: money.optional(),
});

vendorsRouter.patch(
  '/assignments/:assignmentId',
  canManage,
  validate({ body: assignmentUpdate }),
  ah(async (req, res) => {
    const b = req.body as z.infer<typeof assignmentUpdate>;
    const existing = await prisma.vendorAssignment.findUnique({ where: { id: req.params.assignmentId } });
    if (!existing) throw AppError.notFound('Vendor assignment');
    const data: Prisma.VendorAssignmentUncheckedUpdateInput = {};
    if (b.service !== undefined) data.service = b.service;
    if (b.status !== undefined) data.status = b.status;
    if (b.performanceRating !== undefined) data.performanceRating = b.performanceRating;
    if (b.performanceNotes !== undefined) data.performanceNotes = b.performanceNotes;
    if (b.notes !== undefined) data.notes = b.notes;
    if (b.deliveryAt !== undefined) {
      data.deliveryAt = b.deliveryAt ? new Date(b.deliveryAt) : null;
      data.reminderSentAt = null; // new date → reminder may fire again
    }
    if (b.agreedAmountMinor !== undefined) data.agreedAmountMinor = BigInt(b.agreedAmountMinor);
    const row = await prisma.vendorAssignment.update({ where: { id: existing.id }, data, include: assignmentInclude });
    const changes = diff(
      { status: existing.status, agreedAmountMinor: Number(existing.agreedAmountMinor), deliveryAt: existing.deliveryAt?.toISOString() ?? null, performanceRating: existing.performanceRating, service: existing.service },
      { status: row.status, agreedAmountMinor: Number(row.agreedAmountMinor), deliveryAt: row.deliveryAt?.toISOString() ?? null, performanceRating: row.performanceRating, service: row.service },
    );
    if (Object.keys(changes).length) {
      await audit(req, { action: 'vendor_assignment.update', entityType: 'booking', entityId: row.bookingId, summary: `${row.poNumber ?? row.id}: ${row.vendor.name}`, changes });
    }
    ok(res, row);
  }),
);

vendorsRouter.delete(
  '/assignments/:assignmentId',
  canManage,
  ah(async (req, res) => {
    const existing = await prisma.vendorAssignment.findUnique({ where: { id: req.params.assignmentId }, include: { vendor: { select: { name: true } } } });
    if (!existing) throw AppError.notFound('Vendor assignment');
    const paidCount = await prisma.expense.count({ where: { assignmentId: existing.id, status: 'PAID' } });
    if (paidCount) throw AppError.conflict('Payments have been recorded against this assignment. Cancel it instead of deleting.');
    await prisma.vendorAssignment.delete({ where: { id: existing.id } });
    await audit(req, { action: 'vendor_assignment.delete', entityType: 'booking', entityId: existing.bookingId, summary: `${existing.poNumber ?? existing.id}: ${existing.vendor.name} — ${existing.service}` });
    ok(res, { ok: true });
  }),
);

// ───────────────────────────── Documents ─────────────────────────────

vendorsRouter.get(
  '/documents/:docId/file',
  canView,
  ah(async (req, res) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.docId } });
    if (!doc || !doc.vendorId) throw AppError.notFound('Document');
    const media = await prisma.mediaAsset.findUnique({ where: { id: doc.mediaId } });
    if (!media || !media.storageKey) throw AppError.notFound('File');
    const access = privateFileAccess(media.provider, media.storageKey, media.mime);
    if (access.redirect) return res.redirect(access.redirect);
    res.setHeader('Content-Type', media.mime);
    res.setHeader('Content-Disposition', `inline; filename="${media.filename.replace(/[^\w.\- ]+/g, '_')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const stream = access.stream!;
    stream.on('error', () => {
      if (!res.headersSent) res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
      else res.end();
    });
    stream.pipe(res);
  }),
);

vendorsRouter.delete(
  '/documents/:docId',
  canManage,
  ah(async (req, res) => {
    const doc = await prisma.document.findUnique({ where: { id: req.params.docId } });
    if (!doc || !doc.vendorId) throw AppError.notFound('Document');
    const media = await prisma.mediaAsset.findUnique({ where: { id: doc.mediaId } });
    await prisma.document.delete({ where: { id: doc.id } });
    if (media) {
      const stillUsed = await prisma.document.count({ where: { mediaId: media.id } });
      if (!stillUsed) {
        await prisma.mediaAsset.delete({ where: { id: media.id } });
        await deleteStored(media.provider, media.storageKey, media.isPrivate);
      }
    }
    await audit(req, { action: 'vendor_document.delete', entityType: 'vendor', entityId: doc.vendorId, summary: doc.name });
    ok(res, { ok: true });
  }),
);

vendorsRouter.post(
  '/:id/documents',
  canManage,
  upload.single('file'),
  ah(async (req, res) => {
    const vendor = await prisma.vendor.findUnique({ where: { id: req.params.id }, select: { id: true, name: true } });
    if (!vendor) throw AppError.notFound('Vendor');
    const file = req.file;
    if (!file) throw AppError.badRequest('Choose a file to upload');
    const meta = z
      .object({
        name: str(200).optional(),
        kind: z.enum(['CONTRACT', 'SIGNED_CONTRACT', 'INVOICE', 'PLAN', 'OTHER']).default('OTHER'),
      })
      .parse(req.body ?? {});
    const stored = await storeFile(file.buffer, file.originalname, { isPrivate: true, allow: ['DOCUMENT', 'IMAGE'] });
    const filename = file.originalname.slice(0, 200) || 'document';
    const doc = await prisma.$transaction(async (tx) => {
      const media = await tx.mediaAsset.create({
        data: { ...stored, filename, isPrivate: true, folder: 'Vendors', uploadedById: req.user!.id, tags: [] },
      });
      return tx.document.create({ data: { vendorId: vendor.id, name: meta.name || filename, kind: meta.kind, mediaId: media.id, uploadedById: req.user!.id } });
    });
    await audit(req, { action: 'vendor_document.upload', entityType: 'vendor', entityId: vendor.id, summary: `${doc.name} (${meta.kind})` });
    ok(res, { ...doc, mime: stored.mime, sizeBytes: stored.sizeBytes, fileUrl: `/api/v1/admin/vendors/documents/${doc.id}/file` }, undefined, 201);
  }),
);

// ───────────────────────────── Vendor CRUD ─────────────────────────────

vendorsRouter.get(
  '/:id',
  canView,
  ah(async (req, res) => {
    const vendor = await prisma.vendor.findUnique({
      where: { id: req.params.id },
      include: {
        assignments: {
          include: { booking: { select: { id: true, reference: true, title: true, eventDate: true, status: true } } },
          orderBy: { createdAt: 'desc' },
          take: 200,
        },
        documents: { orderBy: { createdAt: 'desc' } },
        expenses: {
          orderBy: { incurredOn: 'desc' },
          take: 200,
          select: { id: true, bookingId: true, assignmentId: true, category: true, description: true, amountMinor: true, currency: true, incurredOn: true, status: true, paidOn: true, reference: true },
        },
        resources: { select: { id: true, name: true, category: true, quantity: true } },
        venues: { select: { id: true, name: true, city: true } },
      },
    });
    if (!vendor) throw AppError.notFound('Vendor');

    const [byStatus, ratingAgg, agreedAgg, expenseAgg, mediaRows] = await Promise.all([
      prisma.vendorAssignment.groupBy({ by: ['status'], where: { vendorId: vendor.id }, _count: true }),
      prisma.vendorAssignment.aggregate({ where: { vendorId: vendor.id, performanceRating: { not: null } }, _avg: { performanceRating: true }, _count: { performanceRating: true } }),
      prisma.vendorAssignment.aggregate({ where: { vendorId: vendor.id, status: { not: 'CANCELLED' } }, _sum: { agreedAmountMinor: true } }),
      prisma.expense.groupBy({ by: ['status'], where: { vendorId: vendor.id }, _sum: { amountMinor: true } }),
      prisma.mediaAsset.findMany({ where: { id: { in: vendor.documents.map((d) => d.mediaId) } }, select: { id: true, mime: true, sizeBytes: true, filename: true } }),
    ]);
    const counts: Record<string, number> = Object.fromEntries(ASSIGNMENT_STATUSES.map((s) => [s, 0]));
    for (const g of byStatus) counts[g.status] = g._count;
    const totalAgreedMinor = agreedAgg._sum.agreedAmountMinor ?? 0n;
    const paidMinor = expenseAgg.find((e) => e.status === 'PAID')?._sum.amountMinor ?? 0n;
    const unpaidMinor = expenseAgg.find((e) => e.status === 'UNPAID')?._sum.amountMinor ?? 0n;
    const mediaById = new Map(mediaRows.map((m) => [m.id, m]));

    ok(res, {
      ...vendor,
      assignments: vendor.assignments.map((a) => ({ ...a, booking: { ...a.booking, eventDate: isoDate(a.booking.eventDate) } })),
      expenses: vendor.expenses.map((e) => ({ ...e, incurredOn: isoDate(e.incurredOn), paidOn: isoDate(e.paidOn) })),
      documents: vendor.documents.map((d) => ({ ...d, file: mediaById.get(d.mediaId) ?? null, fileUrl: `/api/v1/admin/vendors/documents/${d.id}/file` })),
      performance: {
        avgRating: ratingAgg._avg.performanceRating === null ? null : Math.round(ratingAgg._avg.performanceRating * 10) / 10,
        ratedCount: ratingAgg._count.performanceRating,
        assignmentCounts: counts,
        totalAssignments: Object.values(counts).reduce((a, b) => a + b, 0),
        totalAgreedMinor,
        paidMinor,
        unpaidMinor,
        outstandingMinor: totalAgreedMinor > paidMinor ? totalAgreedMinor - paidMinor : 0n,
      },
    });
  }),
);

vendorsRouter.post(
  '/',
  canManage,
  validate({ body: vendorInput }),
  ah(async (req, res) => {
    const b = req.body as z.infer<typeof vendorInput>;
    const row = await prisma.vendor.create({ data: { ...b, rating: b.rating ?? null } });
    await audit(req, { action: 'vendor.create', entityType: 'vendor', entityId: row.id, summary: `${row.name} (${row.category})` });
    ok(res, row, undefined, 201);
  }),
);

vendorsRouter.put(
  '/:id',
  canManage,
  validate({ body: vendorInput.partial() }),
  ah(async (req, res) => {
    const existing = await prisma.vendor.findUnique({ where: { id: req.params.id } });
    if (!existing) throw AppError.notFound('Vendor');
    const b = req.body as Partial<z.infer<typeof vendorInput>>;
    const row = await prisma.vendor.update({ where: { id: existing.id }, data: b });
    const changes = diff(existing as unknown as Record<string, unknown>, b as Record<string, unknown>);
    if (Object.keys(changes).length) await audit(req, { action: 'vendor.update', entityType: 'vendor', entityId: row.id, summary: row.name, changes });
    ok(res, row);
  }),
);

vendorsRouter.delete(
  '/:id',
  canManage,
  ah(async (req, res) => {
    const existing = await prisma.vendor.findUnique({ where: { id: req.params.id }, include: { _count: { select: { assignments: true, expenses: true } } } });
    if (!existing) throw AppError.notFound('Vendor');
    if (existing._count.assignments || existing._count.expenses) {
      throw AppError.conflict('This vendor has assignments or payments on record. Mark it INACTIVE instead of deleting.');
    }
    const docs = await prisma.document.findMany({ where: { vendorId: existing.id } });
    const media = await prisma.mediaAsset.findMany({ where: { id: { in: docs.map((d) => d.mediaId) } } });
    await prisma.$transaction([
      prisma.document.deleteMany({ where: { vendorId: existing.id } }),
      prisma.mediaAsset.deleteMany({ where: { id: { in: media.map((m) => m.id) } } }),
      prisma.vendor.delete({ where: { id: existing.id } }),
    ]);
    for (const m of media) await deleteStored(m.provider, m.storageKey, m.isPrivate);
    await audit(req, { action: 'vendor.delete', entityType: 'vendor', entityId: existing.id, summary: existing.name });
    ok(res, { ok: true });
  }),
);
