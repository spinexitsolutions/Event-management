import { env } from '../../config/env';
import type { PaymentProvider } from './provider';
import { razorpayProvider } from './razorpay.provider';
import { sandboxProvider } from './sandbox.provider';

export const paymentProvider: PaymentProvider = env.PAYMENT_PROVIDER === 'razorpay' ? razorpayProvider : sandboxProvider;
export { sandboxProvider };
export type { PaymentProvider };
