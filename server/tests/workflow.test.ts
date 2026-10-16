import { beforeAll, describe, expect, it } from 'vitest';
import { agent, app, ensureRoles, lastEmailToken, pricing, prisma, staffAgent, validInquiry, type Agent } from './helpers';
import request from 'supertest';
import { sandboxProvider } from '../src/services/payments';

/**
 * The full business workflow through the HTTP API:
 * admin theme publish → service/package → inquiry → assignment → quotation → send → client portal →
 * acceptance → booking → contract → online (sandbox) payment verified server-side → confirmation →
 * duplicate webhook → tasks & vendors → completion with final payment → final invoice → reports.
 */
describe('end-to-end event workflow', () => {
  let admin: Agent;
  let client: Agent;
  let inquiryId: string;
  let reference: string;
  let quotationId: string;
  let bookingId: string;
  let clientEmail: string;
  let plannerId: string;

  beforeAll(async () => {
    await ensureRoles();
    admin = (await staffAgent('SUPER_ADMIN')).a;
    plannerId = (await staffAgent('EVENT_MANAGER')).user.id;
  });

  it('admin changes the theme and logo, previews the draft and publishes', async () => {
    const draft = await admin.get('/api/v1/admin/cms/site/theme');
    expect(draft.status).toBe(200);
    const theme = { ...draft.body.data.draft, colors: { ...draft.body.data.draft.colors, primary: '#542633' } };
    expect((await admin.put('/api/v1/admin/cms/site/theme/draft', theme)).status).toBe(200);
    // Public site still shows the published theme until publish.
    expect((await request(app).get('/api/v1/public/bootstrap')).body.data.theme.colors.primary).not.toBe('#542633');
    expect((await admin.post('/api/v1/admin/cms/site/theme/publish', { note: 'Burgundy' })).status).toBe(200);
    const site = (await admin.get('/api/v1/admin/cms/site/site')).body.data.draft;
    await admin.put('/api/v1/admin/cms/site/site/draft', { ...site, brand: { ...site.brand, name: 'Test Atelier', logoUrl: '/uploads/logo.webp' } });
    expect((await admin.post('/api/v1/admin/cms/site/site/publish', {})).status).toBe(200);
    const boot = (await request(app).get('/api/v1/public/bootstrap')).body.data;
    expect(boot.theme.colors.primary).toBe('#542633');
    expect(boot.site.brand.name).toBe('Test Atelier');
    const versions = (await admin.get('/api/v1/admin/cms/site/theme/versions')).body.data;
    expect(versions.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects publishing an invalid theme', async () => {
    const draft = (await admin.get('/api/v1/admin/cms/site/theme')).body.data.draft;
    await admin.put('/api/v1/admin/cms/site/theme/draft', { ...draft, colors: { ...draft.colors, primary: 'red' } });
    const r = await admin.post('/api/v1/admin/cms/site/theme/publish', {});
    expect(r.status).toBe(422);
    await admin.post('/api/v1/admin/cms/site/theme/discard', {});
  });

  it('admin creates and publishes a page with a hero, then restores a version', async () => {
    const page = (await admin.post('/api/v1/admin/cms/pages', { title: 'Winter Weddings', slug: 'winter-weddings' })).body.data;
    const hero = { id: 'hero_test1', type: 'hero', enabled: true, props: { headline: 'Winter', slides: [{ imageUrl: 'https://example.com/a.jpg', alt: 'A' }] } };
    expect((await admin.put(`/api/v1/admin/cms/pages/${page.id}/draft`, { sections: [{ ...hero, props: { headline: '' } }] })).status).toBe(200);
    const bad = await admin.post(`/api/v1/admin/cms/pages/${page.id}/publish`, {});
    expect(bad.status).toBe(422);
    await admin.put(`/api/v1/admin/cms/pages/${page.id}/draft`, { sections: [hero] });
    expect((await admin.post(`/api/v1/admin/cms/pages/${page.id}/publish`, {})).status).toBe(200);
    const pub = await request(app).get('/api/v1/public/pages/winter-weddings');
    expect(pub.body.data.sections[0].props.headline).toBe('Winter');
    await admin.put(`/api/v1/admin/cms/pages/${page.id}/draft`, { sections: [{ ...hero, props: { ...hero.props, headline: 'Winter v2' } }] });
    await admin.post(`/api/v1/admin/cms/pages/${page.id}/publish`, {});
    expect((await admin.post(`/api/v1/admin/cms/pages/${page.id}/versions/1/restore`, { publish: true })).status).toBe(200);
    expect((await request(app).get('/api/v1/public/pages/winter-weddings')).body.data.sections[0].props.headline).toBe('Winter');
  });

  it('admin creates a service and a package with transparent pricing', async () => {
    const s = await admin.post('/api/v1/admin/content/services', { slug: 'test-florals', name: 'Test Florals', status: 'PUBLISHED', defaultPriceMinor: 100_000_00 });
    expect(s.status).toBe(201);
    const bad = await admin.post('/api/v1/admin/content/packages', { slug: 'p1', name: 'P1', pricingModel: 'STARTING_FROM', status: 'PUBLISHED' });
    expect(bad.status).toBe(422);
    const p = await admin.post('/api/v1/admin/content/packages', { slug: 'test-luxe', name: 'Test Luxe', pricingModel: 'STARTING_FROM', priceMinor: 500_000_00, status: 'PUBLISHED', serviceIds: [s.body.data.id] });
    expect(p.status).toBe(201);
    const pub = await request(app).get('/api/v1/public/packages/test-luxe');
    expect(pub.body.data.priceMinor).toBe(500_000_00);
    expect(pub.body.data.services[0].name).toBe('Test Florals');
    // Internal reference prices never leak publicly.
    const svc = await request(app).get('/api/v1/public/services/test-florals');
    expect(svc.body.data.defaultPriceMinor).toBeUndefined();
  });

  it('a client submits an inquiry and gets a reference; duplicates are not re-created', async () => {
    const body = validInquiry();
    clientEmail = body.email;
    const anon = await agent();
    const r = await anon.post('/api/v1/public/inquiries', body);
    expect(r.status).toBe(201);
    reference = r.body.data.reference;
    expect(reference).toMatch(/^INQ-[A-Z0-9]{6}$/);
    const dup = await anon.post('/api/v1/public/inquiries', body);
    expect(dup.status).toBe(200);
    expect(dup.body.data.reference).toBe(reference);
    expect(await prisma.inquiry.count({ where: { email: clientEmail } })).toBe(1);
    const inq = await prisma.inquiry.findUniqueOrThrow({ where: { reference } });
    inquiryId = inq.id;
    // Confirmation email is logged honestly as SKIPPED (no provider configured).
    await new Promise((r) => setTimeout(r, 200));
    const msg = await prisma.outboundMessage.findFirst({ where: { to: clientEmail, templateKey: 'inquiry_confirmation' } });
    expect(msg?.status).toBe('SKIPPED');
    // Tracking needs the matching email.
    expect((await anon.post('/api/v1/public/inquiries/track', { reference, email: clientEmail })).body.data.statusLabel).toMatch(/Received/);
    expect((await anon.post('/api/v1/public/inquiries/track', { reference, email: 'other@example.com' })).status).toBe(404);
  });

  it('rejects invalid and bot submissions', async () => {
    const anon = await agent();
    expect((await anon.post('/api/v1/public/inquiries', validInquiry({ email: 'nope' }))).status).toBe(422);
    expect((await anon.post('/api/v1/public/inquiries', validInquiry({ website: 'http://spam' }))).status).toBe(422);
    expect((await anon.post('/api/v1/public/inquiries', validInquiry({ startedAt: Date.now() }))).status).toBe(400);
  });

  it('admin assigns the inquiry to a planner and logs a call', async () => {
    const r = await admin.patch(`/api/v1/admin/inquiries/${inquiryId}`, { assignedToId: plannerId, status: 'CONTACTED' });
    expect(r.status).toBe(200);
    expect(r.body.data.assignedToId).toBe(plannerId);
    await admin.post(`/api/v1/admin/inquiries/${inquiryId}/communications`, { kind: 'CALL', direction: 'OUTBOUND', body: 'Discussed venue options' });
    const detail = (await admin.get(`/api/v1/admin/inquiries/${inquiryId}`)).body.data;
    expect(detail.communications.some((c: { body: string }) => c.body.includes('venue options'))).toBe(true);
    expect(await prisma.notification.count({ where: { userId: plannerId } })).toBeGreaterThan(0);
  });

  it('admin creates a quotation; totals are computed on the server', async () => {
    const inq = await prisma.inquiry.findUniqueOrThrow({ where: { id: inquiryId } });
    const tampered = { ...pricing(), subtotalMinor: 1, totalMinor: 1 };
    const r = await admin.post('/api/v1/admin/quotations', {
      clientId: inq.clientId,
      inquiryId,
      meta: { title: 'Lakeside wedding', eventDate: '2027-02-14', venue: 'Lake Palace', guestCount: 250 },
      content: { intro: 'Welcome', pricing: tampered },
    });
    expect(r.status).toBe(201);
    quotationId = r.body.data.id;
    const v = r.body.data.versions[0];
    expect(Number(v.subtotalMinor)).toBe(1_000_000_00);
    expect(Number(v.totalMinor)).toBe(1_180_000_00);
    const pdf = await admin.get(`/api/v1/admin/quotations/${quotationId}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
  });

  it('sending locks the version and invites the client to the portal; later edits create a revision', async () => {
    const r = await admin.post(`/api/v1/admin/quotations/${quotationId}/send`, {});
    expect(r.status).toBe(200);
    expect(r.body.data.deliveredByEmail).toBe(false);
    expect(r.body.data.portalInviteUrl).toContain('token=');
    const q = await prisma.quotation.findUniqueOrThrow({ where: { id: quotationId }, include: { versions: true } });
    expect(q.status).toBe('SENT');
    expect(q.versions[0].lockedAt).not.toBeNull();
    expect((await prisma.inquiry.findUniqueOrThrow({ where: { id: inquiryId } })).status).toBe('QUOTATION_SENT');
    // Revise after sending → v2 draft, then send again.
    const rev = await admin.put(`/api/v1/admin/quotations/${quotationId}`, { content: { intro: 'Revised', pricing: pricing(900_000_00) } });
    expect(rev.body.data.currentVersion).toBe(2);
    expect((await admin.post(`/api/v1/admin/quotations/${quotationId}/send`, {})).status).toBe(200);
  });

  it('client activates the portal from the invitation and sees only their own data', async () => {
    const token = await lastEmailToken(clientEmail, 'portal_invite');
    const anon = await agent();
    expect((await anon.post('/api/v1/auth/reset-password', { token, password: 'ClientPass123' })).status).toBe(200);
    client = await agent();
    expect((await client.post('/api/v1/auth/login', { email: clientEmail, password: 'ClientPass123' })).status).toBe(200);
    const ov = (await client.get('/api/v1/portal/overview')).body.data;
    expect(ov.quotations).toHaveLength(1);
    // Client cannot reach admin APIs.
    expect((await client.get('/api/v1/admin/inquiries')).status).toBe(403);
  });

  it('client previews optional services and accepts; the accepted version is recorded', async () => {
    const view = (await client.get(`/api/v1/portal/quotations/${quotationId}`)).body.data;
    expect(view.version).toBe(2);
    expect(view.lines.find((l: { id: string }) => l.id === 'o1').optional).toBe(true);
    const prev = (await client.post(`/api/v1/portal/quotations/${quotationId}/preview`, { selectedOptionalIds: ['o1'] })).body.data;
    expect(prev.subtotalMinor).toBe(950_000_00);
    expect((await client.post(`/api/v1/portal/quotations/${quotationId}/accept`, { selectedOptionalIds: ['nope'], agree: true })).status).toBe(400);
    const acc = await client.post(`/api/v1/portal/quotations/${quotationId}/accept`, { selectedOptionalIds: ['o1'], agree: true });
    expect(acc.status).toBe(200);
    expect(acc.body.data.acceptedVersion).toBe(3);
    expect((await client.post(`/api/v1/portal/quotations/${quotationId}/accept`, { selectedOptionalIds: [], agree: true })).status).toBe(409);
  });

  it('admin converts the accepted quotation into a booking with an installment schedule', async () => {
    const r = await admin.post(`/api/v1/admin/quotations/${quotationId}/convert`, { managerId: plannerId });
    expect(r.status).toBe(201);
    bookingId = r.body.data.id;
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { installments: true, services: true } });
    expect(b.status).toBe('AWAITING_CONTRACT');
    expect(Number(b.contractValueMinor)).toBe(Math.round(950_000_00 * 1.18));
    expect(b.installments.reduce((s, i) => s + Number(i.amountMinor), 0)).toBe(Number(b.contractValueMinor));
    expect(b.services.map((s) => s.name)).toContain('Same-day film');
    expect((await admin.post(`/api/v1/admin/quotations/${quotationId}/convert`, {})).status).toBe(409);
  });

  it('payments are refused before the contract is signed', async () => {
    const r = await client.post(`/api/v1/portal/bookings/${bookingId}/payments/order`, { installmentId: null });
    expect(r.status).toBe(409);
  });

  it('cannot confirm without the advance unless overridden by finance', async () => {
    await admin.post(`/api/v1/admin/bookings/${bookingId}/contract-signed`, {});
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('AWAITING_ADVANCE');
    const r = await admin.post(`/api/v1/admin/bookings/${bookingId}/status`, { status: 'CONFIRMED' });
    expect(r.status).toBe(409);
  });

  it('client pays the advance online; the server verifies and confirms the booking', async () => {
    const inst = await prisma.installment.findFirstOrThrow({ where: { bookingId }, orderBy: { sortOrder: 'asc' } });
    const order = (await client.post(`/api/v1/portal/bookings/${bookingId}/payments/order`, { installmentId: inst.id })).body.data;
    expect(order.amountMinor).toBe(Number(inst.amountMinor));
    // Forged signature is rejected.
    const forged = await client.post('/api/v1/portal/payments/verify', { orderId: order.orderId, paymentId: 'pay_fake', signature: 'bad' });
    expect(forged.status).toBe(400);
    const sim = sandboxProvider.simulate(order.orderId, 'success');
    const v = await client.post('/api/v1/portal/payments/verify', { orderId: order.orderId, paymentId: sim.paymentId, signature: sim.signature });
    expect(v.status).toBe(200);
    expect(v.body.data.status).toBe('PAID');
    // Replaying the callback does not double-count.
    expect((await client.post('/api/v1/portal/payments/verify', { orderId: order.orderId, paymentId: sim.paymentId, signature: sim.signature })).status).toBe(200);
    // Duplicate webhook for the same payment is ignored.
    const body = JSON.stringify({ id: 'evt_dup_1', event: 'payment.captured', payload: { payment: { entity: { id: sim.paymentId, order_id: order.orderId, amount: order.amountMinor, method: 'card' } } } });
    const sig = sandboxProvider.webhookSignature(body);
    const w1 = await request(app).post('/api/v1/webhooks/sandbox').set('Content-Type', 'application/json').set('x-sandbox-signature', sig).send(body);
    const w2 = await request(app).post('/api/v1/webhooks/sandbox').set('Content-Type', 'application/json').set('x-sandbox-signature', sig).send(body);
    expect(w1.status).toBe(200);
    expect(w2.body.duplicate).toBe(true);
    const bad = await request(app).post('/api/v1/webhooks/sandbox').set('Content-Type', 'application/json').set('x-sandbox-signature', 'nope').send(body);
    expect(bad.status).toBe(400);
    const paid = await prisma.payment.findMany({ where: { bookingId, status: 'PAID' } });
    expect(paid).toHaveLength(1);
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(b.status).toBe('CONFIRMED');
    const instAfter = await prisma.installment.findUniqueOrThrow({ where: { id: inst.id } });
    expect(instAfter.status).toBe('PAID');
  });

  it('a failed payment is recorded and nothing is applied', async () => {
    const order = (await client.post(`/api/v1/portal/bookings/${bookingId}/payments/order`, { installmentId: null })).body.data;
    const r = await client.post('/api/v1/portal/payments/sandbox', { orderId: order.orderId, outcome: 'failure' });
    expect(r.status).toBe(402);
    expect((await prisma.payment.findFirstOrThrow({ where: { providerOrderId: order.orderId } })).status).toBe('FAILED');
  });

  it('the team assigns tasks and a vendor; the client sees shared milestones only', async () => {
    const t1 = await admin.post('/api/v1/admin/tasks', { bookingId, title: 'Venue confirmation', phase: 'Venue Confirmation', visibleToClient: true, isMilestone: true });
    expect(t1.status).toBe(201);
    await admin.post('/api/v1/admin/tasks', { bookingId, title: 'Internal margin review', phase: 'Final Settlement', visibleToClient: false });
    const vendor = await admin.post('/api/v1/admin/vendors', { name: 'Test Florist', category: 'Florists' });
    expect(vendor.status).toBe(201);
    const asg = await admin.post('/api/v1/admin/vendors/assignments', { vendorId: vendor.body.data.id, bookingId, service: 'Florals', agreedAmountMinor: 200_000_00 });
    expect(asg.status).toBe(201);
    const portal = (await client.get(`/api/v1/portal/bookings/${bookingId}`)).body.data;
    expect(portal.milestones.map((m: { title: string }) => m.title)).toEqual(['Venue confirmation']);
    expect(JSON.stringify(portal)).not.toContain('Test Florist');
    expect(portal.financials.paidMinor).toBeGreaterThan(0);
  });

  it('client messages the manager and requests a change', async () => {
    expect((await client.post(`/api/v1/portal/bookings/${bookingId}/messages`, { body: 'Can we add a string quartet?' })).status).toBe(201);
    expect((await client.post(`/api/v1/portal/bookings/${bookingId}/change-requests`, { type: 'SPECIAL_REQUEST', message: 'String quartet for the ceremony' })).status).toBe(201);
    const msgs = (await admin.get(`/api/v1/admin/bookings/${bookingId}/messages`)).body.data;
    expect(msgs[0].fromClient).toBe(true);
  });

  it('event is executed, final payment recorded manually, booking completes, final invoice issued', async () => {
    expect((await admin.post(`/api/v1/admin/bookings/${bookingId}/status`, { status: 'IN_PROGRESS' })).status).toBe(200);
    expect((await admin.post(`/api/v1/admin/bookings/${bookingId}/status`, { status: 'AWAITING_FINAL_PAYMENT' })).status).toBe(200);
    const fin = (await admin.get(`/api/v1/admin/bookings/${bookingId}`)).body.data.financials;
    expect(fin.balanceMinor).toBeGreaterThan(0);
    const tooMuch = await admin.post('/api/v1/admin/finance/payments/manual', { bookingId, amountMinor: fin.balanceMinor + 1, method: 'bank_transfer', reference: 'UTR123', paidAt: '2026-10-10' });
    expect(tooMuch.status).toBe(400);
    const m = await admin.post('/api/v1/admin/finance/payments/manual', { bookingId, amountMinor: fin.balanceMinor, method: 'bank_transfer', reference: 'UTR123', paidAt: '2026-10-10' });
    expect(m.status).toBe(201);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('COMPLETED');
    const inv = await admin.post('/api/v1/admin/finance/invoices', { kind: 'FINAL', bookingId });
    expect(inv.status).toBe(201);
    expect(inv.body.data.status).toBe('PAID');
    expect((await admin.get(`/api/v1/admin/finance/invoices/${inv.body.data.id}/pdf`)).status).toBe(200);
    expect((await client.get(`/api/v1/portal/bookings/${bookingId}/invoices/${inv.body.data.id}/pdf`)).status).toBe(200);
    expect((await client.post(`/api/v1/portal/bookings/${bookingId}/feedback`, { rating: 5, comment: 'Magical' })).status).toBe(200);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'payment.manual_record', entityId: m.body.data.id } });
    expect(audit).not.toBeNull();
  });

  it('dashboard and reports distinguish contract value, received payments and quotations', async () => {
    const d = (await admin.get('/api/v1/admin/dashboard')).body.data;
    expect(d.money.receivedMinor).toBeGreaterThan(0);
    expect(d.money.confirmedValueMinor).toBeGreaterThan(0);
    expect(d.money.outstandingMinor).toBe(0);
    const out = await admin.get('/api/v1/admin/reports/outstanding-balances');
    expect(out.body.data.rows).toEqual([]);
    const csv = await admin.get('/api/v1/admin/reports/payments-received?format=csv');
    expect(csv.headers['content-type']).toContain('text/csv');
  });
});
