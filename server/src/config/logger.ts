import pino from 'pino';
import { env, isProd } from './env';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', '*.password', '*.passwordHash', '*.token', '*.mfaSecret'],
    censor: '[redacted]',
  },
  transport: isProd || env.NODE_ENV === 'test' ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
});
