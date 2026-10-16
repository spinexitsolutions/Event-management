import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { agent, app, ensureRoles, loginAs, PASSWORD, prisma, staffAgent } from './helpers';
import { hashPassword } from '../src/services/auth.service';

async function clientWithBooking(label: string) {
  const email = `${label}.${Date.now()}@example.com`;
  const user = await prisma.user.create({ data: { email, name: label, roleKey: 'CLIENT', status: 'ACTIVE', passwordHash: await hashPassword(PASSWORD) } });
  const c = await prisma.client.create({ data: { name: label, email, userId: user.id } });
  const b = await prisma.booking.create({ data: { reference: `EV-${label}-${Date.now()}`, title: `${label} event`, clientId: c.id, eventDate: new Date('2027-05-01'), contractValueMinor: 100_000n } });
  const d = await prisma.mediaAsset.create({ data: { url: '', provider: 'local', storageKey: 'x.pdf', kind: 'DOCUMENT', mime: 'application/pdf', filename: 'secret.pdf', isPrivate: true, tags: [] } });
  const doc = await prisma.document.create({ data: { bookingId: b.id, name: 'Contract', mediaId: d.id, visibleToClient: true } });
  return { email, booking: b, doc };
}

describe('authentication & authorisation', () => {
  beforeAll(ensureRoles);

  it('rejects state-changing requests without a CSRF token', async () => {
    const r = await request(app).post('/api/v1/auth/login').send({ email: 'a@b.co', password: 'x' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('CSRF_FAILED');
  });

  it('does not reveal whether an email exists and locks after repeated failures', async () => {
    const { user } = await staffAgent('SALES_EXECUTIVE');
    const a = await agent();
    const wrong = await a.post('/api/v1/auth/login', { email: user.email, password: 'wrongpass1' });
    const unknown = await a.post('/api/v1/auth/login', { email: 'ghost@example.com', password: 'wrongpass1' });
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    for (let i = 0; i < 8; i++) await a.post('/api/v1/auth/login', { email: user.email, password: 'wrongpass1' });
    const locked = await a.post('/api/v1/auth/login', { email: user.email, password: PASSWORD });
    expect(locked.status).toBe(429);
  });

  it('a client cannot read another client’s booking, documents or pay for it by guessing ids', async () => {
    const alice = await clientWithBooking('alice');
    const bob = await clientWithBooking('bob');
    const a = await loginAs(alice.email);
    expect((await a.get(`/api/v1/portal/bookings/${alice.booking.id}`)).status).toBe(200);
    expect((await a.get(`/api/v1/portal/bookings/${bob.booking.id}`)).status).toBe(404);
    expect((await a.get(`/api/v1/portal/bookings/${bob.booking.id}/documents/${bob.doc.id}`)).status).toBe(404);
    expect((await a.get(`/api/v1/portal/bookings/${alice.booking.id}/documents/${bob.doc.id}`)).status).toBe(404);
    expect((await a.post(`/api/v1/portal/bookings/${bob.booking.id}/payments/order`, {})).status).toBe(404);
    expect((await a.post(`/api/v1/portal/bookings/${bob.booking.id}/messages`, { body: 'hi' })).status).toBe(404);
  });

  it('enforces role permissions on the server', async () => {
    const sales = (await staffAgent('SALES_EXECUTIVE')).a;
    expect((await sales.get('/api/v1/admin/inquiries')).status).toBe(200);
    expect((await sales.get('/api/v1/admin/finance/payments')).status).toBe(403);
    expect((await sales.get('/api/v1/admin/staff/users')).status).toBe(403);
    expect((await sales.put('/api/v1/admin/cms/site/theme/draft', {})).status).toBe(403);
    const editor = (await staffAgent('CONTENT_EDITOR')).a;
    expect((await editor.get('/api/v1/admin/cms/pages')).status).toBe(200);
    expect((await editor.get('/api/v1/admin/clients')).status).toBe(403);
    expect((await editor.get('/api/v1/admin/bookings')).status).toBe(403);
    const ops = (await staffAgent('OPERATIONS_STAFF')).a;
    const list = await ops.get('/api/v1/admin/bookings');
    expect(list.status).toBe(200);
    // Operations staff do not see contract values.
    for (const b of list.body.data) expect(b.contractValueMinor).toBeUndefined();
    expect((await request(app).get('/api/v1/admin/dashboard')).status).toBe(401);
  });

  it('refunds need a second approver and cannot exceed the payment', async () => {
    const { booking } = await clientWithBooking('carol');
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED', contractSignedAt: new Date() } });
    const fin = (await staffAgent('FINANCE_MANAGER')).a;
    const pay = await fin.post('/api/v1/admin/finance/payments/manual', { bookingId: booking.id, amountMinor: 50_000, method: 'cash', reference: 'RCPT-1', paidAt: '2026-10-01' });
    expect(pay.status).toBe(201);
    const dupRef = await fin.post('/api/v1/admin/finance/payments/manual', { bookingId: booking.id, amountMinor: 10_000, method: 'cash', reference: 'RCPT-1', paidAt: '2026-10-01' });
    expect(dupRef.status).toBe(409);
    expect((await fin.post('/api/v1/admin/finance/refunds', { paymentId: pay.body.data.id, amountMinor: 60_000, reason: 'Too much' })).status).toBe(400);
    const req = await fin.post('/api/v1/admin/finance/refunds', { paymentId: pay.body.data.id, amountMinor: 20_000, reason: 'Scope reduced' });
    expect(req.status).toBe(201);
    expect((await fin.post(`/api/v1/admin/finance/refunds/${req.body.data.id}/decide`, { approve: true })).status).toBe(403);
    const fin2 = (await staffAgent('FINANCE_MANAGER')).a;
    const ok = await fin2.post(`/api/v1/admin/finance/refunds/${req.body.data.id}/decide`, { approve: true, manualReference: 'NEFT-9' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('PROCESSED');
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: pay.body.data.id } });
    expect(p.status).toBe('PARTIALLY_REFUNDED');
    expect(Number(p.refundedMinor)).toBe(20_000);
  });

  it('prevents double-booking an exclusive venue', async () => {
    const admin = (await staffAgent('SUPER_ADMIN')).a;
    const venue = await prisma.venue.create({ data: { slug: `v-${Date.now()}`, name: 'Exclusive Hall', exclusive: true } });
    const c = await prisma.client.create({ data: { name: 'Venue test', email: `vt.${Date.now()}@example.com` } });
    const base = { clientId: c.id, title: 'Gala', eventDate: '2027-06-10', venueId: venue.id, contractValueMinor: 1000 };
    expect((await admin.post('/api/v1/admin/bookings', base)).status).toBe(201);
    const clash = await admin.post('/api/v1/admin/bookings', { ...base, title: 'Clash' });
    expect(clash.status).toBe(409);
    expect((await admin.post('/api/v1/admin/bookings', { ...base, eventDate: '2027-06-11' })).status).toBe(201);
  });

  it('rejects uploads whose content does not match an allowed type', async () => {
    const admin = (await staffAgent('CONTENT_EDITOR')).a;
    const r = await admin.upload('/api/v1/admin/media').attach('files', Buffer.from('<script>alert(1)</script>'), { filename: 'evil.jpg', contentType: 'image/jpeg' });
    expect(r.status).toBe(415);
  });

  it('password reset revokes sessions and tokens are single-use', async () => {
    const { user, a } = await staffAgent('EVENT_MANAGER');
    const anon = await agent();
    await anon.post('/api/v1/auth/forgot-password', { email: user.email });
    const m = await prisma.outboundMessage.findFirstOrThrow({ where: { to: user.email, templateKey: 'password_reset' }, orderBy: { createdAt: 'desc' } });
    const token = m.body.match(/token=([A-Za-z0-9_-]+)/)![1];
    expect((await anon.post('/api/v1/auth/reset-password', { token, password: 'NewPassword99' })).status).toBe(200);
    expect((await anon.post('/api/v1/auth/reset-password', { token, password: 'NewPassword98' })).status).toBe(400);
    expect((await a.get('/api/v1/admin/inquiries')).status).toBe(401);
    expect((await loginAs(user.email, 'NewPassword99')).get).toBeDefined();
  });
});
