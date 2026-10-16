import type { BookingStatus } from '@maison/shared';

/** API shapes used by the bookings & finance screens (money in integer minor units). */

export interface Person {
  id: string;
  name: string;
}

export interface BookingListItem {
  id: string;
  reference: string;
  title: string;
  eventDate: string;
  eventEndDate: string | null;
  venueName: string;
  city: string;
  guestCount: number | null;
  status: BookingStatus;
  archived: boolean;
  currency: string;
  contractValueMinor?: number | null;
  client: Person;
  manager: Person | null;
  category: { name: string } | null;
}

export interface Installment {
  id: string;
  label: string;
  amountMinor: number | null;
  paidMinor: number | null;
  dueDate: string | null;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'WAIVED';
  sortOrder: number;
}

export interface Invoice {
  id: string;
  number: string;
  bookingId: string;
  installmentId: string | null;
  kind: 'INSTALLMENT' | 'FINAL' | 'CUSTOM';
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  currency: string;
  status: 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
  issuedAt: string;
  dueDate: string | null;
  notes: string;
  booking?: { id: string; reference: string; title: string; client: { name: string } };
}

export interface Refund {
  id: string;
  paymentId: string;
  amountMinor: number;
  reason: string;
  status: 'REQUESTED' | 'APPROVED' | 'PROCESSED' | 'REJECTED' | 'FAILED';
  providerRefundId: string | null;
  requestedById: string | null;
  approvedById: string | null;
  processedAt: string | null;
  createdAt: string;
  payment?: { id: string; provider: string; amountMinor: number; currency: string; booking: { id: string; reference: string; client: { name: string } } };
}

export interface Payment {
  id: string;
  bookingId: string;
  installmentId: string | null;
  invoiceId: string | null;
  provider: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  amountMinor: number;
  refundedMinor: number;
  currency: string;
  status: 'CREATED' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
  method: string;
  reference: string;
  failureReason: string;
  paidAt: string | null;
  createdAt: string;
  refunds: Refund[];
  booking?: { id: string; reference: string; title: string; client: { name: string } };
  installment?: { label: string } | null;
}

export interface Financials {
  contractValueMinor: number;
  paidMinor: number;
  balanceMinor: number;
  overpaidMinor: number;
  currency: string;
}

export interface BookingDocument {
  id: string;
  name: string;
  kind: 'CONTRACT' | 'SIGNED_CONTRACT' | 'INVOICE' | 'PLAN' | 'OTHER';
  mediaId: string;
  visibleToClient: boolean;
  uploadedByClient: boolean;
  createdAt: string;
}

export interface ChangeRequest {
  id: string;
  type: 'CHANGE' | 'SPECIAL_REQUEST' | 'RESCHEDULE' | 'CANCELLATION';
  message: string;
  requestedDate: string | null;
  status: 'OPEN' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN';
  resolutionNote: string;
  resolvedAt: string | null;
  createdAt: string;
}

export interface BookingServiceLine {
  id?: string;
  serviceId: string | null;
  name: string;
  description: string;
  amountMinor: number;
}

export interface BookingDetail {
  id: string;
  reference: string;
  title: string;
  clientId: string;
  eventDate: string;
  eventEndDate: string | null;
  startTime: string;
  venueId: string | null;
  venueName: string;
  city: string;
  guestCount: number | null;
  status: BookingStatus;
  currency: string;
  contractValueMinor: number | null;
  managerId: string | null;
  categoryId: string | null;
  requirements: string;
  clientVisibleNotes: string;
  contractSignedAt: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string;
  archived: boolean;
  createdAt: string;
  client: { id: string; name: string; email: string; phone: string | null; company: string; userId: string | null };
  manager: Person | null;
  category: Person | null;
  venue: { id: string; name: string; city: string } | null;
  quotation: { id: string; number: string; acceptedVersion: number | null } | null;
  inquiry: { id: string; reference: string } | null;
  services: (BookingServiceLine & { id: string })[];
  installments: Installment[];
  invoices: Invoice[];
  payments: Payment[];
  documents: BookingDocument[];
  changeRequests: ChangeRequest[];
  feedback: { rating: number; comment: string } | null;
  microsite: { slug: string; enabled: boolean } | null;
  _count: { tasks: number; guests: number; vendorAssignments: number; messages: number };
  tasksDone: number;
  unreadMessages: number;
  financials: Financials | null;
}

