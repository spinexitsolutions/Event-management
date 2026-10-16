import { formatMoney } from '@maison/shared';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { addDays, isoDate, startOfDayUtc } from '../lib/dates';
import { bookingFinancials } from '../services/booking.service';
import { emailConfigured, notifyUser, processMessage, sendEmail } from '../services/notify.service';
import { expireQuotations } from '../services/quotation.service';
import { getBusiness } from '../services/siteConfig.service';
import { deleteStored } from '../services/storage.service';

/** Delivers queued messages whose retry time has come. */
export async function processOutbox() {
  if (!emailConfigured()) return 0;
  const due = await prisma.outboundMessage.findMany({ where: { status: 'QUEUED', nextAttemptAt: { lte: new Date() } }, take: 50, orderBy: { nextAttemptAt: 'asc' }, select: { id: true } });
  for (const m of due) await processMessage(m.id);
  return due.length;
}

export async function paymentDueReminders() {
  const biz = await getBusiness();
  const today = startOfDayUtc();
  let sent = 0;
  for (const days of biz.notifications.paymentReminderDays) {
    const target = addDays(today, days);
    const due = await prisma.installment.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL'] }, dueDate: target, booking: { status: { in: ['AWAITING_ADVANCE', 'CONFIRMED', 'IN_PROGRESS', 'AWAITING_FINAL_PAYMENT'] } } },
      include: { booking: { include: { client: true } } },
    });
    for (const i of due) {
      const r = await sendEmail({
        to: i.booking.client.email,
        template: 'payment_due_reminder',
        automation: 'paymentDueReminder',
        vars: { name: i.booking.client.name, label: i.label, amount: formatMoney(Number(i.amountMinor) - Number(i.paidMinor), i.booking.currency), title: i.booking.title, dueDate: isoDate(i.dueDate), portalUrl: `${env.APP_URL}/portal/bookings/${i.bookingId}` },
        dedupeKey: `pay-due:${i.id}:${days}`,
        entityType: 'Installment',
        entityId: i.id,
      });
      if (r) sent++;
    }
  }
  return sent;
}

export async function eventReminders() {
  const biz = await getBusiness();
  const today = startOfDayUtc();
  let sent = 0;
  for (const days of biz.notifications.eventReminderDays) {
    const bookings = await prisma.booking.findMany({ where: { eventDate: addDays(today, days), status: { in: ['CONFIRMED', 'IN_PROGRESS'] } }, include: { client: true, manager: true } });
    for (const b of bookings) {
      const r = await sendEmail({
        to: b.client.email,
        template: 'event_reminder',
        automation: 'eventReminder',
        vars: { name: b.client.name, title: b.title, eventDate: isoDate(b.eventDate), days, portalUrl: `${env.APP_URL}/portal/bookings/${b.id}` },
        dedupeKey: `event-rem:${b.id}:${days}`,
        entityType: 'Booking',
        entityId: b.id,
      });
      if (r) sent++;
      if (b.managerId) await notifyUser(b.managerId, `${b.reference} is ${days} days away`, b.title, `/admin/bookings/${b.id}`);
    }
  }
  return sent;
}

export async function consultationReminders() {
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 3600_000);
  const list = await prisma.consultation.findMany({ where: { status: 'SCHEDULED', reminderSentAt: null, scheduledAt: { gt: now, lte: soon } }, include: { inquiry: true } });
  for (const c of list) {
    await sendEmail({
      to: c.inquiry.email,
      template: 'consultation_reminder',
      automation: 'consultationReminder',
      vars: { name: c.inquiry.name, when: c.scheduledAt.toUTCString().replace(':00 GMT', ' UTC'), mode: c.mode.replace('_', ' ').toLowerCase(), location: c.location },
      dedupeKey: `consult-rem:${c.id}:${c.scheduledAt.toISOString()}`,
      entityType: 'Consultation',
      entityId: c.id,
    });
    await prisma.consultation.update({ where: { id: c.id }, data: { reminderSentAt: now } });
    if (c.ownerId) await notifyUser(c.ownerId, 'Consultation within 24 hours', `${c.inquiry.name} · ${c.inquiry.reference}`, `/admin/inquiries/${c.inquiryId}`);
  }
  return list.length;
}

