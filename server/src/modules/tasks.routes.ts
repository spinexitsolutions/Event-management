import { Router, type Request } from 'express';
import { z } from 'zod';
import { TASK_PRIORITIES, TASK_STATUSES } from '@maison/shared';
import { prisma, type Prisma, type Tx } from '../config/db';
import { AppError } from '../lib/AppError';
import { randomToken } from '../lib/crypto';
import { addDays, isoDate } from '../lib/dates';
import { ah, ok, qry } from '../lib/http';
import { requireAnyPermission, requirePermission } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { audit } from '../services/audit.service';
import { notifyUser } from '../services/notify.service';

/**
 * Event execution tasks: per-booking task lists grouped by planning phase, dependencies, checklists,
 * comments, "my tasks", progress, and reusable task templates relative to the event date.
 */
export const tasksRouter = Router();
const canRead = requireAnyPermission('tasks.manage', 'bookings.view');
const canManage = requirePermission('tasks.manage');

export const TASK_PHASES = [
  'Venue Confirmation',
  'Decoration Design',
  'Vendor Confirmation',
  'Guest Coordination',
  'Final Setup',
  'Event Day',
  'Breakdown',
  'Final Settlement',
] as const;
const phaseRank = (p: string) => {
  const i = (TASK_PHASES as readonly string[]).indexOf(p);
  return i === -1 ? TASK_PHASES.length : i;
};

const str = (max: number) => z.string().trim().max(max);
const dateTime = z
  .string()
  .trim()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date/time');
const checklistItem = z.object({ id: str(40).min(1).optional(), label: str(300).min(1), done: z.boolean().default(false) });
type ChecklistItem = { id: string; label: string; done: boolean };
const normaliseChecklist = (items: { id?: string; label: string; done: boolean }[]): ChecklistItem[] =>
  items.map((i) => ({ id: i.id || randomToken(6), label: i.label, done: i.done }));

// ───────────────────────────── Templates ─────────────────────────────

const templateItem = z.object({
  title: str(200).min(1),
  phase: str(60).min(1).default('General'),
  offsetDays: z.coerce.number().int().min(-730).max(365),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  isMilestone: z.boolean().default(false),
  visibleToClient: z.boolean().default(false),
  checklist: z.array(str(300).min(1)).max(50).default([]),
});
type TemplateItem = z.infer<typeof templateItem>;
const templateInput = z.object({
  name: str(120).min(1, 'Name is required'),
  eventType: str(80).default(''),
  items: z.array(templateItem).min(1, 'Add at least one task').max(300),
});

type DefaultTemplate = { name: string; eventType: string; items: TemplateItem[] };
const t = (
  title: string,
  phase: (typeof TASK_PHASES)[number],
  offsetDays: number,
  opts: Partial<Pick<TemplateItem, 'priority' | 'isMilestone' | 'visibleToClient' | 'checklist'>> = {},
): TemplateItem => ({ title, phase, offsetDays, priority: opts.priority ?? 'MEDIUM', isMilestone: opts.isMilestone ?? false, visibleToClient: opts.visibleToClient ?? false, checklist: opts.checklist ?? [] });

