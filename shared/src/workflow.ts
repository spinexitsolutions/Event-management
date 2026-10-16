/**
 * Status vocabularies and allowed transitions for the sales → delivery pipeline:
 * Inquiry → Consultation → Requirements → Quotation → Client approval → Contract → Advance payment →
 * Event confirmed → Execution → Final payment → Completed.
 * The server is the only place transitions are applied; these maps are shared so the UI can offer valid actions.
 */
export const INQUIRY_STATUSES = [
  'NEW',
  'CONTACTED',
  'CONSULTATION_SCHEDULED',
  'REQUIREMENTS_RECEIVED',
  'QUOTATION_SENT',
  'NEGOTIATION',
  'WON',
  'LOST',
  'ARCHIVED',
] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  CONSULTATION_SCHEDULED: 'Consultation scheduled',
  REQUIREMENTS_RECEIVED: 'Requirements received',
  QUOTATION_SENT: 'Quotation sent',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
  ARCHIVED: 'Archived',
};

/** Public-facing progress label shown on the inquiry tracker (no internal sales jargon). */
export const INQUIRY_PUBLIC_LABELS: Record<InquiryStatus, string> = {
  NEW: 'Received — a planner will contact you shortly',
  CONTACTED: 'A planner has been in touch',
  CONSULTATION_SCHEDULED: 'Consultation scheduled',
  REQUIREMENTS_RECEIVED: 'Requirements received — preparing your proposal',
  QUOTATION_SENT: 'Proposal shared with you',
  NEGOTIATION: 'Refining your proposal',
  WON: 'Booking in progress',
  LOST: 'Closed',
  ARCHIVED: 'Closed',
};

export const QUOTATION_STATUSES = ['DRAFT', 'SENT', 'VIEWED', 'REVISION_REQUESTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED'] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const BOOKING_STATUSES = [
  'AWAITING_CONTRACT',
  'AWAITING_ADVANCE',
  'CONFIRMED',
  'IN_PROGRESS',
  'AWAITING_FINAL_PAYMENT',
  'COMPLETED',
  'CANCELLED',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  AWAITING_CONTRACT: 'Awaiting contract',
  AWAITING_ADVANCE: 'Awaiting advance payment',
  CONFIRMED: 'Event confirmed',
  IN_PROGRESS: 'Event in execution',
  AWAITING_FINAL_PAYMENT: 'Awaiting final payment',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  AWAITING_CONTRACT: ['AWAITING_ADVANCE', 'CANCELLED'],
  AWAITING_ADVANCE: ['CONFIRMED', 'AWAITING_CONTRACT', 'CANCELLED'],
  CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['AWAITING_FINAL_PAYMENT', 'COMPLETED'],
  AWAITING_FINAL_PAYMENT: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** Bookings in these statuses hold venue/resource reservations and count toward contract value. */
export const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['AWAITING_CONTRACT', 'AWAITING_ADVANCE', 'CONFIRMED', 'IN_PROGRESS', 'AWAITING_FINAL_PAYMENT'];
/** Bookings that represent a firm, confirmed contract (advance received or later). */
export const CONFIRMED_BOOKING_STATUSES: BookingStatus[] = ['CONFIRMED', 'IN_PROGRESS', 'AWAITING_FINAL_PAYMENT', 'COMPLETED'];

export function canTransitionBooking(from: BookingStatus, to: BookingStatus) {
  return BOOKING_TRANSITIONS[from]?.includes(to) ?? false;
}

export const PAYMENT_STATUSES = ['CREATED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const VENDOR_CATEGORIES = [
  'Venues',
  'Caterers',
  'Decorators',
  'Florists',
  'Photographers',
  'Videographers',
  'DJs and artists',
  'Sound and lighting',
  'Transportation',
  'Security',
  'Accommodation',
  'Printing and invitations',
  'Rental equipment',
  'Exhibition and production',
] as const;

export const CHANGE_REQUEST_TYPES = ['CHANGE', 'SPECIAL_REQUEST', 'RESCHEDULE', 'CANCELLATION'] as const;
export type ChangeRequestType = (typeof CHANGE_REQUEST_TYPES)[number];

export const RSVP_STATUSES = ['PENDING', 'ATTENDING', 'DECLINED', 'MAYBE'] as const;
