# Integrations

All integrations are optional in development and fail **honestly**: when something is not configured the UI says so,
messages are stored as `SKIPPED`, and nothing is ever reported as sent or paid. Status: Admin → Business settings → Integrations.

## Razorpay (client payments)
1. Create API keys (start in **Test mode**) → `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `PAYMENT_PROVIDER=razorpay`.
2. Add the webhook (see deployment.md) → `RAZORPAY_WEBHOOK_SECRET`.
3. Test with Razorpay's test cards/UPI in the client portal.

How it works: the server creates the order with the amount computed from the booking's instalment (the browser never sends an
amount) → Checkout → the callback signature is verified (HMAC) **and** the payment is fetched from Razorpay before it is marked
paid → webhooks are signature-verified and de-duplicated by event id → capture is idempotent (row lock + unique ids), so a callback
and a webhook for the same payment can arrive in any order, any number of times. Card data never touches this application.
Refunds are requested by finance, approved by a different user with `refunds.approve`, then executed through the Razorpay API.

**Sandbox:** `PAYMENT_PROVIDER=sandbox` (default, refused in production) simulates the gateway but uses exactly the same
verification path; the portal shows a clearly labelled “Test payment” dialog.

Manual payments (bank transfer, cash, cheque) are recorded by `finance.manage` users with a mandatory reference; duplicates by
reference are rejected and every entry is audit-logged.

## Email
`EMAIL_PROVIDER=smtp` (`SMTP_HOST/PORT/USER/PASS/SECURE`) or `EMAIL_PROVIDER=resend` (`RESEND_API_KEY`), plus `EMAIL_FROM`
on a domain with SPF/DKIM configured. Messages go through an outbox with retries (exponential backoff, 5 attempts) and are
visible in Admin → Emails & automations → Outbox, where failed messages can be retried. Templates and automation toggles are
editable in the same area.

## WhatsApp (optional)
Meta WhatsApp Cloud API: `WHATSAPP_PROVIDER=meta`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, then enable WhatsApp in
Admin → Emails & automations. Business-initiated messages outside the 24-hour window require approved templates in Meta.
The website's floating WhatsApp button (a `wa.me` link) needs no credentials — set the number in Global content.

## Media storage (Cloudinary)
`STORAGE_DRIVER=cloudinary` with `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`. Public media go to `maison/media`; contracts and
client uploads are stored as **authenticated** assets and served via short-lived signed URLs after an authorisation check.
Uploads are type-checked by file signature (not by extension), images are re-encoded to WebP (EXIF/GPS stripped) and bounded to 2560px.

## Spam protection
Every public form has a honeypot, a minimum fill time, per-IP rate limits and duplicate detection. Optional Cloudflare Turnstile:
`TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`.

## AI assistance (optional)
`AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`). Enables inquiry triage suggestions and quotation drafts built
**only** from your published services and their internal reference prices. Suggestions are labelled, editable and never sent to
clients automatically; nothing about vendor availability, prices or bookings is invented.

## Photography
Sample images reference Unsplash (free licence). Replace them with your own licensed event photography in the Media library;
record photographer credits in each asset's “Credit” field. Only publish portfolio events and testimonials your clients have
authorised — the CMS enforces consent flags before publishing.
