import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { RSVP_STATUSES } from '@maison/shared';
import { prisma, type Prisma } from '../config/db';
import { env, isTest } from '../config/env';
import { AppError } from '../lib/AppError';
import { refCode } from '../lib/crypto';
import { toCsv } from '../lib/csv';
import { isoDate, startOfDayUtc } from '../lib/dates';
import { ah, ok, pageMeta, paginate, qry } from '../lib/http';
import { requirePermission } from '../middleware/auth';
import { formLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { audit } from '../services/audit.service';
import { emailConfigured, sendEmail } from '../services/notify.service';

/**
 * Guest management (lists, CSV import/export, seating, invitations, check-in), event microsites,
 * and the public RSVP / microsite endpoints reached by invite code or slug.
 */
export const guestsRouter = Router();
guestsRouter.use(requirePermission('guests.manage'));
export const rsvpPublicRouter = Router();

const MAX_IMPORT = 2000;
const MAX_PLUS_ONES = 10;
const str = (max: number) => z.string().trim().max(max);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const normCode = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

const guestInput = z.object({
  name: str(160).min(1, 'Name is required'),
  email: z.union([z.literal(''), z.string().trim().toLowerCase().email('Invalid email').max(200)]).default(''),
  phone: str(40).default(''),
  group: str(80).default(''),
  side: str(80).default(''),
  plusOnes: z.coerce.number().int().min(0).max(MAX_PLUS_ONES).default(0),
  rsvpStatus: z.enum(RSVP_STATUSES).default('PENDING'),
  dietary: str(300).default(''),
  tableLabel: str(40).default(''),
  seatNumber: z.coerce.number().int().min(1).max(10_000).nullable().optional(),
  notes: str(2000).default(''),
});
type GuestInput = z.infer<typeof guestInput>;

/** Generates invite codes that do not collide with existing ones. */
async function uniqueCodes(n: number) {
  const out = new Set<string>();
  for (let attempt = 0; out.size < n && attempt < 10; attempt++) {
    const batch = new Set<string>();
    while (batch.size < n - out.size) batch.add(refCode(10));
    const taken = await prisma.guest.findMany({ where: { inviteCode: { in: [...batch] } }, select: { inviteCode: true } });
    const takenSet = new Set(taken.map((t) => t.inviteCode));
    for (const c of batch) if (!takenSet.has(c) && !out.has(c)) out.add(c);
  }
  if (out.size < n) throw new Error('Could not generate unique invite codes');
  return [...out];
}

async function bookingOr404(bookingId: string) {
  const b = await prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true, reference: true, title: true, eventDate: true, eventEndDate: true, status: true, venueName: true, city: true } });
  if (!b) throw AppError.notFound('Booking');
  return b;
}

// ───────────────────────────── Admin: list & summary ─────────────────────────────

const listQuery = z.object({
  bookingId: z.string().min(1).max(40),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
  q: str(100).optional(),
  rsvp: z.enum(RSVP_STATUSES).optional(),
  group: str(80).optional(),
  side: str(80).optional(),
  table: str(40).optional(),
  checkedIn: z.enum(['true', 'false']).optional(),
});
type ListQuery = z.infer<typeof listQuery>;

function guestWhere(q: Partial<ListQuery> & { bookingId: string }): Prisma.GuestWhereInput {
  return {
    bookingId: q.bookingId,
    ...(q.rsvp ? { rsvpStatus: q.rsvp } : {}),
    ...(q.group ? { group: q.group } : {}),
    ...(q.side ? { side: q.side } : {}),
    ...(q.table !== undefined ? { tableLabel: q.table } : {}),
    ...(q.checkedIn === 'true' ? { checkedInAt: { not: null } } : q.checkedIn === 'false' ? { checkedInAt: null } : {}),
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' as const } },
            { email: { contains: q.q, mode: 'insensitive' as const } },
            { phone: { contains: q.q } },
            { inviteCode: { equals: normCode(q.q) } },
          ],
        }
      : {}),
  };
}

