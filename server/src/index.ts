import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './config/db';
import { logger } from './config/logger';
import { ensureMongoIndexes } from './config/indexes';
import { startScheduler } from './jobs/scheduler';

const app = createApp();
ensureMongoIndexes().catch((err) => logger.error({ err }, 'could not ensure MongoDB indexes'));
const server = app.listen(env.PORT, () => logger.info(`API listening on :${env.PORT}`));
if (env.JOBS_ENABLED) startScheduler();

const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down`);
  server.close(() => undefined);
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
