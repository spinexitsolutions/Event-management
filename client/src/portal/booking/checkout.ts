import type { PaymentOrder } from '../types';

/** Minimal typing for Razorpay Standard Checkout (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/). */
interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
  theme?: { color?: string };
  handler: (r: RazorpayResponse) => void;
  modal: { ondismiss: () => void; escape?: boolean };
}
interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', cb: (r: { error?: { description?: string; reason?: string } }) => void): void;
}
declare global {
  interface Window {
    Razorpay?: new (o: RazorpayOptions) => RazorpayInstance;
  }
}

const SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let loading: Promise<void> | null = null;

export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => (window.Razorpay ? resolve() : reject(new Error('Payment window failed to load')));
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error('Could not load the secure payment window. Check your connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export type CheckoutOutcome = { kind: 'success'; paymentId: string; signature: string } | { kind: 'dismissed' } | { kind: 'failed'; reason: string };

/** Opens Razorpay Checkout for a server-created order. Card details are entered only inside Razorpay's own window. */
export async function openRazorpay(order: PaymentOrder): Promise<CheckoutOutcome> {
  await loadRazorpay();
  if (!order.keyId) throw new Error('Online payments are not fully configured. Please contact us.');
  const primary = getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim();
  const color = primary ? `rgb(${primary.split(/\s+/).join(',')})` : undefined;
  return new Promise<CheckoutOutcome>((resolve) => {
    let settled = false;
    // Razorpay keeps its window open after a failed attempt so the client can retry; we only report the
    // failure once they close it without a successful payment.
    let lastFailure: string | null = null;
    const done = (o: CheckoutOutcome) => {
      if (settled) return;
      settled = true;
      resolve(o);
    };
    const rzp = new window.Razorpay!({
      key: order.keyId!,
      order_id: order.orderId,
      amount: order.amountMinor,
      currency: order.currency,
      name: order.name,
      description: order.description,
      prefill: order.prefill,
      theme: { color },
      handler: (r) => done({ kind: 'success', paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
      modal: { ondismiss: () => done(lastFailure ? { kind: 'failed', reason: lastFailure } : { kind: 'dismissed' }) },
    });
    rzp.on('payment.failed', (r) => {
      lastFailure = (r.error?.description || r.error?.reason || 'Payment failed').slice(0, 280);
    });
    rzp.open();
  });
}