async function summary(bookingId: string) {
  const [byStatus, checkedIn, groups, tables] = await Promise.all([
    prisma.guest.groupBy({ by: ['rsvpStatus'], where: { bookingId }, _count: true, _sum: { plusOnes: true } }),
    prisma.guest.aggregate({ where: { bookingId, checkedInAt: { not: null } }, _count: true, _sum: { checkedInCount: true } }),
    prisma.guest.groupBy({ by: ['group'], where: { bookingId }, _count: true, orderBy: { group: 'asc' } }),
    prisma.guest.groupBy({ by: ['tableLabel'], where: { bookingId }, _count: true, _sum: { plusOnes: true }, orderBy: { tableLabel: 'asc' } }),
  ]);
  const counts: Record<string, number> = Object.fromEntries(RSVP_STATUSES.map((s) => [s, 0]));
  for (const g of byStatus) counts[g.rsvpStatus] = g._count;
  const attending = byStatus.find((g) => g.rsvpStatus === 'ATTENDING');
  const attendingPlusOnes = attending?._sum.plusOnes ?? 0;
  return {
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    byStatus: counts,
    attending: counts.ATTENDING,
    attendingPlusOnes,
    headcount: counts.ATTENDING + attendingPlusOnes,
    checkedInGuests: checkedIn._count,
    checkedInPeople: checkedIn._sum.checkedInCount ?? 0,
    groups: groups.map((g) => ({ name: g.group, count: g._count })),
    tables: tables.filter((t) => t.tableLabel).map((t) => ({ label: t.tableLabel, guests: t._count, seats: t._count + (t._sum.plusOnes ?? 0) })),
    unseated: tables.find((t) => !t.tableLabel)?._count ?? 0,
  };
}

guestsRouter.get(
  '/',
  validate({ query: listQuery }),
  ah(async (req, res) => {
    const q = qry<ListQuery>(req);
    const { page, limit, skip, take } = paginate(q, 500);
    const where = guestWhere(q);
    const [items, total, sum] = await Promise.all([
      prisma.guest.findMany({ where, orderBy: [{ group: 'asc' }, { name: 'asc' }], skip, take }),
      prisma.guest.count({ where }),
      summary(q.bookingId),
    ]);
    ok(res, items, { ...pageMeta(page, limit, total), summary: sum });
  }),
);

guestsRouter.get(
  '/summary',
  validate({ query: z.object({ bookingId: z.string().min(1).max(40) }) }),
  ah(async (req, res) => {
    ok(res, await summary(qry<{ bookingId: string }>(req).bookingId));
  }),
);

