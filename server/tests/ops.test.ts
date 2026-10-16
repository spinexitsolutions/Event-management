import { beforeAll, describe, expect, it } from 'vitest';
import { agent, createStaff, ensureRoles, loginAs, prisma, staffAgent, type Agent } from './helpers';
import { assertVenueAvailable } from '../src/services/conflicts.service';

let seq = 0;
const uid = () => `${Date.now().toString(36)}${seq++}`;

async function makeBooking(over: { eventDate?: string; eventEndDate?: string | null; venueId?: string | null; status?: 'AWAITING_CONTRACT' | 'CONFIRMED' | 'CANCELLED'; title?: string } = {}) {
  const id = uid();
  const client = await prisma.client.create({ data: { name: `Client ${id}`, email: `client.${id}@example.com` } });
  return prisma.booking.create({
    data: {
      reference: `EV-OPS-${id}`,
      title: over.title ?? `Ops event ${id}`,
      clientId: client.id,
      eventDate: new Date(`${over.eventDate ?? '2027-06-15'}T00:00:00Z`),
      eventEndDate: over.eventEndDate ? new Date(`${over.eventEndDate}T00:00:00Z`) : null,
      venueId: over.venueId ?? null,
      status: over.status ?? 'CONFIRMED',
    },
  });
}

const makeVenue = (exclusive = true) => prisma.venue.create({ data: { slug: `venue-${uid()}`, name: `Venue ${uid()}`, exclusive } });

