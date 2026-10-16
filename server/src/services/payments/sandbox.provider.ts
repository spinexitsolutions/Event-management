import { env } from '../../config/env';
import { hmacHex, randomToken, safeEqual } from '../../lib/crypto';
import type { PaymentProvider } from './provider';

/**
 * Local/test gateway. Goes through exactly the same server-side verification path as Razorpay,
 * but payments are simulated. Refused in production (see config/env.ts).
 */
const secret = () => `sandbox:${env.APP_SECRET}`;
const orders = new Map<string, { amountMinor: number; currency: string }>();
const payments = new Map<string, { orderId: string; amountMinor: number; currency: string; status: 'captured' | 'failed' }>();

export const sandboxProvider: PaymentProvider & {
  simulate(orderId: string, outcome: 'success' | 'failure'): { paymentId: string; signature: string };
  webhookSignature(body: string): string;
} = {
  name: 'sandbox',
  async createOrder({ amountMinor, currency }) {
    const orderId = `order_sbx_${randomToken(10)}`;
    orders.set(orderId, { amountMinor, currency });
    return { orderId, amountMinor, currency };
  },
  verifyPaymentSignature(orderId, paymentId, signature) {
    return safeEqual(hmacHex(secret(), `${orderId}|${paymentId}`), signature);
  },
  verifyWebhookSignature(rawBody, signature) {
    return safeEqual(hmacHex(secret(), rawBody.toString('utf8')), signature);
  },
  async fetchPayment(paymentId) {
    const p = payments.get(paymentId);
    if (!p) throw new Error('Unknown sandbox payment');
    return { id: paymentId, orderId: p.orderId, amountMinor: p.amountMinor, currency: p.currency, status: p.status, method: 'sandbox' };
  },
  async refund(paymentId) {
    if (!payments.has(paymentId)) throw new Error('Unknown sandbox payment');
    return { refundId: `rfnd_sbx_${randomToken(8)}`, status: 'processed' };
  },
  simulate(orderId, outcome) {
    const o = orders.get(orderId);
    if (!o) throw new Error('Unknown sandbox order');
    const paymentId = `pay_sbx_${randomToken(10)}`;
    payments.set(paymentId, { orderId, amountMinor: o.amountMinor, currency: o.currency, status: outcome === 'success' ? 'captured' : 'failed' });
    return { paymentId, signature: hmacHex(secret(), `${orderId}|${paymentId}`) };
  },
  webhookSignature(body) {
    return hmacHex(secret(), body);
  },
};