/** Starter templates; offsets are days relative to the event date (negative = before). */
export const DEFAULT_TASK_TEMPLATES: DefaultTemplate[] = [
  {
    name: 'Wedding — full planning',
    eventType: 'Wedding',
    items: [
      t('Confirm venue booking and sign venue contract', 'Venue Confirmation', -150, { priority: 'URGENT', isMilestone: true, visibleToClient: true, checklist: ['Hold dates confirmed in writing', 'Venue deposit paid', 'Signed contract uploaded', 'Noise / curfew rules noted'] }),
      t('Venue recce with couple and decorator', 'Venue Confirmation', -120, { priority: 'HIGH', checklist: ['Floor plan and dimensions', 'Power points and load capacity', 'Rain / backup area identified', 'Photos shared with team'] }),
      t('Accommodation block for out-of-town guests', 'Venue Confirmation', -110, { checklist: ['Room count estimated', 'Rate and cut-off date agreed', 'Booking link shared with family'] }),
      t('Mood board and décor concept approval', 'Decoration Design', -100, { priority: 'HIGH', isMilestone: true, visibleToClient: true, checklist: ['Colour palette', 'Mandap / stage concept', 'Entrance and photo-booth', 'Client sign-off'] }),
      t('Floral plan and fresh-flower order', 'Decoration Design', -45, { checklist: ['Flower varieties and quantities', 'Seasonal availability confirmed', 'Delivery slot booked'] }),
      t('Lighting and stage design final', 'Decoration Design', -40, { checklist: ['Lighting plot', 'Stage drawings', 'Power / generator requirement'] }),
      t('Confirm caterer, menu tasting and final menu', 'Vendor Confirmation', -60, { priority: 'HIGH', visibleToClient: true, checklist: ['Tasting scheduled', 'Menu finalised', 'Dietary counts (veg / Jain / vegan / allergies)', 'Service staff ratio'] }),
      t('Confirm photographer and videographer', 'Vendor Confirmation', -90, { checklist: ['Contract signed', 'Shot list shared', 'Drone permission if needed'] }),
      t('Confirm DJ / band and sound', 'Vendor Confirmation', -60, { checklist: ['Set list / first-dance song', 'Sound check slot', 'Licences checked'] }),
      t('Confirm makeup, mehendi and wardrobe artists', 'Vendor Confirmation', -45),
      t('Transport and guest shuttle plan', 'Vendor Confirmation', -30, { checklist: ['Vehicle count', 'Pickup schedule', 'Driver contacts shared'] }),
      t('Vendor reconfirmation calls (all vendors)', 'Vendor Confirmation', -7, { priority: 'HIGH', isMilestone: true, checklist: ['Arrival times', 'Contact person on day', 'Balance payments due'] }),
      t('Send invitations and open RSVP', 'Guest Coordination', -75, { priority: 'HIGH', visibleToClient: true, checklist: ['Guest list imported', 'Invitations sent', 'Microsite published'] }),
      t('RSVP follow-up and final headcount', 'Guest Coordination', -14, { priority: 'HIGH', isMilestone: true, visibleToClient: true }),
      t('Seating plan and table assignments', 'Guest Coordination', -10, { visibleToClient: true }),
      t('Welcome hampers and room drops', 'Guest Coordination', -3),
      t('Run sheet and cue-to-cue rehearsal', 'Final Setup', -2, { priority: 'HIGH', checklist: ['Minute-by-minute run sheet', 'Emcee script', 'Ritual timings confirmed with family'] }),
      t('Décor installation and sound check', 'Final Setup', -1, { priority: 'URGENT', checklist: ['Stage built', 'Lighting focused', 'Sound check done', 'Backup generator tested'] }),
      t('Event-day coordination and guest check-in', 'Event Day', 0, { priority: 'URGENT', isMilestone: true, checklist: ['Check-in desk staffed', 'Vendor arrivals logged', 'Emergency kit on site'] }),
      t('Teardown and venue handover', 'Breakdown', 1, { priority: 'HIGH', checklist: ['Rented items counted', 'Damages recorded', 'Venue inspection signed'] }),
      t('Return rental inventory and log damages', 'Breakdown', 2),
      t('Settle vendor balances', 'Final Settlement', 7, { priority: 'HIGH', checklist: ['Invoices received', 'Payments recorded', 'TDS / receipts filed'] }),
      t('Final client invoice and feedback request', 'Final Settlement', 10, { isMilestone: true, visibleToClient: true }),
      t('Deliver photo / video gallery', 'Final Settlement', 45, { visibleToClient: true }),
    ],
  },
  {
    name: 'Corporate event / conference',
    eventType: 'Corporate event',
    items: [
      t('Venue contract, AV inventory and floor plan', 'Venue Confirmation', -60, { priority: 'URGENT', isMilestone: true, visibleToClient: true, checklist: ['Contract signed', 'Breakout rooms held', 'Wi-Fi capacity confirmed', 'Floor plan approved'] }),
      t('Insurance, permits and safety plan', 'Venue Confirmation', -40, { checklist: ['Public liability insurance', 'Fire / safety approvals', 'Emergency exits marked on plan'] }),
      t('Branding, signage and stage backdrop design', 'Decoration Design', -35, { priority: 'HIGH', visibleToClient: true, checklist: ['Brand guidelines received', 'Backdrop artwork approved', 'Wayfinding signage', 'Print files sent'] }),
      t('Confirm AV, staging and live-stream partner', 'Vendor Confirmation', -30, { priority: 'HIGH', checklist: ['Projection / LED sizes', 'Mic count', 'Stream platform and links', 'Rehearsal slot'] }),
      t('Confirm catering and coffee breaks', 'Vendor Confirmation', -21, { checklist: ['Menu', 'Dietary counts', 'Break timings aligned with agenda'] }),
      t('Speaker logistics (travel, decks, green room)', 'Vendor Confirmation', -14, { checklist: ['Travel booked', 'Decks collected', 'Speaker briefing sent'] }),
      t('Registration open and attendee communications', 'Guest Coordination', -30, { priority: 'HIGH', visibleToClient: true, checklist: ['Registration page live', 'Confirmation emails', 'Reminder schedule'] }),
      t('Badges, lanyards and delegate kits', 'Guest Coordination', -7),
      t('Final attendee list to client and venue', 'Guest Coordination', -3, { isMilestone: true, visibleToClient: true }),
      t('Technical rehearsal and run of show', 'Final Setup', -1, { priority: 'URGENT', checklist: ['Slides loaded', 'Mic check', 'Stream test', 'Run of show printed'] }),
      t('Event-day registration desk and show calling', 'Event Day', 0, { priority: 'URGENT', isMilestone: true }),
      t('Load-out and equipment return', 'Breakdown', 0, { priority: 'HIGH' }),
      t('Attendee survey and session recordings', 'Final Settlement', 3, { visibleToClient: true }),
      t('Vendor settlement and final invoice', 'Final Settlement', 7, { priority: 'HIGH', isMilestone: true }),
    ],
  },
  {
    name: 'Concert / festival',
    eventType: 'Concert/festival',
    items: [
      t('Venue / ground booking and licences', 'Venue Confirmation', -90, { priority: 'URGENT', isMilestone: true, checklist: ['Ground contract signed', 'Police / municipal permission', 'Performance licences (IPRS / PPL)', 'Excise licence if applicable'] }),
      t('Site plan: stage, FOH, crowd barriers, exits', 'Venue Confirmation', -60, { priority: 'HIGH', checklist: ['Capacity calculation', 'Barricade plan', 'Medical and fire points', 'Accessibility routes'] }),
      t('Stage, lighting and visual design', 'Decoration Design', -45, { checklist: ['Stage plot', 'Lighting design', 'LED content', 'Sponsor branding placements'] }),
      t('Artist contracts, riders and travel', 'Vendor Confirmation', -60, { priority: 'URGENT', checklist: ['Contracts signed', 'Technical riders received', 'Hospitality riders', 'Travel and hotels booked'] }),
      t('Sound, lighting and backline vendor confirmation', 'Vendor Confirmation', -30, { priority: 'HIGH' }),
      t('Security, bouncers and medical team', 'Vendor Confirmation', -21, { priority: 'HIGH', checklist: ['Guard count per zone', 'Ambulance on standby', 'Briefing scheduled'] }),
      t('F&B stalls, toilets and power', 'Vendor Confirmation', -21),
      t('Ticketing live and guest-list management', 'Guest Coordination', -45, { priority: 'HIGH', checklist: ['Ticketing partner set up', 'Wristbands ordered', 'Guest list and passes'] }),
      t('Crowd communication: entry rules and timings', 'Guest Coordination', -5),
      t('Build, sound check and safety walk-through', 'Final Setup', -1, { priority: 'URGENT', isMilestone: true, checklist: ['Stage load test', 'Line check', 'Fire marshal sign-off'] }),
      t('Show day: gates, stage management and security', 'Event Day', 0, { priority: 'URGENT', isMilestone: true }),
      t('Load-out and ground restoration', 'Breakdown', 1, { priority: 'HIGH', checklist: ['Equipment counted', 'Waste cleared', 'Ground handover'] }),
      t('Artist and vendor settlements, ticket reconciliation', 'Final Settlement', 7, { priority: 'HIGH', isMilestone: true }),
    ],
  },
  {
    name: 'Birthday / private party',
    eventType: 'Birthday/private party',
    items: [
      t('Confirm venue and party timing', 'Venue Confirmation', -30, { priority: 'HIGH', isMilestone: true, visibleToClient: true, checklist: ['Venue deposit paid', 'Timing and curfew confirmed'] }),
      t('Theme, colour palette and décor plan', 'Decoration Design', -21, { visibleToClient: true, checklist: ['Theme agreed', 'Balloon / backdrop design', 'Table styling'] }),
      t('Cake order and dessert table', 'Vendor Confirmation', -10, { checklist: ['Flavour and design', 'Dietary needs', 'Delivery time'] }),
      t('Confirm caterer, entertainer and photographer', 'Vendor Confirmation', -14, { priority: 'HIGH' }),
      t('Send invitations and track RSVPs', 'Guest Coordination', -21, { visibleToClient: true }),
      t('Final headcount and return gifts', 'Guest Coordination', -4, { isMilestone: true, visibleToClient: true }),
      t('Décor setup and sound check', 'Final Setup', 0, { priority: 'HIGH', checklist: ['Backdrop and balloons', 'Music playlist', 'Cake table ready'] }),
      t('Party-day coordination', 'Event Day', 0, { priority: 'URGENT', isMilestone: true }),
      t('Pack-down and venue handover', 'Breakdown', 0),
      t('Settle vendors and share photos', 'Final Settlement', 5, { visibleToClient: true }),
    ],
  },
];