describe('ops: resources & venue conflicts', () => {
  let a: Agent;
  beforeAll(async () => {
    await ensureRoles();
    a = (await staffAgent('EVENT_MANAGER')).a;
  });

  it('rejects allocations that would overbook an item, and only one of several concurrent requests succeeds', async () => {
    const b1 = await makeBooking({ eventDate: '2027-07-10', eventEndDate: '2027-07-12' });
    const b2 = await makeBooking({ eventDate: '2027-07-11' });
    const r = await a.post('/api/v1/admin/resources', { name: 'Chiavari chair', category: 'Furniture', quantity: 100 });
    expect(r.status).toBe(201);
    const resourceId = r.body.data.id;

    const first = await a.post('/api/v1/admin/resources/allocations', { resourceId, bookingId: b1.id, quantity: 70 });
    expect(first.status).toBe(201);
    expect(first.body.data.fromDate).toBe('2027-07-10'); // defaults to the booking's dates
    expect(first.body.data.toDate).toBe('2027-07-12');

    const over = await a.post('/api/v1/admin/resources/allocations', { resourceId, bookingId: b2.id, quantity: 31 });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('CONFLICT');
    expect(over.body.error.details.available).toBe(30);

    const results = await Promise.all([1, 2, 3].map(() => a.post('/api/v1/admin/resources/allocations', { resourceId, bookingId: b2.id, quantity: 20 })));
    expect(results.filter((x) => x.status === 201)).toHaveLength(1);
    expect(results.filter((x) => x.status === 409)).toHaveLength(2);

    const day = await a.get(`/api/v1/admin/resources/${resourceId}/availability?from=2027-07-11&to=2027-07-11`);
    expect(day.body.data).toMatchObject({ allocated: 90, available: 10 });
    const later = await a.get(`/api/v1/admin/resources/${resourceId}/availability?from=2027-07-13`);
    expect(later.body.data.available).toBe(100);

    const ret = await a.patch(`/api/v1/admin/resources/allocations/${first.body.data.id}`, { status: 'RETURNED', returnedQty: 68, damagedQty: 2, damageNotes: 'Two broken legs' });
    expect(ret.status).toBe(200);
    expect(ret.body.data.resourceFlaggedForRepair).toBe(true);
    expect((await prisma.resource.findUniqueOrThrow({ where: { id: resourceId } })).condition).toBe('NEEDS_REPAIR');
  });

  it('assertVenueAvailable blocks overlapping active bookings on an exclusive venue', async () => {
    const venue = await makeVenue(true);
    const held = await makeBooking({ eventDate: '2027-08-01', eventEndDate: '2027-08-03', venueId: venue.id });
    await makeBooking({ eventDate: '2027-08-02', venueId: venue.id, status: 'CANCELLED' }); // cancelled bookings never block

    await expect(prisma.$transaction((tx) => assertVenueAvailable(tx, venue.id, new Date('2027-08-03T00:00:00Z'), null))).rejects.toMatchObject({ status: 409 });
    await expect(prisma.$transaction((tx) => assertVenueAvailable(tx, venue.id, new Date('2027-07-30T00:00:00Z'), new Date('2027-08-01T00:00:00Z')))).rejects.toMatchObject({ status: 409 });
    await expect(prisma.$transaction((tx) => assertVenueAvailable(tx, venue.id, new Date('2027-08-04T00:00:00Z'), new Date('2027-08-05T00:00:00Z')))).resolves.toBeUndefined();
    // The booking itself is excluded when re-validating its own dates.
    await expect(prisma.$transaction((tx) => assertVenueAvailable(tx, venue.id, new Date('2027-08-02T00:00:00Z'), null, held.id))).resolves.toBeUndefined();

    const shared = await makeVenue(false);
    await makeBooking({ eventDate: '2027-08-01', venueId: shared.id });
    await expect(prisma.$transaction((tx) => assertVenueAvailable(tx, shared.id, new Date('2027-08-01T00:00:00Z'), null))).resolves.toBeUndefined();

    const r = await a.get(`/api/v1/admin/resources/venue-availability?venueId=${venue.id}&from=2027-08-02&to=2027-08-02`);
    expect(r.status).toBe(200);
    expect(r.body.data.available).toBe(false);
    expect(r.body.data.conflicts.map((c: { id: string }) => c.id)).toEqual([held.id]);
  });

  it('calendar entries cannot double-book a venue (409) and warn about overlapping bookings', async () => {
    const venue = await makeVenue(true);
    await makeBooking({ eventDate: '2027-09-05', venueId: venue.id });
    const first = await a.post('/api/v1/admin/calendar/entries', { title: 'Site visit', type: 'SITE_VISIT', startsAt: '2027-09-05T10:00:00Z', endsAt: '2027-09-05T11:00:00Z', venueId: venue.id });
    expect(first.status).toBe(201);
    expect(first.body.meta.warnings.venueBookings).toHaveLength(1);

    const clash = await a.post('/api/v1/admin/calendar/entries', { title: 'Tasting', startsAt: '2027-09-05T10:30:00Z', endsAt: '2027-09-05T12:00:00Z', venueId: venue.id });
    expect(clash.status).toBe(409);

    const adjacent = await a.post('/api/v1/admin/calendar/entries', { title: 'Lighting recce', startsAt: '2027-09-05T11:00:00Z', venueId: venue.id });
    expect(adjacent.status).toBe(201);
  });
});

