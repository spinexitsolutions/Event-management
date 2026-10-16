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
  const acquired = await prisma.$executeRaw`
    INSERT INTO "JobLock" ("name", "lockedAt", "lockedBy", "expiresAt") VALUES (${name}, ${now}, ${INSTANCE}, ${expires})
    ON CONFLICT ("name") DO UPDATE SET "lockedAt" = ${now}, "lockedBy" = ${INSTANCE}, "expiresAt" = ${expires}
    WHERE "JobLock"."expiresAt" < ${now}`;
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