guestsRouter.get(
  '/export.csv',
  validate({ query: listQuery }),
  ah(async (req, res) => {
    const q = qry<ListQuery>(req);
    const booking = await bookingOr404(q.bookingId);
    const rows = await prisma.guest.findMany({ where: guestWhere(q), orderBy: [{ group: 'asc' }, { name: 'asc' }], take: 20_000 });
    const csv = toCsv(
      rows.map((g) => ({ ...g, rsvpAt: g.rsvpAt?.toISOString() ?? '', checkedInAt: g.checkedInAt?.toISOString() ?? '', rsvpUrl: `${env.APP_URL}/rsvp/${g.inviteCode}` })),
      [
        { key: 'name', label: 'name' },
        { key: 'email', label: 'email' },
        { key: 'phone', label: 'phone' },
        { key: 'group', label: 'group' },
        { key: 'side', label: 'side' },
        { key: 'plusOnes', label: 'plusOnes' },
        { key: 'dietary', label: 'dietary' },
        { key: 'tableLabel', label: 'table' },
        { key: 'seatNumber', label: 'seat' },
        { key: 'rsvpStatus', label: 'rsvp' },
        { key: 'rsvpAt', label: 'rsvpAt' },
        { key: 'inviteCode', label: 'inviteCode' },
        { key: 'rsvpUrl', label: 'rsvpUrl' },
        { key: 'checkedInAt', label: 'checkedInAt' },
        { key: 'checkedInCount', label: 'checkedInCount' },
      ],
    );
    await audit(req, { action: 'guest.export', entityType: 'booking', entityId: booking.id, summary: `${rows.length} guests exported` });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="guests-${booking.reference}.csv"`);
    res.send(`\uFEFF${csv}`);
  }),
);

// ───────────────────────────── Admin: create / import / update ─────────────────────────────

guestsRouter.post(
  '/',
  validate({ body: guestInput.extend({ bookingId: z.string().min(1).max(40) }) }),
  ah(async (req, res) => {
    const { bookingId, ...b } = req.body as GuestInput & { bookingId: string };
    const booking = await bookingOr404(bookingId);
    const [inviteCode] = await uniqueCodes(1);
    const row = await prisma.guest.create({ data: { ...b, seatNumber: b.seatNumber ?? null, bookingId: booking.id, inviteCode, rsvpAt: b.rsvpStatus !== 'PENDING' ? new Date() : null } });
    ok(res, row, undefined, 201);
  }),
);

/** Minimal RFC 4180 parser (quoted fields, escaped quotes, CRLF/LF). Blank lines are kept (as ['']) so callers can report accurate row numbers. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const HEADER_ALIASES: Record<string, keyof GuestInput> = {
  name: 'name',
  'full name': 'name',
  guest: 'name',
  email: 'email',
  'e-mail': 'email',
  phone: 'phone',
  mobile: 'phone',
  group: 'group',
  side: 'side',
  plusones: 'plusOnes',
  'plus ones': 'plusOnes',
  'plus-ones': 'plusOnes',
  plus_ones: 'plusOnes',
  dietary: 'dietary',
  diet: 'dietary',
  table: 'tableLabel',
  tablelabel: 'tableLabel',
};

guestsRouter.post(
  '/import',
  validate({ body: z.object({ bookingId: z.string().min(1).max(40), csv: z.string().min(1, 'Paste CSV content').max(2_000_000), dryRun: z.boolean().default(false) }) }),
  ah(async (req, res) => {
    const { bookingId, csv, dryRun } = req.body as { bookingId: string; csv: string; dryRun: boolean };
    const booking = await bookingOr404(bookingId);
    const isBlank = (r: string[]) => r.every((f) => f.trim() === '');
    const all = parseCsv(csv);
    const headerIdx = all.findIndex((r) => !isBlank(r));
    // Keep each record's 1-based line number so errors point at the right spreadsheet row.
    const table = all.map((cells, i) => ({ cells, rowNo: i + 1 })).slice(Math.max(headerIdx, 0)).filter((r, i) => i === 0 || !isBlank(r.cells));
    if (headerIdx === -1 || table.length < 2) throw AppError.badRequest('The CSV needs a header row and at least one guest');
    const header = table[0].cells.map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? null);
    if (!header.includes('name')) throw AppError.badRequest('The CSV must have a "name" column. Expected columns: name,email,phone,group,side,plusOnes,dietary,table');
    const dataRows = table.slice(1);
    if (dataRows.length > MAX_IMPORT) throw AppError.badRequest(`At most ${MAX_IMPORT} guests can be imported at once (found ${dataRows.length})`);

    const existingEmails = new Set(
      (await prisma.guest.findMany({ where: { bookingId, email: { not: '' } }, select: { email: true } })).map((g) => g.email.toLowerCase()),
    );
    const valid: GuestInput[] = [];
    const errors: { row: number; message: string }[] = [];
    const skipped: { row: number; message: string }[] = [];
    dataRows.forEach(({ cells, rowNo }) => {
      const obj: Record<string, string> = {};
      header.forEach((key, i) => {
        if (key && cells[i] !== undefined) obj[key] = cells[i].trim();
      });
      if (obj.plusOnes === '') delete obj.plusOnes;
      const parsed = guestInput.safeParse(obj);
      if (!parsed.success) {
        errors.push({ row: rowNo, message: parsed.error.issues.map((i) => `${i.path.join('.') || 'row'}: ${i.message}`).join('; ') });
        return;
      }
      const email = parsed.data.email.toLowerCase();
      if (email && existingEmails.has(email)) {
        skipped.push({ row: rowNo, message: `${email} is already on the guest list` });
        return;
      }
      if (email) existingEmails.add(email);
      valid.push(parsed.data);
    });

    let created = 0;
    if (!dryRun && valid.length) {
      const codes = await uniqueCodes(valid.length);
      const res2 = await prisma.guest.createMany({ data: valid.map((g, i) => ({ ...g, seatNumber: g.seatNumber ?? null, bookingId: booking.id, inviteCode: codes[i] })) });
      created = res2.count;
      await audit(req, { action: 'guest.import', entityType: 'booking', entityId: booking.id, summary: `${created} guests imported (${errors.length} errors, ${skipped.length} skipped)` });
    }
    ok(res, { created, valid: valid.length, errors, skipped, dryRun, totalRows: dataRows.length });
  }),
);

guestsRouter.post(
  '/tables',
  validate({
    body: z.object({
      bookingId: z.string().min(1).max(40),
      assignments: z
        .array(z.object({ guestId: z.string().min(1).max(40), tableLabel: str(40), seatNumber: z.coerce.number().int().min(1).max(10_000).nullable().optional() }))
        .min(1)
        .max(MAX_IMPORT),
    }),
  }),
  ah(async (req, res) => {
    const { bookingId, assignments } = req.body as { bookingId: string; assignments: { guestId: string; tableLabel: string; seatNumber?: number | null }[] };
    const ids = [...new Set(assignments.map((a) => a.guestId))];
    const count = await prisma.guest.count({ where: { id: { in: ids }, bookingId } });
    if (count !== ids.length) throw AppError.badRequest('All guests must belong to this booking');
    await prisma.$transaction(assignments.map((a) => prisma.guest.update({ where: { id: a.guestId }, data: { tableLabel: a.tableLabel, seatNumber: a.tableLabel ? (a.seatNumber ?? null) : null } })));
    ok(res, { updated: assignments.length });
  }),
);

/** Door check-in by invite code (QR). Idempotent: repeat scans never exceed the party size. */
guestsRouter.post(
  '/check-in',
  validate({ body: z.object({ code: str(40).min(4), count: z.coerce.number().int().min(1).max(MAX_PLUS_ONES + 1).optional(), bookingId: z.string().max(40).optional() }) }),
  ah(async (req, res) => {
    const { code, count, bookingId } = req.body as { code: string; count?: number; bookingId?: string };
    const inviteCode = normCode(code);
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Guest" WHERE "inviteCode" = ${inviteCode} FOR UPDATE`;
      if (!locked[0]) throw AppError.notFound('Invitation');
      const g = await tx.guest.findUniqueOrThrow({ where: { id: locked[0].id } });
      if (bookingId && g.bookingId !== bookingId) throw AppError.conflict('This invitation is for a different event');
      const max = g.plusOnes + 1;
      if (g.checkedInAt) {
        // Late-arriving members of the party may be added, never beyond the party size.
        const next = count ? Math.min(max, g.checkedInCount + count) : g.checkedInCount;
        const row = next !== g.checkedInCount ? await tx.guest.update({ where: { id: g.id }, data: { checkedInCount: next } }) : g;
        return { guest: row, alreadyCheckedIn: true, partySize: max };
      }
      const row = await tx.guest.update({ where: { id: g.id }, data: { checkedInAt: new Date(), checkedInCount: Math.min(max, count ?? max) } });
      return { guest: row, alreadyCheckedIn: false, partySize: max };
    });
    ok(res, {
      alreadyCheckedIn: result.alreadyCheckedIn,
      partySize: result.partySize,
      guest: {
        id: result.guest.id,
        name: result.guest.name,
        group: result.guest.group,
        tableLabel: result.guest.tableLabel,
        seatNumber: result.guest.seatNumber,
        rsvpStatus: result.guest.rsvpStatus,
        dietary: result.guest.dietary,
        plusOnes: result.guest.plusOnes,
        checkedInAt: result.guest.checkedInAt,
        checkedInCount: result.guest.checkedInCount,
      },
    });
  }),
);

