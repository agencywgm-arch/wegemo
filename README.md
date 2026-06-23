# Wegemo

Multi-tenant SaaS for **QR-code restaurant ordering**. Guests scan a QR code at
their table, browse the menu, order and pay; staff manage everything from a single
dashboard with a real-time kitchen view.

- **Frontend** — React 19 + Vite 8, a single monolithic `src/App.jsx` (CSS-in-JS,
  Figtree font, iOS-style palette).
- **Backend** — Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions in Deno/TS).
- **Payments** — Stripe (PaymentIntent via edge function).
- **Email** — Resend (campaigns + receipts) + Gmail OAuth.
- **AI** — OpenAI `gpt-4o-mini` via the `chat-agent` edge function (admin assistant,
  customer assistant, menu import, inventory generation).

> The app runs **fully offline in demo mode** when Supabase env vars are absent —
> click "Voir la démo" on the landing page.

## Quick start

```bash
npm install
cp .env.example .env      # fill in Supabase / Stripe keys (optional for demo)
npm run dev
```

`npm run build` produces a static SPA in `dist/`. `npm run lint` runs ESLint.

## Environment variables (`.env`)

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Optional global fallback (key can also be per-restaurant) |
| `VITE_BASE_PATH` | `/` or `/repo-name/` for GitHub Pages subpaths |
| `VITE_GOOGLE_CLIENT_ID` | Gmail OAuth client id (for the connect button) |

## Database setup

Run these in the Supabase SQL editor **in order**:

1. `supabase/schema.sql`
2. `supabase/migration_customers.sql`
3. `supabase/migration_email_connections.sql`
4. `supabase/migration_franchise.sql`
5. `supabase/migration_inventory.sql`
6. `supabase/migration_promotions.sql`
7. `supabase/migration_settings.sql`
8. `supabase/migration_security_fixes.sql`
9. `supabase/migration_modules.sql`
10. `supabase/migration_influencers.sql`
11. `supabase/migration_influencer_campaigns.sql`

Then create a **public** Storage bucket named `assets` and run
`supabase/storage_policies.sql`. Finally enable Realtime replication for the
`orders` and `order_items` tables.

### Security model (non-negotiable)

- **Owner isolation** — every business table is gated by an RLS policy checking
  `restaurants.owner_id = auth.uid()`.
- **No customer auth** — a guest's only proof of legitimacy is knowing the secret
  order UUID (128 bits, non-enumerable). Anonymous order tracking goes through the
  `get_order_status` `security definer` RPC, never an open `select`.
- **Secret keys** (Stripe secret, OpenAI, Resend) are only ever read inside edge
  functions with the service-role key — never bundled into the frontend.
- **Stripe** never receives a PaymentIntent ≤ 0 €; a 0 € total (e.g. 100 % promo)
  bypasses Stripe entirely and validates the order directly.

## Edge functions (`supabase/functions/`)

| Function | Role | Required env |
| --- | --- | --- |
| `chat-agent` | Multi-mode OpenAI endpoint (dashboard / customer / setup-menu / setup-inventory), 20 req/min/IP | `OPENAI_API_KEY` |
| `create-payment-intent` | Stripe PaymentIntent using the restaurant's secret key | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `gmail-oauth` | Exchange OAuth code → store Gmail connection | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `send-campaign` | Authenticated bulk Resend email (≤ 500 recipients) + `campaign_logs` | `RESEND_API_KEY`, `RESEND_FROM`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `send-receipt-email` | Single transactional receipt via Resend | `RESEND_API_KEY`, `RESEND_FROM` |

Deploy with `supabase functions deploy <name>`.

## Routing

| Path | View |
| --- | --- |
| `/oauth/gmail` | Gmail OAuth callback |
| `/r/{slug}/t/{tableNum}` | Public customer ordering page (slug **or** UUID) |
| anything else | Dashboard shell (landing / auth / restaurants / dashboard / kitchen) |

## Website embed widget

`public/embed.js` is a dependency-free script that injects an order button on any
external site and opens the customer page in a bottom-sheet iframe:

```html
<div data-wegemo="restaurant-slug" data-table="0" data-label="🛒 Commander"
     data-color="#1D1D1F" data-text-color="#ffffff" data-name="My Restaurant"></div>
<script src="https://your-domain.com/embed.js"></script>
```

## Deployment

- **GitHub Pages** — `.github/workflows/deploy.yml` builds on push and deploys
  `dist/` to the `gh-pages` branch (with `dist/404.html` SPA fallback). Add the
  `VITE_*` build secrets in the repo settings.
- **Vercel** — `vercel.json` provides SPA rewrites, security headers and immutable
  asset caching.

## Project structure

```
src/
  App.jsx          # the whole app: theme, demo data, hooks, all pages
  main.jsx         # React entry
  index.css        # global styles + keyframes
  lib/supabase.js  # Supabase client (null in demo mode)
public/
  embed.js         # external website widget
  favicon.svg
supabase/
  schema.sql + migration_*.sql + storage_policies.sql
  functions/       # 5 Deno edge functions
```