describe('ops: tasks', () => {
  let a: Agent;
  beforeAll(async () => {
    a = (await staffAgent('EVENT_MANAGER')).a;
  });

  it('blocks DONE while a dependency is open, rejects loops, and stamps completedAt', async () => {
    const b = await makeBooking();
    const t1 = await a.post('/api/v1/admin/tasks', { bookingId: b.id, title: 'Confirm venue', phase: 'Venue Confirmation' });
    const t2 = await a.post('/api/v1/admin/tasks', { bookingId: b.id, title: 'Approve décor', phase: 'Decoration Design', dependsOnId: t1.body.data.id });
    expect(t1.status).toBe(201);
    expect(t2.status).toBe(201);

    const blocked = await a.patch(`/api/v1/admin/tasks/${t2.body.data.id}`, { status: 'DONE' });
    expect(blocked.status).toBe(409);

    const loop = await a.patch(`/api/v1/admin/tasks/${t1.body.data.id}`, { dependsOnId: t2.body.data.id });
    expect(loop.status).toBe(400);

    const other = await makeBooking();
    const foreign = await a.post('/api/v1/admin/tasks', { bookingId: other.id, title: 'x', dependsOnId: t1.body.data.id });
    expect(foreign.status).toBe(400);

    const d1 = await a.patch(`/api/v1/admin/tasks/${t1.body.data.id}`, { status: 'DONE' });
    expect(d1.status).toBe(200);
    expect(d1.body.data.completedAt).toBeTruthy();
    const d2 = await a.patch(`/api/v1/admin/tasks/${t2.body.data.id}`, { status: 'DONE' });
    expect(d2.status).toBe(200);

    const reopened = await a.patch(`/api/v1/admin/tasks/${t1.body.data.id}`, { status: 'IN_PROGRESS' });
    expect(reopened.body.data.completedAt).toBeNull();

    const progress = await a.get(`/api/v1/admin/tasks/progress?bookingId=${b.id}`);
    expect(progress.body.data).toMatchObject({ done: 1, total: 2 });
  });

  it('applies a template with due dates relative to the event date and notifies the assignee', async () => {
    const b = await makeBooking({ eventDate: '2027-06-15' });
    const assignee = await createStaff('OPERATIONS_STAFF');
    const tpl = await a.post('/api/v1/admin/tasks/templates', {
      name: `Mini ${uid()}`,
      eventType: 'Wedding',
      items: [
        { title: 'Lock venue', phase: 'Venue Confirmation', offsetDays: -10, priority: 'HIGH', checklist: ['Deposit paid', 'Contract signed'] },
        { title: 'Settle vendors', phase: 'Final Settlement', offsetDays: 2 },
        { title: 'Run the day', phase: 'Event Day', offsetDays: 0, isMilestone: true },
      ],
    });
    expect(tpl.status).toBe(201);
    const applied = await a.post(`/api/v1/admin/tasks/templates/${tpl.body.data.id}/apply`, { bookingId: b.id, assigneeId: assignee.id });
    expect(applied.status).toBe(201);
    expect(applied.body.data.created).toBe(3);

    const list = await a.get(`/api/v1/admin/tasks?bookingId=${b.id}`);
    const byTitle = Object.fromEntries(list.body.data.map((t: { title: string }) => [t.title, t]));
    expect(byTitle['Lock venue'].dueAt.slice(0, 10)).toBe('2027-06-05');
    expect(byTitle['Run the day'].dueAt.slice(0, 10)).toBe('2027-06-15');
    expect(byTitle['Settle vendors'].dueAt.slice(0, 10)).toBe('2027-06-17');
    expect(byTitle['Lock venue'].checklist).toEqual([
      { id: expect.any(String), label: 'Deposit paid', done: false },
      { id: expect.any(String), label: 'Contract signed', done: false },
    ]);
    expect(list.body.data.map((t: { phase: string }) => t.phase)).toEqual(['Venue Confirmation', 'Event Day', 'Final Settlement']);
    expect(await prisma.notification.count({ where: { userId: assignee.id } })).toBe(1);
  });
});