tasksRouter.get(
  '/templates',
  canRead,
  ah(async (_req, res) => {
    const items = await prisma.taskTemplate.findMany({ orderBy: [{ eventType: 'asc' }, { name: 'asc' }] });
    ok(res, items, { defaults: DEFAULT_TASK_TEMPLATES.map((d) => ({ name: d.name, eventType: d.eventType, taskCount: d.items.length })), phases: TASK_PHASES });
  }),
);

/** Installs any built-in templates that are not present yet (matched by name). */
tasksRouter.post(
  '/templates/install-defaults',
  canManage,
  ah(async (req, res) => {
    const existing = new Set((await prisma.taskTemplate.findMany({ select: { name: true } })).map((r) => r.name));
    const missing = DEFAULT_TASK_TEMPLATES.filter((d) => !existing.has(d.name));
    if (missing.length) await prisma.taskTemplate.createMany({ data: missing.map((d) => ({ name: d.name, eventType: d.eventType, items: d.items })) });
    if (missing.length) await audit(req, { action: 'task_template.install_defaults', entityType: 'taskTemplate', summary: missing.map((m) => m.name).join(', ') });
    ok(res, { installed: missing.length });
  }),
);

tasksRouter.get(
  '/templates/:id',
  canRead,
  ah(async (req, res) => {
    const row = await prisma.taskTemplate.findUnique({ where: { id: req.params.id } });
    if (!row) throw AppError.notFound('Task template');
    ok(res, row);
  }),
);

