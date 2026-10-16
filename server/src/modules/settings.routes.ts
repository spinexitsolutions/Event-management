import { Router } from 'express';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { ah, ok } from '../lib/http';
import { requirePermission } from '../middleware/auth';
import { audit } from '../services/audit.service';
import { aiConfigured } from '../services/ai.service';
import { emailConfigured, whatsappConfigured } from '../services/notify.service';
import { getBusiness, updateBusiness } from '../services/siteConfig.service';

export const settingsRouter = Router();

settingsRouter.get('/business', requirePermission('settings.manage'), ah(async (_req, res) => ok(res, await getBusiness())));
settingsRouter.put(
  '/business',
  requirePermission('settings.manage'),
  ah(async (req, res) => {
    const before = await getBusiness();
    const after = await updateBusiness(req.body, req.user!.id);
    await audit(req, { action: 'settings.business', entityType: 'SiteConfig', entityId: 'business', changes: { before, after } });
    ok(res, after);
  }),
);

/** Read-only integration status — never exposes secrets. */
settingsRouter.get(
  '/integrations',
  requirePermission('dashboard.view'),
  ah(async (_req, res) => {
    ok(res, {
      payments: { provider: env.PAYMENT_PROVIDER, liveCredentials: env.PAYMENT_PROVIDER === 'razorpay', webhookSecret: !!env.RAZORPAY_WEBHOOK_SECRET, webhookUrl: `${env.API_URL}/api/v1/webhooks/razorpay` },
      email: { provider: env.EMAIL_PROVIDER, configured: emailConfigured(), from: env.EMAIL_FROM },
      whatsapp: { provider: env.WHATSAPP_PROVIDER, configured: whatsappConfigured() },
      storage: { driver: env.STORAGE_DRIVER },
      captcha: { turnstile: !!env.TURNSTILE_SECRET_KEY },
      ai: { configured: aiConfigured() },
      jobs: { enabled: env.JOBS_ENABLED },
    });
  }),
);

settingsRouter.get(
  '/newsletter',
  requirePermission('cms.manage'),
  ah(async (_req, res) => ok(res, await prisma.newsletterSubscriber.findMany({ orderBy: { createdAt: 'desc' }, take: 5000, select: { id: true, email: true, status: true, source: true, createdAt: true } }))),
);
