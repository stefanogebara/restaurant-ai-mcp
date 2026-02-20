# Seatable - AI Restaurant Management Platform

## Project Overview

**Seatable** is an AI-powered multi-tenant restaurant management platform that enables customers to make reservations through natural conversation (voice, text, WhatsApp) while providing restaurant hosts with real-time dashboards to manage walk-ins, reservations, and table assignments.

**Production URL**: https://restaurant-ai-mcp.vercel.app

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS |
| **Backend** | Node.js, Express (Vercel Serverless) |
| **Database** | Supabase PostgreSQL (multi-tenant, RLS) |
| **AI Services** | Anthropic Claude, OpenAI, ElevenLabs/Cartesia (TTS) |
| **Payments** | Stripe (subscription + metered usage billing) |
| **Deployment** | Vercel (auto-deploy on push to main) |
| **State** | React Query (@tanstack/react-query) |
| **Rate Limiting** | Upstash Redis (with in-memory fallback) |
| **Testing** | Jest (backend, 164 tests), Vitest + RTL (frontend, 100 tests) |
| **Logging** | createSecureLogger (masks sensitive data) |

---

## Multi-Tenancy Architecture

All operational tables (`reservations`, `tables`, `waitlist`, `service_records`, `subscriptions`) are scoped by `restaurant_id`. RLS policies enforce tenant isolation via JWT claims.

- **supabaseAdmin**: SERVICE_ROLE_KEY client, bypasses RLS. Used by webhooks, cron jobs.
- **supabaseClient**: ANON_KEY client, respects RLS. Used for user-facing queries.
- **createAuthClient(jwt)**: Per-request client with user JWT for RLS enforcement.

Restaurant config lives in `restaurant.restaurant_config` schema.

---

## Pricing Plans

| Plan | Price | Features |
|------|-------|----------|
| **Starter** | EUR 29/month | AI reservations (Chat + WhatsApp), Host dashboard, Basic analytics, Email support, Up to 50 reservations/month |
| **Growth** | EUR 99/month | Everything in Starter + Voice AI agent, Advanced analytics, Waitlist management, Up to 150 reservations/month, SMS notifications |
| **Scale** | EUR 199/month | Everything in Growth + Unlimited reservations, Unlimited SMS, Priority support, Custom integrations |

*Growth plan includes 14-day free trial. Usage-based metered billing for reservations, AI calls, SMS, and WhatsApp.*

---

## Application Routes

### Public Pages
| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing Page | Marketing site with features, pricing, FAQ, contact |
| `/live-demo` | Live AI Demo | Voice-based AI reservation demo |
| `/login` | Login | Google OAuth authentication |
| `/book/:slug` | Booking Page | Public customer booking portal |
| `/book/:slug/confirmed` | Booking Confirmation | Reservation confirmation |
| `/customer` | Customer Portal | Customer reservation management |

### Dashboard Pages
| Route | Page | Description |
|-------|------|-------------|
| `/host-dashboard/simple` | Dashboard | Main unified dashboard (stats, tables, reservations, waitlist) |
| `/host-dashboard/legacy` | SimpleDashboard | Legacy simple view |
| `/host-dashboard/reports` | Weekly Reports | Date-range reports with metrics |
| `/host-dashboard/segovia` | Segovia Insights | AI-powered insights |
| `/host-dashboard/calls` | Call Tracking | AI agent call dashboard |
| `/host-dashboard/tables` | Table Config | Table setup and management |
| `/host-dashboard/voice-settings` | Voice Settings | AI voice configuration |
| `/analytics` | Analytics Dashboard | Full analytics view |

### Auth/Setup Pages
| Route | Page | Description |
|-------|------|-------------|
| `/onboarding` | Onboarding Wizard | 6-step restaurant setup (protected) |
| `/welcome` | Welcome | Post-onboarding welcome (protected) |
| `/subscription/success` | Subscription Success | Post-payment confirmation |
| `/subscription/manage` | Subscription Manage | Plan management |
| `/settings/language` | Language Settings | EN/ES language toggle |

---

## Cron Jobs (Vercel)

| Schedule | Endpoint | Description |
|----------|----------|-------------|
| Every 5 min | `/api/cron/check-late-reservations` | Marks 20+ min late reservations as no-show |
| Daily 9 AM | `/api/cron/send-reminders` | Sends reservation reminders |
| Daily 6 AM | `/api/cron/update-churn-scores` | Recalculates customer churn risk |
| Daily 4 AM | `/api/report-usage` | Reports metered usage to Stripe |

