import type { BookingStatus, InquiryStatus, QuotationStatus, QuoteTotals } from '@maison/shared';

export interface Overview {
  client: { name: string; email: string; relationshipManager: { name: string; title: string | null } | null };
  bookings: { id: string; reference: string; title: string; eventDate: string | null; venueName: string; city: string; status: BookingStatus; statusLabel: string; manager: { name: string } | null }[];
  quotations: { id: string; number: string; title: string; status: QuotationStatus; validUntil: string | null; currentVersion: number; versions: { totalMinor: number }[]; currency: string }[];
  inquiries: { reference: string; eventType: string; status: InquiryStatus; createdAt: string }[];
}

export interface ProposalLine {
  id: string;
  name: string;
  description: string;
  quantityX100: number;
  unit: string;
  unitPriceMinor: number;
  discountBps: number;
  optional: boolean;
  selected: boolean;
  taxable: boolean;
}

export interface Proposal {
  id: string;
  number: string;
  title: string;
  status: QuotationStatus;
  eventDate: string | null;
  venue: string;
  guestCount: number | null;
  currency: string;
  validUntil: string | null;
  version: number;
  intro: string;
  terms: string;
  lines: ProposalLine[];
  taxes: { name: string; rateBps: number }[];
  fees: { name: string; amountMinor: number; taxable: boolean }[];
  totals: QuoteTotals;
  clientComment: string;
  bookingId: string | null;
  history: { version: number; createdAt: string; totalMinor: number }[];
}

export interface Installment { id: string; label: string; amountMinor: number; paidMinor: number; dueDate: string | null; status: 'PENDING' | 'PARTIAL' | 'PAID' | 'WAIVED' }
export interface Invoice { id: string; number: string; kind: string; totalMinor: number; paidMinor: number; status: string; issuedAt: string; dueDate: string | null }
export interface PaymentRow { id: string; amountMinor: number; refundedMinor: number; method: string; paidAt: string | null; status: string }
export interface PlanItem { id: string; title: string; phase: string; status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE'; dueAt: string | null; isMilestone: boolean; completedAt: string | null }
export interface DocRow { id: string; name: string; kind: string; createdAt: string; uploadedByClient: boolean }
export interface ChangeRequestRow { id: string; type: 'CHANGE' | 'SPECIAL_REQUEST' | 'RESCHEDULE' | 'CANCELLATION'; message: string; requestedDate: string | null; status: string; resolutionNote: string; createdAt: string }

export interface BookingDetail {
  id: string;
  reference: string;
  title: string;
  status: BookingStatus;
  statusLabel: string;
  eventDate: string | null;
  eventEndDate: string | null;
  startTime: string;
  venueName: string;
  city: string;
  guestCount: number | null;
  currency: string;
  contractValueMinor: number;
  contractSignedAt: string | null;
  clientVisibleNotes: string;
  quotationId: string | null;
  manager: { name: string; title: string | null; email: string; phone: string | null } | null;
  services: { name: string; description: string }[];
  installments: Installment[];
  invoices: Invoice[];
  payments: PaymentRow[];
  microsite: { slug: string; enabled: boolean } | null;
  financials: { contractValueMinor: number; paidMinor: number; balanceMinor: number; overpaidMinor: number; currency: string };
  milestones: PlanItem[];
  documents: DocRow[];
  changeRequests: ChangeRequestRow[];
  feedback: { rating: number; comment: string; createdAt: string } | null;
  paymentsEnabled: boolean;
  paymentProvider: 'razorpay' | 'sandbox';
}

export interface MessageRow { id: string; authorName: string; fromClient: boolean; body: string; createdAt: string }

export interface PaymentOrder {
  provider: 'razorpay' | 'sandbox';
  orderId: string;
  amountMinor: number;
  currency: string;
  keyId: string | null;
  label: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
}