describe('ops: guests, RSVP and check-in', () => {
  let a: Agent;
  beforeAll(async () => {
    a = (await staffAgent('OPERATIONS_STAFF')).a;
  });

  it('imports guests from CSV and reports row errors', async () => {
    const b = await makeBooking();
    const csv = ['name,email,phone,group,side,plusOnes,dietary,table', 'Asha Rao,asha@example.com,+91 1,Family,Bride,2,Vegetarian,T1', '"Lee, Bo",not-an-email,,,,,,', ',,,,,,,', 'Ravi,,,Friends,Groom,99,,', 'Dup,ASHA@example.com,,,,,,', 'Meera,,,,,1,,'].join('\n');
    const r = await a.post('/api/v1/admin/guests/import', { bookingId: b.id, csv });
    expect(r.status).toBe(200);
    expect(r.body.data.created).toBe(2);
    expect(r.body.data.errors.map((e: { row: number }) => e.row)).toEqual([3, 5]); // bad email, plusOnes > 10 (blank row is skipped)
    expect(r.body.data.skipped.map((e: { row: number }) => e.row)).toEqual([6]); // duplicate email
    const guests = await prisma.guest.findMany({ where: { bookingId: b.id } });
    expect(guests.map((g) => g.name).sort()).toEqual(['Asha Rao', 'Meera']);
    expect(new Set(guests.map((g) => g.inviteCode)).size).toBe(2);

    const tooMany = await a.post('/api/v1/admin/guests/import', { bookingId: b.id, csv: ['name', ...Array.from({ length: 2001 }, (_, i) => `G${i}`)].join('\n') });
    expect(tooMany.status).toBe(400);
  });

  it('accepts an RSVP, enforces the deadline, and check-in is idempotent', async () => {
    const b = await makeBooking({ eventDate: '2027-10-10' });
    const g = await a.post('/api/v1/admin/guests', { bookingId: b.id, name: 'Kiran Shah', email: 'kiran@example.com', plusOnes: 0 });
    expect(g.status).toBe(201);
    const code = g.body.data.inviteCode as string;
    expect(code).toMatch(/^[A-Z0-9]{10}$/);

    const pub = await agent();
    const view = await pub.get(`/api/v1/public/rsvp/${code}`);
    expect(view.status).toBe(200);
    expect(view.body.data.guest.firstName).toBe('Kiran');
    expect(view.body.data.guest).not.toHaveProperty('email');
    expect(view.body.data.rsvp.open).toBe(true);

    const rsvp = await pub.post(`/api/v1/public/rsvp/${code}`, { rsvpStatus: 'ATTENDING', plusOnes: 2, dietary: 'Vegan' });
    expect(rsvp.status).toBe(200);
    expect(rsvp.body.data).toMatchObject({ rsvpStatus: 'ATTENDING', plusOnes: 2 });
    expect((await pub.post(`/api/v1/public/rsvp/${code}`, { rsvpStatus: 'ATTENDING', plusOnes: 11 })).status).toBe(422);
    expect((await pub.get('/api/v1/public/rsvp/NOTACODE00')).status).toBe(404);

    const summary = await a.get(`/api/v1/admin/guests/summary?bookingId=${b.id}`);
    expect(summary.body.data).toMatchObject({ attending: 1, headcount: 3 });

    const first = await a.post('/api/v1/admin/guests/check-in', { code: code.toLowerCase() });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ alreadyCheckedIn: false, partySize: 3 });
    expect(first.body.data.guest.checkedInCount).toBe(3);
    const again = await a.post('/api/v1/admin/guests/check-in', { code, count: 2 });
    expect(again.body.data.alreadyCheckedIn).toBe(true);
    expect(again.body.data.guest.checkedInCount).toBe(3); // never beyond plusOnes + 1

    // Microsite with a past RSVP deadline closes RSVPs; the public microsite exposes no guest data.
    const slug = `kiran-${uid()}`;
    const bad = await a.put(`/api/v1/admin/guests/microsite?bookingId=${b.id}`, { slug, enabled: true, photoShareUrl: 'http://insecure.example.com' });
    expect(bad.status).toBe(422);
    const site = await a.put(`/api/v1/admin/guests/microsite?bookingId=${b.id}`, { slug, enabled: true, headline: 'Join us', schedule: [{ time: '18:00', title: 'Sangeet', location: 'Lawn' }], rsvpDeadline: '2026-01-01' });
    expect(site.status).toBe(200);
    const closed = await pub.post(`/api/v1/public/rsvp/${code}`, { rsvpStatus: 'DECLINED' });
    expect(closed.status).toBe(409);
    expect(closed.body.error.code).toBe('RSVP_CLOSED');
    const micro = await pub.get(`/api/v1/public/events/${slug}`);
    expect(micro.status).toBe(200);
    expect(micro.body.data.schedule).toHaveLength(1);
    expect(JSON.stringify(micro.body.data)).not.toContain('kiran@example.com');
  });
});

