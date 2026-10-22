import cron from 'node-cron';
import os from 'node:os';
import { prisma } from '../config/db';
import { logger } from '../config/logger';
import { TASKS } from './tasks';

const INSTANCE = `${os.hostname()}:${process.pid}`;

/** Cross-instance lease lock so only one API instance runs a job at a time. */
export async function withLock(name: string, ttlSeconds: number, fn: () => Promise<unknown>) {
  const now = new Date();
  const expires = new Date(now.getTime() + ttlSeconds * 1000);
  // Take over an expired lease atomically, or create the lock document (unique _id) if it doesn't exist yet.
  let acquired = (await prisma.jobLock.updateMany({ where: { name, expiresAt: { lt: now } }, data: { lockedAt: now, lockedBy: INSTANCE, expiresAt: expires } })).count === 1;
  if (!acquired) {
    try {
      await prisma.jobLock.create({ data: { name, lockedAt: now, lockedBy: INSTANCE, expiresAt: expires } });
      acquired = true;
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e; // someone else holds a live lease
    }
  }
  if (!acquired) return false;
  try {
    await fn();
  } catch (err) {
    logger.error({ err, job: name }, 'job failed');
  } finally {
    await prisma.jobLock.update({ where: { name }, data: { expiresAt: new Date() } }).catch(() => undefined);
  }
  return true;
}

export function startScheduler() {
  for (const t of TASKS) cron.schedule(t.cron, () => void withLock(t.name, t.ttl, t.run));
  logger.info(`Scheduler started (${TASKS.length} jobs)`);
}