All cron jobs are secured with `CRON_SECRET` Bearer token and use `createSecureLogger`.

---

## Database Schema (Supabase)

### Public Schema
| Table | Purpose | Multi-tenant |
|-------|---------|:---:|
| `reservations` | Customer bookings | Yes (`restaurant_id`) |
| `tables` | Physical table inventory | Yes (`restaurant_id`) |
| `waitlist` | Customers waiting | Yes (`restaurant_id`) |
| `service_records` | Active dining sessions | Yes (`restaurant_id`) |
| `subscriptions` | Stripe subscription data | Yes (`restaurant_id`) |
| `customer_history` | Visit history & preferences | Yes |
| `customer_ltv` | Lifetime value & churn scores | Yes |
| `usage_tracking` | Metered billing usage | Yes (`restaurant_id`) |

### Restaurant Schema
| Table | Purpose |
|-------|---------|
| `restaurant_config` | Business config, hours, policies, timezone |

---

## Project Structure

```
restaurant-ai-mcp/
├── client/
│   └── src/
│       ├── pages/              # React pages
│       ├── components/
│       │   ├── common/         # PhoneInput, Modal, etc.
│       │   ├── host/           # WalkInModal, WaitlistPanel, etc.
│       │   ├── dashboard/      # StatsBar, ReservationsList, ActivePartiesPanel
│       │   ├── onboarding/     # Onboarding steps
│       │   └── landing/        # Landing page sections
│       ├── contexts/           # Auth & state management
│       ├── hooks/              # useRealtimeSubscription, etc.
│       ├── services/           # API clients, supabase.ts
│       ├── utils/              # timeFormatting, tableCombinations
│       ├── types/              # TypeScript types
│       └── i18n/               # EN + ES translations
├── api/
│   ├── _lib/                   # Shared: supabase.js, auth.js, rate-limit.js, secure-logger.js
│   ├── cron/                   # Cron jobs
│   ├── ml/                     # ML prediction engine
│   ├── onboarding/             # Onboarding API
│   ├── services/               # Business logic (subscription-limits, etc.)
│   └── *.js                    # Serverless API endpoints
├── api/__tests__/              # Backend tests (Jest)
└── client/src/**/__tests__/    # Frontend tests (Vitest + RTL)
```

---

## Key Files

### Frontend
| File | Purpose |
|------|---------|
| `client/src/pages/Dashboard.tsx` | Main unified dashboard |
| `client/src/pages/SimpleDashboard.tsx` | Legacy simple dashboard |
| `client/src/pages/LiveAIDemo.tsx` | AI demo page |
| `client/src/pages/Onboarding.tsx` | Onboarding wizard |
| `client/src/pages/BookingPage.tsx` | Public customer booking portal |
| `client/src/components/common/PhoneInput.tsx` | Country code selector (30+ countries) |
| `client/src/components/dashboard/StatsBar.tsx` | Dashboard stats bar |
| `client/src/components/dashboard/ReservationsList.tsx` | Upcoming reservations list |
| `client/src/components/dashboard/ActivePartiesPanel.tsx` | Active parties panel |
| `client/src/hooks/useRealtimeSubscription.ts` | Supabase Realtime subscriptions |

### Backend
| File | Purpose |
|------|---------|
| `api/_lib/supabase.js` | Database service layer (~1900 lines) |
| `api/_lib/auth.js` | JWT auth, Google OAuth, restaurant_id in tokens |
| `api/_lib/rate-limit.js` | Upstash Redis rate limiting with fallback |
| `api/_lib/secure-logger.js` | Logging with sensitive data masking |
| `api/_lib/stripe-usage-reporter.js` | Metered billing usage reporting |
| `api/host-dashboard.js` | Dashboard API endpoints |
| `api/reservations.js` | Reservation CRUD |
| `api/waitlist.js` | Waitlist management |
| `api/whatsapp-webhook.js` | Meta Cloud WhatsApp integration |
| `api/twilio-whatsapp-webhook.js` | Twilio WhatsApp integration |
| `api/stripe-webhook.js` | Stripe payment webhooks |
| `api/batch-predict.js` | ML no-show predictions (cron + single-restaurant) |

---

## Testing

### Backend (Jest)
```bash
npx jest --forceExit    # 164 tests across 3 suites
```

