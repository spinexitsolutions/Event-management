# Database

MongoDB via the Prisma MongoDB connector — schema: `server/prisma/schema.prisma`. MongoDB must run as a **replica set**
(a single node is fine) because bookings, payments, refunds, quotation acceptance and inventory use multi-document
transactions. MongoDB Atlas clusters are replica sets out of the box.

## Applying schema changes
MongoDB has no SQL migrations. After editing the schema run `npm run db:push`, which:
1. `prisma db push` — creates collections and syncs indexes / unique constraints;
2. `ensureIndexes` — replaces the unique indexes of *optional* unique fields with partial unique indexes
   (MongoDB would otherwise treat two documents without the value as duplicates). This also runs on every server start.

## Domains (collections)
- **Identity & access:** `User`, `Role` (permissions[]), `Session`, `PasswordResetToken` (reset / invite / verify), `AuditLog`
- **Website & CMS:** `SiteConfig` + `SiteConfigVersion` (theme, global site settings — draft/published/versions; private business settings),
  `Page` + `PageVersion` (draft document + immutable published snapshots), `MediaAsset`, `EventCategory`, `Service`, `Package`,
  `PortfolioProject`, `Testimonial`, `TeamMember`, `Faq`, `ClientLogo`, `BlogPost`, `NewsletterSubscriber`
- **CRM & sales:** `Client`, `Inquiry`, `Communication` (log & notes), `Consultation`, `Reminder`, `Quotation` + `QuotationVersion`
- **Delivery:** `Booking`, `BookingService`, `ChangeRequest`, `Document`, `Message`, `Feedback`, `Task`, `TaskComment`, `TaskTemplate`, `CalendarEntry`
- **Finance:** `Installment`, `Invoice`, `Payment`, `Refund`, `WebhookEvent`, `Expense`
- **Operations:** `Vendor`, `VendorAssignment`, `Venue`, `Resource`, `ResourceAllocation`, `Guest`, `EventMicrosite`
- **Platform:** `Notification`, `EmailTemplate`, `OutboundMessage` (outbox with retries and dedupe keys), `JobLock`, `Counter`

Document ids are string cuids stored in `_id`. Many-to-many links (services ↔ categories / packages / projects) are
stored as id arrays on both sides and kept in sync by Prisma. Relations and `onDelete` rules are enforced by Prisma.

## Integrity rules
- Money: 64-bit integer minor units (`BigInt`) everywhere; totals recomputed from line items; instalments must sum to the contract value.
- Dates: date-only values (event dates, due dates) are stored as UTC midnight.
- Uniqueness: references and numbers (`INQ-…`, `QT-YYYY-NNNN`, `EV-…`, `INV-…`, `PO-…` via an atomic `$inc` counter),
  provider order/payment/refund ids (partial unique indexes), `WebhookEvent(provider, eventId)`, `OutboundMessage.dedupeKey`.
- Concurrency: quotation acceptance/conversion, payment capture, manual payments, refunds, resource allocation, venue calendar
  entries, guest check-in and Super Admin changes run in transactions that first bump the documents' `lockVersion`; competing
  writers get a write conflict and are retried (`withTx`). Exclusive venues cannot hold overlapping active bookings.
- Nulls: optional fields are always written (as `null` when empty) so null filters are reliable.
- Deletion: financial records are protected (`Restrict`); in-use media cannot be deleted silently.
- Indexes on status/date, foreign keys and lookup fields used by dashboards and filters.
