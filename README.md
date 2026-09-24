# MV MARKETS by OceanX

A Maldives-first online marketplace: buy, sell, chat, earn Stars, become VIP — and OceanX controls everything from a private Admin Dashboard.

**Business model (all values admin-configurable, nothing hard-coded):**
- Normal sellers: one-time posting fee per published listing (default **MVR 20**). No subscription, no commission on the sale.
- VIP sellers: earned only through genuine completed deals; **MVR 10** posting fee (50% off), eligible for the monthly VIP reward pool.
- Businesses: optional paid plans (storefront, branding, fee-free listing quota, featured slots, analytics).

## Stack

Next.js 15 (App Router, server actions) · TypeScript · PostgreSQL + Prisma · Tailwind CSS 4 · sharp (image processing) · optional Anthropic Claude for payment-slip reading · Vitest + Playwright.

## Features

| Area | What's included |
|---|---|
| Buyers | Browse, search (keywords, category/subcategory, atoll/island, price, condition, VIP sellers, include sold), sort, listing details with gallery, call / WhatsApp / in-app chat, save items, report listings, seller profiles, SOLD badges |
| Sellers | Mobile-first listing form with client-side photo compression, Atoll → Island → Area picker, preview, fee shown before payment (normal vs VIP), bank details, slip upload (image/PDF), payment status, edit, mark SOLD (naming the buyer), withdraw with fine confirmation |
| Payments | Statuses Pending / AI Checking / Verified / Needs Review / Rejected / Refunded / Cancelled; duplicate slip detection (exact SHA-256 + perceptual hash), duplicate reference detection, date checks, optional AI extraction; flagged items always go to a human; neutral wording to customers; private slip storage |
| Stars & levels | Recomputed from source records (never incremented); only counted deals earn Stars; anti-manipulation rules (min hours live, daily caps, same-buyer caps, buyer account age, buyer confirmation, disputes); configurable levels |
| VIP | Automatic qualification, 2-month duration, automatic renewal if still active, expiry back to normal fee, optional admin approval, suspend/restore/revoke with reasons, full history |
| Monthly rewards | Admin enters eligible profit × percentage → pool; configurable formula (weighted by deals / listings / referrals / Stars, or equal split); adjustments, withholding, approval, payment records, audit trail; users see only their own history |
| Cancellations | Fine only on voluntary withdrawal of a PUBLISHED listing; grace period; explicit confirmation of the exact amount; exception requests; admin overrides; effects on Stars/VIP/level/review/warnings all configurable; unpaid fines can block posting |
| Businesses | Business profiles, logo/banner/colour, storefront, plans, fee-free quotas, featured listings, analytics, verification |
| Other | Referrals (anti-fake), giveaways (crypto-random draws), notifications (in-app + email), versioned Terms/Privacy with re-acceptance, banners, homepage content |
| Admin | Private dashboard (404 for everyone else), per-permission roles, email OTP 2-step login, revenue (today/week/month/year/total by source, refunds, VIP rewards), marketplace stats, payments queue, listings, users, reports, VIP, deals, levels, referrals, rewards, cancellations, categories, locations, businesses & plans, giveaways, content, all settings, audit log |

## Security

- bcrypt password hashing, account lockout, per-IP / per-account rate limits (Postgres-backed, works on serverless)
- Email OTP for verification, password reset and **mandatory 2-step admin sign-in**; codes are HMAC-hashed, single-use, expire in 10 min, max 5 attempts
- Opaque session tokens (only SHA-256 stored), `__Host-` HttpOnly Secure SameSite=Lax cookies; sessions revoked on password reset, suspension and role changes
- Admin authorisation enforced server-side on every page, server action and file route; admin pages return 404 to non-admins
- Zod validation on all input; Prisma parameterised queries; React escaping (no raw HTML); strict security headers & CSP; Next.js server-action origin checks + origin check on upload route
- Uploads decoded with sharp (never trusting MIME type), re-encoded, EXIF/GPS stripped, size-limited; PDFs magic-byte checked
- Payment slips stored PRIVATE, served only to their owner and admins with payment/finance permission
- Duplicate listing prevention, suspicious-payment flags, reports + optional auto-hide, suspensions, audit log for every admin action
- No secrets in client code; see `.env.example`

## Local development

```bash
cp .env.example .env          # fill in DATABASE_URL, AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npx prisma migrate deploy     # create tables
npm run db:seed               # atolls/islands, categories, levels, plans, terms, super admin
npm run dev
```

Without `RESEND_API_KEY`, OTP codes and emails are printed to the server console in development.

## Tests

```bash
npm test          # 67 integration tests against a throwaway Postgres DB (created & dropped per run)
npm run build && npm start &
npm run test:e2e  # 19-step browser test: sign-up/OTP, listing, slip payment, admin verify, search, chat, SOLD + buyer confirmation, Stars, cancellation fine, VIP fee, reward pool
```

`npm test` needs a local Postgres user able to create databases (`TEST_DATABASE_BASE_URL`, default `postgresql://mvm:mvm@localhost:5432`).

## Deploying to Vercel

1. Create a PostgreSQL database (e.g. Neon). Copy its connection string.
2. In Vercel: **Add New → Project → import this GitHub repo**.
3. Add environment variables (see `.env.example`): `DATABASE_URL`, `AUTH_SECRET` (32+ random characters), `CRON_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `RESEND_API_KEY`, `EMAIL_FROM`, and after the first deploy `APP_URL`. Optional: `DIRECT_URL` (non-pooled URL; defaults to `DATABASE_URL`), `ANTHROPIC_API_KEY`, S3 and SMS variables.
4. Deploy. The build (`scripts/vercel-build.sh`) applies database migrations and loads starter data automatically (idempotent — it never overwrites admin edits), and creates the super admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` if it doesn't exist.
5. Sign in with the admin account (an email code is required) and configure bank details, fees and rules in **Admin → Settings**.

The daily Vercel Cron (`/api/cron/daily`, 01:00 Maldives time) handles VIP expiry/renewal, deal auto-confirmation, subscription expiry and cleanup. Admins can also run the VIP check manually from **Admin → VIP**.

**File storage:** the default `database` driver needs no setup. For high volume, set `STORAGE_DRIVER=s3` with a private S3-compatible bucket (Cloudflare R2, AWS S3, Supabase Storage); files are still served through the access-controlled `/api/files/[id]` route.
