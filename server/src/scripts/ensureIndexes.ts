/** Applies MongoDB index adjustments that Prisma cannot express (run after `prisma db push`). */
import { prisma } from '../config/db';
import { ensureMongoIndexes } from '../config/indexes';

ensureMongoIndexes()
  .then(() => console.log('MongoDB indexes ensured'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
