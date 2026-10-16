import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * Recreates the TEST database schema and applies migrations once per run.
 * Guarded: refuses to run unless the database name ends in "_test".
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/events_test';
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error(`Refusing to reset "${dbName}": test database names must end in _test`);
  const p = new PrismaClient({ datasourceUrl: url });
  await p.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await p.$executeRawUnsafe('CREATE SCHEMA public');
  await p.$disconnect();
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
}