guestsRouter.post(
  '/:id/undo-check-in',
  ah(async (req, res) => {
    const g = await prisma.guest.findUnique({ where: { id: req.params.id } });
    if (!g) throw AppError.notFound('Guest');
    const row = await prisma.guest.update({ where: { id: g.id }, data: { checkedInAt: null, checkedInCount: 0 } });
    await audit(req, { action: 'guest.undo_check_in', entityType: 'booking', entityId: g.bookingId, summary: g.name });
    ok(res, row);
  }),
);

guestsRouter.post(
  '/invite',
  validate({ body: z.object({ guestIds: z.array(z.string().min(1).max(40)).min(1).max(MAX_IMPORT), resend: z.boolean().default(false) }) }),
  ah(async (req, res) => {
    const { guestIds, resend } = req.body as { guestIds: string[]; resend: boolean };
    const guests = await prisma.guest.findMany({ where: { id: { in: guestIds } }, include: { booking: { select: { id: true, title: true, eventDate: true, status: true } } } });
    if (!guests.length) throw AppError.notFound('Guests');
    const bookingIds = new Set(guests.map((g) => g.bookingId));
    if (bookingIds.size > 1) throw AppError.badRequest('Send invitations for one event at a time');
    const booking = guests[0].booking;
    if (booking.status === 'CANCELLED') throw AppError.conflict('This booking is cancelled');
    let queued = 0;
    let duplicates = 0;
    const noEmail: string[] = [];
    const stamp = resend ? `:${Date.now()}` : '';
    for (const g of guests) {
      if (!g.email) {
        noEmail.push(g.id);
        continue;
      }
      const msg = await sendEmail({
        to: g.email,
        template: 'rsvp_invitation',
        vars: { name: g.name, title: booking.title, eventDate: isoDate(booking.eventDate), url: `${env.APP_URL}/rsvp/${g.inviteCode}` },
        dedupeKey: `rsvp_invite:${g.id}${stamp}`,
        entityType: 'guest',
        entityId: g.id,
      });
      if (msg) queued++;
      else duplicates++;
    }
    await audit(req, { action: 'guest.invite', entityType: 'booking', entityId: booking.id, summary: `${queued} invitations queued${resend ? ' (resend)' : ''}` });
    ok(res, { queued, alreadyInvited: duplicates, noEmail, deliveredByEmail: emailConfigured(), notFound: guestIds.length - guests.length });
  }),
);