tasksRouter.post(
  '/templates',
  canManage,
  validate({ body: templateInput }),
  ah(async (req, res) => {
    const b = req.body as z.infer<typeof templateInput>;
    const row = await prisma.taskTemplate.create({ data: b });
    await audit(req, { action: 'task_template.create', entityType: 'taskTemplate', entityId: row.id, summary: `${row.name} (${b.items.length} tasks)` });
    ok(res, row, undefined, 201);
  }),
);

tasksRouter.put(
  '/templates/:id',
  canManage,
  validate({ body: templateInput }),
  ah(async (req, res) => {
    const existing = await prisma.taskTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) throw AppError.notFound('Task template');
    const b = req.body as z.infer<typeof templateInput>;
    const row = await prisma.taskTemplate.update({ where: { id: existing.id }, data: b });
    await audit(req, { action: 'task_template.update', entityType: 'taskTemplate', entityId: row.id, summary: row.name });
    ok(res, row);
  }),
);

tasksRouter.delete(
  '/templates/:id',
  canManage,
  ah(async (req, res) => {
    const existing = await prisma.taskTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) throw AppError.notFound('Task template');
    await prisma.taskTemplate.delete({ where: { id: existing.id } });
    await audit(req, { action: 'task_template.delete', entityType: 'taskTemplate', entityId: existing.id, summary: existing.name });
    ok(res, { ok: true });
  }),
);

