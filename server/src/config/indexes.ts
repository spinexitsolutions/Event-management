import { prisma } from './db';
import { logger } from './logger';

/**
 * Optional fields that must be unique when set (payment ids, PO numbers, dedupe keys, 1-to-1 links).
 * A plain MongoDB unique index treats missing/null values as equal, so a second document without the value
 * would be rejected. We replace Prisma's index with a *partial* unique index that only covers string values.
 * Idempotent — runs after `prisma db push` and on server start.
 */
const OPTIONAL_UNIQUE: [collection: string, field: string][] = [
  ['Client', 'userId'],
  ['Booking', 'quotationId'],
  ['Payment', 'providerOrderId'],
  ['Payment', 'providerPaymentId'],
  ['Refund', 'providerRefundId'],
  ['VendorAssignment', 'poNumber'],
  ['Resource', 'sku'],
  ['OutboundMessage', 'dedupeKey'],
];

export async function ensureMongoIndexes() {
  for (const [collection, field] of OPTIONAL_UNIQUE) {
    const name = `${collection}_${field}_key`;
    // $indexStats returns each index's full spec (listIndexes output is not decodable through $runCommandRaw).
    const model = collection[0].toLowerCase() + collection.slice(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats = (await (prisma as any)[model].aggregateRaw({
      pipeline: [{ $indexStats: {} }, { $project: { _id: 0, name: 1, partial: { $gt: ['$spec.partialFilterExpression', null] } } }],
    })) as { name: string; partial: boolean }[];
    const current = stats.find((i) => i.name === name);
    if (current?.partial) continue;
    if (current) await prisma.$runCommandRaw({ dropIndexes: collection, index: name });
    await prisma.$runCommandRaw({
      createIndexes: collection,
      indexes: [{ key: { [field]: 1 }, name, unique: true, partialFilterExpression: { [field]: { $type: 'string' } } }],
    });
    logger.debug({ collection, field }, 'partial unique index ensured');
  }
}