// ───────────────────────────── Admin: microsite ─────────────────────────────

const urlOrPath = z
  .string()
  .trim()
  .max(1000)
  .refine((u) => u === '' || u.startsWith('https://') || /^\/uploads\/[\w.\-/]+$/.test(u), 'Use an https:// URL or an uploaded image');
const micrositeInput = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens'),
  enabled: z.boolean().default(false),
  headline: str(200).default(''),
  message: str(4000).default(''),
  coverImage: urlOrPath.default(''),
  schedule: z.array(z.object({ time: str(40).default(''), title: str(200).min(1), location: str(200).default('') })).max(50).default([]),
  gallery: z.array(z.object({ url: urlOrPath.refine((u) => u !== '', 'Image URL required'), alt: str(200).default(''), caption: str(300).default('') })).max(100).default([]),
  photoShareUrl: z.union([z.literal(''), z.string().trim().url().max(1000).startsWith('https://', 'The photo-sharing link must start with https://')]).default(''),
  showCountdown: z.boolean().default(true),
  rsvpEnabled: z.boolean().default(true),
  rsvpDeadline: dateStr.nullable().optional(),
});

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 60)
    .replace(/^-|-$/g, '') || 'event';

const serialiseSite = <T extends { rsvpDeadline: Date | null }>(m: T) => ({ ...m, rsvpDeadline: isoDate(m.rsvpDeadline) });

guestsRouter.get(
  '/microsite',
  validate({ query: z.object({ bookingId: z.string().min(1).max(40) }) }),
  ah(async (req, res) => {
    const { bookingId } = qry<{ bookingId: string }>(req);
    const booking = await bookingOr404(bookingId);
    const site = await prisma.eventMicrosite.findUnique({ where: { bookingId } });
    ok(res, site ? serialiseSite(site) : null, { suggestedSlug: `${slugify(booking.title)}-${booking.reference.toLowerCase().replace(/[^a-z0-9]/g, '').slice(-4)}`, publicUrl: site ? `${env.APP_URL}/e/${site.slug}` : null });
  }),
);