tasksRouter.post(
  '/templates/:id/apply',
  canManage,
  validate({ body: z.object({ bookingId: z.string().min(1).max(40), assigneeId: z.string().max(40).nullable().optional() }) }),
  ah(async (req, res) => {
    const { bookingId, assigneeId } = req.body as { bookingId: string; assigneeId?: string | null };
    const [tpl, booking] = await Promise.all([
      prisma.taskTemplate.findUnique({ where: { id: req.params.id } }),
      prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true, reference: true, title: true, eventDate: true, managerId: true, status: true } }),
    ]);
    if (!tpl) throw AppError.notFound('Task template');
    if (!booking) throw AppError.notFound('Booking');
    if (booking.status === 'CANCELLED') throw AppError.conflict('This booking is cancelled');
    const parsed = z.array(templateItem).safeParse(tpl.items);
    if (!parsed.success) throw AppError.badRequest('This template is malformed. Edit and save it again.');
    const assignee = assigneeId === undefined ? booking.managerId : assigneeId;
    if (assignee) await assertAssignable(assignee);

    const created = await prisma.$transaction(async (tx) => {
      const max = await tx.task.aggregate({ where: { bookingId }, _max: { sortOrder: true } });
      let order = (max._max.sortOrder ?? -1) + 1;
      const sorted = [...parsed.data].sort((a, b) => phaseRank(a.phase) - phaseRank(b.phase) || a.offsetDays - b.offsetDays);
      const rows = sorted.map((i) => ({
        bookingId,
        title: i.title,
        phase: i.phase,
        priority: i.priority,
        isMilestone: i.isMilestone,
        visibleToClient: i.visibleToClient,
        dueAt: addDays(booking.eventDate, i.offsetDays),
        checklist: i.checklist.map((label) => ({ id: randomToken(6), label, done: false })),
        assigneeId: assignee ?? null,
        sortOrder: order++,
      }));
      await tx.task.createMany({ data: rows });
      return rows.length;
    });
    await audit(req, { action: 'task_template.apply', entityType: 'booking', entityId: booking.id, summary: `${tpl.name}: ${created} tasks added to ${booking.reference}` });
    if (assignee && assignee !== req.user!.id) {
      await notifyUser(assignee, `${created} tasks assigned to you`, `${booking.title} (${booking.reference}) — from template “${tpl.name}”`, `/admin/bookings/${booking.id}?tab=tasks`).catch(() => undefined);
    }
    ok(res, { created }, undefined, 201);
  }),
);

// ───────────────────────────── Tasks ─────────────────────────────

const taskInclude = {
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  dependsOn: { select: { id: true, title: true, status: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskInclude;

async function assertAssignable(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { status: true, roleKey: true } });
  if (!u || u.roleKey === 'CLIENT' || u.status === 'DEACTIVATED') throw AppError.badRequest('Tasks can only be assigned to active staff members');
}

/** Dependency must be another task on the same booking and must not create a cycle. */
async function assertDependency(tx: Tx, taskId: string | null, bookingId: string, dependsOnId: string) {
  if (taskId && dependsOnId === taskId) throw AppError.badRequest('A task cannot depend on itself');
  const dep = await tx.task.findUnique({ where: { id: dependsOnId }, select: { id: true, bookingId: true } });
  if (!dep || dep.bookingId !== bookingId) throw AppError.badRequest('The dependency must be a task on the same booking');
  if (!taskId) return;
  let cursor: string | null = dependsOnId;
  for (let hops = 0; cursor && hops < 500; hops++) {
    if (cursor === taskId) throw AppError.badRequest('That dependency would create a loop');
    const next: { dependsOnId: string | null } | null = await tx.task.findUnique({ where: { id: cursor }, select: { dependsOnId: true } });
    cursor = next?.dependsOnId ?? null;
  }
}

const sortTasks = <T extends { phase: string; sortOrder: number; createdAt: Date }>(rows: T[]) =>
  rows.sort((a, b) => phaseRank(a.phase) - phaseRank(b.phase) || a.phase.localeCompare(b.phase) || a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());

const listQuery = z.object({
  bookingId: z.string().min(1).max(40),
  status: z.enum(TASK_STATUSES).optional(),
  assigneeId: z.string().max(40).optional(),
  phase: str(60).optional(),
});

tasksRouter.get(
  '/',
  canRead,
  validate({ query: listQuery }),
  ah(async (req, res) => {
    const q = qry<z.infer<typeof listQuery>>(req);
    const rows = await prisma.task.findMany({
      where: { bookingId: q.bookingId, ...(q.status ? { status: q.status } : {}), ...(q.assigneeId ? { assigneeId: q.assigneeId } : {}), ...(q.phase ? { phase: q.phase } : {}) },
      include: taskInclude,
    });
    const now = Date.now();
    ok(
      res,
      sortTasks(rows).map((r) => ({ ...r, overdue: r.status !== 'DONE' && !!r.dueAt && r.dueAt.getTime() < now, blockedByDependency: !!r.dependsOn && r.dependsOn.status !== 'DONE' })),
      { phases: TASK_PHASES },
    );
  }),
);

tasksRouter.get(
  '/mine',
  canRead,
  validate({ query: z.object({ includeDone: z.enum(['true', 'false']).optional(), limit: z.coerce.number().int().min(1).max(500).default(200) }) }),
  ah(async (req, res) => {
    const q = qry<{ includeDone?: string; limit: number }>(req);
    const rows = await prisma.task.findMany({
      where: { assigneeId: req.user!.id, ...(q.includeDone === 'true' ? {} : { status: { not: 'DONE' } }), booking: { status: { not: 'CANCELLED' } } },
      include: { ...taskInclude, booking: { select: { id: true, reference: true, title: true, eventDate: true } } },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }],
      take: q.limit,
    });
    const now = Date.now();
    ok(
      res,
      rows.map((r) => ({ ...r, booking: { ...r.booking, eventDate: isoDate(r.booking.eventDate) }, overdue: r.status !== 'DONE' && !!r.dueAt && r.dueAt.getTime() < now })),
    );
  }),
);

