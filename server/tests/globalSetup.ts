import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * Recreates the TEST database and syncs the schema/indexes once per run.
 * Guarded: refuses to run unless the database name ends in "_test".
 * MongoDB must run as a replica set (transactions) — see docs/setup.md.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'mongodb://127.0.0.1:27017/events_test?replicaSet=rs0&directConnection=true';
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error(`Refusing to reset "${dbName}": test database names must end in _test`);
  const p = new PrismaClient({ datasourceUrl: url });
  await p.$runCommandRaw({ dropDatabase: 1 });
  await p.$disconnect();
  execSync('npx prisma db push --skip-generate', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
  execSync('npx tsx src/scripts/ensureIndexes.ts', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
}