describe('ops: staff & access control', () => {
  beforeAll(ensureRoles);

  it('cannot deactivate yourself or change your own role; only a Super Admin can act on a Super Admin', async () => {
    const { user: sa1, a: a1 } = await staffAgent('SUPER_ADMIN');
    const sa2 = await createStaff('SUPER_ADMIN');
    const { a: ownerAgent } = await staffAgent('OWNER');

    expect((await a1.post(`/api/v1/admin/staff/users/${sa1.id}/deactivate`)).status).toBe(409);
    expect((await a1.patch(`/api/v1/admin/staff/users/${sa1.id}`, { roleKey: 'OWNER' })).status).toBe(409);

    expect((await ownerAgent.post(`/api/v1/admin/staff/users/${sa2.id}/deactivate`)).status).toBe(403);
    expect((await ownerAgent.patch(`/api/v1/admin/staff/users/${sa2.id}`, { roleKey: 'OWNER' })).status).toBe(403);
    expect((await ownerAgent.post('/api/v1/admin/staff/users', { name: 'X', email: `x.${uid()}@example.com`, roleKey: 'SUPER_ADMIN' })).status).toBe(403);

    const ok = await a1.post(`/api/v1/admin/staff/users/${sa2.id}/deactivate`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('DEACTIVATED');
    expect(await prisma.session.count({ where: { userId: sa2.id } })).toBe(0);
  });

  it('never leaves the system without an active Super Admin', async () => {
    const { user: sa, a: saAgent } = await staffAgent('SUPER_ADMIN');
    // Make `sa` the only active Super Admin.
    await prisma.user.updateMany({ where: { roleKey: 'SUPER_ADMIN', id: { not: sa.id } }, data: { status: 'DEACTIVATED' } });
    // The only remaining paths to remove the last Super Admin are acting on yourself, which are refused.
    expect((await saAgent.post(`/api/v1/admin/staff/users/${sa.id}/deactivate`)).status).toBe(409);
    expect((await saAgent.patch(`/api/v1/admin/staff/users/${sa.id}`, { roleKey: 'OWNER' })).status).toBe(409);
    expect((await saAgent.put('/api/v1/admin/staff/roles/SUPER_ADMIN', { permissions: ['dashboard.view'] })).status).toBe(409);
    expect(await prisma.user.count({ where: { roleKey: 'SUPER_ADMIN', status: 'ACTIVE' } })).toBe(1);
  });

  it('a non-Super-Admin with staff.manage cannot grant permissions they do not hold', async () => {
    const hrKey = `HR_${uid().toUpperCase()}`;
    const targetKey = `TEAM_${uid().toUpperCase()}`;
    await prisma.role.create({ data: { key: hrKey, name: 'HR', permissions: ['dashboard.view', 'staff.manage', 'tasks.manage'], isSystem: false } });
    await prisma.role.create({ data: { key: targetKey, name: 'Team', permissions: ['dashboard.view'], isSystem: false } });
    const hr = await prisma.user.create({ data: { email: `hr.${uid()}@test.local`, name: 'HR', roleKey: hrKey, passwordHash: (await createStaff('OPERATIONS_STAFF')).passwordHash } });
    const a = await loginAs(hr.email);

    const escalate = await a.put(`/api/v1/admin/staff/roles/${targetKey}`, { permissions: ['dashboard.view', 'finance.manage'] });
    expect(escalate.status).toBe(403);
    const self = await a.put(`/api/v1/admin/staff/roles/${hrKey}`, { permissions: ['dashboard.view', 'staff.manage', 'refunds.approve'] });
    expect(self.status).toBe(403);
    const unknown = await a.put(`/api/v1/admin/staff/roles/${targetKey}`, { permissions: ['root.everything'] });
    expect(unknown.status).toBe(400);
    const allowed = await a.put(`/api/v1/admin/staff/roles/${targetKey}`, { permissions: ['dashboard.view', 'tasks.manage'] });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.permissions).toEqual(['dashboard.view', 'tasks.manage']);
  });

  it('invites staff and returns the link only when email cannot be delivered', async () => {
    const { a } = await staffAgent('OWNER');
    const email = `invitee.${uid()}@example.com`;
    const r = await a.post('/api/v1/admin/staff/users', { name: 'New Planner', email, roleKey: 'EVENT_MANAGER' });
    expect(r.status).toBe(201);
    expect(r.body.data.deliveredByEmail).toBe(false);
    expect(r.body.data.inviteUrl).toMatch(/\/reset-password\?token=.+&invite=1$/);
    expect(r.body.data.user.status).toBe('INVITED');
    expect((await a.post('/api/v1/admin/staff/users', { name: 'Again', email, roleKey: 'EVENT_MANAGER' })).status).toBe(409);
  });
});