tasksRouter.get(
  '/progress',
  canRead,
  validate({ query: z.object({ bookingId: z.string().min(1).max(40) }) }),
  ah(async (req, res) => {
    const { bookingId } = qry<{ bookingId: string }>(req);
    const rows = await prisma.task.findMany({ where: { bookingId }, select: { phase: true, status: true, dueAt: true, isMilestone: true } });
    const now = Date.now();
    const phases = new Map<string, { phase: string; done: number; total: number; overdue: number }>();
    let done = 0;
    let overdue = 0;
    let milestonesDone = 0;
    let milestones = 0;
    for (const r of rows) {
      const p = phases.get(r.phase) ?? { phase: r.phase, done: 0, total: 0, overdue: 0 };
      p.total++;
      if (r.status === 'DONE') {
        p.done++;
        done++;
      } else if (r.dueAt && r.dueAt.getTime() < now) {
        p.overdue++;
        overdue++;
      }
      if (r.isMilestone) {
        milestones++;
        if (r.status === 'DONE') milestonesDone++;
      }
      phases.set(r.phase, p);
    }
    const byPhase = [...phases.values()].sort((a, b) => phaseRank(a.phase) - phaseRank(b.phase) || a.phase.localeCompare(b.phase)).map((p) => ({ ...p, percent: p.total ? Math.round((p.done / p.total) * 100) : 0 }));
    ok(res, { done, total: rows.length, overdue, percent: rows.length ? Math.round((done / rows.length) * 100) : 0, milestones: { done: milestonesDone, total: milestones }, byPhase });
  }),
);

