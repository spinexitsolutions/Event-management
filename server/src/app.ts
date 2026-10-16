import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { env, isProd } from './config/env';
import { logger } from './config/logger';
import { attachUser } from './middleware/auth';
import { issueCsrf, verifyCsrf } from './middleware/csrf';
import { errorHandler, notFound } from './middleware/error';
import { apiLimiter } from './middleware/rateLimit';
import { PUBLIC_UPLOAD_DIR } from './services/storage.service';
import { apiRouter } from './routes';
import { seoRouter, renderSpaShell } from './modules/seo.routes';
import { webhookRouter } from './modules/webhooks.routes';

export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  const origins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'img-src': ["'self'", 'data:', 'blob:', 'https:'],
          'media-src': ["'self'", 'blob:', 'https:'],
          'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'script-src': ["'self'", 'https://checkout.razorpay.com', 'https://challenges.cloudflare.com'],
          'frame-src': ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com', 'https://www.google.com', 'https://www.youtube-nocookie.com', 'https://player.vimeo.com', 'https://challenges.cloudflare.com'],
          'connect-src': ["'self'", 'https://lumberjack.razorpay.com', 'https://api.razorpay.com'],
          'worker-src': ["'self'", 'blob:'],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cors({ origin: (o, cb) => cb(null, !o || origins.includes(o)), credentials: true }));
  app.use(compression());
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      // Keep request logs compact and free of cookies/headers.
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // Webhooks need the raw body for signature verification — mount before JSON parsing.
  app.use('/api/v1/webhooks', express.raw({ type: '*/*', limit: '1mb' }), webhookRouter);

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(issueCsrf);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/uploads', express.static(PUBLIC_UPLOAD_DIR, { maxAge: '30d', immutable: true, fallthrough: false }));

  app.use('/api/v1', apiLimiter, verifyCsrf, attachUser, apiRouter);
  app.use(seoRouter); // sitemap.xml, robots.txt

  // Production: serve the built client with per-route SEO meta injected into the HTML shell.
  const clientDist = path.resolve(process.cwd(), '../client/dist');
  if (isProd && existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1y', immutable: true }));
    app.get(/^\/(?!api\/|uploads\/).*/, renderSpaShell(path.join(clientDist, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
