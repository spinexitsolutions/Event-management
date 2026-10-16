import nodemailer, { type Transporter } from 'nodemailer';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { DEFAULT_EMAIL_TEMPLATES } from './templates';
import { getPublishedSite, getBusiness } from './siteConfig.service';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function interpolate(tpl: string, vars: Record<string, unknown>) {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, k) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k])));
}

/** Minimal, safe text → HTML: escapes everything, then supports **bold**, [label](https url) and paragraphs. */
export function textToHtml(text: string) {
  return esc(text)
    .split(/\n{2,}/)
    .map((p) =>
      `<p style="margin:0 0 16px">${p
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, (_m, label, url) => `<a href="${url}" style="color:#8a6d3b">${label}</a>`)
        .replace(/\n/g, '<br>')}</p>`,
    )
    .join('');
}

function wrapHtml(brand: string, inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#f6f3ee;font-family:Georgia,'Times New Roman',serif;color:#1a1816">
<div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="text-align:center;letter-spacing:.3em;text-transform:uppercase;font-size:13px;color:#8a6d3b;margin-bottom:24px">${esc(brand)}</div>
<div style="background:#fff;padding:32px;border:1px solid #e8ded0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6">${inner}</div>
<div style="text-align:center;font-size:12px;color:#8b8478;margin-top:20px;font-family:Helvetica,Arial,sans-serif">This message was sent by ${esc(brand)}.</div></div></body></html>`;
}

let transporter: Transporter | null = null;
function smtp() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export const emailConfigured = () =>
  (env.EMAIL_PROVIDER === 'smtp' && !!env.SMTP_HOST) || (env.EMAIL_PROVIDER === 'resend' && !!env.RESEND_API_KEY);
export const whatsappConfigured = () => env.WHATSAPP_PROVIDER === 'meta' && !!env.WHATSAPP_TOKEN && !!env.WHATSAPP_PHONE_NUMBER_ID;

async function deliverEmail(to: string, subject: string, html: string, text: string): Promise<string | undefined> {
  if (env.EMAIL_PROVIDER === 'smtp') {
    const info = await smtp().sendMail({ from: env.EMAIL_FROM, to, subject, html, text });
    return info.messageId;
  }
  if (env.EMAIL_PROVIDER === 'resend') {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html, text }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return ((await r.json()) as { id?: string }).id;
  }
  throw new Error('No email provider configured');
}

async function deliverWhatsApp(to: string, body: string): Promise<string | undefined> {
  const r = await fetch(`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/\D/g, ''), type: 'text', text: { body } }),
  });
  if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()) as { messages?: { id: string }[] }).messages?.[0]?.id;
}

const MAX_ATTEMPTS = 5;

/** Attempts delivery of one queued message; records the outcome honestly. */
export async function processMessage(id: string) {
  const claimed = await prisma.outboundMessage.updateMany({
    where: { id, status: 'QUEUED', attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 5 * 60_000) },
  });
  if (claimed.count !== 1) return;
  const m = await prisma.outboundMessage.findUniqueOrThrow({ where: { id } });
  try {
    let providerId: string | undefined;
    if (m.channel === 'EMAIL') {
      const site = await getPublishedSite();
      providerId = await deliverEmail(m.to, m.subject, wrapHtml(site.brand.name, textToHtml(m.body)), m.body.replace(/\*\*/g, ''));
    } else {
      providerId = await deliverWhatsApp(m.to, m.body.replace(/\*\*/g, '*'));
    }
    await prisma.outboundMessage.update({ where: { id }, data: { status: 'SENT', sentAt: new Date(), providerId: providerId ?? null, lastError: '' } });
  } catch (err) {
    const failed = m.attempts >= MAX_ATTEMPTS;
    const backoff = Math.min(6 * 3600_000, 60_000 * 2 ** m.attempts);
    await prisma.outboundMessage.update({
      where: { id },
      data: { status: failed ? 'FAILED' : 'QUEUED', lastError: (err as Error).message.slice(0, 500), nextAttemptAt: new Date(Date.now() + backoff) },
    });
    logger.warn({ id, err: (err as Error).message }, 'outbound message delivery failed');
  }
}

export interface SendEmailInput {
  to: string;
  template: string;
  vars?: Record<string, unknown>;
  dedupeKey?: string;
  entityType?: string;
  entityId?: string;
  /** Automation toggle in business settings; when disabled the message is not created at all. */
  automation?: keyof Awaited<ReturnType<typeof getBusiness>>['notifications']['automations'];
}

/**
 * Renders a template and queues it. When no provider is configured the message is stored as SKIPPED
 * (visible in Admin → Notifications) — it is never reported as sent.
 */
export async function sendEmail(input: SendEmailInput) {
  if (input.automation) {
    const biz = await getBusiness();
    if (!biz.notifications.automations[input.automation]) return null;
  }
  if (input.dedupeKey && (await prisma.outboundMessage.findUnique({ where: { dedupeKey: input.dedupeKey } }))) return null;
  const site = await getPublishedSite();
  const row = await prisma.emailTemplate.findUnique({ where: { key: input.template } });
  const def = DEFAULT_EMAIL_TEMPLATES[input.template];
  if (!row && !def) throw new Error(`Unknown email template ${input.template}`);
  if (row && !row.enabled) return null;
  const vars = { brand: site.brand.name, appUrl: env.APP_URL, ...input.vars };
  const subject = interpolate(row?.subject ?? def.subject, vars).slice(0, 250);
  const body = interpolate(row?.body ?? def.body, vars);
  const configured = emailConfigured();
  try {
    const msg = await prisma.outboundMessage.create({
      data: {
        channel: 'EMAIL',
        to: input.to,
        templateKey: input.template,
        subject,
        body,
        status: configured ? 'QUEUED' : 'SKIPPED',
        lastError: configured ? '' : 'No email provider configured (EMAIL_PROVIDER=none)',
        dedupeKey: input.dedupeKey ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
    });
    if (configured) void processMessage(msg.id);
    return msg;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return null; // dedupe race
    throw err;
  }
}

export async function sendWhatsApp(to: string, body: string, meta: { dedupeKey?: string; entityType?: string; entityId?: string } = {}) {
  const biz = await getBusiness();
  if (!biz.notifications.whatsappEnabled || !to) return null;
  const configured = whatsappConfigured();
  const msg = await prisma.outboundMessage.create({
    data: {
      channel: 'WHATSAPP',
      to,
      body,
      status: configured ? 'QUEUED' : 'SKIPPED',
      lastError: configured ? '' : 'WhatsApp provider not configured',
      dedupeKey: meta.dedupeKey ?? null,
      entityType: meta.entityType ?? null,
      entityId: meta.entityId ?? null,
    },
  });
  if (configured) void processMessage(msg.id);
  return msg;
}

/** In-app notification for staff/clients. */
export async function notifyUser(userId: string, title: string, body = '', link = '') {
  await prisma.notification.create({ data: { userId, title, body, link } });
}

/** Notifies all active staff holding a permission (in-app). */
export async function notifyStaffWith(permission: string, title: string, body = '', link = '') {
  const users = await prisma.user.findMany({ where: { status: 'ACTIVE', role: { permissions: { has: permission } }, NOT: { roleKey: 'CLIENT' } }, select: { id: true } });
  if (users.length) await prisma.notification.createMany({ data: users.map((u) => ({ userId: u.id, title, body, link })) });
}
