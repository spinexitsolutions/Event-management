import { Prisma, PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({ log: ['warn', 'error'] });
export type Tx = Prisma.TransactionClient;
export { Prisma };

/** BigInt columns are serialised as plain numbers in JSON (amounts stay well below 2^53). */
(BigInt.prototype as unknown as { toJSON: () => number }).toJSON = function (this: bigint) {
  return Number(this);
};