const taskBase = {
  title: str(200).min(1, 'Title is required'),
  description: str(8000).default(''),
  phase: str(60).min(1).default('General'),
  assigneeId: z.string().max(40).nullable().optional(),
  dueAt: dateTime.nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).default('MEDIUM'),
  status: z.enum(TASK_STATUSES).default('TODO'),
  isMilestone: z.boolean().default(false),
  visibleToClient: z.boolean().default(false),
  dependsOnId: z.string().max(40).nullable().optional(),
  checklist: z.array(checklistItem).max(100).default([]),
};
const taskCreate = z.object({ bookingId: z.string().min(1).max(40), ...taskBase });
const taskUpdate = z
  .object({
    title: taskBase.title.optional(),
    description: str(8000).optional(),
    phase: str(60).min(1).optional(),
    assigneeId: taskBase.assigneeId,
    dueAt: taskBase.dueAt,
    priority: z.enum(TASK_PRIORITIES).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    isMilestone: z.boolean().optional(),
    visibleToClient: z.boolean().optional(),
    dependsOnId: taskBase.dependsOnId,
    checklist: z.array(checklistItem).max(100).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'Nothing to update');

async function notifyAssigned(req: Request, task: { id: string; title: string; bookingId: string; dueAt: Date | null }, assigneeId: string | null | undefined) {
  if (!assigneeId || assigneeId === req.user!.id) return;
  const booking = await prisma.booking.findUnique({ where: { id: task.bookingId }, select: { title: true, reference: true } });
  await notifyUser(
    assigneeId,
    `New task: ${task.title}`.slice(0, 200),
    `${req.user!.name} assigned you a task for ${booking?.title ?? 'an event'}${booking ? ` (${booking.reference})` : ''}${task.dueAt ? ` — due ${isoDate(task.dueAt)}` : ''}`,
    `/admin/bookings/${task.bookingId}?tab=tasks&task=${task.id}`,
  ).catch(() => undefined);
}

tasksRouter.post(
  '/',
  canManage,
  validate({ body: taskCreate }),
  ah(async (req, res) => {
    const b = req.body as z.infer<typeof taskCreate>;
    const booking = await prisma.booking.findUnique({ where: { id: b.bookingId }, select: { id: true } });
    if (!booking) throw AppError.notFound('Booking');
    if (b.assigneeId) await assertAssignable(b.assigneeId);
    const row = await prisma.$transaction(async (tx) => {
      if (b.dependsOnId) {
        await assertDependency(tx, null, b.bookingId, b.dependsOnId);
        if (b.status === 'DONE') {
          const dep = await tx.task.findUnique({ where: { id: b.dependsOnId }, select: { status: true, title: true } });
          if (dep && dep.status !== 'DONE') throw AppError.conflict(`Complete “${dep.title}” first`);
        }
      }
      const max = await tx.task.aggregate({ where: { bookingId: b.bookingId, phase: b.phase }, _max: { sortOrder: true } });
      return tx.task.create({
        data: {
          ...b,
          assigneeId: b.assigneeId ?? null,
          dependsOnId: b.dependsOnId ?? null,
          dueAt: b.dueAt ? new Date(b.dueAt) : null,
          checklist: normaliseChecklist(b.checklist),
          completedAt: b.status === 'DONE' ? new Date() : null,
          sortOrder: (max._max.sortOrder ?? -1) + 1,
        },
        include: taskInclude,
      });
    });
    await audit(req, { action: 'task.create', entityType: 'booking', entityId: row.bookingId, summary: row.title });
    await notifyAssigned(req, row, row.assigneeId);
    ok(res, row, undefined, 201);
  }),
);

tasksRouter.post(
  '/reorder',
  canManage,
  validate({ body: z.object({ bookingId: z.string().min(1).max(40), ids: z.array(z.string().max(40)).min(1).max(1000), phase: str(60).min(1).optional() }) }),
  ah(async (req, res) => {
    const { bookingId, ids, phase } = req.body as { bookingId: string; ids: string[]; phase?: string };
    const count = await prisma.task.count({ where: { id: { in: ids }, bookingId } });
    if (count !== new Set(ids).size) throw AppError.badRequest('All tasks must belong to this booking');
    await prisma.$transaction(ids.map((id, i) => prisma.task.update({ where: { id }, data: { sortOrder: i, ...(phase ? { phase } : {}) } })));
    ok(res, { ok: true });
  }),
);

tasksRouter.patch(
  '/:id',
  canManage,
  validate({ body: taskUpdate }),
  ah(async (req, res) => {
    const b = req.body as z.infer<typeof taskUpdate>;
    if (b.assigneeId) await assertAssignable(b.assigneeId);
    const { before, row } = await prisma.$transaction(async (tx) => {
      const before = await tx.task.findUnique({ where: { id: req.params.id } });
      if (!before) throw AppError.notFound('Task');
      if (b.dependsOnId) await assertDependency(tx, before.id, before.bookingId, b.dependsOnId);
      const status = b.status ?? before.status;
      const dependsOnId = b.dependsOnId === undefined ? before.dependsOnId : b.dependsOnId;
      if (status === 'DONE' && before.status !== 'DONE' && dependsOnId) {
        const dep = await tx.task.findUnique({ where: { id: dependsOnId }, select: { status: true, title: true } });
        if (dep && dep.status !== 'DONE') throw AppError.conflict(`This task depends on “${dep.title}”, which is not done yet`, { dependsOnId });
      }
      const data: Prisma.TaskUncheckedUpdateInput = {};
      for (const k of ['title', 'description', 'phase', 'priority', 'isMilestone', 'visibleToClient'] as const) if (b[k] !== undefined) (data as Record<string, unknown>)[k] = b[k];
      if (b.assigneeId !== undefined) data.assigneeId = b.assigneeId;
      if (b.dependsOnId !== undefined) data.dependsOnId = b.dependsOnId;
      if (b.dueAt !== undefined) {
        data.dueAt = b.dueAt ? new Date(b.dueAt) : null;
        data.reminderSentAt = null;
      }
      if (b.checklist !== undefined) data.checklist = normaliseChecklist(b.checklist);
      if (b.status !== undefined) {
        data.status = b.status;
        if (b.status === 'DONE' && before.status !== 'DONE') data.completedAt = new Date();
        if (b.status !== 'DONE') data.completedAt = null;
      }
      const row = await tx.task.update({ where: { id: before.id }, data, include: taskInclude });
      return { before, row };
    });
    if (before.status !== row.status || before.assigneeId !== row.assigneeId) {
      await audit(req, {
        action: 'task.update',
        entityType: 'booking',
        entityId: row.bookingId,
        summary: `${row.title}${before.status !== row.status ? `: ${before.status} → ${row.status}` : ''}`,
        changes: { status: { from: before.status, to: row.status }, assigneeId: { from: before.assigneeId, to: row.assigneeId } },
      });
    }
    if (row.assigneeId && row.assigneeId !== before.assigneeId) await notifyAssigned(req, row, row.assigneeId);
    ok(res, row);
  }),
);

tasksRouter.post(
  '/:id/checklist/:itemId/toggle',
  canManage,
  validate({ body: z.object({ done: z.boolean().optional() }) }),
  ah(async (req, res) => {
    const row = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ checklist: unknown }[]>`SELECT "checklist" FROM "Task" WHERE "id" = ${req.params.id} FOR UPDATE`;
      if (!locked[0]) throw AppError.notFound('Task');
      const items = (Array.isArray(locked[0].checklist) ? locked[0].checklist : []) as ChecklistItem[];
      const item = items.find((i) => i.id === req.params.itemId);
      if (!item) throw AppError.notFound('Checklist item');
      item.done = typeof req.body.done === 'boolean' ? req.body.done : !item.done;
      return tx.task.update({ where: { id: req.params.id }, data: { checklist: items }, include: taskInclude });
    });
    ok(res, row);
  }),
);

