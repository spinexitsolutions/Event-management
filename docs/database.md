# Database

PostgreSQL via Prisma — schema: `server/prisma/schema.prisma`, migrations: `server/prisma/migrations/`.

## Domains
- **Identity & access:** `User`, `Role` (permissions[]), `Session`, `PasswordResetToken` (reset / invite / verify), `AuditLog`
- **Website & CMS:** `SiteConfig` + `SiteConfigVersion` (theme, global site settings — draft/published/versions; private business settings),
  `Page` + `PageVersion` (draft JSON + immutable published snapshots), `MediaAsset`, `EventCategory`, `Service`, `Package`,
  `PortfolioProject`, `Testimonial`, `TeamMember`, `Faq`, `ClientLogo`, `BlogPost`, `NewsletterSubscriber`
- **CRM & sales:** `Client`, `Inquiry`, `Communication` (log & notes), `Consultation`, `Reminder`, `Quotation` + `QuotationVersion`
- **Delivery:** `Booking`, `BookingService`, `ChangeRequest`, `Document`, `Message`, `Feedback`, `Task`, `TaskComment`, `TaskTemplate`, `CalendarEntry`
- **Finance:** `Installment`, `Invoice`, `Payment`, `Refund`, `WebhookEvent`, `Expense`
- **Operations:** `Vendor`, `VendorAssignment`, `Venue`, `Resource`, `ResourceAllocation`, `Guest`, `EventMicrosite`
- **Platform:** `Notification`, `EmailTemplate`, `OutboundMessage` (outbox with retries and dedupe keys), `JobLock`, `Counter`

## Integrity rules
- Money: `BigInt` minor units everywhere; totals recomputed from line items; instalments must sum to the contract value.
- Uniqueness: references and numbers (`INQ-…`, `QT-YYYY-NNNN`, `EV-…`, `INV-…`, `PO-…` via an atomic `Counter` upsert),
  provider order/payment/refund ids, `WebhookEvent(provider, eventId)`, `OutboundMessage.dedupeKey`.
- Concurrency: quotation acceptance/conversion, payment capture, manual payments, refunds and resource allocation lock rows
  (`SELECT … FOR UPDATE`) inside transactions; exclusive venues cannot hold overlapping active bookings.
- Deletion: financial records use `Restrict`; content/media references are tracked so in-use media cannot be deleted silently.
- Indexes on status/date, foreign keys and lookup fields used by dashboards and filters.