describe('ops: notifications outbox', () => {
  it('refuses to retry a message when no provider is configured', async () => {
    const { a } = await staffAgent('OWNER');
    const m = await prisma.outboundMessage.create({ data: { channel: 'EMAIL', to: 'someone@example.com', subject: 'Hi', body: 'Hello', status: 'SKIPPED', lastError: 'No email provider configured' } });
    const r = await a.post(`/api/v1/admin/outbox/${m.id}/retry`);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('PROVIDER_NOT_CONFIGURED');
    expect((await prisma.outboundMessage.findUniqueOrThrow({ where: { id: m.id } })).status).toBe('SKIPPED');
    const status = await a.get('/api/v1/admin/outbox/status');
    expect(status.body.data.email).toMatchObject({ provider: 'none', configured: false });
  });
});

describe('ops: permission denials', () => {
  it('enforces per-module permissions for the wrong roles', async () => {
    const b = await makeBooking();
    const { a: editor } = await staffAgent('CONTENT_EDITOR');
    const { a: sales } = await staffAgent('SALES_EXECUTIVE');
    const { a: finance } = await staffAgent('FINANCE_MANAGER');
    const { a: opsStaff } = await staffAgent('OPERATIONS_STAFF');
    const { a: manager } = await staffAgent('EVENT_MANAGER');

    expect((await editor.get('/api/v1/admin/vendors')).status).toBe(403);
    expect((await editor.get(`/api/v1/admin/guests?bookingId=${b.id}`)).status).toBe(403);
    expect((await editor.get('/api/v1/admin/resources')).status).toBe(403);
    expect((await editor.get('/api/v1/admin/calendar/feed?from=2027-06-01&to=2027-06-30')).status).toBe(403);

    // bookings.view grants read access to tasks but not writes.
    expect((await sales.get(`/api/v1/admin/tasks?bookingId=${b.id}`)).status).toBe(200);
    expect((await sales.post('/api/v1/admin/tasks', { bookingId: b.id, title: 'Nope' })).status).toBe(403);

    // vendors.view without vendors.manage
    expect((await finance.get('/api/v1/admin/vendors')).status).toBe(200);
    expect((await finance.post('/api/v1/admin/vendors', { name: 'Bloom', category: 'Florists' })).status).toBe(403);

    expect((await opsStaff.get('/api/v1/admin/staff/users')).status).toBe(403);
    expect((await manager.get('/api/v1/admin/staff/audit')).status).toBe(403);
    expect((await manager.get('/api/v1/admin/outbox')).status).toBe(403);

    // Payment due dates are only in the calendar feed for finance.view holders.
    await prisma.installment.create({ data: { bookingId: b.id, label: 'Advance', amountMinor: 100_00n, dueDate: new Date('2027-06-01T00:00:00Z') } });
    const salesFeed = await sales.get('/api/v1/admin/calendar/feed?from=2027-06-01&to=2027-06-30&types=payment,booking');
    expect(salesFeed.status).toBe(200);
    expect(salesFeed.body.data.some((i: { source: string }) => i.source === 'payment')).toBe(false);
    const managerFeed = await manager.get('/api/v1/admin/calendar/feed?from=2027-06-01&to=2027-06-30&types=payment');
    expect(managerFeed.body.data.some((i: { bookingId: string }) => i.bookingId === b.id)).toBe(true);

    const anon = await agent();
    expect((await anon.get('/api/v1/notifications')).status).toBe(401);
    expect((await anon.get('/api/v1/admin/tasks/mine')).status).toBe(401);
  });
});
