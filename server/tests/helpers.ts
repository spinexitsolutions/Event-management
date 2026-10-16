import './env';
import request from 'supertest';
import type { Express } from 'express';
import { DEFAULT_ROLE_PERMISSIONS, ROLE_KEYS, ROLE_LABELS, type RoleKey } from '@maison/shared';
import { createApp } from '../src/app';
import { prisma } from '../src/config/db';
import { hashPassword } from '../src/services/auth.service';

export const app: Express = createApp();
export { prisma };
export const PASSWORD = 'Password12345';

/** A cookie-keeping agent that handles the CSRF double-submit token like the browser client. */
export async function agent() {
  const a = request.agent(app);
  const r = await a.get('/api/v1/auth/csrf');
  const token = r.body.data.csrfToken as string;
  const withCsrf = <T extends request.Test>(t: T) => t.set('X-CSRF-Token', token);
  return {
    raw: a,
    get: (url: string) => a.get(url),
    post: (url: string, body?: object) => withCsrf(a.post(url)).send(body ?? {}),
    put: (url: string, body?: object) => withCsrf(a.put(url)).send(body ?? {}),
    patch: (url: string, body?: object) => withCsrf(a.patch(url)).send(body ?? {}),
    delete: (url: string) => withCsrf(a.delete(url)),
    upload: (url: string) => withCsrf(a.post(url)),
  };
}
export type Agent = Awaited<ReturnType<typeof agent>>;

export async function ensureRoles() {
  for (const key of ROLE_KEYS) {
    await prisma.role.upsert({ where: { key }, update: { permissions: DEFAULT_ROLE_PERMISSIONS[key] }, create: { key, name: ROLE_LABELS[key], permissions: DEFAULT_ROLE_PERMISSIONS[key] } });
  }
}

let n = 0;
export async function createStaff(role: RoleKey, name = role) {
  await ensureRoles();
  const email = `${role.toLowerCase()}.${Date.now()}.${n++}@test.local`;
  const user = await prisma.user.create({ data: { email, name, roleKey: role, status: 'ACTIVE', passwordHash: await hashPassword(PASSWORD) } });
  return user;
}

export async function loginAs(email: string, password = PASSWORD) {
  const a = await agent();
  const r = await a.post('/api/v1/auth/login', { email, password });
  if (r.status !== 200) throw new Error(`login failed ${r.status} ${JSON.stringify(r.body)}`);
  return a;
}

export async function staffAgent(role: RoleKey) {
  const u = await createStaff(role);
  return { user: u, a: await loginAs(u.email) };
}

/** Extracts a token query param from the most recent outbound email to an address. */
export async function lastEmailToken(to: string, template?: string) {
  const m = await prisma.outboundMessage.findFirst({ where: { to, ...(template ? { templateKey: template } : {}) }, orderBy: { createdAt: 'desc' } });
  const match = m?.body.match(/token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`No token email for ${to}`);
  return match[1];
}

export const validInquiry = (over: Record<string, unknown> = {}) => ({
  name: 'Asha Rao',
  email: `asha.${Date.now()}.${n++}@example.com`,
  phone: '+91 98765 43210',
  eventType: 'Luxury Wedding',
  eventDate: '2027-02-14',
  location: 'Udaipur',
  guestCount: 250,
  budgetRange: '₹30–60 lakh',
  services: ['Décor & florals'],
  notes: 'Lakeside ceremony please',
  consent: true,
  startedAt: Date.now() - 60_000,
  ...over,
});

export const pricing = (total = 1_000_000_00) => ({
  lines: [
    { id: 'l1', serviceId: null, name: 'Complete planning', description: '', quantityX100: 100, unit: 'event', unitPriceMinor: total, discountBps: 0, optional: false, selected: true, taxable: true },
    { id: 'o1', serviceId: null, name: 'Same-day film', description: '', quantityX100: 100, unit: '', unitPriceMinor: 50_000_00, discountBps: 0, optional: true, selected: false, taxable: true },
  ],
  discountType: 'NONE',
  discountValue: 0,
  taxes: [{ name: 'GST', rateBps: 1800 }],
  fees: [],
  milestones: [
    { label: 'Advance', shareBps: 4000, due: 'ON_ACCEPTANCE', days: 0, date: '' },
    { label: 'Balance', shareBps: 6000, due: 'DAYS_BEFORE_EVENT', days: 7, date: '' },
  ],
});