guestsRouter.put(
  '/microsite',
  validate({ query: z.object({ bookingId: z.string().min(1).max(40) }), body: micrositeInput }),
  ah(async (req, res) => {
    const { bookingId } = qry<{ bookingId: string }>(req);
    const booking = await bookingOr404(bookingId);
    const b = req.body as z.infer<typeof micrositeInput>;
    const clash = await prisma.eventMicrosite.findUnique({ where: { slug: b.slug }, select: { bookingId: true } });
    if (clash && clash.bookingId !== booking.id) throw AppError.conflict('That web address is already used by another event');
    const data = { ...b, rsvpDeadline: b.rsvpDeadline ? new Date(`${b.rsvpDeadline}T00:00:00.000Z`) : null };
    const before = await prisma.eventMicrosite.findUnique({ where: { bookingId: booking.id }, select: { enabled: true, slug: true } });
    const site = await prisma.eventMicrosite.upsert({ where: { bookingId: booking.id }, create: { ...data, bookingId: booking.id }, update: data });
    await audit(req, {
      action: 'microsite.save',
      entityType: 'booking',
      entityId: booking.id,
      summary: `/${site.slug} ${site.enabled ? '(live)' : '(hidden)'}`,
      changes: before ? { enabled: { from: before.enabled, to: site.enabled }, slug: { from: before.slug, to: site.slug } } : undefined,
    });
    ok(res, serialiseSite(site), { publicUrl: `${env.APP_URL}/e/${site.slug}` });
  }),
);

// ───────────────────────────── Admin: single guest ─────────────────────────────

guestsRouter.patch(
  '/:id',
  validate({ body: guestInput.partial() }),
  ah(async (req, res) => {
    const g = await prisma.guest.findUnique({ where: { id: req.params.id } });
    if (!g) throw AppError.notFound('Guest');
    const b = req.body as Partial<GuestInput>;
    const row = await prisma.guest.update({
      where: { id: g.id },
      data: { ...b, ...(b.rsvpStatus && b.rsvpStatus !== g.rsvpStatus ? { rsvpAt: new Date() } : {}) },
    });
    ok(res, row);
  }),
);

guestsRouter.delete(
  '/:id',
  ah(async (req, res) => {
    const g = await prisma.guest.findUnique({ where: { id: req.params.id } });
    if (!g) throw AppError.notFound('Guest');
    await prisma.guest.delete({ where: { id: g.id } });
    await audit(req, { action: 'guest.delete', entityType: 'booking', entityId: g.bookingId, summary: g.name });
    ok(res, { ok: true });
  }),
);

// ───────────────────────────── Public: RSVP & microsite ─────────────────────────────

const publicReadLimiter = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 10_000 : 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' } },
});

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

function countdownTarget(eventDate: Date, startTime: string) {
  const time = /^\d{2}:\d{2}$/.test(startTime) ? startTime : '00:00';
  return `${isoDate(eventDate)}T${time}:00`;
}

function rsvpState(
  booking: { eventDate: Date; eventEndDate: Date | null; status: string },
  site: { rsvpEnabled: boolean; rsvpDeadline: Date | null } | null,
) {
  const today = startOfDayUtc();
  if (booking.status === 'CANCELLED') return { open: false, reason: 'This event has been cancelled.' };
  if ((booking.eventEndDate ?? booking.eventDate) < today) return { open: false, reason: 'This event has already taken place.' };
  if (site && !site.rsvpEnabled) return { open: false, reason: 'RSVPs are closed for this event.' };
  if (site?.rsvpDeadline && site.rsvpDeadline < today) return { open: false, reason: `The RSVP deadline (${isoDate(site.rsvpDeadline)}) has passed. Please contact your host.` };
  return { open: true, reason: '' };
}

async function guestByCode(code: string) {
  const inviteCode = normCode(code);
  if (inviteCode.length < 6 || inviteCode.length > 20) throw AppError.notFound('Invitation');
  const g = await prisma.guest.findUnique({
    where: { inviteCode },
    include: {
      booking: {
        select: { id: true, title: true, eventDate: true, eventEndDate: true, startTime: true, venueName: true, city: true, status: true, microsite: true },
      },
    },
  });
  if (!g) throw AppError.notFound('Invitation');
  return g;
}

