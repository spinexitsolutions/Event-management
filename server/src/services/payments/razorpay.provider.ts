import { env } from '../../config/env';
import { hmacHex, safeEqual } from '../../lib/crypto';
import type { PaymentProvider } from './provider';

const API = 'https://api.razorpay.com/v1';
const auth = () => `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, { method, headers: { Authorization: auth(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = (await r.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!r.ok) throw new Error(`Razorpay: ${json.error?.description ?? r.status}`);
  return json;
}

export const razorpayProvider: PaymentProvider = {
  name: 'razorpay',
  async createOrder({ amountMinor, currency, receipt, notes }) {
    const o = await call<{ id: string; amount: number; currency: string }>('POST', '/orders', { amount: amountMinor, currency, receipt: receipt.slice(0, 40), notes, payment_capture: 1 });
    return { orderId: o.id, amountMinor: o.amount, currency: o.currency, keyId: env.RAZORPAY_KEY_ID };
  },
  verifyPaymentSignature(orderId, paymentId, signature) {
    return safeEqual(hmacHex(env.RAZORPAY_KEY_SECRET!, `${orderId}|${paymentId}`), signature);
  },
  verifyWebhookSignature(rawBody, signature) {
    if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
    return safeEqual(hmacHex(env.RAZORPAY_WEBHOOK_SECRET, rawBody.toString('utf8')), signature);
  },
  async fetchPayment(paymentId) {
    const p = await call<{ id: string; order_id: string; amount: number; currency: string; status: string; method: string }>('GET', `/payments/${encodeURIComponent(paymentId)}`);
    const status = p.status === 'captured' ? 'captured' : p.status === 'authorized' ? 'authorized' : p.status === 'failed' ? 'failed' : 'other';
    return { id: p.id, orderId: p.order_id, amountMinor: p.amount, currency: p.currency, status, method: p.method };
  },
  async refund(paymentId, amountMinor, notes) {
    const r = await call<{ id: string; status: string }>('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountMinor, notes });
    return { refundId: r.id, status: r.status === 'processed' ? 'processed' : 'pending' };
  },
};
