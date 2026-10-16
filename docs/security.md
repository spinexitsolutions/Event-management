# Security & data protection

| Area | Implementation |
| --- | --- |
| Passwords | bcrypt (cost 12), min 10 chars with letters + numbers; lockout after 8 failures for 15 min; timing-equalised unknown-email path |
| Sessions | Random 256-bit token in an `HttpOnly`, `SameSite=Lax`, `Secure` (prod) cookie; only its SHA-256 is stored; server-side revocation, "sign out everywhere", sessions list |
| MFA | Optional TOTP (RFC 6238); secrets encrypted at rest (AES-256-GCM) |
| CSRF | Double-submit token (`me_csrf` cookie + `X-CSRF-Token` header) on every mutating request; strict CORS allow-list; webhooks use signatures instead |
| Authorisation | Role → permission mapping in the database, enforced by middleware on every admin route; roles re-read on every request; client data scoped by `clientId` in every portal query (guessing an id returns 404) |
| Validation | zod schemas on every body/query; money recomputed server-side; status transitions via explicit state machines |
| Injection / XSS | Prisma parameterised queries; Markdown rendered without raw HTML; CMS links restricted to safe schemes; CSV exports neutralise formula injection; Helmet CSP |
| Uploads | Magic-byte type detection, size limits, image re-encoding (strips metadata), private storage for documents with authorised streaming / signed URLs |
| Payments | Server-created orders, HMAC signature verification, provider re-fetch, signed + de-duplicated webhooks, idempotent capture with row locks, no card data stored |
| Rate limiting | Global API limit plus stricter limits for auth, public forms and payments |
| Audit | Sensitive actions (logins, status changes, payments, refunds, settings, publishing, exports, staff/role changes) recorded with actor, IP and diffs |
| Secrets | Environment variables only; never sent to the browser; logs redact cookies, tokens and passwords |
| Privacy | Consent on forms; data minimisation; automatic retention clean-up; client erasure for records without financial history; publication consent flags for portfolio, testimonials and logos |

Reporting: rotate `APP_SECRET`, Razorpay and email credentials immediately if a leak is suspected; use Admin → Staff → revoke sessions.