rsvpPublicRouter.get(
  '/rsvp/:code',
  publicReadLimiter,
  ah(async (req, res) => {
    const g = await guestByCode(req.params.code);
    const b = g.booking;
    const site = b.microsite;
    const state = rsvpState(b, site);
    res.set('Cache-Control', 'private, no-store');
    ok(res, {
      guest: { firstName: firstName(g.name), rsvpStatus: g.rsvpStatus, plusOnes: g.plusOnes, dietary: g.dietary, respondedAt: g.rsvpAt, maxPlusOnes: MAX_PLUS_ONES },
      event: { title: b.title, eventDate: isoDate(b.eventDate), eventEndDate: isoDate(b.eventEndDate), startTime: b.startTime, venueName: b.venueName, city: b.city },
      microsite:
        site && site.enabled
          ? {
              slug: site.slug,
              headline: site.headline,
              message: site.message,
              coverImage: site.coverImage,
              schedule: site.schedule,
              countdownTo: site.showCountdown ? countdownTarget(b.eventDate, b.startTime) : null,
            }
          : null,
      rsvp: { open: state.open, closedReason: state.reason, deadline: isoDate(site?.rsvpDeadline) },
    });
  }),
);

const rsvpBody = z.object({
  rsvpStatus: z.enum(['ATTENDING', 'DECLINED', 'MAYBE']),
  plusOnes: z.coerce.number().int().min(0).max(MAX_PLUS_ONES, `You can bring at most ${MAX_PLUS_ONES} guests`).default(0),
  dietary: z.string().trim().max(300).default(''),
});

rsvpPublicRouter.post(
  '/rsvp/:code',
  formLimiter,
  validate({ body: rsvpBody }),
  ah(async (req, res) => {
    const g = await guestByCode(req.params.code);
    const state = rsvpState(g.booking, g.booking.microsite);
    if (!state.open) throw new AppError(409, 'RSVP_CLOSED', state.reason);
    const b = req.body as z.infer<typeof rsvpBody>;
    const row = await prisma.guest.update({
      where: { id: g.id },
      data: { rsvpStatus: b.rsvpStatus, plusOnes: b.rsvpStatus === 'DECLINED' ? 0 : b.plusOnes, dietary: b.dietary, rsvpAt: new Date() },
    });
    ok(res, { firstName: firstName(row.name), rsvpStatus: row.rsvpStatus, plusOnes: row.plusOnes, dietary: row.dietary, respondedAt: row.rsvpAt });
  }),
);

rsvpPublicRouter.get(
  '/events/:slug',
  publicReadLimiter,
  ah(async (req, res) => {
    const slug = String(req.params.slug).toLowerCase();
    if (!/^[a-z0-9-]{3,80}$/.test(slug)) throw AppError.notFound('Event');
    const site = await prisma.eventMicrosite.findUnique({
      where: { slug },
      include: { booking: { select: { title: true, eventDate: true, eventEndDate: true, startTime: true, venueName: true, city: true, status: true } } },
    });
    if (!site || !site.enabled || site.booking.status === 'CANCELLED') throw AppError.notFound('Event');
    const b = site.booking;
    res.set('Cache-Control', 'public, max-age=60');
    ok(res, {
      slug: site.slug,
      title: b.title,
      eventDate: isoDate(b.eventDate),
      eventEndDate: isoDate(b.eventEndDate),
      startTime: b.startTime,
      venueName: b.venueName,
      city: b.city,
      headline: site.headline,
      message: site.message,
      coverImage: site.coverImage,
      schedule: site.schedule,
      gallery: site.gallery,
      photoShareUrl: site.photoShareUrl,
      countdownTo: site.showCountdown ? countdownTarget(b.eventDate, b.startTime) : null,
      rsvpEnabled: site.rsvpEnabled,
      rsvpDeadline: isoDate(site.rsvpDeadline),
    });
  }),
);