Test files:
- `api/__tests__/auth.test.js` - JWT, middleware, restaurant lookup
- `api/__tests__/multi-tenancy.test.js` - Restaurant isolation
- `api/__tests__/supabase.test.js` - Database operations

### Frontend (Vitest + React Testing Library)
```bash
cd client && npx vitest run    # 100 tests across 8 suites
```

Test files:
- `client/src/utils/__tests__/timeFormatting.test.ts` - Time formatting utilities
- `client/src/utils/__tests__/tableCombinations.test.ts` - Table combination algorithm
- `client/src/components/dashboard/__tests__/StatsBar.test.tsx` - Stats bar
- `client/src/components/dashboard/__tests__/ReservationsList.test.tsx` - Reservations list
- `client/src/components/dashboard/__tests__/ActivePartiesPanel.test.tsx` - Active parties
- `client/src/components/common/__tests__/PhoneInput.test.tsx` - Phone input
- `client/src/components/host/__tests__/WaitlistPanel.test.tsx` - Waitlist panel
- `client/src/components/host/__tests__/WalkInModal.test.tsx` - Walk-in modal

---

## Environment Variables

See `.env.example` for the full list. Key groups:

| Group | Variables |
|-------|-----------|
| **Core** | `NODE_ENV`, `PORT`, `CLIENT_URL` |
| **Supabase** | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **AI** | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `CARTESIA_API_KEY` |
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_STRIPE_PUBLISHABLE_KEY` |
| **Metered Billing** | `STRIPE_METERED_PRICE_RESERVATION`, `_AI_CALL`, `_SMS`, `_WHATSAPP` |
| **Rate Limiting** | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| **Cron** | `CRON_SECRET` |
| **Email** | `RESEND_API_KEY` |

---

## Development

### Local Setup
```bash
# Install dependencies
npm install --legacy-peer-deps

# Run frontend (port 5173 or 5174)
cd client && npm run dev

# Run backend (port 3001)
npm run server:dev

# Or run both together
npm run dev:full

# Build for production
cd client && npm run build
```

### Deployment
Push to `main` branch triggers automatic Vercel deployment.

### Code Conventions
- All API endpoints use `createSecureLogger` (not `console.log`) for logging
- All API queries are scoped by `restaurant_id` for multi-tenancy
- Cron jobs use `supabaseAdmin` (service role) and are secured with `CRON_SECRET`
- Frontend supports EN + ES via i18n
- Tests must pass before pushing: `npx jest --forceExit && cd client && npx vitest run`

---

## Completed Phases

### Phase 1: Figma HTML Mockups (DONE)
15 HTML mockup files created in `.figma-mockups/` covering all pages.

### Phase 2: Implement Figma Designs into React (DONE - Feb 19, 2026)
All 15 designs implemented. Commit `5d64fc7b`. 30 files changed, +1,576/-3,115 lines.
Design system: Playfair Display + Inter, burgundy `#9F1239`, charcoal `#1C1917`, warm-white `#FAFAF9`.

---

## Current Roadmap

### Phase 3: Security Hardening (CRITICAL - Code Done, SQL Migration Pending)
- [x] **RLS Policy Fixes** (migration created: `database/migrations/20260220_security_hardening.sql`)
  - [x] Remove `USING(true)` on reservations, service_records, customer_history (exposes PII)
  - [x] Revoke anon GRANT on pos_connections, revenue_records, customer_ltv
  - [x] Add proper restaurant-scoped RLS using JWT claims
  - [ ] **PENDING: Run migration in Supabase SQL Editor**
- [x] **Server-side IDOR Fixes**
  - [x] `api/ltv.js` - now uses `req.user.restaurant_id` from JWT
  - [x] `api/agent-conversations.js` - now uses `req.user.restaurant_id` from JWT
  - [x] `api/ml-performance.js` - now uses `req.user.restaurant_id` from JWT
  - [x] `api/restaurant-settings.js` - added auth + uses `req.user.restaurant_id`
  - [x] `api/portal.js` - public availability endpoint (intentional, not IDOR)
  - [x] `api/batch-predict.js` - cron uses CRON_SECRET, auth path uses JWT (OK)
  - [x] `api/get-wait-time.js` - public endpoint (intentional, non-sensitive)
