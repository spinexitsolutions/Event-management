import { prisma, type Tx } from '../config/db';

/**
 * Yearly sequence: nextNumber('QT') → "QT-2026-0007".
 * Uses an atomic $inc on the counter document. Inside a transaction, concurrent callers conflict on the same
 * document and are retried by `withTx`; outside one, the first-ever creation race is resolved via the unique _id.
 */
export async function nextNumber(prefix: string, tx: Tx = prisma, date = new Date()) {
  const key = `${prefix}-${date.getUTCFullYear()}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const row = await tx.counter.upsert({ where: { key }, update: { value: { increment: 1 } }, create: { key, value: 1 } });
      return `${key}-${String(row.value).padStart(4, '0')}`;
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002' || attempt >= 3) throw e;
    }
  }
}