export interface StaffMember {
  id: string;
  name: string;
  roleKey: string;
  title: string | null;
}

export interface Task {
  id: string;
  bookingId: string;
  title: string;
  description: string;
  phase: string;
  assigneeId: string | null;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  dueAt: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';
  isMilestone: boolean;
  visibleToClient: boolean;
  dependsOnId: string | null;
  dependsOn: { id: string; title: string; status: string } | null;
  checklist: { id: string; label: string; done: boolean }[];
  sortOrder: number;
  completedAt: string | null;
  overdue?: boolean;
  blockedByDependency?: boolean;
  _count?: { comments: number };
}

export interface TaskComment {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface TaskTemplate {
  id: string;
  name: string;
  eventType: string;
  items: unknown[];
}

export interface VendorAssignment {
  id: string;
  vendorId: string;
  bookingId: string;
  service: string;
  poNumber: string | null;
  agreedAmountMinor: number;
  status: 'REQUESTED' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED';
  deliveryAt: string | null;
  performanceRating: number | null;
  performanceNotes: string;
  notes: string;
  paidMinor: number;
  billedUnpaidMinor: number;
  vendor: { id: string; name: string; category: string; phone: string; email: string; status: string };
}

export interface VendorLite {
  id: string;
  name: string;
  category: string;
  status: string;
  rating: number | null;
}

export interface ResourceLite {
  id: string;
  name: string;
  category: string;
  sku: string | null;
  unit: string;
  quantity: number;
  condition: string;
  ownership: string;
  availableToday?: number;
}

export interface Allocation {
  id: string;
  resourceId: string;
  bookingId: string;
  quantity: number;
  fromDate: string;
  toDate: string;
  status: 'RESERVED' | 'DISPATCHED' | 'RETURNED' | 'CANCELLED';
  returnedQty: number | null;
  damagedQty: number;
  damageNotes: string;
  resource: { id: string; name: string; category: string; unit: string; ownership: string; sku: string | null };
}

export interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string;
  group: string;
  side: string;
  plusOnes: number;
  rsvpStatus: 'PENDING' | 'ATTENDING' | 'DECLINED' | 'MAYBE';
  rsvpAt: string | null;
  dietary: string;
  tableLabel: string;
  seatNumber: number | null;
  inviteCode: string;
  checkedInAt: string | null;
  checkedInCount: number;
  notes: string;
}

export interface GuestSummary {
  total: number;
  byStatus: Record<string, number>;
  attending: number;
  attendingPlusOnes: number;
  headcount: number;
  checkedInGuests: number;
  checkedInPeople: number;
  groups: { name: string; count: number }[];
  tables: { label: string; guests: number; seats: number }[];
  unseated: number;
}

export interface Microsite {
  slug: string;
  enabled: boolean;
  headline: string;
  message: string;
  coverImage: string;
  schedule: { time: string; title: string; location: string }[];
  gallery: { url: string; alt: string; caption: string }[];
  photoShareUrl: string;
  showCountdown: boolean;
  rsvpEnabled: boolean;
  rsvpDeadline: string | null;
}

export interface Message {
  id: string;
  authorName: string;
  fromClient: boolean;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface Communication {
  id: string;
  kind: string;
  direction: string;
  subject: string;
  body: string;
  authorId: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  summary: string;
  changes: unknown;
  createdAt: string;
  actor: { name: string } | null;
}

export interface Expense {
  id: string;
  bookingId: string | null;
  vendorId: string | null;
  assignmentId: string | null;
  category: string;
  description: string;
  amountMinor: number;
  currency: string;
  incurredOn: string;
  status: 'UNPAID' | 'PAID';
  paidOn: string | null;
  reference: string;
  receiptMediaId: string | null;
  booking: { id: string; reference: string } | null;
  vendor: { id: string; name: string } | null;
}
