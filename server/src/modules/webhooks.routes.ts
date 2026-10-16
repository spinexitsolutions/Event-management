import { Router } from 'express';
import { ah } from '../lib/http';
import { handleWebhook } from '../services/payment.service';

/** Provider webhooks (raw body; authenticated by HMAC signature, exempt from CSRF). */
export const webhookRouter = Router();

webhookRouter.post(
  '/razorpay',
  ah(async (req, res) => {
    const result = await handleWebhook(req.body as Buffer, req.get('x-razorpay-signature') ?? '');
    res.json({ ok: true, ...result });
  }),
);

// Sandbox uses the same handler and signature scheme (development/test only).
webhookRouter.post(
  '/sandbox',
  ah(async (req, res) => {
    const result = await handleWebhook(req.body as Buffer, req.get('x-sandbox-signature') ?? '');
    res.json({ ok: true, ...result });
  }),
);
