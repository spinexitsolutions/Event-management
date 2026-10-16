export interface CreatedOrder {
  orderId: string;
  amountMinor: number;
  currency: string;
  /** Public key id for the checkout widget (Razorpay). */
  keyId?: string;
}

export interface PaymentProvider {
  name: 'razorpay' | 'sandbox';
  createOrder(input: { amountMinor: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<CreatedOrder>;
  /** Verifies the checkout callback signature (order_id|payment_id). */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean;
  /** Verifies a webhook body signature. */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
  /** Fetches the authoritative payment record from the provider. */
  fetchPayment(paymentId: string): Promise<{ id: string; orderId: string; amountMinor: number; currency: string; status: 'captured' | 'authorized' | 'failed' | 'other'; method: string }>;
  refund(paymentId: string, amountMinor: number, notes: Record<string, string>): Promise<{ refundId: string; status: 'processed' | 'pending' }>;
}
