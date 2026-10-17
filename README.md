# Ricoz Inventory

**Move stock with clarity and control.** Ricoz Inventory is a multi-unit inventory transfer platform that brings products, locations, and transfer workflows into one calmer, more accountable workspace. Whether you run two warehouses or twenty, every stock movement is requested, approved, tracked, and audited — so the number on the screen is the number on the shelf.

## Features

- **Stock transfers** with multi-step approval and separation of duties (the requester can't approve their own transfer)
- **Role-based access control** — `admin`, `inventory_manager`, `approver`, and `warehouse_staff` roles with per-action permission checks
- **Audit log** — every meaningful action is recorded and queryable
- **Reports & CSV export** for stock levels, movements, and transfer history
- **Suppliers & purchase orders** to manage inbound restocking
- **Stocktakes** (cycle counts) with variance review and posting
- **Reservations** to hold stock for pending demand
- **CSV product import** with validation
- **Barcode & QR labels** plus a scan-to-lookup page
- **Public REST API** (`/api/v1`) authenticated with hashed **API keys** (`x-api-key` header or `Authorization: Bearer rzk_…`)
- **Outbound webhooks** signed with **HMAC-SHA256** (`X-Ricoz-Signature: sha256=…`) so consumers can verify deliveries
- **In-app notifications** and email digests
- **Analytics dashboard** with stock/movement charts
- **Replenishment & demand forecasting** to flag low stock before it bites
- **PWA** — installable app with manifest and icons
- **Scheduled crons** — daily digest email and weekly maintenance (Vercel crons)
- **Rate-limited auth** endpoints to blunt credential-stuffing

## Tech stack

- **Next.js 14** (App Router) + **TypeScript** (strict)
- **MongoDB** via **Mongoose** ( Atlas replica set required for transfer transactions )
- **NextAuth v5** (beta) with credentials provider
- **Zod** validation, **React Hook Form**
- **Recharts** analytics, **qrcode**/**jsbarcode** labels
- Plain CSS design system (`src/app/redesign.css`) — no CSS framework
- Deployed on **Vercel**

## Local setup

```bash
npm install
cp .env.example .env.local   # then fill in real values (see below)
npm run dev                  # http://localhost:3000
```

Available scripts: `npm run dev`, `npm run build`, `npm run start`, `npm run lint`.

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `MONGODB_URI` | ✅ | MongoDB connection string. **Must be an Atlas replica set** (or a local replica set) — transfers use multi-document transactions, which single-node deployments don't support. |
| `NEXTAUTH_SECRET` | ✅ | Secret for NextAuth session/JWT signing. At least 32 random chars (`openssl rand -base64 32`). |
| `NEXTAUTH_URL` | ✅ | Canonical app URL, e.g. `https://your-app.vercel.app` (local: `http://localhost:3000`). |
| `NEXT_PUBLIC_APP_URL` | ✅ | Publicly reachable app URL used in links/emails. Usually same as `NEXTAUTH_URL`. |
| `SMTP_HOST` | Optional | SMTP server hostname (e.g. `smtp.gmail.com`). Password-reset and digest emails are skipped if unset. |
| `SMTP_PORT` | Optional | SMTP port (typically `587`). |
| `SMTP_SECURE` | Optional | `true` for SSL (port 465), usually `false` with `587` + STARTTLS. |
| `SMTP_USER` | Optional | SMTP username. |
| `SMTP_PASSWORD` | Optional | SMTP password / app password. |
| `EMAIL_FROM` | Optional | From header, e.g. `"Ricoz Inventory <no-reply@example.com>"`. |
| `CRON_SECRET` | ✅ (prod) | Random 32+ char string. Required by `/api/cron/*` Bearer auth — Vercel crons send it as `Authorization: Bearer $CRON_SECRET` when configured as an env var. |
| `NEXT_PUBLIC_API_URL` | Optional | API base URL for external clients of `/api/v1`. Usually empty (same-origin). |
| `AUTH_URL` | Optional | Fallback base URL for digest email links (rarely needed). |

## Deploying to Vercel

1. Import the repo in Vercel and set **Root Directory** to `./` (the directory containing this README and `next.config.js`).
2. Set all required env vars above in Project → Settings → Environment Variables — including `CRON_SECRET` (generate one with `openssl rand -hex 32`).
3. Deploy. Crons are declared in `vercel.json` and load automatically:
   - `GET /api/cron/daily-digest` — daily at 06:00 UTC
   - `GET /api/cron/maintenance` — Sundays at 04:00 UTC

   Both endpoints require `Authorization: Bearer $CRON_SECRET`.
4. Point `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` at the production domain once it's live.

## Architecture & security notes

- **Org isolation** — every data query is scoped to the authenticated user's organization; models carry an `organizationId` and API layers filter on it, so one tenant can't read another's data.
- **Session revalidation** — auth sessions are re-checked server-side on each request (not trusted from stale JWT claims), so role changes and deactivations take effect immediately.
- **Separation of duties** — transfer approval enforces that requester ≠ approver; permissions are checked server-side per action (`src/lib/permissions`), never only in the UI.
- **Webhook signing** — outbound webhook payloads are signed with HMAC-SHA256 over the raw body using the endpoint's secret (`X-Ricoz-Signature: sha256=…`); consumers should compare in constant time.
- **API keys** — keys are stored hashed (only digests persist); authentication accepts `x-api-key` or `Authorization: Bearer rzk_…`. Secrets are shown once at creation.
- **Rate limiting** — auth-sensitive endpoints are rate-limited per IP (`src/lib/rate-limit.ts`).
- **Auditability** — mutations write `AuditEvent` records with actor, action, and target for later review.
- **Headers** — `next.config.js` sets CSP, `X-Frame-Options: DENY`, `nosniff`, HSTS, and a restrictive `Permissions-Policy` on every route, and disables the `X-Powered-By` header.

## Project structure

```
src/
├── app/
│   ├── (marketing)/        # Public marketing pages
│   ├── (auth)/             # Sign-in / auth screens
│   ├── api/                # Route handlers
│   │   ├── v1/             # Public REST API (API-key auth)
│   │   ├── cron/           # Scheduled jobs (Bearer CRON_SECRET)
│   │   ├── transfers|products|locations|… # Internal app APIs
│   │   └── health/         # Public uptime/DB health check
│   ├── dashboard/          # Authenticated app UI
│   ├── error.tsx           # Route-level error boundary
│   ├── global-error.tsx    # Root crash fallback
│   ├── not-found.tsx       # 404 page
│   └── layout.tsx          # Root layout + metadata
├── components/             # Shared UI (AppShell, charts, forms, …)
├── lib/                    # db, auth, permissions, rate-limit, webhooks, email, …
├── models/                 # Mongoose models (Product, StockTransfer, AuditEvent, …)
└── middleware.ts           # Route protection
public/                     # Icons, manifest.json
vercel.json                 # Crons + build config
```