- [x] **Frontend IDOR Fixes**
  - [x] `CallTrackingDashboard.tsx` - removed restaurant_id from agent-conversations calls
  - [x] `QuickStatsWidget.tsx` - removed restaurant_id from ml-performance calls
  - [x] `LanguageSelector.tsx` - switched from axios+x-restaurant-id to authFetch
- [ ] **Remaining**: `phone-integration-simple.js` has no auth (Twilio webhook endpoint)

### Phase 4: Reliability & Bug Fixes (HIGH)
- [ ] Fix analytics date filter (cosmetic only - never triggers refetch)
- [ ] Fix hardcoded booking data (4.7 stars, "candlelit atmosphere" on ALL restaurants)
- [ ] Fix Dashboard Export button (navigates to wrong page `/host-dashboard/calls`)
- [ ] Fix N+1 queries in `api/batch-predict.js`
- [ ] Fix dashboard cache key mismatch (`['dashboard']` vs `['hostDashboard']`)
- [ ] Remove dead `showCompleteModal` state in Dashboard.tsx
- [ ] Add proper error handling (replace silent catch blocks)
- [ ] Setup Sentry error monitoring

### Phase 5: Code Quality & Technical Debt
- [ ] Split `api/_lib/supabase.js` god file (1909 lines → domain modules)
- [ ] Remove Airtable-era field mapping layer
- [ ] Fix 17 `any` type annotations across 5 pages
- [ ] Remove duplicate UpgradePrompt components
- [ ] Remove duplicate Supabase client on frontend
- [ ] Add missing dialog ARIA attributes on inline modals
- [ ] Add missing label associations in BookingPage
- [ ] Wire up i18n system (defined but unused in all pages)
- [ ] Use design system tokens instead of raw hex values

### Phase 6: Brazil Launch Preparation
- [ ] Connect WhatsApp integration (code exists, not connected to real account)
- [ ] Add PT-BR translation (currently EN/ES only)
- [ ] Add BRL pricing + Pix payment support
- [ ] Create freemium tier for Brazil market
- [ ] Simplify onboarding (7 steps → 3-4)
- [ ] Create Brazilian demo restaurant
- [ ] Remove fabricated "320+ restaurants" claim on landing page
- [ ] Increase Starter plan reservation limit (50/month too restrictive)

### Phase 7: Testing & Quality Assurance
- [ ] Add E2E tests (Playwright - currently 0 E2E tests)
- [ ] Increase test coverage to 80%+
- [ ] Stress test with concurrent users
- [ ] Add API documentation

---

## Strategic Context

- **Target**: Brazil-first, Q2 2026 launch
- **Goal**: 10+ paying restaurants in 6 months
- **Founder**: Solo bootstrapped developer
- **Monetization**: Freemium for Brazil, EUR pricing for Europe
- **Top Priority**: Reliability/bugs, then WhatsApp integration

---

## Known Security Issues (from Feb 2026 audit)

| Severity | Issue | File | Status |
|----------|-------|------|--------|
| CRITICAL | RLS bypassed - all queries use supabaseAdmin | `api/_lib/supabase.js` | All queries scoped by restaurant_id at app layer |
| CRITICAL | Public read on reservations (`USING(true)`) | `seatable-eu-migration.sql:894` | Migration created, pending execution |
| CRITICAL | Anon access to POS OAuth tokens | `20260126_pos_and_revenue.sql:153` | Migration created, pending execution |
| CRITICAL | IDOR via localStorage restaurant_id | `CallTrackingDashboard.tsx:107` | FIXED (Feb 20) |
| CRITICAL | IDOR in ltv.js, agent-conversations.js, ml-performance.js | Multiple API files | FIXED (Feb 20) |
| CRITICAL | No auth on restaurant-settings.js | `api/restaurant-settings.js` | FIXED (Feb 20) |
| HIGH | Analytics date filter cosmetic only | `AnalyticsDashboard.tsx:50` | Needs fix |
| HIGH | Hardcoded fake restaurant data | `BookingPage.tsx:227` | Needs fix |
| MEDIUM | phone-integration-simple.js has no auth | `api/phone-integration-simple.js` | Needs fix |
| MEDIUM | 17 `any` types across pages | Multiple files | Needs fix |
| LOW | Fabricated "320+ restaurants" on landing | Landing components | Needs fix |

---

## Contact

- **Email**: hello@seatable.io
- **Response Time**: Within 24 hours

---

**Last Updated**: February 20, 2026