tasksRouter.delete(
  '/:id',
  canManage,
  ah(async (req, res) => {
    const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!existing) throw AppError.notFound('Task');
    await prisma.task.delete({ where: { id: existing.id } });
    await audit(req, { action: 'task.delete', entityType: 'booking', entityId: existing.bookingId, summary: existing.title });
    ok(res, { ok: true });
  }),
);

tasksRouter.get(
  '/:id/comments',
  canRead,
  ah(async (req, res) => {
    const task = await prisma.task.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!task) throw AppError.notFound('Task');
    ok(res, await prisma.taskComment.findMany({ where: { taskId: task.id }, orderBy: { createdAt: 'asc' }, take: 500 }));
  }),
);

tasksRouter.post(
  '/:id/comments',
  canManage,
  validate({ body: z.object({ body: str(4000).min(1, 'Write a comment') }) }),
  ah(async (req, res) => {
    const task = await prisma.task.findUnique({ where: { id: req.params.id }, select: { id: true, title: true, assigneeId: true, bookingId: true } });
    if (!task) throw AppError.notFound('Task');
    const row = await prisma.taskComment.create({ data: { taskId: task.id, authorId: req.user!.id, authorName: req.user!.name, body: req.body.body } });
    if (task.assigneeId && task.assigneeId !== req.user!.id) {
      await notifyUser(task.assigneeId, `New comment on “${task.title}”`.slice(0, 200), `${req.user!.name}: ${String(req.body.body).slice(0, 140)}`, `/admin/bookings/${task.bookingId}?tab=tasks&task=${task.id}`).catch(
        () => undefined,
      );
    }
    ok(res, row, undefined, 201);
  }),
);