export async function vendorReminders() {
  const now = new Date();
  const soon = new Date(now.getTime() + 48 * 3600_000);
  const list = await prisma.vendorAssignment.findMany({ where: { status: { in: ['REQUESTED', 'CONFIRMED'] }, reminderSentAt: null, deliveryAt: { gt: now, lte: soon } }, include: { vendor: true, booking: true } });
  const biz = await getBusiness();
  for (const a of list) {
    if (a.booking.managerId) await notifyUser(a.booking.managerId, `Vendor delivery: ${a.vendor.name}`, `${a.service} for ${a.booking.reference}`, `/admin/bookings/${a.bookingId}`);
    for (const to of biz.notifications.adminEmails.slice(0, 3)) {
      await sendEmail({ to, template: 'vendor_task_reminder', automation: 'vendorTaskReminder', vars: { vendor: a.vendor.name, service: a.service, title: a.booking.title, when: a.deliveryAt?.toUTCString(), adminUrl: `${env.APP_URL}/admin/bookings/${a.bookingId}` }, dedupeKey: `vendor-rem:${a.id}:${to}` });
    }
    await prisma.vendorAssignment.update({ where: { id: a.id }, data: { reminderSentAt: now } });
  }
  // Task deadline reminders (in-app) for tasks due within 24h.
  const tasks = await prisma.task.findMany({ where: { status: { not: 'DONE' }, reminderSentAt: null, assigneeId: { not: null }, dueAt: { gt: now, lte: new Date(now.getTime() + 24 * 3600_000) } }, include: { booking: { select: { reference: true } } } });
  for (const t of tasks) {
    await notifyUser(t.assigneeId!, `Task due soon: ${t.title}`, t.booking.reference, `/admin/bookings/${t.bookingId}?tab=tasks`);
    await prisma.task.update({ where: { id: t.id }, data: { reminderSentAt: now } });
  }
  return list.length + tasks.length;
}

export async function staffReminders() {
  const due = await prisma.reminder.findMany({ where: { doneAt: null, notifiedAt: null, dueAt: { lte: new Date() } } });
  for (const r of due) {
    await notifyUser(r.userId, `Reminder: ${r.note}`, '', r.entityType === 'inquiry' ? `/admin/inquiries/${r.entityId}` : r.entityType === 'booking' ? `/admin/bookings/${r.entityId}` : `/admin/clients/${r.entityId}`);
    await prisma.reminder.update({ where: { id: r.id }, data: { notifiedAt: new Date() } });
  }
  return due.length;
}

/** Marks bookings whose event day has passed as awaiting final payment when there is a balance (staff can still adjust). */
export async function postEventSweep() {
  const yesterday = addDays(startOfDayUtc(), -1);
  const list = await prisma.booking.findMany({ where: { status: 'IN_PROGRESS', OR: [{ eventEndDate: { lte: yesterday } }, { eventEndDate: null, eventDate: { lte: yesterday } }] } });
  for (const b of list) {
    const fin = await bookingFinancials(b.id);
    if (fin.balanceMinor > 0) await prisma.booking.update({ where: { id: b.id }, data: { status: 'AWAITING_FINAL_PAYMENT' } });
  }
  return list.length;
}

export async function cleanup() {
  const now = new Date();
  await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: addDays(now, -7) } } });
  // Orphaned inquiry inspiration uploads (never attached to a submitted inquiry) older than 2 days.
  const orphans = await prisma.mediaAsset.findMany({ where: { folder: 'inquiry-uploads', createdAt: { lt: addDays(now, -2) } }, take: 200 });
  for (const m of orphans) {
    const used = await prisma.$queryRaw<{ c: bigint }[]>`SELECT COUNT(*)::bigint AS c FROM "Inquiry" WHERE "attachments"::text LIKE ${'%' + m.id + '%'}`;
    if (Number(used[0].c) === 0) {
      await deleteStored(m.provider, m.storageKey, true);
      await prisma.mediaAsset.delete({ where: { id: m.id } });
    }
  }
  // Data retention: delete closed (lost/archived) inquiries with no quotation/booking older than the retention window.
  const biz = await getBusiness();
  const cutoff = addDays(now, -30 * biz.dataRetentionMonths);
  const old = await prisma.inquiry.deleteMany({ where: { status: { in: ['LOST', 'ARCHIVED'] }, updatedAt: { lt: cutoff }, quotations: { none: {} }, bookings: { none: {} } } });
  if (old.count) logger.info(`Retention: removed ${old.count} closed inquiries`);
}

export const TASKS: { name: string; cron: string; ttl: number; run: () => Promise<unknown> }[] = [
  { name: 'outbox', cron: '*/2 * * * *', ttl: 110, run: processOutbox },
  { name: 'staff-reminders', cron: '*/5 * * * *', ttl: 240, run: staffReminders },
  { name: 'consultation-reminders', cron: '*/30 * * * *', ttl: 600, run: consultationReminders },
  { name: 'vendor-reminders', cron: '15 * * * *', ttl: 900, run: vendorReminders },
  { name: 'quotation-expiry', cron: '5 0 * * *', ttl: 900, run: expireQuotations },
  { name: 'payment-reminders', cron: '0 4 * * *', ttl: 1800, run: paymentDueReminders },
  { name: 'event-reminders', cron: '30 4 * * *', ttl: 1800, run: eventReminders },
  { name: 'post-event', cron: '0 5 * * *', ttl: 900, run: postEventSweep },
  { name: 'cleanup', cron: '0 3 * * *', ttl: 1800, run: cleanup },
];
