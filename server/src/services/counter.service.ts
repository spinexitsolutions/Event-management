import { prisma, type Tx } from '../config/db';

/** Atomic yearly sequence: nextNumber('QT') → "QT-2026-0007". Safe under concurrency (single UPSERT). */
export async function nextNumber(prefix: string, tx: Tx = prisma, date = new Date()) {
  const key = `${prefix}-${date.getUTCFullYear()}`;
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return `${key}-${String(rows[0].value).padStart(4, '0')}`;
}
